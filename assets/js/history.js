// ==========================================
// 1. ตั้งค่าเมนู นำเข้าข้อมูลย้อนหลัง
// ==========================================
setupNavClick('navImportHistory', 'importHistorySection', () => {
    // ใส่คำสั่งให้ดึงข้อมูลตารางมาโชว์ในอนาคตได้ที่นี่
});

function downloadCSVTemplate() {
    const csvContent = "\uFEFFเดือน,รหัสนักศึกษา,ชื่อ-สกุล,คณะ,หน่วยงาน,ชื่องาน,จำนวนเงิน\nมกราคม,6612345678,นายใจดี เรียนเก่ง,คณะเกษตรศาสตร์,สำนักงานพัฒนานักศึกษา,ผู้ช่วยกิจกรรม,1500\nกุมภาพันธ์,6587654321,นางสาวสมหญิง รักเรียน,คณะวิทยาศาสตร์,สำนักวิทยบริการ,บรรณารักษ์,2400";
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "Template_ข้อมูลจ้างงานย้อนหลัง.csv";
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
}

// ฟังก์ชันบันทึกข้อมูลด้วยมือ
function submitManualHistory(e) {
    e.preventDefault();
    const uploaderName = currentUser ? `${currentUser.prefix || ''}${currentUser.firstName} ${currentUser.lastName}`.trim() : 'Admin';
    
    // ⚠️ ต้องมีตัวแปร faculty ตรงนี้ เพื่อดึงค่าจากช่องคณะส่งไปหลังบ้าน
    const payload = {
        year: document.getElementById('manualYear').value,
        month: document.getElementById('manualMonth').value,
        studentId: document.getElementById('manualStdId').value,
        studentName: document.getElementById('manualStdName').value,
        faculty: document.getElementById('manualFaculty').value, // <--- จุดที่ดึงค่าคณะ
        department: document.getElementById('manualDept').value,
        jobTitle: document.getElementById('manualJob').value,
        amountPaid: document.getElementById('manualAmount').value,
        uploaderName: uploaderName
    };

    Swal.fire({ title: 'กำลังบันทึกข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    google.script.run.withSuccessHandler(res => {
        if(res.success) {
            Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ', timer: 1500, showConfirmButton: false });
            document.getElementById('manualHistoryForm').reset(); 
            document.getElementById('manualYear').value = payload.year; // คงค่าปีไว้
            loadHistoryData(); // โหลดตารางใหม่
        } else {
            Swal.fire('ข้อผิดพลาด', res.message, 'error');
        }
    }).addSingleHistoryRecord(payload);
}

// ==========================================
// 4. ฟังก์ชันอัปโหลดไฟล์ CSV
// ==========================================
function uploadHistoryFile() {
    const fileInput = document.getElementById('historyFileInput');
    const yearSelect = document.getElementById('importHistoryYear').value;

    if (fileInput.files.length === 0) {
        showAlert('กรุณาเลือกไฟล์ที่ต้องการนำเข้า', 'error');
        return;
    }

    const file = fileInput.files[0];
    if (!file.name.toLowerCase().endsWith('.csv')) {
        showAlert('ระบบรองรับเฉพาะไฟล์นามสกุล .csv เท่านั้น', 'error');
        return;
    }

    const uploaderName = currentUser ? `${currentUser.prefix || ''}${currentUser.firstName} ${currentUser.lastName}`.trim() : 'Admin';

    const reader = new FileReader();
    reader.onload = function(e) {
        const csvContent = e.target.result;
        Swal.fire({
            title: 'กำลังนำเข้าข้อมูล...',
            text: 'ระบบกำลังประมวลผลและบันทึกลงฐานข้อมูล กรุณารอสักครู่',
            allowOutsideClick: false,
            didOpen: () => { Swal.showLoading(); }
        });

        google.script.run.withSuccessHandler(res => {
            if (res.success) {
                Swal.fire('นำเข้าสำเร็จ!', `บันทึกข้อมูลจำนวน ${res.count} รายการ เรียบร้อยแล้ว`, 'success');
                fileInput.value = ''; 
            } else {
                Swal.fire('เกิดข้อผิดพลาด', res.message, 'error');
            }
        }).importHistoryData(csvContent, yearSelect, uploaderName);
    };
    reader.readAsText(file, 'UTF-8');
}

function switchHistoryTab(tabId) {
    const tabs = ['tabSearch', 'tabUpload', 'tabManual', 'tabBudget'];
    const panels = ['panelSearch', 'panelUpload', 'panelManual', 'panelBudget'];

    tabs.forEach(id => document.getElementById(id).classList.remove('active'));
    panels.forEach(id => document.getElementById(id).classList.remove('active'));

    document.getElementById('tab' + tabId.charAt(0).toUpperCase() + tabId.slice(1)).classList.add('active');
    document.getElementById('panel' + tabId.charAt(0).toUpperCase() + tabId.slice(1)).classList.add('active');

    if(tabId === 'budget') renderHistoryBudgetTable(); // แก้เป็นชื่อใหม่
}
// ==========================================
// ระบบดึงข้อมูลและค้นหาประวัติย้อนหลัง
// ==========================================
let globalHistoryData = []; // เก็บข้อมูลทั้งหมดไว้ในเครื่อง เพื่อให้ค้นหาได้ไวโดยไม่ต้องโหลดใหม่

// 1. ฟังก์ชันโหลดข้อมูลจากหลังบ้าน
function loadHistoryData() {
    const tbody = document.querySelector('#historyTable tbody');
    tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 40px; color: #1976D2;"><i class="material-icons" style="animation: spin 2s linear infinite; vertical-align: middle;">autorenew</i> กำลังโหลดข้อมูล...</td></tr>';

    google.script.run.withSuccessHandler(res => {
        globalHistoryData = res || [];
        updateDepartmentDropdown(globalHistoryData);
        renderHistoryTable();
        
        // เมื่อโหลดประวัติเสร็จ ให้โหลดงบประมาณตามมาทันที (ซ้อนกัน)
        google.script.run.withSuccessHandler(budgets => {
            globalBudgetData = budgets || [];
            renderHistoryBudgetTable();
        }).getHistoryBudgets();
        
    }).getHistoryDataFromExternal();
}
function submitHistoryBudget(e) {
    e.preventDefault();
    const payload = {
        year: document.getElementById('budgetYear').value,
        department: document.getElementById('budgetDept').value,
        amount: parseFloat(document.getElementById('budgetAmount').value) || 0,
        uploaderName: currentUser ? `${currentUser.prefix || ''}${currentUser.firstName} ${currentUser.lastName}`.trim() : 'Admin'
    };

    Swal.fire({ title: 'กำลังบันทึกงบประมาณ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    google.script.run.withSuccessHandler(res => {
        if(res.success) {
            Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ', timer: 1500, showConfirmButton: false });
            document.getElementById('budgetAmount').value = ''; 
            loadHistoryData(); // โหลดข้อมูลใหม่ทั้งหมดเพื่อให้ตารางอัปเดต
        } else {
            Swal.fire('ข้อผิดพลาด', res.message, 'error');
        }
    }).saveHistoryBudget(payload);
}

// 4. ฟังก์ชันพระเอก! (คำนวณและวาดตารางสรุปงบ)
function renderHistoryBudgetTable() {
    const year = String(document.getElementById('filterBudgetYear').value);
    const tbody = document.querySelector('#budgetSummaryTable tbody');
    tbody.innerHTML = '';
    
    // 1. ดึงงบที่ถูกตั้งไว้สำหรับปีนี้
    const budgetsThisYear = globalBudgetData.filter(b => String(b.year) === year);
    
    // 2. ดึงประวัติเบิกจ่ายทั้งหมดของปีนี้
    const spentThisYear = globalHistoryData.filter(h => String(h.year) === year);
    
    // 3. รวบรวมรายชื่อหน่วยงานทั้งหมด (ทั้งที่ได้งบ และที่มีการจ่ายจริง)
    const deptSet = new Set();
    budgetsThisYear.forEach(b => deptSet.add(b.department));
    spentThisYear.forEach(h => deptSet.add(h.department));
    const allDepts = Array.from(deptSet).sort();

    if(allDepts.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #64748b; padding: 20px;">ไม่มีข้อมูลการจัดสรรงบ หรือการเบิกจ่ายในปีการศึกษา ${year}</td></tr>`;
        return;
    }

    let totalAllocated = 0, totalSpent = 0;

    // 4. คำนวณทีละหน่วยงาน
    allDepts.forEach(dept => {
        // หางบตั้งต้น
        const budgetObj = budgetsThisYear.find(b => b.department === dept);
        const allocated = budgetObj ? parseFloat(budgetObj.allocatedAmount) : 0;
        
        // รวมยอดเบิกจ่ายจริงของหน่วยงานนี้
        const spent = spentThisYear.filter(h => h.department === dept).reduce((sum, h) => sum + h.amount, 0);
        
        const remaining = allocated - spent;
        
        totalAllocated += allocated;
        totalSpent += spent;

        // กำหนดป้ายสถานะ (Badge)
        let statusBadge = '';
        if (allocated === 0 && spent > 0) {
            statusBadge = '<span style="background: #fef2f2; color: #ef4444; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: bold;">🔴 ไม่ได้ตั้งงบ แต่มีการจ่าย</span>';
        } else if (remaining < 0) {
            statusBadge = '<span style="background: #fef2f2; color: #ef4444; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: bold;">🔴 เบิกเกินงบ</span>';
        } else if (remaining === 0 && allocated > 0) {
            statusBadge = '<span style="background: #fef9c3; color: #ca8a04; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: bold;">🟡 งบหมดพอดี</span>';
        } else {
            statusBadge = '<span style="background: #f0fdf4; color: #22c55e; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: bold;">🟢 ปกติ</span>';
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight: 500;">${dept}</td>
            <td style="text-align: right; color: #1976D2;">${allocated.toLocaleString('th-TH')}</td>
            <td style="text-align: right; color: #ea580c;">${spent.toLocaleString('th-TH')}</td>
            <td style="text-align: right; font-weight: bold; color: ${remaining < 0 ? '#ef4444' : '#334155'};">${remaining.toLocaleString('th-TH')}</td>
            <td style="text-align: center;">${statusBadge}</td>
        `;
        tbody.appendChild(tr);
    });
    // แถวสรุปผลรวมด้านล่างสุด
    const sumRow = document.createElement('tr');
    sumRow.style.background = '#f1f5f9';
    const totalRemaining = totalAllocated - totalSpent;
    sumRow.innerHTML = `
        <td style="text-align: right; font-weight: bold; padding: 15px;">รวมทั้งสิ้น:</td>
        <td style="text-align: right; font-weight: bold; color: #1976D2; padding: 15px;">${totalAllocated.toLocaleString('th-TH')}</td>
        <td style="text-align: right; font-weight: bold; color: #ea580c; padding: 15px;">${totalSpent.toLocaleString('th-TH')}</td>
        <td style="text-align: right; font-weight: bold; font-size: 15px; color: ${totalRemaining < 0 ? '#ef4444' : '#0f172a'}; padding: 15px;">${totalRemaining.toLocaleString('th-TH')}</td>
        <td></td>
    `;
    tbody.appendChild(sumRow);
}

function updateDepartmentDropdown(data) {
    // ดึงมาแค่ช่องค้นหา (ไม่ต้องดึง manualDept แล้ว)
    const filterSelect = document.getElementById('filterHistoryDept');
    const currentFilterVal = filterSelect.value;
    
    // ดึงรายชื่อหน่วยงานที่มีในฐานข้อมูลแบบไม่ซ้ำกัน
    const depts = [...new Set(data.map(item => item.department))].filter(Boolean);
    
    // รายชื่อหน่วยงานตั้งต้นที่คุณเตรียมไว้ (เอาไว้ให้ช่องค้นหามีตัวเลือกครบๆ)
    const commonDepts = [
        "งานอำนวยการ", "งานศิษย์เก่าสัมพันธ์", "งานพัฒนานักศึกษา", 
        "งานกีฬาและนันทนาการ", "งานวินัยและสวัสดิภาพนักศึกษา", 
        "ทุนการศึกษา", "กองทุนเงินให้กู้ยืมเพื่อการศึกษา", 
        "แนะแนวและให้คําปรึกษาสุขภาพจิต", "จัดหางานและจ้างงานระหว่างเรียน"
    ];
    
    // นำหน่วยงานในฐานข้อมูล มารวมกับหน่วยงานตั้งต้น แล้วเรียงลำดับ ก-ฮ
    const allDepts = [...new Set([...commonDepts, ...depts])].sort(); 
    
    let filterHtml = '<option value="all">ทุกหน่วยงาน</option>';
    
    // สร้างตัวเลือกให้เฉพาะช่องค้นหา
    allDepts.forEach(dept => {
        filterHtml += `<option value="${dept}">${dept}</option>`;
    });
    
    filterSelect.innerHTML = filterHtml;
    
    // คืนค่าที่เคยเลือกไว้ตอนค้นหา (ถ้ามี)
    if(allDepts.includes(currentFilterVal)) {
        filterSelect.value = currentFilterVal;
    }
}

let currentHistoryPage = 1;
let historyRowsPerPage = 10; // ค่าเริ่มต้นแสดง 10 รายการ

// เมื่อเปลี่ยนจำนวนแถวที่ต้องการแสดง
function changeHistoryRowsPerPage() {
    const val = document.getElementById('historyRowsPerPage').value;
    historyRowsPerPage = val === 'all' ? 'all' : parseInt(val);
    currentHistoryPage = 1; // กลับไปหน้าแรกเสมอ
    renderHistoryTable();
}

// เมื่อกดเปลี่ยนหน้า
function changeHistoryPage(page) {
    currentHistoryPage = page;
    renderHistoryTable();
}

function filterHistoryTable() {
    currentHistoryPage = 1;
    renderHistoryTable();
}

function renderHistoryTable() {
    const yearFilter = String(document.getElementById('filterHistoryYear').value);
    const deptFilter = document.getElementById('filterHistoryDept').value;
    const searchText = document.getElementById('searchHistoryText').value.toLowerCase().trim();
    const tbody = document.querySelector('#historyTable tbody');
    const paginationContainer = document.getElementById('historyPagination');
    tbody.innerHTML = '';
    
    const filteredData = globalHistoryData.filter(item => {
        const matchYear = (yearFilter === 'all') || (item.year === yearFilter);
        const matchDept = (deptFilter === 'all') || (item.department === deptFilter);
        const matchSearch = item.studentId.toLowerCase().includes(searchText) || item.studentName.toLowerCase().includes(searchText) || item.jobTitle.toLowerCase().includes(searchText) || item.faculty.toLowerCase().includes(searchText);
        return matchYear && matchDept && matchSearch;
    });
    
    if (filteredData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: #64748b; padding: 30px;">ไม่พบข้อมูลที่ตรงกับเงื่อนไข</td></tr>';
        paginationContainer.innerHTML = '';
        return;
    }
    
    const totalAmount = filteredData.reduce((sum, item) => sum + item.amount, 0);
    
    let displayData = filteredData;
    let totalPages = 1;

    if (historyRowsPerPage !== 'all') {
        totalPages = Math.ceil(filteredData.length / historyRowsPerPage);
        if (currentHistoryPage > totalPages) currentHistoryPage = totalPages; 
        
        const startIndex = (currentHistoryPage - 1) * historyRowsPerPage;
        const endIndex = startIndex + historyRowsPerPage;
        displayData = filteredData.slice(startIndex, endIndex); 
    }
    
    displayData.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="text-align:center;">${item.year}</td>
            <td>${item.month}</td>
            <td style="text-align:center;">${item.studentId}</td>
            <td>${item.studentName}</td>
            <td>${item.faculty}</td>
            <td>${item.department}</td>
            <td>${item.jobTitle}</td>
            <td style="text-align: right; font-weight:bold; color:#1976D2;">${item.amount.toLocaleString('th-TH')}</td>
        `;
        tbody.appendChild(tr);
    });
    
    const sumRow = document.createElement('tr');
    sumRow.style.background = '#f8fafc';
    sumRow.innerHTML = `<td colspan="7" style="text-align: right; font-weight: bold; padding: 15px;">รวมเงินที่เบิกจ่าย (ค้นพบ ${filteredData.length} รายการ):</td><td style="text-align: right; font-weight: bold; color: #ea580c; font-size: 16px; padding: 15px;">${totalAmount.toLocaleString('th-TH')} บาท</td>`;
    tbody.appendChild(sumRow);

    if (totalPages > 1) {
        let pageHtml = `
            <button class="btn" style="padding: 5px 12px; border: 1px solid #cbd5e1; background: ${currentHistoryPage === 1 ? '#f1f5f9' : '#fff'}; color: ${currentHistoryPage === 1 ? '#94a3b8' : '#1976D2'};" onclick="changeHistoryPage(${currentHistoryPage - 1})" ${currentHistoryPage === 1 ? 'disabled' : ''}>ก่อนหน้า</button>
            <span style="font-size: 14px; color: #475569; padding: 0 10px;">หน้า <b>${currentHistoryPage}</b> จาก ${totalPages}</span>
            <button class="btn" style="padding: 5px 12px; border: 1px solid #cbd5e1; background: ${currentHistoryPage === totalPages ? '#f1f5f9' : '#fff'}; color: ${currentHistoryPage === totalPages ? '#94a3b8' : '#1976D2'};" onclick="changeHistoryPage(${currentHistoryPage + 1})" ${currentHistoryPage === totalPages ? 'disabled' : ''}>ถัดไป</button>
        `;
        paginationContainer.innerHTML = pageHtml;
    } else {
        paginationContainer.innerHTML = ''; 
    }
}

function filterHistoryTable() {
    renderHistoryTable(); 
}

setupNavClick('navImportHistory', 'importHistorySection', () => {
    loadHistoryData(); 
});
function fetchStudentDataIfComplete(val) {
    val = val.replace(/[^0-9]/g, '');
    document.getElementById('manualStdId').value = val;
    
    const nameInput = document.getElementById('manualStdName');
    const facultyInput = document.getElementById('manualFaculty');

    if (val.length === 11) {
        nameInput.placeholder = "กำลังค้นหาข้อมูล...";
        facultyInput.placeholder = "กำลังค้นหาข้อมูล...";
        
        google.script.run.withSuccessHandler(res => {
            console.log("เช็คข้อมูลที่ส่งมา:", res); 

            if (res.found) {
                nameInput.value = res.name;
                facultyInput.value = res.faculty; 
                
                const Toast = Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 2000 });
                Toast.fire({ icon: 'success', title: 'พบข้อมูลนักศึกษา' });
            } else {
                nameInput.placeholder = "ไม่พบข้อมูล กรุณาพิมพ์เอง";
                facultyInput.placeholder = "ไม่พบข้อมูล กรุณาพิมพ์เอง";
                nameInput.value = "";
                facultyInput.value = "";
            }
        }).searchStudentFromDatabase(val);
    } else if (val.length < 11) {
        nameInput.placeholder = "นาย/นางสาว...";
        facultyInput.placeholder = "ดึงข้อมูลอัตโนมัติ";
        nameInput.value = "";
        facultyInput.value = "";
    }
}

setupNavClick('navYearEndClose', 'yearEndCloseSection', () => openFiscalYearManager());

async function openFiscalYearManager() {
  if (!currentUser || !['admin','executive','staff'].includes(currentUser.role)) {
    showAlert('ไม่มีสิทธิ์เข้าถึงข้อมูลงบประมาณ', 'error'); return;
  }
  const token = sessionStorage.getItem('sessionToken');
  try {
    const years = await window.GAS_API.call('getFiscalYearList', [token]);
    if (!years.success) throw new Error(years.message || 'โหลดรายการปีไม่สำเร็จ');
    const options = years.years.map(y => `<option value="${y}">${y === years.activeYear ? 'ปี '+y+' (ปัจจุบัน)' : 'ปี '+y+' (ย้อนหลัง)'}</option>`).join('');
    const result = await Swal.fire({
      title:'บริหารปีงบประมาณ / ข้อมูลย้อนหลัง',width:850,
      html:`<div style="text-align:left;font-family:Sarabun,sans-serif">
        <label>เลือกปีงบประมาณ</label>
        <select id="fiscalSelect" class="swal2-select" style="width:100%;margin:8px 0">${options}</select>
        <div id="fiscalBudgetResult" style="overflow:auto;max-height:350px">เลือกปีเพื่อดูงบประมาณ</div>
        ${currentUser.role === 'admin' ? '<button type="button" id="closeFiscalBtn" class="swal2-confirm swal2-styled" style="background:#b91c1c;margin-top:15px">ปิดปีงบประมาณ 2569 และเริ่มปี 2570</button>' : ''}
        <p style="font-size:13px;color:#64748b">ข้อมูลปีที่ปิดแล้วเป็นแบบอ่านอย่างเดียว และไม่มีการลบประวัติการเบิกจ่าย</p></div>`,
      showConfirmButton:false,showCloseButton:true,
      didOpen: () => {
        const select=document.getElementById('fiscalSelect');
        const load=async () => {
          const area=document.getElementById('fiscalBudgetResult');
          area.textContent='กำลังโหลด...';
          try {
            const response=await window.GAS_API.call('getFiscalBudgetOverview',[token,Number(select.value)]);
            if(!response.success) throw new Error(response.message);
            const safe=s=>String(s == null ? '' : s).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
            const money=n=>Number(n||0).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2});
            const rows=response.stats.map(x=>`<tr><td>${safe(x.department)}</td><td>${safe(x.budgetName)}</td><td>${safe(x.source)}</td><td style="text-align:right">${money(x.allocated)}</td><td style="text-align:right">${money(x.used)}</td></tr>`).join('');
            const allocated=response.stats.reduce((sum,x)=>sum+Number(x.allocated||0),0),used=response.stats.reduce((sum,x)=>sum+Number(x.used||0),0);
            area.innerHTML=`<p><strong>ปีงบประมาณ ${response.year}</strong> ${response.readOnly?'(ย้อนหลัง / อ่านอย่างเดียว)':'(กำลังดำเนินการ)'}</p><p>จัดสรร ${money(allocated)} บาท | ใช้ไป ${money(used)} บาท | คงเหลือ ${money(allocated-used)} บาท</p><table style="width:100%;font-size:13px;border-collapse:collapse" border="1" cellpadding="5"><thead><tr><th>หน่วยงาน</th><th>รายการงบ</th><th>ประเภท</th><th>จัดสรร</th><th>ใช้ไป</th></tr></thead><tbody>${rows||'<tr><td colspan="5">ไม่มีรายการงบประมาณ</td></tr>'}</tbody></table>`;
          } catch(err) {area.textContent=err.message;}
        };
        select.addEventListener('change',load);load();
        const closeBtn=document.getElementById('closeFiscalBtn');
        if(closeBtn) closeBtn.onclick=async()=>{
          if(years.activeYear!==2569){Swal.showValidationMessage('ปีงบประมาณ 2569 ถูกปิดแล้ว');return;}
          const confirm=await Swal.fire({title:'ยืนยันปิดปีงบประมาณ 2569?',text:'ระบบจะเก็บงบย้อนหลัง จากนั้นเคลียร์งบปีปัจจุบันเป็น 0 บาท โดยไม่ลบข้อมูลเบิกจ่ายและนักศึกษา',icon:'warning',input:'text',inputPlaceholder:'พิมพ์ ปิดงบ 2569',showCancelButton:true,confirmButtonText:'ยืนยันปิดงบ',inputValidator:v=>v==='ปิดงบ 2569'?undefined:'กรุณาพิมพ์ ปิดงบ 2569'});
          if(!confirm.isConfirmed)return;
          Swal.fire({title:'กำลังบันทึกข้อมูลย้อนหลัง',allowOutsideClick:false,didOpen:()=>Swal.showLoading()});
          try {const r=await window.GAS_API.call('closeFiscalYearBudget',[token,2569,confirm.value]);if(!r.success)throw new Error(r.message);await Swal.fire('สำเร็จ','ปิดปี 2569 แล้ว เปิดปี 2570 ด้วยงบ 0 บาท','success');window.location.reload();}
          catch(err){Swal.fire('ไม่สำเร็จ',err.message,'error');}
        };
      }
    });
  } catch(err) {Swal.fire('ข้อผิดพลาด',err.message,'error');}
}

function exportYearEndHistoryCSV() {
    showLoading();
    
    google.script.run.withSuccessHandler(res => {
        hideLoading();
        
        if (!res.success) {
            Swal.fire('ข้อผิดพลาด', res.message || 'ไม่สามารถดึงข้อมูลได้', 'error');
            return;
        }

        const data = res.data;

        if (!data || data.length === 0) {
            Swal.fire('ไม่มีข้อมูล', 'ไม่พบประวัติการเบิกจ่ายที่สมบูรณ์ในปีงบประมาณนี้', 'warning');
            return;
        }

        let csv = [];
        csv.push("\uFEFFเดือน,รหัสนักศึกษา,ชื่อ-สกุล,คณะ,หน่วยงาน,ชื่องาน,จำนวนเงิน");

        const thMonths = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

        data.forEach(student => {
            let studentId = String(student.studentId).replace(/'/g, '');
            let studentName = student.name || '-';
            let faculty = student.faculty || '-';
            
            if(student.jobDetails && student.jobDetails.length > 0) {
                student.jobDetails.forEach(job => {
                    let dateObj = parseDateString(job.date || job.workDate);
                    let monthName = dateObj ? thMonths[dateObj.getMonth()] : "ไม่ระบุเดือน";
                    let agency = job.agency || '-';
                    let jobTitle = job.title || '-';
                    let amount = parseFloat(String(job.amount).replace(/,/g, '')) || 0;
                    csv.push(`"${monthName}","${studentId}","${studentName}","${faculty}","${agency}","${jobTitle}","${amount}"`);
                });
            }
        });

        const d = new Date();
        let yearTh = d.getFullYear() + 543;
        if(d.getMonth() >= 9) yearTh += 1; 

        const fileName = `History_Template_Export_FY${yearTh}.csv`;
        const csvFile = new Blob([csv.join("\n")], { type: "text/csv;charset=utf-8;" });
        
        if (window.navigator && window.navigator.msSaveOrOpenBlob) {
            window.navigator.msSaveOrOpenBlob(csvFile, fileName);
        } else {
            const downloadLink = document.createElement("a");
            downloadLink.download = fileName;
            downloadLink.href = window.URL.createObjectURL(csvFile);
            downloadLink.style.display = "none";
            document.body.appendChild(downloadLink);
            downloadLink.click();
            setTimeout(() => {
                document.body.removeChild(downloadLink);
                window.URL.revokeObjectURL(downloadLink.href);
            }, 100);
        }

        Swal.fire({
            icon: 'success',
            title: 'ดาวน์โหลดสำเร็จ',
            html: 'ดาวน์โหลดไฟล์สำหรับสำรองข้อมูลเรียบร้อยแล้ว<br>การเริ่มปีงบประมาณใหม่ให้ใช้เมนูปิดปีงบประมาณแบบเก็บข้อมูลย้อนหลัง โดยไม่ลบประวัติการเบิกจ่าย'
        });

    }).withFailureHandler(err => {
        hideLoading();
        Swal.fire('ข้อผิดพลาด', 'การเชื่อมต่อขัดข้อง: ' + err.message, 'error');
    }).getSystemWideDisbursementReport(); 
}

// ปุ่ม "ขั้นตอนที่ 2" เดิม: เปลี่ยนให้เข้าสู่ workflow ปิดงบแบบไม่ทำลายประวัติ
function confirmSystemReset() {
    return openFiscalYearManager();
}

// Compatibility for any other existing button using the old handler.
// NEVER call the destructive resetSystemForNewFiscalYear endpoint.
function executeSystemReset() {
    return openFiscalYearManager();
}

// Correct outdated captions on the existing year-end screen, if loaded.
function updateYearEndCloseLabels() {
    const section = document.getElementById('yearEndCloseSection');
    if (!section) return;
    section.querySelectorAll('button').forEach(btn => {
        const label = (btn.textContent || '').trim();
        if (/ล้างระบบ|ล้างข้อมูลทั้งระบบ|รีเซ็ตระบบ/.test(label)) {
            btn.textContent = 'ปิดงบประมาณ 2569 และเริ่มปี 2570 (เก็บประวัติ)';
        }
    });
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateYearEndCloseLabels);
} else {
    updateYearEndCloseLabels();
}

function showBlockedPayrollError(studentName, statusType, statusDate) {
    Swal.fire({
        title: 'ไม่อนุมัติการเบิกจ่าย',
        html: `
            <div style="text-align: center; font-family: 'Sarabun', sans-serif; line-height: 1.6;">
                <i class="material-icons" style="font-size: 60px; color: #d32f2f; margin-bottom: 10px;">block</i><br>
                ไม่สามารถดำเนินการเบิกจ่ายได้ เนื่องจากนักศึกษา<br>
                <b style="color: #0d47a1; font-size: 18px;">${studentName}</b><br>
                <span style="color: #d32f2f; font-weight: bold;">${statusType}แล้ว เมื่อวันที่ ${statusDate}</span>
            </div>
        `,
        icon: 'error',
        confirmButtonText: 'รับทราบ',
        confirmButtonColor: '#d32f2f'
    });
}

setupNavClick('navManageStatus', 'manageStudentStatusSection', () => {
    document.getElementById('statusSearchId').value = '';
    document.getElementById('statusUpdateArea').style.display = 'none';
});

function searchStudentForStatus() {
    const id = document.getElementById('statusSearchId').value.trim();
    if (!id) { showAlert('กรุณาระบุรหัสนักศึกษา', 'warning'); return; }

    showLoading();
    google.script.run.withSuccessHandler(res => {
        hideLoading();
        if (res.success) {
            const st = res.data;
            document.getElementById('statusStudentName').textContent = `${st.prefix}${st.firstName} ${st.lastName}`;
            document.getElementById('statusStudentIdStr').textContent = st.studentId;
            document.getElementById('statusStudentFaculty').textContent = st.faculty;
            document.getElementById('hiddenStatusStudentId').value = st.studentId;

            let badgeColor = '#2e7d32'; 
            if (st.status !== 'ปกติ' && st.status !== '') badgeColor = '#d32f2f'; 
            
            let dateText = st.statusDate ? ` (เมื่อ ${st.statusDate})` : '';
            const badge = document.getElementById('statusCurrentBadge');
            badge.textContent = (st.status || 'ปกติ') + dateText;
            badge.style.backgroundColor = badgeColor;
            badge.style.color = 'white';

            document.getElementById('newStudentStatus').value = st.status || 'ปกติ';
            document.getElementById('newStatusDate').value = st.rawStatusDate || '';
            document.getElementById('statusUpdateArea').style.display = 'block';
        } else {
            showAlert('ไม่พบข้อมูลนักศึกษานี้ในระบบ', 'error');
            document.getElementById('statusUpdateArea').style.display = 'none';
        }
    }).searchStudentForStatusUpdate(id);
}

document.getElementById('updateStatusForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const studentId = document.getElementById('hiddenStatusStudentId').value;
    const newStatus = document.getElementById('newStudentStatus').value;
    const statusDate = document.getElementById('newStatusDate').value;

    if (!studentId) return;

    Swal.fire({
        title: 'ยืนยันการเปลี่ยนแปลง?',
        html: `คุณต้องการปรับสถานะเป็น <b>"${newStatus}"</b> ใช่หรือไม่?<br><small style="color:red;">*หากเลือกสำเร็จการศึกษา/พ้นสภาพ จะถูกระงับการจ่ายเงินทันที</small>`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'ยืนยันบันทึก',
        cancelButtonText: 'ยกเลิก'
    }).then((result) => {
        if (result.isConfirmed) {
            showLoading();
            google.script.run.withSuccessHandler(res => {
                hideLoading();
                if (res.success) {
                    Swal.fire('สำเร็จ', 'อัปเดตสถานะในระบบเรียบร้อยแล้ว', 'success');
                    searchStudentForStatus(); 
                } else {
                    Swal.fire('ข้อผิดพลาด', res.message, 'error');
                }
            }).saveStudentStatus(studentId, newStatus, statusDate);
        }
    });
});

function showBudgetRunHistory() {
    showLoading();
    google.script.run.withSuccessHandler(res => {
        hideLoading();
        if (res.success) {
            const tbody = document.querySelector('#historyRunTable tbody');
            tbody.innerHTML = '';
            
            if (res.data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:20px;">ยังไม่มีประวัติการบันทึก</td></tr>';
            } else {
                res.data.forEach(item => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td style="text-align:center; font-weight:bold;">${item.runNo}</td>
                        <td style="font-size:12px;">${item.timestamp}</td>
                        <td><span class="vf-badge vf-badge-blue">${item.month}</span></td>
                        <td style="text-align:right;">${item.prevBalance}</td>
                        <td style="text-align:right; color:#d32f2f; font-weight:bold;">-${item.withdrawn}</td>
                        <td style="text-align:right; color:#2e7d32; font-weight:bold;">${item.newBalance}</td>
                        <td style="font-size:11px; color:#555;">${item.sourceCode}</td>
                        <td>${item.savedBy}</td>
                    `;
                    tbody.appendChild(tr);
                });
            }
            document.getElementById('budgetHistoryModal').style.display = 'flex';
        } else {
            showAlert(res.message, 'error');
        }
    }).getBudgetRunHistory();
}

function filterHistoryTable() {
    const input = document.getElementById('searchHistoryInput');
    const filter = input.value.toLowerCase();
    const table = document.getElementById('historyRunTable');
    const tr = table.getElementsByTagName('tr');

    for (let i = 1; i < tr.length; i++) {
        const td = tr[i].innerText.toLowerCase();
        tr[i].style.display = td.indexOf(filter) > -1 ? "" : "none";
    }
}
