// 1. ฟังก์ชันจัดการล็อกอินหลัก (แก้ไขใหม่)
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    const newLoginForm = loginForm.cloneNode(true);
    loginForm.parentNode.replaceChild(newLoginForm, loginForm);

    newLoginForm.addEventListener('submit', async (e) => {
        e.preventDefault(); 
        showLoading();
        
        const studentId = document.getElementById('loginStudentId').value;
        const password = document.getElementById('loginPassword').value;
        
        google.script.run.withSuccessHandler(res => {
            hideLoading();
            if(res.success) {
                if (res.requireOtp) {
                    // หากเซิร์ฟเวอร์แจ้งว่าต้องใช้ OTP
                    document.getElementById('otpEmailHint').textContent = res.emailHint;
                    document.getElementById('otpCodeInput').value = '';
                    showSection('otpSection');
                    // เก็บ ID ชั่วคราวไว้ใช้ตอนยืนยัน OTP
                    sessionStorage.setItem('tempLoginId', studentId);
                } else {
                    // กรณีระบบไม่ต้องการ OTP (เช่น กำหนดข้อยกเว้นให้ Admin)
                    finalizeLoginProcess(res);
                }
            } else {
                showAlert(res.message, 'error');
            }
        }).withFailureHandler(err => { 
            hideLoading(); 
            showAlert(err.message, 'error'); 
        }).login(studentId, password);
    });
}
document.getElementById('otpForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const otpCode = document.getElementById('otpCodeInput').value;
    const studentId = sessionStorage.getItem('tempLoginId');

    if(!studentId) {
        showAlert('เซสชั่นหมดอายุ กรุณาเข้าสู่ระบบใหม่', 'error');
        showSection('loginSection');
        return;
    }

    showLoading();
    google.script.run.withSuccessHandler(res => {
        hideLoading();
        if(res.success) {
            sessionStorage.removeItem('tempLoginId'); // ล้างค่าชั่วคราว
            finalizeLoginProcess(res); // เข้าสู่ระบบ
        } else {
            showAlert(res.message, 'error');
            document.getElementById('otpCodeInput').value = '';
            document.getElementById('otpCodeInput').focus();
        }
    }).withFailureHandler(err => {
        hideLoading();
        showAlert('เกิดข้อผิดพลาด: ' + err.message, 'error');
    }).verifyOTP(studentId, otpCode);
});

// 3. ฟังก์ชันจัดการเมื่อกด "ส่งรหัสอีกครั้ง"
document.getElementById('resendOtpBtn').addEventListener('click', (e) => {
    e.preventDefault();
    const studentId = sessionStorage.getItem('tempLoginId');
    if(!studentId) return;

    showLoading();
    google.script.run.withSuccessHandler(res => {
        hideLoading();
        if(res.success) {
            showAlert('ส่งรหัส OTP ใหม่ไปที่อีเมลแล้ว', 'success');
        } else {
            showAlert(res.message, 'error');
        }
    }).resendOTP(studentId);
});

// 4. ฟังก์ชันกลางสำหรับจบกระบวนการล็อกอิน (แยกออกมาเพื่อให้เรียกใช้ง่ายขึ้น)
function finalizeLoginProcess(res) {
    currentUser = res.user; 
    sessionStorage.setItem('currentUser', JSON.stringify(currentUser));
    sessionStorage.setItem('sessionToken', res.token); 
    startSessionTimer(); 
    trackUserAction("Login", "เข้าสู่ระบบสำเร็จ (OTP Verified)");

    if (currentUser.role === 'admin' || currentUser.role === 'staff' || currentUser.role === 'executive') {
        showSecurityNotice(() => { proceedToSystem(); });
    } else {
        proceedToSystem();
    }
}

const originalDoVerifySearch = doVerifySearch; 
doVerifySearch = function() {
    const id = document.getElementById('verifyInputId').value.trim();
    
    if(id) {
        trackUserAction("Search Student", "ตรวจสอบข้อมูลนักศึกษา รหัส: " + id);
    }
    
    if(!id) { showAlert('กรุณาระบุรหัสนักศึกษา', 'warning'); return; }
    showLoading();
    
    // 🛡️ ดึง Token จากระบบ
    const token = sessionStorage.getItem('sessionToken');

    google.script.run.withSuccessHandler(res => {
        hideLoading();
        const resultArea = document.getElementById('verifyResultArea');
        const notFoundMsg = document.getElementById('vfNotFound');

        if (res.success && res.data) {
             const d = res.data;
             currentVerifyDataCache = d; 
             if(notFoundMsg) notFoundMsg.style.display = 'none';
             resultArea.style.display = 'block';
             
             document.getElementById('vfName').textContent = d.fullName;
             document.getElementById('vfStudentId').textContent = d.studentId;
             document.getElementById('vfFaculty').textContent = d.faculty;
             document.getElementById('vfMajor').textContent = d.major || '-';
             document.getElementById('vfGpax').textContent = d.gpax || '-';
             document.getElementById('vfLoan').textContent = d.loan || '-';
             document.getElementById('vfScholar').textContent = d.scholarship || '-';
             document.getElementById('vfMobileLink').textContent = d.mobile || '-';
             document.getElementById('vfMobileLink').href = d.mobile ? `tel:${d.mobile}` : '#';
             document.getElementById('vfLine').textContent = d.line || '-';
             document.getElementById('vfFb').textContent = d.facebook || '-';
             document.getElementById('vfEmail').textContent = d.email || '-';
             document.getElementById('vfAgency').textContent = d.agency || 'ยังไม่ระบุ';
             document.getElementById('vfJobType').textContent = d.jobType || '-';
             document.getElementById('vfSkills').textContent = d.skills || '-';
             document.getElementById('vfReason').textContent = d.reason || '-';
        } else {
             resultArea.style.display = 'none';
             if(notFoundMsg) notFoundMsg.style.display = 'block';
             showAlert('ไม่พบข้อมูล', 'error');
        }
    }).getStudentDetailsBySheet(token, id); // 🛡️ แนบ Token เป็นตัวแปรแรก
};

const originalGenerateReport = generateFinancialReport;
generateFinancialReport = function() {
    const selectedDept = document.getElementById('reportDeptSelector').value;
    const checkedBoxes = document.querySelectorAll('.job-checkbox:checked');
    
    if (selectedDept && checkedBoxes.length > 0) {
        trackUserAction("Generate Report", `สร้างรายงานเบิกจ่ายหน่วยงาน: ${selectedDept} (${checkedBoxes.length} รายการ)`);
    }

    const selectedJobs = Array.from(checkedBoxes).map(cb => cb.value);

    if (selectedJobs.length === 0) {
        showAlert('กรุณาเลือกงานอย่างน้อย 1 งาน', 'warning');
        return;
    }

    const uniqueNames = [...new Set(selectedJobs)];

    if (uniqueNames.length === 1) {
        renderReportWithTitle(selectedDept, selectedJobs, uniqueNames[0]);
    } else {
        const options = {};
        uniqueNames.forEach(name => { options[name] = name; });
        
        Swal.fire({
            title: 'เลือกชื่องานสำหรับหัวรายงาน',
            text: 'คุณเลือกงานที่มีชื่อต่างกัน กรุณาระบุชื่อที่จะแสดงบนหัวรายงาน',
            input: 'select',
            inputOptions: options,
            inputValue: uniqueNames[0],
            showCancelButton: true,
            confirmButtonText: 'สร้างรายงาน',
            cancelButtonText: 'ยกเลิก',
            inputValidator: (value) => {
                if (!value) return 'กรุณาเลือกชื่องาน';
            }
        }).then((result) => {
            if (result.isConfirmed) {
                renderReportWithTitle(selectedDept, selectedJobs, result.value);
            }
        });
    }
};

setupNavClick('navSystemLog', 'systemLogSection', () => {
    loadSystemLogs();
});

let allLogsCache = [];     
let currentLogPage = 1;    
let logRowsPerPage = 20;   

function loadSystemLogs() {
    showLoading();
    google.script.run.withSuccessHandler(res => {
        hideLoading();
        if(res.success) {
            allLogsCache = res.logs;
            
            if(document.getElementById('logTodayActions')) 
                document.getElementById('logTodayActions').innerText = res.stats.totalToday.toLocaleString();
            if(document.getElementById('logActiveUsers')) 
                document.getElementById('logActiveUsers').innerText = res.stats.activeUsers.toLocaleString();
            if(document.getElementById('logTotalShow')) 
                document.getElementById('logTotalShow').innerText = res.logs.length.toLocaleString();

            currentLogPage = 1;
            refreshLogDisplay();
        } else {
            Swal.fire('ข้อผิดพลาด', res.message, 'error');
        }
    }).getSystemActivityLogs();
}

function changeLogRows() {
    logRowsPerPage = parseInt(document.getElementById('logRowsPerPage').value);
    currentLogPage = 1; 
    refreshLogDisplay();
}

function refreshLogDisplay() {
    const searchText = document.getElementById('logSearchInput').value.toLowerCase().trim();
    const filteredLogs = allLogsCache.filter(log => {
        const str = `${log.displayTime} ${log.name} ${log.userId} ${log.action} ${log.detail} ${log.ip}`.toLowerCase();
        return str.includes(searchText);
    });

    const totalItems = filteredLogs.length;
    const totalPages = Math.ceil(totalItems / logRowsPerPage);
    
    if (currentLogPage > totalPages) currentLogPage = totalPages || 1;
    if (currentLogPage < 1) currentLogPage = 1;

    const startIdx = (currentLogPage - 1) * logRowsPerPage;
    const endIdx = startIdx + logRowsPerPage;
    const displayedLogs = filteredLogs.slice(startIdx, endIdx);
    const tbody = document.querySelector('#systemLogTable tbody');
    tbody.innerHTML = '';

    if (totalItems === 0) {
        document.getElementById('noLogData').style.display = 'block';
        document.getElementById('logPaginationContainer').style.display = 'none';
        return;
    }
    
    document.getElementById('noLogData').style.display = 'none';
    document.getElementById('logPaginationContainer').style.display = 'flex';

    displayedLogs.forEach(log => {
        const tr = document.createElement('tr');
        
        let badgeStyle = 'background:#eee; color:#555;';
        let icon = '';
        const act = String(log.action).toLowerCase();
        
        if(act.includes('login')) { badgeStyle = 'background:#e8f5e9; color:#2e7d32;'; icon = 'login'; }
        else if(act.includes('search') || act.includes('check')) { badgeStyle = 'background:#e3f2fd; color:#1565c0;'; icon = 'search'; }
        else if(act.includes('approve') || act.includes('submit')) { badgeStyle = 'background:#fff3e0; color:#ef6c00;'; icon = 'check_circle'; }
        else if(act.includes('delete') || act.includes('ลบ')) { badgeStyle = 'background:#ffebee; color:#c62828;'; icon = 'delete'; }
        else if(act.includes('report')) { badgeStyle = 'background:#f3e5f5; color:#7b1fa2;'; icon = 'summarize'; }

        tr.innerHTML = `
            <td style="font-size:13px; color:#333;">${log.displayTime}</td>
            <td>
                <div style="font-weight:bold; color:#0d47a1;">${log.name}</div>
                <div style="font-size:11px; color:#666;">${log.userId} <span style="background:#eee; padding:1px 4px; border-radius:3px;">${log.role}</span></div>
            </td>
            <td>${log.faculty}</td>
            <td><span style="font-family:monospace; font-size:11px; color:#00695c; background:#e0f2f1; padding:2px 5px; border-radius:4px;">${log.ip || '-'}</span></td>
            <td>
                <span class="vf-badge" style="${badgeStyle} display:inline-flex; align-items:center; gap:3px;">
                    ${icon ? `<i class="material-icons" style="font-size:12px;">${icon}</i>` : ''} ${log.action}
                </span>
            </td>
            <td style="color:#444; font-size:13px;">${log.detail}</td>
        `;
        tbody.appendChild(tr);
    });

    renderLogPagination(totalItems, totalPages);
}

function renderLogPagination(totalItems, totalPages) {
    const container = document.getElementById('logPageButtons');
    const info = document.getElementById('logPageInfo');
    container.innerHTML = '';
    
    const start = (currentLogPage - 1) * logRowsPerPage + 1;
    const end = Math.min(start + logRowsPerPage - 1, totalItems);
    info.innerText = `แสดง ${start}-${end} จาก ${totalItems.toLocaleString()} รายการ`;

    const prevBtn = document.createElement('button');
    prevBtn.className = 'page-btn';
    prevBtn.innerHTML = '<i class="material-icons" style="font-size:14px;">chevron_left</i>';
    prevBtn.disabled = currentLogPage === 1;
    prevBtn.onclick = () => { currentLogPage--; refreshLogDisplay(); };
    container.appendChild(prevBtn);

    const createBtn = (i) => {
        const btn = document.createElement('button');
        btn.className = `page-btn ${i === currentLogPage ? 'active' : ''}`;
        btn.innerText = i;
        btn.onclick = () => { currentLogPage = i; refreshLogDisplay(); };
        container.appendChild(btn);
    };

    if (totalPages <= 7) {
        for (let i = 1; i <= totalPages; i++) createBtn(i);
    } else {
        createBtn(1);
        if (currentLogPage > 3) container.appendChild(document.createTextNode('...'));
        
        let startPage = Math.max(2, currentLogPage - 1);
        let endPage = Math.min(totalPages - 1, currentLogPage + 1);
        
        for (let i = startPage; i <= endPage; i++) createBtn(i);
        
        if (currentLogPage < totalPages - 2) container.appendChild(document.createTextNode('...'));
        createBtn(totalPages);
    }

    const nextBtn = document.createElement('button');
    nextBtn.className = 'page-btn';
    nextBtn.innerHTML = '<i class="material-icons" style="font-size:14px;">chevron_right</i>';
    nextBtn.disabled = currentLogPage === totalPages || totalPages === 0;
    nextBtn.onclick = () => { currentLogPage++; refreshLogDisplay(); };
    container.appendChild(nextBtn);
}

function printFacultyStatsReport() {
    const applied = document.getElementById('sumApplied').innerText;
    const hired = document.getElementById('sumHired').innerText;
    const notHired = document.getElementById('sumNotHired') ? document.getElementById('sumNotHired').innerText : "0";
    const ratio = document.getElementById('sumRatio').innerText;
    const sourceRows = document.querySelectorAll('#facultyStatsTable tbody tr');
    let tableHtml = '';

    sourceRows.forEach(row => {
        const cells = row.querySelectorAll('td'); 
        const name = cells[0].innerText.trim();
        const col1 = cells[1].innerText.trim();
        const col2 = cells[2].innerText.trim();
        const col3 = cells[3].innerText.trim();
        
        let percentText = cells[4].innerText.trim(); 
        if(percentText.includes('\n')) percentText = percentText.split('\n')[0];

        tableHtml += `
            <tr>
                <td style="border: 1px solid #000; padding: 5px; text-align: left;">${name}</td>
                <td style="border: 1px solid #000; padding: 5px; text-align: center;">${col1}</td>
                <td style="border: 1px solid #000; padding: 5px; text-align: center;">${col2}</td>
                <td style="border: 1px solid #000; padding: 5px; text-align: center;">${col3}</td>
                <td style="border: 1px solid #000; padding: 5px; text-align: center;">${percentText}</td>
            </tr>
        `;
    });

    const d = new Date();
    const printDate = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear() + 543} เวลา ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')} น.`;

    const printArea = document.createElement('div');
    printArea.id = 'tempPrintStatsArea';
    printArea.style.fontFamily = "'Sarabun', sans-serif";
    printArea.innerHTML = `
        <div class="paper-sheet" style="padding: 40px;">
            <div style="text-align: center; margin-bottom: 20px;">
                <img src="https://img5.pic.in.th/file/secure-sv1/singha.fcd1107b32cbf973a5b97825.png" style="height: 60px; margin-bottom: 10px;">
                <h2 style="margin: 0;">รายงานสรุปสถิติการสมัครและการจ้างงาน</h2>
                <div style="font-size: 14px; color: #555;">มหาวิทยาลัยอุบลราชธานี</div>
                <div style="font-size: 12px; margin-top: 5px;">ข้อมูล ณ วันที่: ${printDate}</div>
            </div>

            <div style="display: flex; justify-content: space-between; margin-bottom: 30px; border: 1px solid #000; padding: 15px;">
                <div style="text-align: center; width: 25%;">
                    <div style="font-size: 12px;">ผู้สมัครทั้งหมด</div>
                    <div style="font-size: 20px; font-weight: bold;">${applied}</div>
                </div>
                <div style="text-align: center; width: 25%;">
                    <div style="font-size: 12px;">จ้างงานแล้ว</div>
                    <div style="font-size: 20px; font-weight: bold; color: green;">${hired}</div>
                </div>
                <div style="text-align: center; width: 25%;">
                    <div style="font-size: 12px;">ยังไม่ได้งาน</div>
                    <div style="font-size: 20px; font-weight: bold; color: red;">${notHired}</div>
                </div>
                <div style="text-align: center; width: 25%;">
                    <div style="font-size: 12px;">คิดเป็นร้อยละ (%)</div>
                    <div style="font-size: 20px; font-weight: bold;">${ratio}</div>
                </div>
            </div>

            <h4 style="margin-bottom: 10px;">รายละเอียดแยกรายหน่วยงาน</h4>
            
            <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                <thead>
                    <tr style="background-color: #f0f0f0;">
                        <th style="border: 1px solid #000; padding: 8px; text-align: center;">คณะ / หน่วยงาน</th>
                        <th style="border: 1px solid #000; padding: 8px; text-align: center; width: 15%;">ผู้สมัคร (คน)</th>
                        <th style="border: 1px solid #000; padding: 8px; text-align: center; width: 15%;">ได้งานทำ (คน)</th>
                        <th style="border: 1px solid #000; padding: 8px; text-align: center; width: 15%;">ยังไม่ได้งาน (คน)</th>
                        <th style="border: 1px solid #000; padding: 8px; text-align: center; width: 15%;">คิดเป็นร้อยละ (%)</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableHtml}
                </tbody>
            </table>
            
            <div style="margin-top: 30px; font-size: 10px; color: #888; text-align: right;">
                พิมพ์รายงานจากฐานข้อมูลระบบจ้างงานระหว่างเรียน มหาวิทยาลัยอุบลราชธานี 
            </div>
        </div>
    `;

    const style = document.createElement('style');
    style.innerHTML = `
        @media print {
            body * { visibility: hidden; }
            #tempPrintStatsArea, #tempPrintStatsArea * { visibility: visible; }
            #tempPrintStatsArea { 
                position: absolute; 
                left: 0; top: 0; 
                width: 100%; 
            }
            /* บังคับขอบตาราง */
            #tempPrintStatsArea table, #tempPrintStatsArea th, #tempPrintStatsArea td {
                border: 1px solid #000 !important;
                border-collapse: collapse !important;
            }
        }
    `;

    document.body.appendChild(printArea);
    document.head.appendChild(style);

    window.print();

    setTimeout(() => {
        document.body.removeChild(printArea);
        document.head.removeChild(style);
    }, 1000);
}

let currentFacultyStudentsCache = [];
let currentFacultyNameFilter = '';
let currentFilterType = 'all';


function openFacultyDetail(facultyName) {
    currentFacultyNameFilter = facultyName;
    document.getElementById('facDetailTitle').innerText = `รายชื่อนักศึกษา: ${facultyName}`;
    document.getElementById('facultyDetailModal').style.display = 'flex';
    document.querySelectorAll('#facultyDetailModal .reg-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('#facultyDetailModal .reg-tab-btn').classList.add('active'); 
    showLoading();
    google.script.run.withSuccessHandler(data => {
        hideLoading();
        currentFacultyStudentsCache = data; 
        filterFacultyStudents('all'); 
    }).getStudentsByFacultyDetail(facultyName);
}

function filterFacultyStudents(type) {
    currentFilterType = type;
    
    const btns = document.querySelectorAll('#facultyDetailModal .reg-tab-btn');
    btns.forEach(b => b.classList.remove('active'));
    
    if (type === 'all') btns[0].classList.add('active');
    if (type === 'hired') btns[1].classList.add('active');
    if (type === 'not_hired') btns[2].classList.add('active');

    const tbody = document.querySelector('#facDetailTable tbody');
    tbody.innerHTML = '';

    let filtered = [];
    
    if (type === 'all') {
        filtered = currentFacultyStudentsCache;
    } else if (type === 'hired') {
        filtered = currentFacultyStudentsCache.filter(s => s.hasHistory === true);
    } else if (type === 'not_hired') {
        filtered = currentFacultyStudentsCache.filter(s => s.hasHistory === false);
    }

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:#999;">ไม่พบรายชื่อในกลุ่มนี้</td></tr>';
    } else {
        filtered.forEach((item, index) => {
            let statusBadge = item.hasHistory 
                ? `<span class="vf-badge vf-badge-green">เคยทำงาน</span>` 
                : `<span class="vf-badge" style="background:#ffebee; color:#c62828;">ไม่มีประวัติ</span>`;
            
            let income = item.totalIncome > 0 ? Number(item.totalIncome).toLocaleString() + ' บ.' : '-';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="text-align:center;">${index + 1}</td>
                <td>${item.studentId}</td>
                <td>${item.name}</td>
                <td style="text-align:center;">${statusBadge}</td>
                <td><small>${item.lastJob || '-'}</small></td>
                <td style="text-align:right;">${income}</td>
            `;
            tbody.appendChild(tr);
        });
    }
    
    document.getElementById('facDetailCount').innerText = `รวมจำนวน: ${filtered.length.toLocaleString()} คน`;
}

function printFacultyDetailReport() {
    if (!currentFacultyStudentsCache || currentFacultyStudentsCache.length === 0) return;
    let dataToPrint = [];
    let filterTitle = "ทั้งหมด";
    
    if (currentFilterType === 'all') {
        dataToPrint = currentFacultyStudentsCache;
    } else if (currentFilterType === 'hired') {
        dataToPrint = currentFacultyStudentsCache.filter(s => s.hasHistory === true);
        filterTitle = "เฉพาะผู้ที่มีประวัติการทำงาน (เคยได้รับเงิน)";
    } else if (currentFilterType === 'not_hired') {
        dataToPrint = currentFacultyStudentsCache.filter(s => s.hasHistory === false);
        filterTitle = "เฉพาะผู้ที่ไม่มีประวัติการทำงาน (สมัครแต่ยังไม่ได้งาน)";
    }

    let rowsHtml = '';
    dataToPrint.forEach((item, index) => {
        rowsHtml += `
            <tr>
                <td style="text-align:center;">${index + 1}</td>
                <td style="text-align:center;">${item.studentId}</td>
                <td>${item.name}</td>
                <td style="text-align:center;">${item.hasHistory ? 'มีการจ้างงาน' : 'ยังไม่มีจ้างงาน'}</td>
                <td>${item.lastJob || '-'}</td>
                <td style="text-align:right;">${item.totalIncome > 0 ? Number(item.totalIncome).toLocaleString() : '-'}</td>
            </tr>
        `;
    });

    const d = new Date();
    const printDate = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear() + 543}`;

    const printContent = `
        <div class="paper-sheet" style="padding: 40px; font-family: 'Sarabun', sans-serif;">
            <div style="text-align: center; margin-bottom: 20px;">
                <h2 style="margin: 0;">รายงานสรุปรายชื่อนักศึกษา</h2>
                <h3 style="margin: 5px 0;">คณะ: ${currentFacultyNameFilter}</h3>
                <div style="font-size: 14px; color: #555;"> ${filterTitle}</div>
                <div style="font-size: 12px; margin-top: 5px;">ข้อมูล ณ วันที่: ${printDate}</div>
            </div>
            
            <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                <thead>
                    <tr style="background-color: #f0f0f0;">
                        <th style="border: 1px solid #000; padding: 5px;">ลำดับ</th>
                        <th style="border: 1px solid #000; padding: 5px;">รหัสนักศึกษา</th>
                        <th style="border: 1px solid #000; padding: 5px;">ชื่อ-นามสกุล</th>
                        <th style="border: 1px solid #000; padding: 5px;">สถานะ</th>
                        <th style="border: 1px solid #000; padding: 5px;">งานล่าสุด</th>
                        <th style="border: 1px solid #000; padding: 5px;">รายได้สะสม</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>
            <div style="margin-top: 10px; text-align: right; font-weight: bold;">รวมทั้งหมด: ${dataToPrint.length} คน</div>
        </div>
    `;

    const printDiv = document.createElement('div');
    printDiv.id = 'tempFacPrint';
    printDiv.innerHTML = printContent;
    document.body.appendChild(printDiv);

    const style = document.createElement('style');
    style.innerHTML = `
        @media print {
            body * { visibility: hidden; }
            #tempFacPrint, #tempFacPrint * { visibility: visible; }
            #tempFacPrint { position: absolute; left: 0; top: 0; width: 100%; }
        }
    `;
    document.head.appendChild(style);

    window.print();

    setTimeout(() => {
        document.body.removeChild(printDiv);
        document.head.removeChild(style);
    }, 1000);
}
function escapeHtml(text) {
  if (!text) return text;
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
// --- ฟังก์ชันแสดงป๊อปอัพแจ้งเตือนปิดปรับปรุงระบบ (เช็คเวลา 22.00 - 02.00 น.) ---
function showMaintenanceWarning() {
    // ดึงชั่วโมงปัจจุบัน (0 - 23)
    const currentHour = new Date().getHours();
    
    // ตรวจสอบว่าเวลาปัจจุบันอยู่ระหว่าง 22:00 (22) ถึงก่อน 02:00 (น้อยกว่า 2 คือ 0 หรือ 1)
    const isMaintenanceTime = (currentHour >= 22 || currentHour < 1);

    // ถ้าไม่อยู่ในช่วงเวลาดังกล่าว ให้หยุดการทำงานทันที (ไม่แสดงป๊อปอัพ)
    if (!isMaintenanceTime) {
        return; 
    }

    // ถ้าอยู่ในช่วงเวลา 22:00 - 02:00 ให้แสดงหน้าต่างแจ้งเตือน
    Swal.fire({
        padding: '0', 
        width: '450px',
        background: '#ffffff',
        showConfirmButton: true,
        confirmButtonText: 'รับทราบ',
        confirmButtonColor: '#1e3a8a',
        allowOutsideClick: false, 
        customClass: {
            popup: 'custom-maintenance-popup',
            confirmButton: 'custom-maintenance-btn'
        },
        html: `
            <div style="font-family: 'Sarabun', sans-serif; text-align: center;">
                
                <div style="background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%); padding: 35px 20px; color: white; border-radius: 20px 20px 0 0;">
                    <i class="material-icons" style="font-size: 48px; margin-bottom: 10px; animation: pulseIcon 2s infinite;">cloud_sync</i>
                    <p style="margin: 5px 0 0 0; font-size: 18px; opacity: 0.85;">แจ้งประมวลผลฐานข้อมูลประจำวัน</p>
                </div>

                <div style="padding: 30px 25px; color: #334155;">
                    
                    <div style="background: #fffbeb; border: 1px dashed #fcd34d; border-radius: 12px; padding: 15px; margin-bottom: 20px;">
                        <span style="display: block; font-size: 13px; color: #b45309; margin-bottom: 5px; font-weight: 600;">ระบบจะสำรองและประมวลผลฐานข้อมูลประจำวัน</span>
                        <div style="font-size: 26px; font-weight: 800; color: #d97706; letter-spacing: 1px;">
                            <i class="material-icons" style="font-size: 24px; vertical-align: text-bottom; color: #d97706;">schedule</i> 
                            23:00 - 01:00 น.
                        </div>
                    </div>

                    <p style="font-size: 15px; line-height: 1.6; margin-bottom: 15px; text-align: left; font-weight: 500;">
                        ในช่วงเวลาดังกล่าว อาจส่งผลให้การเข้าใช้งานระบบเกิดความล่าช้า หรือไม่สามารถดำเนินการบางรายการได้ตามปกติ รวมถึงข้อมูลที่บันทึกอาจยังไม่แสดงผลในทันที ทั้งนี้ ระบบจะทำการอัปเดตข้อมูลโดยอัตโนมัติภายหลังจากการประมวลผลเสร็จสิ้น
                    </p>
                    
                    <div style="margin-top: 25px; font-size: 13px; color: #dc2626; font-weight: 600; padding-top: 15px; border-top: 1px solid #f1f5f9;">
                         ผู้ใช้งานกรุณาหลีกเลี่ยงการใช้งานระบบในช่วงเวลาดังกล่าว
                    </div>
                </div>
            </div>

            <style>
                .swal2-html-container { margin: 0 !important; padding: 0 !important; }
                .custom-maintenance-popup { 
                    border-radius: 20px !important; 
                    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25) !important;
                }
                .custom-maintenance-btn { 
                    border-radius: 50px !important; 
                    padding: 12px 35px !important; 
                    font-size: 16px !important; 
                    font-weight: 700 !important; 
                    font-family: 'Sarabun', sans-serif !important; 
                    margin-bottom: 25px !important; 
                    box-shadow: 0 10px 20px -10px rgba(30, 58, 138, 0.5); 
                    transition: transform 0.2s, box-shadow 0.2s !important; 
                }
                .custom-maintenance-btn:hover { 
                    transform: translateY(-2px) !important; 
                    box-shadow: 0 15px 25px -10px rgba(30, 58, 138, 0.6) !important; 
                }
                @keyframes pulseIcon {
                    0% { transform: scale(1); opacity: 1; }
                    50% { transform: scale(1.1); opacity: 0.8; }
                    100% { transform: scale(1); opacity: 1; }
                }
            </style>
        `
    });
}
function toggleJobTypeUI() {
    const jobType = document.querySelector('input[name="jobDateType"]:checked').value;
    if (jobType === 'multi') {
        document.getElementById('divJobEndDate').style.display = 'block';
        document.getElementById('lblJobDate').textContent = 'ตั้งแต่วันที่ (เริ่มต้น)';
        document.getElementById('divTimeSlotQuota').style.display = 'none';
        document.getElementById('jobEndDate').required = true;
    } else {
        document.getElementById('divJobEndDate').style.display = 'none';
        document.getElementById('lblJobDate').textContent = 'วันที่ปฏิบัติงาน';
        document.getElementById('divTimeSlotQuota').style.display = 'block';
        document.getElementById('jobEndDate').required = false;
    }
}
// ตัวแปรเก็บสถานะ Tab ปัจจุบัน (เริ่มต้นให้แสดงงานที่กำลังมาถึง)
let currentRegJobFilter = 'upcoming'; 

function switchRegJobTab(filter) {
    currentRegJobFilter = filter;
    
    // เปลี่ยนสีปุ่ม Tab
    const btns = document.querySelectorAll('#regMasterView .reg-tab-btn');
    btns.forEach(btn => btn.classList.remove('active'));
    
    if (filter === 'upcoming') btns[0].classList.add('active');
    if (filter === 'past') btns[1].classList.add('active');
    if (filter === 'all') btns[2].classList.add('active');
    
    // วาดตารางใหม่โดยใช้ข้อมูลใน Cache เดิม
    renderRegMasterTable(allRegistrationsCache);
}
// ==========================================
// ระบบประชาสัมพันธ์ (Frontend)
// ==========================================

setupNavClick('navManageAnnouncements', 'manageAnnouncementsSection', () => loadAllAnnouncements());

function fetchActiveAnnouncements() {
    if(!currentUser) return;
    
    const role = (currentUser.role === 'admin' || currentUser.role === 'staff' || currentUser.role === 'executive') ? 'staff' : 'student';
    
    google.script.run.withSuccessHandler(res => {
        if(res.success) {
            renderDashboardAnnouncements(res.data, role);
        }
    }).getActiveAnnouncements(role);
}

// ผูกการเรียกประกาศเข้ากับปุ่มเมนู
document.getElementById('navUserDashboard').addEventListener('click', () => {
    fetchActiveAnnouncements();
});

document.getElementById('navDashboard').addEventListener('click', () => {
    fetchActiveAnnouncements();
});

setTimeout(() => { fetchActiveAnnouncements(); }, 1000);

// วาดการ์ดแสดงผล (เพิ่มชื่อผู้ประกาศ)
function renderDashboardAnnouncements(prList, role) {
    const containerId = role === 'student' ? 'studentPrContainer' : 'staffPrContainer';
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = '';
    if(prList.length === 0) return;

    let html = `<h3 style="color:#e91e63; margin-bottom:15px; border-bottom: 2px solid #fce4ec; padding-bottom:10px;">
                  <i class="material-icons" style="vertical-align:bottom;">campaign</i> ข่าวประชาสัมพันธ์
                </h3>`;
    
    prList.forEach(pr => {
        let imgHtml = pr.imageUrl ? `<div style="width:100%; max-height:350px; overflow:hidden; border-radius:8px; margin-bottom:15px; text-align:center; background:#f9f9f9;"><img src="${pr.imageUrl}" style="max-width:100%; max-height:350px; object-fit:contain;" onerror="this.parentElement.style.display='none';"></div>` : '';
        
        // เพิ่มไอคอนและชื่อผู้ประกาศ (pr.uploader)
        html += `
            <div style="background:#fff; border-left:5px solid #e91e63; border-radius:8px; padding:20px; margin-bottom:15px; box-shadow:0 4px 12px rgba(0,0,0,0.05); border:1px solid #eee;">
                ${imgHtml}
                <h4 style="margin:0 0 8px 0; font-size:18px; color:#333;">${pr.title}</h4>
                <div style="font-size:12px; color:#888; margin-bottom:15px; border-bottom:1px dashed #eee; padding-bottom:10px; display: flex; align-items: center; flex-wrap: wrap; gap: 10px;">
                    <div><i class="material-icons" style="font-size:14px; vertical-align:middle;">schedule</i> ประกาศเมื่อ: ${pr.createdAt}</div>
                    <div style="color: #ccc;">|</div>
                    <div style="color: #1976D2;"><i class="material-icons" style="font-size:14px; vertical-align:middle;">person</i> โดย: ${pr.uploader || 'หน่วยงาน/ผู้ดูแลระบบ'}</div>
                </div>
                <div style="font-size:14px; color:#444; line-height:1.6; white-space:pre-wrap;">${pr.detail}</div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

// บันทึกประกาศใหม่ (ปรับให้ส่งชื่อ-สกุลเต็ม)
document.getElementById('announcementForm').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const fileInput = document.getElementById('prImage');
    
    // --- [จุดที่แก้ไข] ดึง คำนำหน้า + ชื่อจริง + นามสกุล มารวมกัน ---
    const prefix = currentUser.prefix || '';
    const fName = currentUser.firstName || '';
    const lName = currentUser.lastName || '';
    const fullName = `${prefix}${fName} ${lName}`.trim();

    const payload = {
        title: document.getElementById('prTitle').value,
        detail: document.getElementById('prDetail').value,
        expiryDate: document.getElementById('prExpiryDate').value,
        target: document.getElementById('prTarget').value,
        uploader: fullName, // <--- ส่งชื่อ-นามสกุลแบบเต็มไปบันทึก
        fileContent: null,
        mimeType: null,
        fileName: null
    };

    const processUpload = () => {
        showLoading();
        google.script.run.withSuccessHandler(res => {
            hideLoading();
            if(res.success) {
                document.getElementById('addAnnouncementModal').style.display = 'none';
                document.getElementById('announcementForm').reset();
                showAlert('สร้างประกาศเรียบร้อย', 'success');
                loadAllAnnouncements(); 
                fetchActiveAnnouncements(); 
            } else {
                showAlert('Error: ' + res.message, 'error');
            }
        }).saveAnnouncement(payload);
    };

if (fileInput.files.length > 0) {
        const file = fileInput.files[0];
        // ขยายเป็น 10MB (10 * 1024 * 1024)
        if (file.size > 10 * 1024 * 1024) { 
            showAlert('ขนาดรูปภาพต้องไม่เกิน 15MB', 'error'); return;
        }
        const reader = new FileReader();
        reader.onload = function(e) {
            payload.fileContent = e.target.result.split(',')[1];
            payload.mimeType = file.type;
            payload.fileName = file.name;
            processUpload();
        };
        reader.readAsDataURL(file);
    } else {
        processUpload(); 
    }
});

// โหลดตารางประกาศ (เพิ่มชื่อผู้ประกาศใต้ชื่อเรื่อง)
function loadAllAnnouncements() {
    showLoading();
    google.script.run.withSuccessHandler(data => {
        hideLoading();
        const tbody = document.querySelector('#announcementsTable tbody');
        tbody.innerHTML = '';
        
        if(data.length === 0) {
            document.getElementById('noAnnouncementsMsg').style.display = 'block';
            return;
        }
        document.getElementById('noAnnouncementsMsg').style.display = 'none';

        data.forEach(item => {
            const tr = document.createElement('tr');
            let targetText = item.target === 'student' ? 'นักศึกษา' : (item.target === 'staff' ? 'หน่วยงาน' : 'ทั้งหมด');
            let imgBtn = item.imageUrl ? `<a href="${item.imageUrl}" target="_blank" class="btn btn-info" style="padding:4px 8px; font-size:11px;">ดูรูป</a>` : '-';
            
            let isExpired = new Date(item.expiryDate) < new Date(new Date().setHours(0,0,0,0));
            let expireStyle = isExpired ? 'color:red; text-decoration:line-through;' : 'color:green; font-weight:bold;';

            tr.innerHTML = `
                <td>${formatDate(item.createdAt)}</td>
                <td>
                    <div style="font-weight:bold; color:#333;">${item.title}</div>
                    <div style="font-size: 11px; color: #1976D2; margin-top: 4px;">
                        <i class="material-icons" style="font-size: 11px; vertical-align: middle;">person</i> ${item.uploader || 'แอดมิน'}
                    </div>
                </td>
                <td style="${expireStyle}">${formatDate(item.expiryDate)}</td>
                <td><span class="vf-badge" style="background:#eee; color:#555;">${targetText}</span></td>
                <td style="text-align:center;">${imgBtn}</td>
                <td style="text-align:center;">
                    <button class="btn btn-danger" onclick="deleteAnnouncement('${item.id}')" style="padding:4px 8px;"><i class="material-icons" style="font-size:14px;">delete</i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }).getAllAnnouncementsForAdmin();
}

function deleteAnnouncement(id) {
    Swal.fire({
        title: 'ยืนยันการลบ', text: 'ต้องการลบประกาศนี้ใช่หรือไม่', icon: 'warning',
        showCancelButton: true, confirmButtonColor: '#d33', confirmButtonText: 'ลบประกาศ', cancelButtonText: 'ยกเลิก'
    }).then((res) => {
        if(res.isConfirmed) {
            showLoading();
            google.script.run.withSuccessHandler(r => {
                hideLoading();
                if(r.success) { 
                    showAlert('ลบเรียบร้อย', 'success'); 
                    loadAllAnnouncements(); 
                    fetchActiveAnnouncements(); 
                } else showAlert(r.message, 'error');
            }).deleteAnnouncementById(id);
        }
    });
}
function fetchPublicAnnouncements() {
    // ดึงประกาศโดยใช้สิทธิ์ 'student' เพื่อให้เห็นประกาศที่นักศึกษาควรเห็น
    google.script.run.withSuccessHandler(res => {
        if(res.success) {
            renderPublicAnnouncements(res.data);
        }
    }).getActiveAnnouncements('student'); 
}

function renderPublicAnnouncements(prList) {
    const container = document.getElementById('publicPrContainer');
    if (!container) return;
    
    container.innerHTML = '';
    
    // ถ้าไม่มีประกาศให้ซ่อนไปเลย
    if(prList.length === 0) return;

    // สร้างกรอบข่าวสาร
    let html = `
        <div style="border-top: 1px solid #e2e8f0; margin-top: 30px; padding-top: 20px;">
            <h4 style="color: #e91e63; font-size: 16px; margin: 0 0 15px 0; display: flex; align-items: center; gap: 5px; font-weight: 700;">
                <i class="material-icons" style="font-size: 20px;">campaign</i> ข่าวประชาสัมพันธ์
            </h4>
            <div style="max-height: 250px; overflow-y: auto; padding-right: 5px; text-align: left;">
    `;
    
    // วนลูปสร้างการ์ดข่าวเล็กๆ
    prList.forEach(pr => {
        let linkHtml = pr.imageUrl ? `<a href="${pr.imageUrl}" target="_blank" style="display: inline-block; margin-top: 8px; color: #1976D2; font-weight: 600; text-decoration: none; font-size: 12px;"><i class="material-icons" style="font-size: 14px; vertical-align: bottom;">image</i> ดูรูปภาพประกอบ</a>` : '';
        
        html += `
            <div style="background: #f8fafc; border-left: 3px solid #e91e63; padding: 12px; margin-bottom: 10px; border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
                <div style="font-weight: 700; color: #1e293b; font-size: 14px; margin-bottom: 4px; line-height: 1.4;">${pr.title}</div>
                <div style="color: #64748b; font-size: 11px; margin-bottom: 6px;">
                    <i class="material-icons" style="font-size: 11px; vertical-align: middle;">schedule</i> ${pr.createdAt}
                </div>
                <div style="color: #475569; font-size: 13px; line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; white-space: pre-wrap;">${pr.detail}</div>
                ${linkHtml}
            </div>
        `;
    });
    
    html += `</div></div>`;
    container.innerHTML = html;
}

// สั่งให้โหลดประกาศทันทีที่เปิดหน้าเว็บขึ้นมา
document.addEventListener('DOMContentLoaded', () => {
    fetchPublicAnnouncements();
});
// ฟังก์ชันตรวจจับความหมายและคัดกรองข้อความ (Smart AI Checker)
function analyzeJobDetail(text) {
    let cleanText = text.replace(/\s+/g, ''); // ตัดช่องว่างออกทั้งหมดเพื่อเช็คความยาวจริง
    
    // 1. กฎความสั้นเกินไป (ไม่มีใจความ)
    if (cleanText.length < 10) {
        return { 
            isValid: false, 
            message: 'ข้อความสั้นเกินไป ไม่สามารถสื่อความหมายถึงเนื้องานที่ทำได้ชัดเจน' 
        };
    }

    // 2. กฎการปั่นอักษร (Spam / Gibberish Check) เช่น "ทำงานนนนนนนน" หรือ "asdfghjkl"
    if (/(.)\1{4,}/.test(cleanText)) {
        return { 
            isValid: false, 
            message: 'พบการพิมพ์ตัวอักษรซ้ำกันผิดปกติ กรุณาระบุรายละเอียดงานด้วยภาษาที่ถูกต้อง' 
        };
    }

    // 3. ฐานข้อมูลกลุ่มคำที่สื่อความหมายกว้าง/กำกวม (Vague Words)
    const vaguePhrases = [
        "ประจำสำนักงาน", "ช่วยงานเอกสาร", "รับส่งเอกสาร", "รับ-ส่งเอกสาร", "เดินเอกสาร", 
        "งานเอกสาร", "ถ่ายเอกสาร", "ช่วยงาน", "ทำความสะอาด", "อื่นๆ", 
        "พิมพ์งาน", "จัดเอกสาร", "ทำงาน", "ติดต่อประสานงาน", "ดูแลความเรียบร้อย",
        "งานทั่วไป", "ช่วยงานเอกสาร", "ช่วยงานธุรการ", "ช่วยงานด้านเอกสาร", "ปฏิบัติงาน"
    ];

    // 4. กฎตรวจสอบบริบท (Context Check)
    for (let phrase of vaguePhrases) {
        let phraseNoSpace = phrase.replace(/\s+/g, '');
        
        // หากในประโยคมีคำกำกวมอยู่
        if (cleanText.includes(phraseNoSpace)) {
            // คำนวณหา "ส่วนขยาย" (ตัวอักษรที่พิมพ์เพิ่มเข้ามานอกเหนือจากคำกำกวม)
            let extraChars = cleanText.length - phraseNoSpace.length;
            
            // ถ้าเพิ่มส่วนขยายน้อยกว่า 6 ตัวอักษร (เช่น พิมพ์แค่ "ช่วยงานเอกสารครับ") ถือว่าความหมายยังไม่ชัดเจน
            if (extraChars < 6) {
                return { 
                    isValid: false, 
                    message: `คำว่า <b>"${phrase}"</b> สื่อความหมายกว้างเกินไป กรุณาระบุ <span style="color:#1976D2;">ส่วนขยาย</span> ว่าทำเกี่ยวกับเรื่องอะไร หรือรูปแบบเนื้อหางานเเบบไหนเช่น ตรวจสอบเอกสารผู้กู้ยืม กยศ. เป็นต้น` 
                };
            }
        }
    }

    // หากผ่านทุกกฎ ถือว่าข้อความสื่อความหมายได้
    return { isValid: true };
}

// 1. ฐานข้อมูลลำดับที่นักศึกษา (อิงตามไฟล์ PDF ประกาศ 355 คน ครบถ้วน)
const STUDENT_NO_MAP = {
    "65111140506": 1, "66111340240": 2, "66111440469": 3, "66111440571": 4, "66111440640": 5,
    "66112140041": 6, "66112140412": 7, "66114140021": 8, "66114540346": 9, "66114540418": 10,
    "66114540443": 11, "66114540739": 12, "66114540766": 13, "66114540779": 14, "67111240138": 15,
    "67111240145": 16, "67111440101": 17, "67111440112": 18, "67111440233": 19, "67111440288": 20,
    "67111440309": 21, "67112140037": 22, "67112140558": 23, "67112240092": 24, "67112240126": 25,
    "67112240205": 26, "67113340311": 27, "67114540015": 28, "67114540059": 29, "67114540141": 30,
    "67114540424": 31, "67114540666": 32, "67114640209": 33, "67114640467": 34, "68111240298": 35,
    "68113340613": 36, "68114540184": 37, "68114540474": 38, "68114640589": 39, "63120040246": 40,
    "64120040160": 41, "64120041196": 42, "65120040536": 43, "65120041160": 44, "65120042334": 45,
    "65120042374": 46, "66120040748": 47, "66120040757": 48, "66120041116": 49, "66120041666": 50,
    "66120041882": 51, "66120540231": 52, "66120540257": 53, "67120040671": 54, "67120041944": 55,
    "68120041914": 56, "62130640280": 57, "65130040052": 58, "65130040063": 59, "65130040201": 60,
    "65130040270": 61, "65130040502": 62, "65130042030": 63, "65130042621": 64, "65130043512": 65,
    "65130044173": 66, "65130044577": 67, "65130045820": 68, "65130046140": 69, "66130040848": 70,
    "66130041661": 71, "66130043212": 72, "66130044510": 73, "66130045236": 74, "66130045904": 75,
    "66130046134": 76, "66130046509": 77, "67130043516": 78, "67130046177": 79, "67130046199": 80,
    "67130046627": 81, "67130046735": 82, "67130046856": 83, "68130040884": 84, "68130041119": 85,
    "68130044093": 86, "68130044280": 87, "68130044914": 88, "68130045968": 89, "68130740096": 90,
    "63141540060": 91, "64142140840": 92, "65141140396": 93, "65141140402": 94, "65141140493": 95,
    "65141140602": 96, "65141140631": 97, "65142140045": 98, "65142140249": 99, "65142140319": 100,
    "65142140573": 101, "65142140696": 102, "65142140799": 103, "65142140827": 104, "65142940065": 105,
    "66140740749": 106, "66141140351": 107, "66141140472": 108, "66141140672": 109, "66141640330": 110,
    "66142140011": 111, "66142140185": 112, "66142140723": 113, "66142940288": 114, "66142940295": 115,
    "66144740697": 116, "66145140067": 117, "66145140168": 118, "66145940113": 119, "66145940126": 120,
    "67140740177": 121, "67140740586": 122, "67141540189": 123, "67141540299": 124, "67141540466": 125,
    "67141540479": 126, "67141540545": 127, "67141540578": 128, "67141540600": 129, "67141640029": 130,
    "67141640041": 131, "67141640074": 132, "67141640265": 133, "67141640447": 134, "67142140160": 135,
    "67142140454": 136, "67142140553": 137, "67142140599": 138, "67142140713": 139, "67142140786": 140,
    "67142940087": 141, "67142940173": 142, "67144740582": 143, "67145140040": 144, "67145140600": 145,
    "68140740086": 146, "68141140096": 147, "68141540146": 148, "68141540416": 149, "68141640310": 150,
    "68142140321": 151, "68142140718": 152, "68142140886": 153, "68142140945": 154, "68142940037": 155,
    "68142940154": 156, "68142940213": 157, "68142940286": 158, "68142940415": 159, "68144740183": 160,
    "68144740428": 161, "68144740660": 162, "68144740763": 163, "68145140441": 164, "68145140489": 165,
    "68145140641": 166, "62150041003": 167, "66150040844": 168, "67150041099": 169, "68150040275": 170,
    "64170140134": 171, "65170742260": 172, "66170140696": 173, "66170142104": 174, "66170142313": 175,
    "66170142357": 176, "66170240701": 177, "66170240712": 178, "66170241104": 179, "66170241544": 180,
    "66170340397": 181, "66170340694": 182, "66170340797": 183, "66170340885": 184, "66170341077": 185,
    "66170341138": 186, "66170341257": 187, "66170740270": 188, "66170740513": 189, "66170740526": 190,
    "66170741428": 191, "66170741532": 192, "66170741594": 193, "66170742562": 194, "66170940184": 195,
    "67170140677": 196, "67170141058": 197, "67170141188": 198, "67170141933": 199, "67170142200": 200,
    "67170240670": 201, "67170241118": 202, "67170241567": 203, "67170241626": 204, "67170340185": 205,
    "67170340390": 206, "67170340420": 207, "67170340435": 208, "67170340620": 209, "67170340635": 210,
    "67170340860": 211, "67170440230": 212, "67170740338": 213, "67170740723": 214, "67170740778": 215,
    "67170740860": 216, "67170740873": 217, "67170741324": 218, "67170741481": 219, "67170741562": 220,
    "67170741698": 221, "67170741724": 222, "67170741986": 223, "67170742253": 224, "67170940392": 225,
    "67170940536": 226, "67170940817": 227, "67170941221": 228, "67170941368": 229, "68170240125": 230,
    "68170240295": 231, "68170240451": 232, "68170240534": 233, "68170240617": 234, "68170340209": 235,
    "68170340373": 236, "68170340412": 237, "68170340997": 238, "68170740162": 239, "68170740584": 240,
    "68170741062": 241, "68170940225": 242, "67180040891": 243, "66180040973": 244, "67180040981": 245,
    "66190240060": 246, "66190240237": 247, "66190240439": 248, "66190240479": 249, "66190240509": 250,
    "66190640493": 251, "66190640547": 252, "66190640556": 253, "67190240137": 254, "67190240856": 255,
    "67190640100": 256, "67190640269": 257, "67190640641": 258, "67190640911": 259, "65201140104": 260,
    "66200140188": 261, "66200140623": 262, "66200141695": 263, "67200140080": 264, "67200140143": 265,
    "67200140471": 266, "68200140520": 267, "68200140850": 268, "68200140861": 269, "65210041159": 270,
    "65210041298": 271, "65210042824": 272, "65210043986": 273, "65210044019": 274, "66210041105": 275,
    "66210041277": 276, "66210041929": 277, "66210042063": 278, "66210042362": 279, "66210042672": 280,
    "66210042687": 281, "66210042870": 282, "66210043677": 283, "67210040042": 284, "67210040291": 285,
    "67210040824": 286, "67210040936": 287, "67210041122": 288, "67210041306": 289, "67210041513": 290,
    "67210041953": 291, "67210041977": 292, "67210042345": 293, "67210042390": 294, "67210042617": 295,
    "67210042859": 296, "67210043920": 297, "67210044242": 298, "67210044330": 299, "68210041842": 300,
    "68210042328": 301, "68210042566": 302, "68210042809": 303, "68210044021": 304, "68210044177": 305,
    "68210044212": 306, "68210044225": 307, "68210044375": 308, "66230140031": 309, "66230140598": 310,
    "66230140972": 311, "66230141281": 312, "66230141654": 313, "66230141726": 314, "66230340345": 315,
    "66230340596": 316, "66230341597": 317, "66230342387": 318, "67230140162": 319, "67230140245": 320,
    "67230141341": 321, "67230141585": 322, "67230340133": 323, "67230340599": 324, "67230340638": 325,
    "67230341059": 326, "67230342403": 327, "68230340109": 328, "68230340569": 329, "68230341139": 330,
    "68230342206": 331, "68230342453": 332, "65146240088": 333, "65146540096": 334, "66146140071": 335,
    "66146140132": 336, "66146240283": 337, "66146440119": 338, "66146740228": 339, "66146840106": 340,
    "67146140175": 341, "67146240019": 342, "67146240044": 343, "67146240145": 344, "67146240190": 345,
    "67146640046": 346, "67146840077": 347, "67146840109": 348, "67146840183": 349, "67146840190": 350,
    "67146840231": 351, "67146840268": 352, "67146840271": 353, "68264640110": 354, "68264640257": 355
};

// 2. ฟังก์ชันวาดเครื่องหมายถูก, รหัสนักศึกษา (Debug) และตัดหน้า PDF
async function generatePdfWithCheckmarks() {
    if (!currentReportJobInfo || !currentReportJobInfo.data || currentReportJobInfo.data.length === 0) {
        showAlert('กรุณาสร้างรายงานการเบิกจ่ายก่อน', 'warning');
        return;
    }

    showLoading();

    google.script.run.withSuccessHandler(async (res) => {
        if (!res.success) {
            hideLoading();
            Swal.fire('ข้อผิดพลาด', res.message, 'error');
            return;
        }

        try {
            const binaryString = window.atob(res.data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            const { PDFDocument, rgb } = PDFLib;
            const pdfDoc = await PDFDocument.load(bytes);
            const pages = pdfDoc.getPages();

            const paidStudentIds = currentReportJobInfo.data.map(st => String(st.studentId).trim());

            const checkX = 525;          // ↔️ ซ้าย-ขวา
            
            // ↕️ จุดเริ่มต้นตาราง (ปรับลดลง 1 บรรทัดจากภาพที่คุณส่งมาให้ดู)
            const startY_Page2 = 710.0;  // บรรทัดแรกของหน้า 2
            const startY_Others = 689.5; // บรรทัดแรกของหน้า 3 เป็นต้นไป
            
            const rowHeight = 18.52;     // ↕️ ความสูงระหว่างบรรทัด
            const rowsPerPage = 35;      // จำนวนบรรทัดต่อหน้า 

            let markCount = 0;
            
            // เตรียมฟอนต์สำหรับการพิมพ์รหัสนักศึกษา
            const helveticaFont = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);

            // สร้างกล่องความจำ ว่าหน้าไหนมีการติ๊กถูกบ้าง
            const pagesToKeep = new Set();
            pagesToKeep.add(0); // บังคับเก็บหน้า 1 (ปกประกาศ) ไว้เสมอ

            paidStudentIds.forEach(studentId => {
                const studentNo = STUDENT_NO_MAP[studentId];
                
                if (studentNo) {
                    const pageIndex = Math.floor((studentNo - 1) / rowsPerPage) + 1;
                    const rowIndex = (studentNo - 1) % rowsPerPage; 
                    
                    if (pageIndex < pages.length) {
                        const page = pages[pageIndex];
                        const startY = (pageIndex === 1) ? startY_Page2 : startY_Others;
                        const yPos = startY - (rowIndex * rowHeight);

                        // 1. วาดเครื่องหมายถูก (✓)
                        page.drawSvgPath('M 0 5 L 4 10 L 12 0', {
                            x: checkX,
                            y: yPos,
                            borderColor: rgb(0, 0.4, 0), // สีเขียวเข้ม
                            borderWidth: 2.5,
                            scale: 0.9 
                        });

                        page.drawText(studentId, {
                            x: checkX + 15,
                            y: yPos,
                            size: 5,
                            font: helveticaFont,
                            color: rgb(1, 0, 0)
                        });

                        // บันทึกไว้ว่าหน้านี้มีการใช้งาน (ห้ามลบทิ้ง)
                        pagesToKeep.add(pageIndex);
                        
                        markCount++;
                    }
                }
            });

 
            const totalPages = pdfDoc.getPageCount();
            for (let i = totalPages - 1; i >= 0; i--) {
                if (!pagesToKeep.has(i)) {
                    pdfDoc.removePage(i);
                }
            }

            const pdfBytes = await pdfDoc.save();
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            
            hideLoading();
            
    
            const downloadLink = document.createElement("a");
            downloadLink.href = url;
            downloadLink.download = "รายชื่อประกาศแนบเอกสารประกอบการเบิกจ่าย"; 
            downloadLink.style.display = "none";
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);
            
 
            setTimeout(() => window.URL.revokeObjectURL(url), 1000);
            
            if(markCount < paidStudentIds.length) {
               showAlert(`ติ๊กถูกสำเร็จ ${markCount} รายการ (หาไม่เจอ ${paidStudentIds.length - markCount} รายชื่อในประกาศ)`, 'info');
            }

        } catch (error) {
            hideLoading();
            console.error(error);
            Swal.fire('เกิดข้อผิดพลาดในการวาด PDF', error.message, 'error');
        }
    }).getOfficialPdfBase64();
}
// --- สร้างตัวแปรและฟังก์ชันสำหรับหน่วยงานที่ "ยุบรวมแล้ว" (เฉพาะหน้าเอกสาร) ---
const MERGED_DEPARTMENTS = [
    "งานบริหารทั่วไป",
    "งานศิษย์เก่าสัมพันธ์",
    "งานพัฒนานักศึกษา",
    "งานกีฬาและนันทนาการ",
    "งานวินัยและสวัสดิภาพนักศึกษา",
    "งบสำรอง",
    "งานสวัสดิการนักศึกษา" // ยุบรวม 4 งานย่อยไว้ที่นี่แล้ว
];

function populateMergedDepartments(selectId) {
    const select = document.getElementById(selectId);
    if(!select) return;
    select.innerHTML = '<option value="">-- ทุกหน่วยงาน --</option>';
    
    MERGED_DEPARTMENTS.forEach(dept => {
        const opt = document.createElement('option');
        opt.value = dept;
        opt.textContent = dept;
        select.appendChild(opt);
    });
}
