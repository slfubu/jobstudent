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
      showAlert('การเชื่อมต่อขัดข้อง กรุณาโหลดรายการใหม่และตรวจว่ามีการบันทึกแล้วหรือไม่ ก่อนกดซ้ำ: '+(err && err.message || err),'error');
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
      showAlert('ไม่ทราบว่าบันทึกสำเร็จหรือไม่ กรุณาตรวจสอบ Payroll ก่อนกดซ้ำ: '+
        String(err && err.message || err),'error');
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
    select.addEventListener('change',function(){adminPayrollAgencySelection_=select.value; payrollDataCache=[]; const oldRows=document.getElementById('payrollListContainer'); if(oldRows) oldRows.innerHTML=''; const emptyHint=document.getElementById('payrollInitialMsg'); if(emptyHint) emptyHint.style.display='block'; if(adminPayrollAgencySelection_)renderPayrollPageForAgency_();else {const summary=document.getElementById('myBudgetSummary');if(summary)summary.innerHTML='';const list=document.getElementById('payrollJobFilter');if(list)list.innerHTML='<option value="">-- กรุณาเลือกงาน --</option>';const ts=document.getElementById('timeSheetPayrollContainer');if(ts)ts.innerHTML='';}});
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
    document.getElementById('payrollJobFilter').addEventListener('change', function() {
        const selectedJob = this.value;
        const container = document.getElementById('payrollListContainer');
        const initialMsg = document.getElementById('payrollInitialMsg');
        const noDataMsg = document.getElementById('noStudentPayroll');
        
        container.innerHTML = '';
        initialMsg.style.display = 'none';

        if (!selectedJob) {
            initialMsg.style.display = 'block';
            return;
        }

        // กรองเฉพาะงานที่เลือก
        const filteredList = payrollDataCache.filter(item => item.jobTitle === selectedJob);

        if (filteredList.length === 0) {
            noDataMsg.style.display = 'block';
        } else {
            noDataMsg.style.display = 'none';
            
            // สร้างตาราง
            const tableContainer = document.createElement('div');
            tableContainer.className = 'payroll-table-container';
            
            const table = document.createElement('table');
            table.className = 'payroll-table';
            table.innerHTML = `
                <thead>
                    <tr>
                        ${currentUser.role === 'admin' ? '<th style="text-align:center;"><input type="checkbox" id="adminPayrollBulkAll" aria-label="เลือกนักศึกษาทั้งหมดในงาน" /></th>' : ''}
                        <th>ลำดับที่</th>
                        <th>ชื่อ-สกุล / รหัสนักศึกษา</th>
                        ${currentUser.role === 'admin' ? '<th>วันที่ปฏิบัติงาน</th><th>ช่วงเวลา</th>' : ''}
                        <th style="text-align:right;">จัดการเบิกจ่าย</th>
                    </tr>
                </thead>
                <tbody></tbody>
            `;
            
            const tbody = table.querySelector('tbody');
            
            filteredList.forEach((st, index) => {
                // 1. ตรวจสอบสถานะและสร้าง Tag ต่อท้ายชื่อ
                let statusTag = '';
                let isBlocked = false; // ตัวแปรเช็คว่าถูกบล็อกการจ่ายเงินหรือไม่
                let displayStatusDate = st.statusDate ? formatDate(st.statusDate) : '-';

                if (st.studentStatus === 'สำเร็จการศึกษา' || st.studentStatus === 'พ้นสภาพ') {
                    isBlocked = true;
                    // สร้างข้อความสีแดงต่อท้ายชื่อ
                    statusTag = `<span style="color: #d32f2f; font-size: 13px; font-weight: 500; margin-left: 8px;">
                                   (${st.studentStatus}เมื่อ ${displayStatusDate})
                                 </span>`;
                }

                // 2. เปลี่ยนฟังก์ชัน onclick ของปุ่มเบิกจ่าย
                // ถ้า isBlocked = true ให้เรียกฟังก์ชันโชว์ Error แทนการเปิด Modal
                const buttonAction = isBlocked 
                    ? `showBlockedPayrollError('${st.studentName}', '${st.studentStatus}', '${displayStatusDate}')` 
                    : `openPayModal(${JSON.stringify(st).replace(/"/g, '&quot;')})`;

                // 3. เปลี่ยนสีปุ่มถ้าถูกบล็อกให้เป็นสีเทาและกดไม่ได้ (หรือกดแล้วโชว์ Error)
                const btnClass = isBlocked ? 'btn-secondary' : 'btn-primary';
                const btnIconColor = isBlocked ? '#999' : 'white';

                const tr = document.createElement('tr');
                // ไฮไลต์พื้นหลังแถวเป็นสีแดงอ่อนถ้าถูกบล็อก
                if(isBlocked) tr.style.backgroundColor = '#fff0f2'; 

                if(currentUser.role === 'admin') {
                    tr.dataset.bulkIndex = String(index);
                    tr.payrollBulkCandidate = st;
                }
                tr.innerHTML = `
                    ${currentUser.role === 'admin' ? `<td style="text-align:center;"><input type="checkbox" class="admin-payroll-bulk-check" ${isBlocked ? 'disabled title="ไม่สามารถอนุมัติรายการนี้"' : ''} aria-label="เลือกอนุมัติรายการนี้" /></td>` : ''}
                    <td>${index + 1}</td>
                    <td>
                        <div style="font-weight:bold; color:#333; display: flex; align-items: center;">
                            ${st.studentName} ${statusTag}
                        </div>
                        <div style="font-size:12px; color:#888;">${st.studentId}</div>
                    </td>
                    ${currentUser.role === 'admin' ? `<td><input class="form-control admin-payroll-bulk-date" type="date" aria-label="วันที่ปฏิบัติงานของ ${index + 1}" ${isBlocked ? 'disabled' : ''} style="min-width:140px;padding:6px" /></td>
                      <td><select class="form-control admin-payroll-bulk-slot" aria-label="ช่วงเวลาปฏิบัติงานของ ${index + 1}" ${isBlocked ? 'disabled' : ''} style="min-width:115px;padding:6px"><option value="">-- เลือก --</option><option value="morning">เช้า 150</option><option value="afternoon">บ่าย 150</option><option value="evening">เย็น 150</option><option value="full">เต็มวัน 300</option></select></td>` : ''}
                    <td style="text-align:right;">
                         <button class="btn ${btnClass}" onclick="${buttonAction}" style="padding: 6px 15px; font-size:13px; border-radius:20px;">
                             เบิกจ่าย <i class="material-icons" style="font-size:14px; vertical-align:middle; margin-left:3px; color:${btnIconColor};">arrow_forward</i>
                         </button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
            
            if (currentUser.role === 'admin') {
                const toolbar=document.createElement('div');
                toolbar.style.cssText='display:flex;flex-wrap:wrap;align-items:end;gap:10px;margin:12px 0;padding:14px;border:1px solid #bcd4f1;border-radius:10px;background:#f3f8ff';
                toolbar.innerHTML=`
                  <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;">วันที่ปฏิบัติงานสำหรับรายการที่เลือก
                    <input type="date" class="form-control" id="adminPayrollBulkMasterDate" style="padding:7px;" />
                  </label>
                  <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;">ช่วงเวลาสำหรับรายการที่เลือก
                    <select class="form-control" id="adminPayrollBulkMasterSlot" style="padding:7px;"><option value="">-- เลือกช่วงเวลา --</option><option value="morning">เช้า (150 บาท)</option><option value="afternoon">บ่าย (150 บาท)</option><option value="evening">เย็น (150 บาท)</option><option value="full">เต็มวัน (300 บาท)</option></select>
                  </label>
                  <button type="button" class="btn btn-secondary" id="adminPayrollBulkFillBtn">ใส่วันที่/ช่วงเวลาให้รายการที่ติ๊ก</button>
                  <div style="margin-left:auto;display:flex;flex-direction:column;gap:6px;align-items:end;">
                    <strong id="adminPayrollBulkSummary">เลือก 0 รายการ | ยอดรวม 0 บาท</strong>
                    <button type="button" class="btn btn-success" id="adminPayrollBulkApproveBtn" disabled>อนุมัติรายการที่เลือกทั้งหมด</button>
                  </div>`;
                container.appendChild(toolbar);
                toolbar.querySelector('#adminPayrollBulkFillBtn').addEventListener('click',adminPayrollBulkFillSelected_);
                toolbar.querySelector('#adminPayrollBulkApproveBtn').addEventListener('click',adminPayrollBulkApproveSelected_);
                const selectAll=table.querySelector('#adminPayrollBulkAll');
                selectAll.addEventListener('change',function(){
                    table.querySelectorAll('.admin-payroll-bulk-check:not(:disabled)').forEach(function(c){c.checked=selectAll.checked;});
                    adminPayrollBulkRefresh_();
                });
                table.addEventListener('change',function(e){
                    if(e.target.matches('.admin-payroll-bulk-check, .admin-payroll-bulk-date, .admin-payroll-bulk-slot')) adminPayrollBulkRefresh_();
                });
            }
            tableContainer.appendChild(table);
            container.appendChild(tableContainer);
            if (currentUser.role === 'admin') adminPayrollBulkRefresh_();
        }
    });

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
    function openPayModal(st) {
        document.getElementById('payStudentName').textContent = st.studentName;
        document.getElementById('payJobTitle').textContent = st.jobTitle;
        
        document.getElementById('payRegId').value = st.regId;
        document.getElementById('payStudentId').value = st.studentId;
        document.getElementById('payJobTitleVal').value = st.jobTitle;
        
        // Set วันที่ปัจจุบัน
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        document.getElementById('payDate').value = `${yyyy}-${mm}-${dd}`;
        
        // Reset Selection ไปที่ Morning
        const cards = document.querySelectorAll('.slot-card');
        selectPaySlot(cards[0], 'morning'); // เรียกฟังก์ชันเลือกการ์ดใบแรก

        document.getElementById('payrollModal').style.display = 'flex';
    }
// --- 5. เปิด Modal เบิกจ่าย (UI ใหม่) ---
    function openPayModal(st) {
        document.getElementById('payStudentName').textContent = st.studentName;
        document.getElementById('payJobTitle').textContent = st.jobTitle;
        
        document.getElementById('payRegId').value = st.regId;
        document.getElementById('payStudentId').value = st.studentId;
        document.getElementById('payJobTitleVal').value = st.jobTitle;
        
        // Set วันที่ปัจจุบัน
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        document.getElementById('payDate').value = `${yyyy}-${mm}-${dd}`;
        
        // Reset Selection ไปที่ Morning
        const cards = document.querySelectorAll('.slot-card');
        selectPaySlot(cards[0], 'morning'); // เรียกฟังก์ชันเลือกการ์ดใบแรก

        document.getElementById('payrollModal').style.display = 'flex';
    }

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
