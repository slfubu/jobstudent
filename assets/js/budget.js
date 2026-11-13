function loadBudgetInfoForAdmin() {
    showLoading();
    const token = sessionStorage.getItem('sessionToken');
    google.script.run.withSuccessHandler(result => {
        hideLoading();
        if (!result || !result.success) {
            showAlert(result && result.message ? result.message : 'ไม่สามารถโหลดงบประมาณได้', 'error');
            return;
        }
        const counts = result.studentCounts || {byDepartment:{},internalUniqueCount:0,externalUniqueCount:0};
        window.internalUniqueCount = counts.internalUniqueCount || 0;
        window.externalUniqueCount = counts.externalUniqueCount || 0;
        budgetDataCache = (result.stats || []).map(item => ({
            ...item,
            studentCount: (counts.byDepartment || {})[item.department] || 0
        }));
        // Closed fiscal years are accessed only via the read-only fiscal history dialog.
        renderBudgetTable();
    }).withFailureHandler(err => {
        hideLoading();
        showAlert('ไม่สามารถโหลดงบประมาณ: ' + err.message, 'error');
    }).getFiscalBudgetOverview(token);
}

function switchBudgetSource(source) {
    currentBudgetSource = source;
    document.querySelectorAll('.budget-tab-btn').forEach(btn => btn.classList.remove('active'));
    event.currentTarget.classList.add('active');
    
    renderBudgetTable();
}

function renderBudgetTable() {
    const tbody = document.querySelector('#budgetTable tbody');
    tbody.innerHTML = '';

    // สร้าง tfoot ถ้ายังไม่มี
    let tfoot = document.querySelector('#budgetTable tfoot');
    if (!tfoot) {
        tfoot = document.createElement('tfoot');
        document.querySelector('#budgetTable').appendChild(tfoot);
    }
    tfoot.innerHTML = '';

    // กรองข้อมูลตามประเภทงบ (Internal/External)
    const filteredData = budgetDataCache.filter(d => {
        return (d.source || 'internal') === currentBudgetSource;
    });

    if (filteredData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#999; padding:20px;">ยังไม่มีการจัดสรรงบประมาณปีปัจจุบัน</td></tr>`;
        tfoot.innerHTML = `<tr><td style="text-align:center;font-weight:bold">รวมงบประมาณปีปัจจุบัน</td><td style="text-align:right">0.00</td><td style="text-align:right">0.00</td><td style="text-align:right">0.00</td><td>-</td></tr>`;
        return;
    }

    let grandAlloc = 0;
    let grandUsed = 0;
    
    // Set สำหรับเก็บรายชื่อหน่วยงานที่แสดงไปแล้ว (ป้องกันไม่ให้ไปโผล่ซ้ำด้านล่าง)
    let renderedDepartments = new Set();
    
    // ตัวนับลำดับกลุ่ม (เพื่อให้ ID ไม่ซ้ำ)
    let groupIndex = 0; 

    // A. ส่วนแสดงผลแบบกลุ่ม (Hierarchy) - เฉพาะงบภายใน
    if (currentBudgetSource === 'internal') {
        for (const [parentName, subUnits] of Object.entries(DEPARTMENT_GROUPS)) {
            // หาข้อมูลลูกๆ ที่อยู่ในกลุ่มนี้ (ตัดช่องว่างชื่อหน่วยงานเพื่อความชัวร์)
            const childData = filteredData.filter(d => subUnits.includes(d.department.trim()));
            
            if (childData.length > 0) {
                groupIndex++; 
                const parentRowId = `group-row-${groupIndex}`; 

                let groupAlloc = 0, groupUsed = 0;
                
                // คำนวณยอดรวมกลุ่ม และเก็บชื่อหน่วยงานลง Set เพื่อกันไม่ให้โชว์ซ้ำ
                childData.forEach(c => { 
                    groupAlloc += Number(c.allocated); 
                    groupUsed += Number(c.used);
                    renderedDepartments.add(c.department); // <--- จุดสำคัญ: ต้องเพิ่มลง Set
                });

                const totalBal = groupAlloc - groupUsed;
                
                // 1. สร้างแถวแม่ (Parent Row)
                tbody.innerHTML += `
                    <tr class="parent-row" onclick="toggleChildRows('${parentRowId}', this)" style="background:#e3f2fd; cursor: pointer; border-bottom: 1px solid #fff;">
                        <td style="font-weight:bold; color:#0d47a1;">
                            <i class="material-icons toggle-icon" style="transition: transform 0.2s;">chevron_right</i> ${parentName}
                        </td>
                        <td style="text-align:right; font-weight:bold;">${groupAlloc.toLocaleString()}</td>
                        <td style="text-align:right; font-weight:bold; color:#d32f2f;">${groupUsed.toLocaleString()}</td>
                        <td style="text-align:right; font-weight:bold; color:${totalBal < 0 ? 'red' : 'green'}">${totalBal.toLocaleString()}</td>
                        <td style="text-align:center;"><small class="vf-badge vf-badge-blue">รวมกลุ่ม</small></td>
                    </tr>
                `;

                // 2. สร้างแถวลูก (Child Rows)
                childData.forEach(child => {
                    grandAlloc += Number(child.allocated);
                    grandUsed += Number(child.used);
                    // เรียก renderNormalRow โดยส่ง class ลูกไป เพื่อให้มันซ่อนตัว
                    renderNormalRow(tbody, child, false, `child-row ${parentRowId}`);
                });
            }
        }
    }

    // B. ส่วนแสดงผลรายการปกติ (Normal) - รายการที่ไม่อยู่ในกลุ่ม หรือ งบภายนอก
    // กรองเอาเฉพาะรายการที่ "ไม่อยู่" ใน renderedDepartments
    const normalData = filteredData.filter(d => !renderedDepartments.has(d.department));
    
    if(normalData.length > 0) {
        // เส้นคั่น ถ้ามีกลุ่มแสดงไปก่อนหน้าแล้ว
        if(renderedDepartments.size > 0 && currentBudgetSource === 'internal') {
            tbody.innerHTML += `<tr><td colspan="5" style="background:#fff; border-bottom:2px solid #eee; padding:5px;"><small style="color:#999;">หน่วยงานอื่นๆ / แหล่งทุน</small></td></tr>`;
        }
        
        normalData.forEach(item => {
            grandAlloc += Number(item.allocated);
            grandUsed += Number(item.used);
            // รายการปกติ ส่ง extraClass เป็นค่าว่าง
            renderNormalRow(tbody, item, (currentBudgetSource === 'external'), '');
        });
    }

    // C. ส่วน Footer รวมยอดทั้งหมด
    const grandBalance = grandAlloc - grandUsed;
    tfoot.innerHTML = `
        <tr style="background-color: #f8f9fa; color: #333; font-weight: bold; border-top: 2px solid #dee2e6; border-bottom: 2px solid #dee2e6;">
            <td style="text-align: center;">รวมงบประมาณทั้งหมดสุทธิ</td>
            <td style="text-align: right;">${grandAlloc.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
            <td style="text-align: right; color: #d32f2f;">${grandUsed.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
            <td style="text-align: right; color: ${grandBalance < 0 ? 'red' : '#2e7d32'};">${grandBalance.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
            <td style="text-align: center;">-</td>
        </tr>
    `;
}

function toggleChildRows(groupId, element) {
    console.log("Toggling group:", groupId); 

    // ค้นหาแถวลูกด้วย Class Name
    const children = document.getElementsByClassName(groupId);
    
    if (!children || children.length === 0) {
        console.warn("No children found for class:", groupId);
        return;
    }

    // หมุนลูกศร
    element.classList.toggle('expanded');
    const icon = element.querySelector('.toggle-icon');
    if(icon) {
        icon.style.transform = element.classList.contains('expanded') ? 'rotate(90deg)' : 'rotate(0deg)';
    }

    // สลับการแสดงผล
    for(let i = 0; i < children.length; i++) {
        const child = children[i];
        if (child.style.display === 'none' || child.style.display === '') {
            child.style.display = 'table-row';
        } else {
            child.style.display = 'none';
        }
    }
}

function renderNormalRow(tbody, item, showName, extraClass) {
    const balance = item.allocated - item.used;
    const nameDisplay = showName ? 
        `<div style="font-weight:bold;">${item.budgetName || 'ไม่ระบุชื่อ'}</div><small style="color:#666;">${item.department}</small>` : 
        item.department;

    const itemStr = JSON.stringify(item).replace(/"/g, '&quot;');

    // ** แก้ไขจุดนี้: ถ้ามี extraClass (เป็นลูก) ให้ใส่ style="display:none" **
    // เพื่อให้มันซ่อนตัวตั้งแต่แรกที่โหลดหน้า
    let rowHtmlClass = extraClass || '';
    let rowHtmlStyle = extraClass ? 'display:none; background-color: #f8f9fa;' : '';

    tbody.innerHTML += `
        <tr class="${rowHtmlClass}" style="${rowHtmlStyle}">
            <td style="${extraClass ? 'padding-left:40px;' : ''}">
                ${extraClass ? '<span style="color:#ccc; margin-right:5px;">↳</span>' : ''} ${nameDisplay}
            </td>
            <td style="text-align:right;">${Number(item.allocated).toLocaleString()}</td>
            <td style="text-align:right; color:#d32f2f;">${Number(item.used).toLocaleString()}</td>
            <td style="text-align:right; font-weight:bold; color:${balance < 0 ? 'red' : 'green'}">${balance.toLocaleString()}</td>
            <td style="text-align:center;">
                ${renderActionButtons(item)}
            </td>
        </tr>
    `;
}


function openTransferModal() {
    const selectSrc = document.getElementById('transferSource');
    const selectDest = document.getElementById('transferDest');
    
    selectSrc.innerHTML = '<option value="">-- เลือกต้นทาง --</option>';
    selectDest.innerHTML = '<option value="">-- เลือกปลายทาง --</option>';
    document.getElementById('transferAmount').value = '';
    document.getElementById('transferNote').value = '';
    document.getElementById('sourceBalanceShow').textContent = 'คงเหลือ: 0';

    budgetDataCache.forEach(item => {
        const name = item.budgetName ? `${item.budgetName} (${item.department})` : item.department;
        const balance = item.allocated - item.used;
        const optSrc = document.createElement('option');
        optSrc.value = item.id; 
        optSrc.text = name;
        optSrc.dataset.balance = balance; 
        selectSrc.appendChild(optSrc);
        const optDest = document.createElement('option');
        optDest.value = item.id;
        optDest.text = name;
        selectDest.appendChild(optDest);
    });

    document.getElementById('transferModal').style.display = 'flex';
}

function updateTransferDestOptions() {
    const srcSelect = document.getElementById('transferSource');
    const destSelect = document.getElementById('transferDest');
    const selectedOption = srcSelect.options[srcSelect.selectedIndex];
    const bal = selectedOption.dataset.balance || 0;
    document.getElementById('sourceBalanceShow').textContent = `คงเหลือ: ${Number(bal).toLocaleString()} บาท`;
    document.getElementById('sourceBalanceShow').style.color = bal < 0 ? 'red' : 'green';
    for (let i = 0; i < destSelect.options.length; i++) {
        destSelect.options[i].disabled = (destSelect.options[i].value === srcSelect.value);
    }
}

document.getElementById('transferForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const srcId = document.getElementById('transferSource').value;
    const destId = document.getElementById('transferDest').value;
    const amount = Number(document.getElementById('transferAmount').value);
    const note = document.getElementById('transferNote').value;

    if(srcId === destId) { showAlert('ต้นทางและปลายทางต้องไม่เหมือนกัน', 'error'); return; }
    showLoading();
    const data = {
        srcId: srcId,
        destId: destId,
        amount: amount,
        note: note,
        user: currentUser.firstName // บันทึกคนทำรายการ
    };

    google.script.run.withSuccessHandler(res => {
        hideLoading();
        if(res.success) {
            document.getElementById('transferModal').style.display = 'none';
            showAlert('โอนย้ายงบประมาณเรียบร้อย', 'success');
            loadBudgetInfoForAdmin(); 
        } else {
            showAlert(res.message, 'error');
        }
    }).transferBudget(data); 
});

function deleteBudgetItem(id, name) {
    Swal.fire({
        title: 'ยืนยันการลบ',
        text: `ต้องการลบงบประมาณของ "${name}" ใช่หรือไม่ ประวัติการใช้งานอาจคลาดเคลื่อน`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'ยืนยันลบ',
        cancelButtonText: 'ยกเลิก'
    }).then((result) => {
        if (result.isConfirmed) {
            showLoading();
            google.script.run.withSuccessHandler(res => {
                hideLoading();
                if(res.success) {
                    showAlert('ลบรายการเรียบร้อย');
                    loadBudgetInfoForAdmin();
                } else {
                    showAlert(res.message, 'error');
                }
            }).deleteBudgetItem(id); 
        }
    });
}

// --- [UPDATE] แก้ไขการ Submit ฟอร์มจัดสรรงบ ให้รองรับทั้ง "เพิ่มใหม่" และ "แก้ไข" ---
document.getElementById('allocateForm').onsubmit = (e) => {
    e.preventDefault();
    const budgetForm = e.currentTarget;
    if (budgetForm.dataset.saving === '1') return;
    budgetForm.dataset.saving = '1';
    
    // ดึง ID สำหรับแก้ไข (ถ้ามี)
    const editIdInput = document.getElementById('editBudgetId');
    const editId = editIdInput ? editIdInput.value : '';
    
    const amount = document.getElementById('allocAmount').value;
    const note = document.getElementById('allocNote').value;

    showLoading();

    if (editId) {
        // === กรณีแก้ไข (มี ID) ===
        google.script.run.withSuccessHandler(res => {
            budgetForm.dataset.saving = '0';
            hideLoading();
            if(res.success) {
                document.getElementById('allocateModal').style.display = 'none';
                document.getElementById('editBudgetId').value = ''; // ล้างค่า ID
                showAlert('แก้ไขงบประมาณเรียบร้อย', 'success'); 
                loadBudgetInfoForAdmin(); // โหลดตารางใหม่
            } else {
                showAlert(res.message, 'error');
            }
        }).withFailureHandler(err => {
            budgetForm.dataset.saving = '0';
            hideLoading();
            showAlert(err.message || 'บันทึกไม่สำเร็จ', 'error');
        }).updateBudgetAmount(editId, amount, note);

    } else {
        // === กรณีเพิ่มใหม่ (ไม่มี ID) ===
        const sourceType = document.getElementById('allocSourceType').value;
        const data = {
            source: sourceType,
            department: document.getElementById('allocDepartment').value,
            budgetName: sourceType === 'external' ? document.getElementById('allocBudgetName').value : 'งบจัดสรรประจำปี',
            amount: amount,
            note: note,
            type: 'add'
        };
        
        google.script.run.withSuccessHandler(res => {
            budgetForm.dataset.saving = '0';
            hideLoading();
            if(res.success) { 
                document.getElementById('allocateModal').style.display = 'none';
                showAlert('บันทึกงบประมาณเรียบร้อย', 'success'); 
                loadBudgetInfoForAdmin(); 
            } else {
                showAlert(res.message, 'error');
            }
        }).withFailureHandler(err => {
            budgetForm.dataset.saving = '0';
            hideLoading();
            showAlert(err.message || 'บันทึกไม่สำเร็จ', 'error');
        }).saveBudgetTransaction(data);
    }
};

// หมายเหตุ: ต้องปรับแก้ handle form submit ของ #allocateForm ให้เช็คว่ามี editBudgetId หรือไม่
// ถ้ามี ให้เรียก updateBudget แทน saveBudgetTransaction
// --- Helper: ฟังก์ชันวาดแถวปกติ ---
function renderNormalRow(tbody, item, showName) {
    const balance = item.allocated - item.used;
    const nameDisplay = showName ? 
        `<div style="font-weight:bold;">${item.budgetName || 'ไม่ระบุชื่อ'}</div><small style="color:#666;">${item.department}</small>` : 
        item.department;

    tbody.innerHTML += `
        <tr>
            <td>${nameDisplay}</td>
            <td style="text-align:right;">${Number(item.allocated).toLocaleString()}</td>
            <td style="text-align:right; color:#d32f2f;">${Number(item.used).toLocaleString()}</td>
            <td style="text-align:right; font-weight:bold; color:${balance < 0 ? 'red' : 'green'}">${balance.toLocaleString()}</td>
            <td style="text-align:center;">
                ${renderActionButtons(item)}
            </td>
        </tr>
    `;
}

// --- [FIX] แก้ไขปุ่มกดดูประวัติ ให้ส่งชื่อหน่วยงานไปค้นหาแน่นอน ---
function renderActionButtons(item) {
    // ใช้ ID ถ้ามี, ถ้าไม่มีให้ใช้ชื่อ Department เป็นตัวค้นหาแทน
    const searchKey = item.id || item.department;
    // ชื่อที่จะแสดงบนหัว Modal
    const displayName = item.budgetName || item.department;
    
    return `
        <button class="btn btn-secondary" onclick="viewBudgetHistory('${searchKey}', '${displayName}')" style="padding:4px 10px; font-size:12px; border-radius:4px;">
            <i class="material-icons" style="font-size:14px; vertical-align:middle;">history</i> ประวัติ
        </button>
    `;
}
function toggleChildRows(parentId, element) {
    // ค้นหาแถวลูกทั้งหมดด้วย Class Name ที่เราตั้งไว้ (group-row-X)
    const children = document.getElementsByClassName(parentId);
    
    // หมุนลูกศร
    element.classList.toggle('expanded');
    const icon = element.querySelector('.toggle-icon');
    if(icon) {
        icon.style.transform = element.classList.contains('expanded') ? 'rotate(90deg)' : 'rotate(0deg)';
    }

    // แสดง/ซ่อน แถวลูก
    for(let child of children) {
        if (child.style.display === 'none' || child.style.display === '') {
            child.style.display = 'table-row';
        } else {
            child.style.display = 'none';
        }
    }
}

function openExternalBudgetModal() {
    // 1. รีเซ็ตฟอร์ม
    document.getElementById('allocateForm').reset();
    document.getElementById('allocSourceType').value = 'external';
    document.getElementById('allocModalTitle').textContent = 'บันทึกรับงบประมาณ (ภายนอก)';
    
    // 2. [POINT] ซ่อน Dropdown หน่วยงาน และ แสดงช่องกรอกชื่อโครงการ
    document.getElementById('divAllocDept').style.display = 'none'; // ซ่อน Dropdown
    document.getElementById('divAllocName').style.display = 'block'; // แสดงช่องชื่อโครงการ
    
    // 3. (Optional) เติม Dropdown ไว้เผื่อระบบต้องใช้ค่า Default (ป้องกัน Error required)
    // populateDepartments('allocDepartment'); // ถ้าไม่จำเป็นต้องเลือกหน่วยงานเจ้าของเงิน ก็ comment ได้
    
    document.getElementById('allocateModal').style.display = 'flex';
}

function openAllocateModal() {
    // 1. รีเซ็ตฟอร์ม
    document.getElementById('allocateForm').reset();
    
    // 2. ตั้งค่าเป็น internal
    document.getElementById('allocModalTitle').textContent = 'จัดสรรงบประมาณ (ภายใน)';
    document.getElementById('allocSourceType').value = 'internal';

    // 3. [POINT] แสดง Dropdown หน่วยงาน และ ซ่อนช่องชื่อโครงการ
    document.getElementById('divAllocDept').style.display = 'block'; // แสดง Dropdown
    document.getElementById('divAllocName').style.display = 'none';  // ซ่อนช่องชื่อโครงการ
    
    // 4. ล้าง ID การแก้ไข
    let editInput = document.getElementById('editBudgetId');
    if(editInput) editInput.value = '';

    // 5. แสดง Modal
    document.getElementById('allocateModal').style.display = 'flex';
}

// --- [ADD] ดูประวัติและแก้ไข ---
function viewBudgetHistory(refId, title) {
    document.getElementById('histModalSubtitle').innerText = title;
    showLoading();
    
    google.script.run.withSuccessHandler(history => {
        hideLoading();
        const tbody = document.querySelector('#budgetHistoryTable tbody');
        tbody.innerHTML = '';
        
        if(!history || history.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">ไม่มีประวัติ</td></tr>';
        } else {
            history.forEach(h => {
                tbody.innerHTML += `
                    <tr>
                        <td>${formatDate(h.date)}</td>
                        <td>${h.note || '-'}</td>
                        <td style="color:${h.amount > 0 ? 'green' : 'red'}; text-align:right;">
                            ${Number(h.amount).toLocaleString()}
                        </td>
                        <td>${h.user || 'Admin'}</td>
                        <td style="text-align:center;">
                            <i class="material-icons" style="cursor:pointer; color:#ffa000;" onclick="editBudgetTransaction('${h.transId}')">edit</i>
                            <i class="material-icons" style="cursor:pointer; color:red; margin-left:5px;" onclick="deleteBudgetTransaction('${h.transId}')">delete</i>
                        </td>
                    </tr>
                `;
            });
        }
        
        document.getElementById('budgetHistoryModal').style.display = 'flex';
    }).getBudgetHistoryLog(refId); // Backend Function
}

// ฟังก์ชันลบประวัติ (ตัวอย่าง)
function deleteBudgetTransaction(transId) {
    if(confirm('ต้องการลบรายการนี้ใช่หรือไม่? ยอดเงินจะถูกคำนวณใหม่')) {
        showLoading();
        google.script.run.withSuccessHandler(() => {
            hideLoading();
            document.getElementById('budgetHistoryModal').style.display = 'none';
            loadBudgetInfoForAdmin();
            showAlert('ลบรายการเรียบร้อย');
        }).deleteBudgetTransaction(transId);
    }
}

// ตัวแปรเก็บข้อมูลชั่วคราว
    let payrollDataCache = [];

let adminPayrollAgencySelection_ = '';

// Admin-only payroll bulk selection. Individual approval remains available.
function adminPayrollBulkSelectedRows_() {
  var list = document.getElementById('payrollListContainer');
  return list ? Array.from(list.querySelectorAll('tr[data-bulk-index]')).filter(function(row) {
    var c = row.querySelector('.admin-payroll-bulk-check');
    return c && c.checked && !c.disabled;
  }) : [];
}
function adminPayrollBulkRefresh_() {
  var rows = adminPayrollBulkSelectedRows_();
  var total = 0, complete = true;
  rows.forEach(function(row) {
    var s = row.querySelector('.admin-payroll-bulk-slot');
    var d = row.querySelector('.admin-payroll-bulk-date');
    if (!s || !d || !s.value || !d.value) complete = false;
    else total += (s.value === 'full' ? 300 : 150);
  });
  var summary = document.getElementById('adminPayrollBulkSummary');
  if (summary) summary.textContent = 'เลือก ' + rows.length + ' รายการ | ยอดรวม ' +
    (complete ? total.toLocaleString('th-TH') + ' บาท' : 'รอกำหนดวันที่/ช่วงเวลาให้ครบ');
  var btn = document.getElementById('adminPayrollBulkApproveBtn');
  if (btn) btn.disabled = !(rows.length && complete);
  var all = document.getElementById('adminPayrollBulkAll');
  if (all) {
    var enabled = Array.from(document.querySelectorAll('#payrollListContainer .admin-payroll-bulk-check')).filter(function(c) {return !c.disabled;});
    all.checked = !!enabled.length && enabled.every(function(c) { return c.checked; });
    all.indeterminate = enabled.some(function(c){return c.checked;}) && !all.checked;
  }
}
function adminPayrollBulkFillSelected_() {
  var rows = adminPayrollBulkSelectedRows_();
  var date = document.getElementById('adminPayrollBulkMasterDate');
  var slot = document.getElementById('adminPayrollBulkMasterSlot');
  if (!rows.length) { showAlert('กรุณาติ๊กเลือกรายการก่อน', 'warning'); return; }
  if (!date || !date.value || !slot || !slot.value) {
    showAlert('กรุณาระบุวันที่ปฏิบัติงานและช่วงเวลาที่ต้องการใช้กับรายการที่เลือก', 'warning'); return;
  }
  rows.forEach(function(row) {
    row.querySelector('.admin-payroll-bulk-date').value = date.value;
    row.querySelector('.admin-payroll-bulk-slot').value = slot.value;
  });
  adminPayrollBulkRefresh_();
}
function adminPayrollBulkApproveSelected_() {
  if (!currentUser || currentUser.role !== 'admin' || !adminPayrollAgencySelection_) return;
  var rows = adminPayrollBulkSelectedRows_();
  if (!rows.length || rows.length > 100) {
    showAlert('กรุณาเลือก 1–100 รายการต่อครั้ง', 'warning'); return;
  }
  var agency = adminPayrollAgencySelection_;
  var items = [];
  var amount = 0;
  for (var i=0; i<rows.length; i++) {
    var row=rows[i];
    var date=row.querySelector('.admin-payroll-bulk-date').value;
    var session=row.querySelector('.admin-payroll-bulk-slot').value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || ['morning','afternoon','evening','full'].indexOf(session)<0) {
      showAlert('กรุณากำหนดวันที่ปฏิบัติงานและช่วงเวลาของรายการที่เลือกให้ครบ', 'warning'); return;
    }
    if (!row.payrollBulkCandidate || !row.payrollBulkCandidate.regId) {
      showAlert('ข้อมูลใบสมัครไม่ครบ กรุณาโหลดรายการใหม่', 'error'); return;
    }
    items.push({regId:String(row.payrollBulkCandidate.regId),workDate:date,session:session});
    amount += session==='full'?300:150;
  }
  Swal.fire({title:'ยืนยันอนุมัติ Payroll แบบกลุ่ม',
    text:'หน่วยงาน: '+agency+'\nจำนวน: '+items.length+' รายการ\nยอดรวม: '+amount.toLocaleString('th-TH')+' บาท\nระบบจะตรวจรายการซ้ำและงบคงเหลืออีกครั้งก่อนบันทึก',
    icon:'warning', showCancelButton:true, confirmButtonText:'ยืนยันอนุมัติทั้งหมด', cancelButtonText:'ยกเลิก',
    confirmButtonColor:'#198754'
  }).then(function(result){
    if (!result.isConfirmed) return;
    if (adminPayrollAgencySelection_ !== agency) {showAlert('หน่วยงานเปลี่ยนแล้ว กรุณาเลือกใหม่','warning');return;}
    var button=document.getElementById('adminPayrollBulkApproveBtn');
    if(button) button.disabled=true;
    showLoading();
    google.script.run.withSuccessHandler(function(res){
      hideLoading();
      if(res && res.success) {
        Swal.fire('อนุมัติสำเร็จ',String(res.count || items.length)+' รายการ รวม '+Number(res.amount || amount).toLocaleString('th-TH')+' บาท','success');
        loadPayrollPage();
      } else {
        showAlert((res && res.message) || 'บันทึก Payroll ไม่สำเร็จ กรุณาตรวจสอบรายการ', 'error');
        adminPayrollBulkRefresh_();
      }
    }).withFailureHandler(function(err){
      hideLoading();
      var payrollError = String(err && err.message || err);
      if (/^Forbidden: API action นี้ไม่ได้รับอนุญาต/.test(payrollError)) {
        showAlert('ยังไม่ได้เปิดใช้งาน API อนุมัติค่าตอบแทนแบบกลุ่มบนเซิร์ฟเวอร์ กรุณาอัปเดต Api.gs และ Deploy เวอร์ชันใหม่ (คำขอนี้ไม่ถูกบันทึก)','error');
      } else {
        showAlert('การเชื่อมต่อขัดข้อง กรุณาโหลดรายการใหม่และตรวจว่ามีการบันทึกแล้วหรือไม่ ก่อนกดซ้ำ: '+payrollError,'error');
      }
      // Network timeout may occur after commit: force a fresh server fetch, not blind retry.
      loadPayrollPage();
    }).adminApproveJobPayrollBulk(sessionStorage.getItem('sessionToken'),{agency:agency,items:items});
  });
}


// Admin-only: select groups of submitted TimeLogs without changing individual approval.
let adminSpecialBulkBusy_ = false;
function adminSpecialBulkSelected_() {
  const wrap = document.getElementById('timeSheetPayrollContainer');
  if (!wrap) return [];
  return Array.from(wrap.querySelectorAll('.admin-special-bulk-check:checked:not(:disabled)'))
    .map(function(box){ return box.closest('tr') && box.closest('tr').specialPayrollItem; })
    .filter(Boolean);
}
function adminSpecialBulkRefresh_() {
  const wrap = document.getElementById('timeSheetPayrollContainer');
  if (!wrap) return;
  const selected = adminSpecialBulkSelected_();
  let amount = 0, logCount = 0;
  selected.forEach(function(item){ amount += Number(item.totalAmount) || 0; logCount += (item.logIds || []).length; });
  const count = wrap.querySelector('#adminSpecialBulkSummary');
  if (count) count.textContent = 'เลือก ' + selected.length + ' คน / ' + logCount +
    ' รายการลงเวลา | ' + amount.toLocaleString('th-TH', {minimumFractionDigits:2,maximumFractionDigits:2}) + ' บาท';
  const button = wrap.querySelector('#adminSpecialBulkApproveBtn');
  if (button) button.disabled = adminSpecialBulkBusy_ || !selected.length || selected.length>100 || logCount>500 || !(amount>0);
  const selectAll = wrap.querySelector('#adminSpecialBulkAll');
  if (selectAll) {
    const available = Array.from(wrap.querySelectorAll('.admin-special-bulk-check:not(:disabled)'));
    selectAll.checked = !!available.length && available.every(function(box){return box.checked;});
    selectAll.indeterminate = available.some(function(box){return box.checked;}) && !selectAll.checked;
  }
}
function adminSpecialBulkApproveSelected_() {
  if (adminSpecialBulkBusy_ || !currentUser || currentUser.role !== 'admin' || !adminPayrollAgencySelection_) return;
  const agency = adminPayrollAgencySelection_;
  const selected = adminSpecialBulkSelected_();
  const groups = selected.map(function(item){
    return {studentId:String(item.studentId||''),logIds:(item.logIds||[]).map(String)};
  });
  const logCount = groups.reduce(function(n,g){return n+g.logIds.length;},0);
  const total = selected.reduce(function(n,x){return n+(Number(x.totalAmount)||0);},0);
  if (!groups.length || groups.length>100 || !logCount || logCount>500) {
    showAlert('เลือกได้ครั้งละ 1–100 คน และไม่เกิน 500 รายการลงเวลา','warning'); return;
  }
  if (!(total>0) || selected.some(function(x){return x.bulkInvalidAmount;})) {
    showAlert('พบข้อมูลจำนวนเงินไม่ถูกต้อง กรุณาตรวจรายการลงเวลาก่อน','error'); return;
  }
  Swal.fire({title:'ยืนยันอนุมัติค่าตอบแทนแบบกลุ่ม',
    text:'หน่วยงาน: '+agency+'\nจำนวน '+groups.length+' คน / '+logCount+' รายการลงเวลา\nยอดรวม '+
      total.toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2})+
      ' บาท\nระบบจะตรวจสถานะ รายการซ้ำ และงบคงเหลือจากเซิร์ฟเวอร์อีกครั้ง',
    icon:'warning',showCancelButton:true,confirmButtonText:'ยืนยันอนุมัติทั้งหมด',cancelButtonText:'ยกเลิก',confirmButtonColor:'#198754'
  }).then(function(confirmed){
    if (!confirmed.isConfirmed) return;
    if (agency !== adminPayrollAgencySelection_) {showAlert('หน่วยงานเปลี่ยนแล้ว กรุณาโหลดใหม่','warning');return;}
    adminSpecialBulkBusy_ = true;
    adminSpecialBulkRefresh_();
    showLoading();
    google.script.run.withSuccessHandler(function(res){
      hideLoading();
      adminSpecialBulkBusy_ = false;
      if (res && res.success) {
        Swal.fire('อนุมัติสำเร็จ',String(res.students||groups.length)+' คน / '+String(res.count||logCount)+
          ' รายการ รวม '+Number(res.amount||total).toLocaleString('th-TH')+' บาท','success');
        loadPayrollPage();
      } else {
        showAlert((res && res.message) || 'อนุมัติไม่สำเร็จ กรุณาตรวจสอบข้อมูล','error');
        // Commit may have occurred before a TimeLogs status error. Reload instead of retrying.
        if (res && res.committed) loadPayrollPage();
        else adminSpecialBulkRefresh_();
      }
    }).withFailureHandler(function(err){
      hideLoading();
      adminSpecialBulkBusy_ = false;
      var payrollError = String(err && err.message || err);
      if (/^Forbidden: API action นี้ไม่ได้รับอนุญาต/.test(payrollError)) {
        showAlert('ยังไม่ได้เปิดใช้งาน API อนุมัติงานเฉพาะด้านแบบกลุ่มบนเซิร์ฟเวอร์ กรุณาอัปเดต Api.gs และ Deploy เวอร์ชันใหม่ (คำขอนี้ไม่ถูกบันทึก)','error');
      } else {
        showAlert('ไม่ทราบว่าบันทึกสำเร็จหรือไม่ กรุณาตรวจสอบ Payroll ก่อนกดซ้ำ: '+payrollError,'error');
      }
      loadPayrollPage();
    }).adminApproveAgencyTimeLogsBulk(sessionStorage.getItem('sessionToken'),{agency:agency,groups:groups});
  });
}

function loadPayrollPage() {
  if (!currentUser || currentUser.role !== 'admin') return renderPayrollPageForAgency_();
  const section = document.getElementById('payrollSection');
  let holder = document.getElementById('adminAgencyPayrollSelector');
  if (!holder) {
    holder = document.createElement('div');
    holder.id = 'adminAgencyPayrollSelector';
    holder.style.cssText = 'margin:16px 0;padding:16px;background:#eaf3ff;border:1px solid #b6d3ff;border-radius:10px';
    const summary = document.getElementById('myBudgetSummary');
    if (summary && summary.parentNode) summary.parentNode.insertBefore(holder,summary);
    else if(section) section.insertBefore(holder,section.firstChild);
  }
  showLoading();
  google.script.run.withSuccessHandler(function(agencies) {
    hideLoading();
    const select = document.createElement('select');
    select.id = 'adminPayrollAgencySelect';
    select.className = 'form-control';
    select.style.cssText = 'max-width:520px;padding:10px';
    const empty = document.createElement('option'); empty.value=''; empty.textContent='-- เลือกหน่วยงานที่ต้องการอนุมัติแทน --'; select.appendChild(empty);
    (agencies || []).forEach(function(agency){const option=document.createElement('option');option.value=agency;option.textContent=agency;select.appendChild(option);});
    if (agencies.indexOf(adminPayrollAgencySelection_)===-1) adminPayrollAgencySelection_='';
    select.value=adminPayrollAgencySelection_;
    select.addEventListener('change',function(){adminPayrollAgencySelection_=select.value; payrollDataCache=[]; const oldRows=document.getElementById('payrollListContainer'); if(oldRows) oldRows.innerHTML=''; const emptyHint=document.getElementById('payrollInitialMsg'); if(emptyHint) emptyHint.style.display='block'; const dayPanel=document.getElementById('payrollWorkDayPanel');if(dayPanel)dayPanel.style.display='none';if(adminPayrollAgencySelection_)renderPayrollPageForAgency_();else {const summary=document.getElementById('myBudgetSummary');if(summary)summary.innerHTML='';const list=document.getElementById('payrollJobFilter');if(list)list.innerHTML='<option value="">-- กรุณาเลือกงาน --</option>';const ts=document.getElementById('timeSheetPayrollContainer');if(ts)ts.innerHTML='';}});
    holder.textContent='';
    const title=document.createElement('strong');title.textContent='Admin: อนุมัติเบิกจ่ายแทนหน่วยงาน (ไม่ต้อง Impersonation)';title.style.display='block';title.style.marginBottom='8px';
    holder.appendChild(title);holder.appendChild(select);
    if (adminPayrollAgencySelection_) renderPayrollPageForAgency_();
  }).withFailureHandler(function(err){hideLoading();showAlert('โหลดรายชื่อหน่วยงานไม่ได้: '+(err.message||err),'error');}).adminPayrollAgencies(sessionStorage.getItem('sessionToken'));
}
function renderPayrollPageForAgency_() {
    const payrollAgency = currentUser.role === 'admin' ? adminPayrollAgencySelection_ : currentUser.faculty;
    showLoading();
    
    // 1. ดึงข้อมูลภาพรวมงบประมาณของหน่วยงานที่กำลังดำเนินการ (Actual หรือ Impersonated)
    const financeRunner = google.script.run.withSuccessHandler(res => {
        if(res.success && res.stats) {
             const s = res.stats;
             document.getElementById('myBudgetSummary').innerHTML = `
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px; width: 100%;">
                    <div style="background: linear-gradient(135deg, #2196F3 0%, #1976D2 100%); color: white; padding: 25px; border-radius: 12px; box-shadow: 0 4px 10px rgba(33, 150, 243, 0.3);">
                        <div style="font-size: 14px; opacity: 0.9;">งบประมาณได้รับจัดสรร</div>
                        <div style="font-size: 32px; font-weight: bold; margin-top: 5px;">฿${Number(s.allocated).toLocaleString()}</div>
                        <div style="font-size: 12px; opacity: 0.8;">หน่วยงาน: ${payrollAgency}</div>
                    </div>
                    <div style="background: linear-gradient(135deg, #FF9800 0%, #F57C00 100%); color: white; padding: 25px; border-radius: 12px; box-shadow: 0 4px 10px rgba(255, 152, 0, 0.3);">
                        <div style="font-size: 14px; opacity: 0.9;">อนุมัติเบิกจ่ายค่าตอบแทนแล้ว</div>
                        <div style="font-size: 32px; font-weight: bold; margin-top: 5px;">฿${Number(s.used).toLocaleString()}</div>
                    </div>
                    <div style="background: linear-gradient(135deg, #4CAF50 0%, #388E3C 100%); color: white; padding: 25px; border-radius: 12px; box-shadow: 0 4px 10px rgba(76, 175, 80, 0.3);">
                        <div style="font-size: 14px; opacity: 0.9;">งบประมาณคงเหลือ</div>
                        <div style="font-size: 32px; font-weight: bold; margin-top: 5px;">฿${Number(s.balance).toLocaleString()}</div>
                    </div>
                </div>`;
        }
    });
    if(currentUser.role === 'admin') financeRunner.adminPayrollBudget(sessionStorage.getItem('sessionToken'),payrollAgency);
    else financeRunner.getFinancialOverview(currentUser.id,payrollAgency);

    // 2. ดึงรายการนักศึกษาค้างจ่าย (งานกิจกรรม) - ส่งชื่อหน่วยงานไปกรอง
    const jobRunner = google.script.run.withSuccessHandler(list => {
        if (currentUser.role === 'admin' && payrollAgency !== adminPayrollAgencySelection_) return;
        payrollDataCache = Array.isArray(list) ? list : []; 
        const jobSelect = document.getElementById('payrollJobFilter');
        jobSelect.innerHTML = '<option value="">-- กรุณาเลือกงาน --</option>';
        payrollEnsureWorkDayPicker_();
        document.getElementById('payrollWorkDayPanel').style.display='none';
        const oldRows=document.getElementById('payrollListContainer');
        if(oldRows) oldRows.replaceChildren();
        const initialMsg=document.getElementById('payrollInitialMsg');
        if(initialMsg){initialMsg.style.display='block';initialMsg.textContent='กรุณาเลือกงาน แล้วเลือกวันที่ปฏิบัติงานจากใบสมัคร';}
        const uniqueJobs = [...new Set(payrollDataCache.map(item => item.jobTitle))];
        if (uniqueJobs.length > 0) {
             uniqueJobs.forEach(jobTitle => {
                 const opt = document.createElement('option');
                 opt.value = jobTitle; opt.textContent = jobTitle;
                 jobSelect.appendChild(opt);
             });
        }
    });
    if(currentUser.role === 'admin') jobRunner.adminPayrollJobCandidates(sessionStorage.getItem('sessionToken'),payrollAgency);
    else jobRunner.getApprovedStudentsForPayroll(currentUser.id,payrollAgency);

    // 3. TimeLogs / งานตามความสามารถเฉพาะด้าน: เลือกได้หลายคนสำหรับ Admin.
    const timeRunner = google.script.run.withSuccessHandler(list => {
        hideLoading();
        if (currentUser.role === 'admin' && payrollAgency !== adminPayrollAgencySelection_) return;
        let tsContainer = document.getElementById('timeSheetPayrollContainer');
        if (!tsContainer) {
            tsContainer = document.createElement('div');
            tsContainer.id = 'timeSheetPayrollContainer';
            tsContainer.style.cssText = 'margin-top:40px;border-top:2px dashed #ccc;padding-top:20px';
            document.getElementById('payrollSection').querySelector('.card').appendChild(tsContainer);
        }
        tsContainer.replaceChildren();
        if (!Array.isArray(list) || !list.length) return;

        const isAdmin = currentUser.role === 'admin';
        const heading = document.createElement('h3');
        heading.style.color = '#0d47a1';
        heading.textContent = 'การเบิกจ่ายค่าตอบแทนการจ้างงานตามความสามารถเฉพาะด้านหรือภารกิจ ของ ' + payrollAgency;
        tsContainer.appendChild(heading);
        const frame = document.createElement('div');
        frame.className = 'table-container';
        const table = document.createElement('table');
        table.className = 'clean-table';
        const thead = table.createTHead().insertRow();
        if (isAdmin) {
            const th = document.createElement('th');
            const check = document.createElement('input');
            check.type = 'checkbox';check.id = 'adminSpecialBulkAll';check.setAttribute('aria-label','เลือกนักศึกษาทั้งหมดในหมวดงานเฉพาะด้าน');
            th.appendChild(check);thead.appendChild(th);
        }
        [['รหัสนักศึกษา','left'],['ชื่อ-สกุล','left'],['ชั่วโมงสะสม','right'],['ยอดเงินรวม','right'],['จัดการ','center']]
          .forEach(function(field){const th = document.createElement('th');th.textContent=field[0];th.style.textAlign=field[1];thead.appendChild(th);});
        const tbody = table.createTBody();
        list.forEach(function(item){
            const row = tbody.insertRow();
            row.specialPayrollItem = item;
            const blocked = !!item.bulkInvalidAmount || !(Number(item.totalAmount) > 0);
            if (isAdmin) {
                const cell = row.insertCell();cell.style.textAlign='center';
                const check=document.createElement('input');check.type='checkbox';check.className='admin-special-bulk-check';
                check.disabled=blocked;check.setAttribute('aria-label','เลือกอนุมัติ '+String(item.studentId||''));
                if(blocked) check.title='กรุณาตรวจจำนวนเงินในรายการลงเวลา';
                cell.appendChild(check);
            }
            row.insertCell().textContent=String(item.studentId || '-');
            row.insertCell().textContent=String(item.studentName || '-');
            let cell=row.insertCell();cell.style.textAlign='right';cell.textContent=String(item.totalHours||0);
            cell=row.insertCell();cell.style.cssText='text-align:right;font-weight:bold;color:green';
            cell.textContent=Number(item.totalAmount||0).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2});
            cell=row.insertCell();cell.style.textAlign='center';
            const button=document.createElement('button');button.type='button';button.className='btn btn-success';
            button.style.cssText='padding:5px 10px;font-size:12px';button.textContent='✓ อนุมัติจ่าย';
            if (isAdmin && blocked) button.disabled=true;
            button.addEventListener('click',function(){approveTimeSheet(Object.assign({},item));});
            cell.appendChild(button);
        });
        frame.appendChild(table);
        tsContainer.appendChild(frame);
        if (isAdmin) {
            const bar=document.createElement('div');
            bar.style.cssText='display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;margin:12px 0;padding:14px;border:1px solid #bcd4f1;border-radius:10px;background:#f3f8ff';
            const summary=document.createElement('strong');summary.id='adminSpecialBulkSummary';
            const button=document.createElement('button');button.type='button';button.id='adminSpecialBulkApproveBtn';
            button.className='btn btn-success';button.textContent='อนุมัติรายการที่เลือกทั้งหมด';button.disabled=true;
            bar.appendChild(summary);bar.appendChild(button);tsContainer.appendChild(bar);
            table.querySelector('#adminSpecialBulkAll').addEventListener('change',function(e){
                table.querySelectorAll('.admin-special-bulk-check:not(:disabled)').forEach(function(box){box.checked=e.target.checked;});
                adminSpecialBulkRefresh_();
            });
            table.addEventListener('change',function(e){if(e.target.classList.contains('admin-special-bulk-check'))adminSpecialBulkRefresh_();});
            button.addEventListener('click',adminSpecialBulkApproveSelected_);
            adminSpecialBulkRefresh_();
        }
    });
    if(currentUser.role === 'admin') timeRunner.adminPayrollSubmittedLogs(sessionStorage.getItem('sessionToken'),payrollAgency);
    else timeRunner.getSubmittedTimeLogsForPayroll(currentUser.id,payrollAgency);

}

// ค้นหาฟังก์ชันเดิมแล้วแทนที่ด้วยอันนี้
function approveTimeSheet(item) {
    Swal.fire({
        title: 'ยืนยันการอนุมัติ',
        html: `อนุมัติการเบิกจ่ายให้ <b>${item.studentName}</b><br>ยอดเงิน <b>${item.totalAmount.toLocaleString()}</b> บาท<br><br><small style="color:gray">รายการนี้จะถูกส่งไปที่ระบบ Payroll เพื่อออกรายงานส่งกองคลัง</small>`,
        icon: 'info',
        showCancelButton: true,
        confirmButtonText: 'ยืนยันอนุมัติ',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#28a745'
    }).then((result) => {
        if (result.isConfirmed) {
            showLoading();
            // เพิ่มตัวระบุคนกดอนุมัติ
            item.payerId = currentUser.id; 
            
            // 🛡️ ดึง Token จากระบบ
            const token = sessionStorage.getItem('sessionToken');
            
            google.script.run.withSuccessHandler(res => {
                hideLoading();
                if(res.success) {
                    Swal.fire({
                        icon: 'success',
                        title: 'อนุมัติเรียบร้อย',
                        text: 'ข้อมูลเข้าสู่ระบบ Payroll แล้ว',
                        timer: 1500,
                        showConfirmButton: false
                    });
                    // รีโหลดหน้านี้ใหม่ เพื่อให้รายการที่อนุมัติแล้วหายไปจาก list รออนุมัติ
                    loadPayrollPage(); 
                } else {
                    Swal.fire('Error', res.message, 'error');
                }
            }).withFailureHandler(err => {hideLoading();showAlert(err.message||String(err),'error');})[currentUser.role==='admin'?'adminApproveAgencyTimeLogs':'approveTimeSheetToPayroll'](token,currentUser.role==='admin'?{agency:adminPayrollAgencySelection_,studentId:item.studentId,logIds:item.logIds}:item); // 🛡️ แนบ Token เป็นตัวแปรแรก
        }
    });
}
// --- Event Listener: เมื่อเลือกงานใน Dropdown (เปลี่ยนจาก List เป็น Table) ---
        document.getElementById('payrollJobFilter').addEventListener('change', payrollPopulateWorkDays_);

// เลือกวันที่ตามใบสมัครที่ยืนยันแล้ว ไม่เปิดเผยรายชื่อจนกว่าจะเลือกวันปฏิบัติงาน
function payrollThaiDateLabel_(iso) {
    const parts=String(iso||'').split('-');
    if(parts.length!==3) return iso;
    const date=new Date(Number(parts[0]),Number(parts[1])-1,Number(parts[2]));
    return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'});
}
function payrollEnsureWorkDayPicker_() {
    const job=document.getElementById('payrollJobFilter');
    if(!job) return null;
    let panel=document.getElementById('payrollWorkDayPanel');
    if(!panel){
        panel=document.createElement('div');
        panel.id='payrollWorkDayPanel';
        panel.style.cssText='display:none;margin:14px 0;padding:16px;border:1px solid #c9d8ec;border-radius:10px;background:#f5f9ff';
        const label=document.createElement('label');
        label.htmlFor='payrollWorkDayFilter';
        label.style.cssText='display:block;font-weight:700;color:#0d47a1;margin-bottom:7px';
        label.textContent='วันที่ปฏิบัติงาน (เลือกจากวันที่มีผู้สมัครจริง)';
        const select=document.createElement('select');
        select.className='form-control';select.id='payrollWorkDayFilter';
        select.style.cssText='width:100%;max-width:520px;padding:10px';
        const hint=document.createElement('div');
        hint.id='payrollWorkDayHint';hint.style.cssText='font-size:13px;color:#52637a;margin-top:8px';
        panel.appendChild(label);panel.appendChild(select);panel.appendChild(hint);
        const anchor=job.closest('.clean-input-group')||job.parentElement;
        anchor.parentNode.insertBefore(panel,anchor.nextSibling);
        select.addEventListener('change',renderPayrollApplicantsByDay_);
    }
    return panel;
}
function payrollPopulateWorkDays_() {
    const job=document.getElementById('payrollJobFilter');
    const panel=payrollEnsureWorkDayPicker_();
    if(!job||!panel) return;
    const selector=panel.querySelector('#payrollWorkDayFilter');
    const hint=panel.querySelector('#payrollWorkDayHint');
    const initial=document.getElementById('payrollInitialMsg');
    const noData=document.getElementById('noStudentPayroll');
    const list=document.getElementById('payrollListContainer');
    if(list) list.replaceChildren();
    if(noData) noData.style.display='none';
    selector.replaceChildren();
    const choose=document.createElement('option');choose.value='';choose.textContent='-- กรุณาเลือกวันที่ปฏิบัติงาน --';selector.appendChild(choose);
    if(!job.value){ panel.style.display='none';if(initial){initial.style.display='block';initial.textContent='กรุณาเลือกงานก่อน แล้วเลือกวันที่ปฏิบัติงาน';}return; }
    panel.style.display='block';
    const candidates=payrollDataCache.filter(function(st){return st.jobTitle===job.value;});
    const count={};let invalid=0;
    candidates.forEach(function(st){
        if(!/^\d{4}-\d{2}-\d{2}$/.test(String(st.workDate||'')) || !['morning','afternoon','evening','full'].includes(st.session)) {invalid++;return;}
        count[st.workDate]=(count[st.workDate]||0)+1;
    });
    const days=Object.keys(count).sort();
    days.forEach(function(date){const option=document.createElement('option');option.value=date;option.textContent=payrollThaiDateLabel_(date)+' — '+count[date]+' รายการ';selector.appendChild(option);});
    hint.textContent='พบ '+days.length+' วันปฏิบัติงาน รวม '+(candidates.length-invalid)+' รายการที่มีวันและช่วงเวลาครบ'+
        (invalid?' | อีก '+invalid+' รายการไม่มีวัน/ช่วงเวลาที่ถูกต้อง กรุณาตรวจชีต Registrations':'');
    if(initial){initial.style.display='block';initial.textContent=days.length?'กรุณาเลือกวันที่ปฏิบัติงานเพื่อแสดงผู้สมัครของวันนั้น':'ไม่พบวันที่ปฏิบัติงานจากใบสมัครของงานนี้';}
    if(noData && !days.length) noData.style.display='block';
}
function payrollSessionLabel_(slot){
    return ({morning:'เช้า (150 บาท)',afternoon:'บ่าย (150 บาท)',evening:'เย็น (150 บาท)',full:'เต็มวัน (300 บาท)'})[slot]||'-';
}
function renderPayrollApplicantsByDay_() {
    const job=document.getElementById('payrollJobFilter');
    const picker=document.getElementById('payrollWorkDayFilter');
    const container=document.getElementById('payrollListContainer');
    const initial=document.getElementById('payrollInitialMsg');
    const noData=document.getElementById('noStudentPayroll');
    if(!job||!picker||!container) return;
    container.replaceChildren();
    if(noData) noData.style.display='none';
    if(!job.value || !picker.value){if(initial){initial.style.display='block';initial.textContent='กรุณาเลือกวันที่ปฏิบัติงานก่อนแสดงรายชื่อ';}return;}
    const day=picker.value;
    const filtered=payrollDataCache.filter(function(st){return st.jobTitle===job.value&&st.workDate===day&&['morning','afternoon','evening','full'].includes(st.session);});
    if(initial) initial.style.display='none';
    if(!filtered.length){if(noData)noData.style.display='block';return;}
    const heading=document.createElement('div');
    heading.style.cssText='margin:12px 0;font-weight:700;color:#0d47a1';
    heading.textContent='วันที่ '+payrollThaiDateLabel_(day)+' | '+filtered.length+' รายการรอส่งเบิกจ่าย';
    container.appendChild(heading);
    const frame=document.createElement('div');frame.className='payroll-table-container';
    const table=document.createElement('table');table.className='payroll-table';
    const thead=table.createTHead().insertRow();
    const admin=currentUser&&currentUser.role==='admin';
    if(admin){const th=document.createElement('th');const check=document.createElement('input');check.type='checkbox';check.id='adminPayrollBulkAll';check.setAttribute('aria-label','เลือกทั้งหมดของวันที่ปฏิบัติงานนี้');th.appendChild(check);thead.appendChild(th);}
    ['ลำดับ','ชื่อ-สกุล / รหัสนักศึกษา','วันที่ปฏิบัติงาน','ช่วงเวลาที่สมัคร','ยอดเงิน','จัดการเบิกจ่าย'].forEach(function(name){const th=document.createElement('th');th.textContent=name;thead.appendChild(th);});
    const tbody=table.createTBody();
    filtered.forEach(function(st,index){
        const blocked=st.studentStatus==='สำเร็จการศึกษา'||st.studentStatus==='พ้นสภาพ';
        const row=tbody.insertRow();
        if(blocked)row.style.backgroundColor='#fff0f2';
        if(admin){
            row.dataset.bulkIndex=String(index);row.payrollBulkCandidate=st;
            const cell=row.insertCell();const check=document.createElement('input');check.type='checkbox';check.className='admin-payroll-bulk-check';
            check.disabled=blocked;check.setAttribute('aria-label','เลือกอนุมัติ '+String(st.studentId||''));cell.appendChild(check);
        }
        row.insertCell().textContent=String(index+1);
        const person=row.insertCell();const name=document.createElement('strong');name.textContent=String(st.studentName||'-');person.appendChild(name);
        const id=document.createElement('div');id.style.cssText='font-size:12px;color:#64748b';id.textContent=String(st.studentId||'-');person.appendChild(id);
        if(blocked){const status=document.createElement('div');status.style.color='#b91c1c';status.textContent=String(st.studentStatus||'');person.appendChild(status);}
        const cellDate=row.insertCell();cellDate.textContent=payrollThaiDateLabel_(st.workDate);
        // Hidden values used by existing bulk-approval routine; no editable date or slot.
        const dateVal=document.createElement('input');dateVal.type='hidden';dateVal.className='admin-payroll-bulk-date';dateVal.value=st.workDate;cellDate.appendChild(dateVal);
        const cellSlot=row.insertCell();cellSlot.textContent=payrollSessionLabel_(st.session);
        const slotVal=document.createElement('input');slotVal.type='hidden';slotVal.className='admin-payroll-bulk-slot';slotVal.value=st.session;cellSlot.appendChild(slotVal);
        row.insertCell().textContent=(st.session==='full'?300:150).toLocaleString('th-TH')+' บาท';
        const action=row.insertCell();const button=document.createElement('button');button.type='button';button.className='btn '+(blocked?'btn-secondary':'btn-primary');
        button.textContent=blocked?'ไม่สามารถเบิกจ่าย':'เบิกจ่าย';button.disabled=blocked;
        button.addEventListener('click',function(){openPayModal(st);});action.appendChild(button);
    });
    frame.appendChild(table);container.appendChild(frame);
    if(admin){
        const toolbar=document.createElement('div');toolbar.style.cssText='display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin:12px 0;padding:14px;border:1px solid #bcd4f1;border-radius:10px;background:#f3f8ff';
        const summary=document.createElement('strong');summary.id='adminPayrollBulkSummary';toolbar.appendChild(summary);
        const btn=document.createElement('button');btn.type='button';btn.id='adminPayrollBulkApproveBtn';btn.className='btn btn-success';btn.textContent='อนุมัติรายการที่เลือกทั้งหมด';btn.disabled=true;toolbar.appendChild(btn);
        btn.addEventListener('click',adminPayrollBulkApproveSelected_);
        table.querySelector('#adminPayrollBulkAll').addEventListener('change',function(e){table.querySelectorAll('.admin-payroll-bulk-check:not(:disabled)').forEach(function(check){check.checked=e.target.checked;});adminPayrollBulkRefresh_();});
        table.addEventListener('change',function(e){if(e.target.classList.contains('admin-payroll-bulk-check'))adminPayrollBulkRefresh_();});
        container.appendChild(toolbar);adminPayrollBulkRefresh_();
    }
}
// ปุ่มอนุมัติรายคนจะรับวันที่และช่วงเวลาตามใบสมัครแบบอ่านอย่างเดียว
function openPayModal(st) {
    if(!st||!st.workDate||!st.session){showAlert('ไม่พบวันที่หรือช่วงเวลาจากใบสมัคร กรุณาโหลดใหม่','error');return;}
    document.getElementById('payStudentName').textContent=st.studentName;
    document.getElementById('payJobTitle').textContent=st.jobTitle;
    document.getElementById('payRegId').value=st.regId;
    document.getElementById('payStudentId').value=st.studentId;
    document.getElementById('payJobTitleVal').value=st.jobTitle;
    const date=document.getElementById('payDate');date.value=st.workDate;date.readOnly=true;
    document.getElementById('selectedSession').value=st.session;
    const amount=st.session==='full'?300:150;
    document.getElementById('payAmount').value=amount;
    const display=document.getElementById('payAmountDisplay');if(display)display.textContent=amount;
    document.querySelectorAll('#payrollModal .slot-card').forEach(function(card){
        card.classList.remove('active');card.style.pointerEvents='none';card.style.opacity='0.65';
        const handler=card.getAttribute('onclick')||'';
        if(handler.indexOf("'"+st.session+"'")!==-1){card.classList.add('active');card.style.opacity='1';}
    });
    let info=document.getElementById('payrollApprovedRegistrationSlot');
    if(!info){info=document.createElement('p');info.id='payrollApprovedRegistrationSlot';info.style.cssText='font-weight:700;color:#0d47a1;margin:10px 0';date.parentNode.appendChild(info);}
    info.textContent='วันและช่วงเวลาตามใบสมัคร: '+payrollThaiDateLabel_(st.workDate)+' | '+payrollSessionLabel_(st.session);
    document.getElementById('payrollModal').style.display='flex';
}

    // --- ฟังก์ชันสำหรับเลือก Slot ใน Modal ใหม่ ---
    function selectPaySlot(element, value) {
        // 1. เอา active ออกจากทุกการ์ด
        document.querySelectorAll('.slot-card').forEach(card => card.classList.remove('active'));
        
        // 2. ใส่ active ให้การ์ดที่เลือก
        element.classList.add('active');
        
        // 3. อัปเดตค่าใน Hidden Input
        document.getElementById('selectedSession').value = value;
        
        // 4. คำนวณเงินใหม่
        let amount = 150;
        if(value === 'full') amount = 300;
        
        document.getElementById('payAmount').value = amount;
        document.getElementById('payAmountDisplay').textContent = amount;
    }
    // --- 5. เปิด Modal เบิกจ่าย (UI ใหม่) ---

// --- 5. เปิด Modal เบิกจ่าย (UI ใหม่) ---


    // --- 6. คำนวณเงิน (เพิ่มความปลอดภัย) ---
    function calcPay() {
        const sessionEl = document.querySelector('input[name="paySession"]:checked');
        if(!sessionEl) return;
        
        const session = sessionEl.value;
        const amount = (session === 'full') ? 300 : 150;
        
        // ใช้ value ในการส่งค่า แต่ใช้ toLocaleString โชว์ความสวยงามไม่ได้ใน input type="text" ปกติ
        // ดังนั้นโชว์เลขเพียวๆ หรือเปลี่ยน input เป็น div ถ้าอยากโชว์ลูกน้ำ
        document.getElementById('payAmount').value = amount; 
    }

// 7. ยืนยันการเบิกจ่าย (แก้ให้ดึงค่าจาก UI ใหม่)
    document.getElementById('payrollForm').addEventListener('submit', (e) => {
        e.preventDefault();
        
        const data = {
            userId: currentUser.id,
            regId: document.getElementById('payRegId').value,
            studentName: document.getElementById('payStudentName').textContent,
            studentId: document.getElementById('payStudentId').value,
            jobTitle: document.getElementById('payJobTitleVal').value,
            workDate: document.getElementById('payDate').value,
            
            // ** เปลี่ยนตรงนี้: ดึงจาก hidden input แทน radio button **
            session: document.getElementById('selectedSession').value, 
            amount: document.getElementById('payAmount').value
        };
        
        // (ส่วน SweetAlert และส่งข้อมูล เหมือนเดิม...)
        Swal.fire({
            title: 'ยืนยันเบิกจ่าย', 
            html: `จ่ายให้ <b>${data.studentName}</b><br>ยอดเงิน <b style="color:green; font-size:18px;">${data.amount}</b> บาท`,
            icon: 'warning',
            showCancelButton: true, confirmButtonText: 'ยืนยัน', cancelButtonText: 'ยกเลิก'
        }).then((result) => {
            if (result.isConfirmed) {
                showLoading();
                google.script.run.withSuccessHandler(res => {
                    hideLoading();
                    if(res.success) {
                        document.getElementById('payrollModal').style.display = 'none';
                        Swal.fire('ทำรายการสำเร็จ', 'บันทึกการเบิกจ่ายเรียบร้อย', 'success');
                        loadPayrollPage(); 
                    } else {
                        Swal.fire('เกิดข้อผิดพลาด', res.message, 'error');
                    }
                }).withFailureHandler(err => {hideLoading();showAlert(err.message||String(err),'error');})[currentUser.role==='admin'?'adminApproveJobPayroll':'submitPayroll'](sessionStorage.getItem('sessionToken'),currentUser.role==='admin'?{...data,agency:adminPayrollAgencySelection_}:data); // 🛡️ แนบ Token
            }
        });
    });
