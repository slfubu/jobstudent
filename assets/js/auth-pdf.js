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
    const selectedMonth = document.getElementById('reportMonthSelector');
    const checkedBoxes = document.querySelectorAll('.job-checkbox:checked');

    if (selectedDept && checkedBoxes.length > 0) {
        const monthLabel = selectedMonth && selectedMonth.selectedIndex >= 0
            ? selectedMonth.options[selectedMonth.selectedIndex].text
            : '-';
        trackUserAction(
            "Generate Report",
            `สร้างรายงานเบิกจ่ายหน่วยงาน: ${selectedDept} | ประจำเดือน: ${monthLabel} (${checkedBoxes.length} รายการ)`
        );
    }

    // ใช้ Logic หลักจาก disbursement.js เพียงจุดเดียว
    // เพื่อให้การกรองเดือนย้อนหลังและยอดเงินไม่ถูกเขียนทับโดยไฟล์นี้
    return originalGenerateReport();
};

setupNavClick('navSystemLog' , 'systemLogSection', () => {
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
(function initAuthPdfWhenDomReady() {
  const run = () => {
    fetchPublicAnnouncements();

  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();
})();
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
const STUDENT_PDF_2570_MAP = {"65114540480":[1,673.91],"66111240539":[1,656.32],"66111440380":[1,638.29],"66111440502":[1,620.48],"66111440557":[1,602.67],"66111440649":[1,584.86],"66114140021":[1,567.05],"66114540739":[1,549.24],"67111140265":[1,531.43],"67111440101":[1,513.46],"67111440112":[1,495.65],"67111440228":[1,477.84],"67111440240":[1,460.19],"67111440417":[1,442.38],"67113340384":[1,424.57],"67113340391":[1,406.75],"67113340418":[1,389.16],"67113340421":[1,371.35],"67114140024":[1,353.54],"67114540028":[1,335.73],"67114540277":[1,317.92],"68111240313":[1,300.11],"68111240386":[1,282.46],"68111440555":[1,264.65],"68111440725":[1,246.84],"68112140049":[1,228.87],"68114140209":[1,211.06],"68114540155":[1,193.25],"68114540232":[1,175.6],"68114540258":[1,157.79],"68114540322":[1,140.2],"68114540474":[1,122.54],"68114540504":[1,104.73],"68114540540":[1,86.92],"68114640259":[1,69.11],"68114640451":[2,674.63],"68114640745":[2,656.82],"69111240192":[2,639.23],"69111240215":[2,621.42],"69111240240":[2,603.61],"69111240378":[2,585.8],"69111240417":[2,567.99],"69111240480":[2,550.18],"69111240505":[2,532.15],"69111440437":[2,514.56],"69111440536":[2,496.75],"69112140378":[2,478.94],"69113340173":[2,461.13],"69113340302":[2,443.32],"69113340326":[2,425.5],"69113340483":[2,407.69],"69113340726":[2,389.88],"69113340731":[2,372.07],"69114140172":[2,354.42],"69114140206":[2,336.61],"69114140235":[2,319.02],"69114540316":[2,301.21],"69114540431":[2,283.4],"69114540493":[2,265.59],"69114540547":[2,247.78],"69114540592":[2,229.75],"69114640018":[2,211.94],"69114640144":[2,194.13],"69114640335":[2,176.54],"69114640380":[2,158.73],"64120040160":[2,140.92],"65120040536":[2,123.26],"65120541928":[2,105.45],"66120040553":[2,87.86],"66120041237":[2,70.21],"67120040671":[3,677.17],"67120040741":[3,659.36],"67120041414":[3,641.55],"67120041603":[3,623.74],"67120041742":[3,605.93],"67120041847":[3,587.96],"68120540080":[3,570.31],"68120540163":[3,552.34],"69120040363":[3,534.69],"69120040752":[3,516.88],"69120041054":[3,499.07],"69120540072":[3,481.26],"69120540128":[3,463.45],"69120540243":[3,445.63],"64130040826":[3,427.82],"65130040870":[3,410.23],"65130041307":[3,392.42],"65130043075":[3,374.61],"65130044423":[3,356.8],"65130047163":[3,338.99],"66130040868":[3,321.18],"66130041078":[3,303.37],"66130044400":[3,285.72],"66130046583":[3,267.91],"67130042050":[3,249.94],"67130044825":[3,232.13],"67130045062":[3,214.32],"67130045567":[3,196.51],"67130045846":[3,178.86],"67130046063":[3,161.26],"67130046119":[3,143.45],"67130046720":[3,125.8],"67130740039":[3,107.83],"67130740046":[3,90.18],"67130740310":[3,72.37],"68130043360":[4,676.97],"68130044552":[4,659.16],"68130045205":[4,641.51],"68130045261":[4,623.7],"68130046242":[4,605.89],"68130740223":[4,588.3],"69130042586":[4,570.49],"69130042780":[4,552.68],"69130044100":[4,534.65],"69130044139":[4,516.84],"69130044416":[4,499.03],"69130740301":[4,481.22],"69130840267":[4,463.63],"65141640562":[4,445.82],"65142140038":[4,428.01],"66140740394":[4,410.2],"66140740624":[4,392.38],"66141140018":[4,374.57],"66141140182":[4,356.76],"66141140212":[4,339.33],"66141140267":[4,321.3],"66141140306":[4,303.71],"66141140351":[4,285.9],"66141140414":[4,267.87],"66141140513":[4,250.06],"66141140627":[4,232.25],"66141140672":[4,214.66],"66142140125":[4,196.63],"66142140185":[4,179.04],"66142140295":[4,161.39],"66142140516":[4,143.58],"66142140635":[4,125.77],"66142940288":[4,108.17],"66144740091":[4,90.36],"66144740617":[4,72.71],"66144740804":[5,676.97],"66145940113":[5,659.54],"66146240016":[5,641.73],"66146840254":[5,623.92],"66146940031":[5,606.11],"67140740021":[5,588.3],"67140740108":[5,570.49],"67140740164":[5,552.68],"67140740177":[5,534.87],"67140740403":[5,517.06],"67140740742":[5,499.25],"67140740780":[5,481.22],"67140740830":[5,463.63],"67141140084":[5,445.82],"67141140738":[5,428.01],"67141540028":[5,410.2],"67141540033":[5,392.38],"67141540299":[5,374.57],"67141540455":[5,356.76],"67141540466":[5,338.95],"67141540479":[5,321.14],"67141540545":[5,303.33],"67141540565":[5,285.52],"67141540578":[5,268.09],"67141540600":[5,250.06],"67141540639":[5,232.25],"67141640630":[5,214.44],"67142140014":[5,196.47],"67142140298":[5,179.04],"67142140357":[5,161.23],"67142140393":[5,143.42],"67142140623":[5,125.77],"67142140678":[5,108.17],"67142140690":[5,90.14],"67142140731":[5,72.55],"67142140757":[6,679.55],"67142140843":[6,661.9],"67142940445":[6,643.93],"67144740014":[6,626.28],"67144740049":[6,608.47],"67144740159":[6,590.5],"67144740302":[6,572.69],"67144740313":[6,554.88],"67144740368":[6,537.07],"67144740522":[6,519.42],"67144740582":[6,501.82],"67144740638":[6,484.01],"67145140095":[6,466.2],"67146140175":[6,448.39],"67146140238":[6,430.58],"67146240044":[6,412.77],"67146240293":[6,394.96],"67146540054":[6,377.15],"67146840019":[6,359.34],"67146840109":[6,341.53],"67146840142":[6,323.72],"67146840178":[6,305.91],"67146840202":[6,288.1],"67146840268":[6,270.29],"67146840271":[6,252.64],"68140740071":[6,234.83],"68140740206":[6,216.86],"68140740312":[6,199.05],"68140740437":[6,181.61],"68140740806":[6,163.8],"68140740897":[6,145.99],"68140740927":[6,128.34],"68141140456":[6,110.37],"68141140630":[6,92.94],"68141540065":[6,75.13],"68141540166":[7,678.45],"68141540272":[7,660.64],"68141540434":[7,642.83],"68141540450":[7,625.02],"68141540605":[7,607.21],"68141640259":[7,589.4],"68141640273":[7,571.59],"68142140077":[7,553.78],"68142140183":[7,535.97],"68142140213":[7,518.16],"68142140293":[7,500.35],"68142140307":[7,482.54],"68142140321":[7,464.73],"68142140336":[7,446.92],"68142140352":[7,429.1],"68142140404":[7,411.29],"68142140428":[7,393.48],"68142140460":[7,375.67],"68142140659":[7,357.86],"68142140776":[7,340.21],"68142140826":[7,322.4],"68142140893":[7,304.59],"68142140923":[7,286.78],"68142140978":[7,269.19],"68142940064":[7,251.16],"68142940286":[7,233.35],"68142940640":[7,215.54],"68144740307":[7,197.57],"68144740718":[7,179.92],"68144740752":[7,162.33],"68144740826":[7,144.67],"68145140010":[7,126.86],"68145140038":[7,109.05],"68145140203":[7,91.24],"68145140322":[7,73.43],"68145140588":[8,678.41],"69140740045":[8,660.6],"69140740179":[8,642.79],"69140740269":[8,624.98],"69141104169":[8,607.33],"69141140013":[8,589.52],"69141140419":[8,571.71],"69141140701":[8,553.9],"69141540051":[8,536.15],"69141540062":[8,518.5],"69141540080":[8,500.69],"69141540246":[8,482.88],"69141540284":[8,465.07],"69141540396":[8,447.26],"69141540426":[8,429.45],"69141540525":[8,411.64],"69141540547":[8,393.82],"69141540592":[8,376.01],"69141540750":[8,358.36],"69141540761":[8,340.55],"69141540774":[8,322.96],"69141540811":[8,304.93],"69141640018":[8,286.96],"69141640098":[8,269.37],"69141640362":[8,251.5],"69141640548":[8,233.91],"69141640649":[8,216.1],"69141640706":[8,198.07],"69141640742":[8,180.86],"69142140328":[8,162.83],"69142140838":[8,145.02],"69142141017":[8,127.42],"69144740041":[8,109.61],"69144740096":[8,91.8],"69144740180":[8,74.15],"69144740906":[9,678.41],"63150040571":[9,660.6],"64150040578":[9,642.79],"66150040929":[9,624.98],"67150040076":[9,607.17],"67150041019":[9,589.36],"69150040827":[9,571.33],"69150040849":[9,553.52],"69150040911":[9,535.93],"65170742260":[9,518.28],"66170141156":[9,500.31],"66170240701":[9,482.5],"66170241368":[9,464.69],"66170540465":[9,446.88],"66170741123":[9,429.07],"66170741428":[9,411.26],"67170142143":[9,393.45],"67170142246":[9,375.79],"67170240106":[9,357.82],"67170240223":[9,340.01],"67170240395":[9,322.36],"67170240425":[9,304.39],"67170240584":[9,286.58],"67170240670":[9,268.99],"67170241613":[9,251.34],"67170241796":[9,233.31],"67170340101":[9,215.34],"67170340173":[9,197.53],"67170340185":[9,180.26],"67170340215":[9,162.45],"67170340709":[9,144.64],"67170340860":[9,126.83],"67170341056":[9,109.02],"67170540556":[9,91.21],"67170540567":[9,73.61],"67170740167":[10,678.07],"67170740356":[10,660.26],"67170741681":[10,642.45],"67170741698":[10,624.64],"67170742040":[10,606.99],"67170742141":[10,589.02],"67170940048":[10,571.21],"67170940068":[10,553.4],"67170940251":[10,535.59],"67170940356":[10,517.78],"67170940563":[10,499.97],"67170940682":[10,482.16],"67170940820":[10,464.35],"67170941252":[10,446.7],"67170941368":[10,428.73],"67170941445":[10,411.07],"67170941690":[10,393.48],"67170941702":[10,375.67],"68170140182":[10,357.86],"68170140632":[10,340.05],"68170140944":[10,322.24],"68170141077":[10,304.43],"68170141165":[10,286.62],"68170141226":[10,268.81],"68170141615":[10,251.0],"68170141743":[10,233.19],"68170141813":[10,215.38],"68170240390":[10,197.57],"68170241001":[10,179.92],"68170241113":[10,162.11],"68170241766":[10,144.3],"68170241784":[10,126.7],"68170340016":[10,108.89],"68170340089":[10,91.24],"68170340106":[10,73.43],"68170340209":[11,682.09],"68170340304":[11,664.28],"68170340360":[11,646.47],"68170340917":[11,628.66],"68170340951":[11,610.85],"68170341781":[11,592.82],"68170540030":[11,575.23],"68170540481":[11,557.2],"68170540575":[11,539.39],"68170740151":[11,521.58],"68170740265":[11,503.77],"68170740539":[11,485.95],"68170740878":[11,468.36],"68170741020":[11,450.55],"68170741486":[11,432.74],"68170741585":[11,414.93],"68170741884":[11,397.12],"68170742009":[11,379.31],"68170742111":[11,361.5],"68170742337":[11,343.69],"68170940018":[11,325.88],"68170940177":[11,308.07],"68170940526":[11,290.26],"68170940775":[11,272.45],"68170941488":[11,254.64],"69170140679":[11,236.61],"69170340169":[11,218.8],"69170440155":[11,200.99],"69170440227":[11,183.55],"69170540268":[11,165.74],"69170540318":[11,147.93],"69170540628":[11,130.34],"69170540688":[11,112.69],"69170540707":[11,94.88],"69170540718":[11,77.07],"69170540798":[12,681.49],"69170540978":[12,663.68],"69170740518":[12,645.87],"69170740521":[12,628.06],"69170741331":[12,610.47],"69170741544":[12,592.66],"69170741564":[12,574.85],"69170741771":[12,556.82],"69170742020":[12,539.01],"69170940129":[12,521.2],"69170940189":[12,503.23],"69170940237":[12,485.58],"69170940253":[12,467.77],"69170941029":[12,450.17],"69170941162":[12,432.36],"69170941290":[12,414.55],"69170941555":[12,396.74],"66180040863":[12,379.09],"68180040355":[12,361.28],"68180040971":[12,343.47],"69180040178":[12,325.66],"69180040473":[12,308.07],"69180040923":[12,290.26],"69180041078":[12,272.23],"66190240028":[12,254.64],"66190240349":[12,236.61],"66190240439":[12,218.8],"66190240509":[12,200.99],"66190640547":[12,183.55],"66190640556":[12,165.58],"67190040173":[12,147.93],"67190240669":[12,130.12],"67190640191":[12,112.31],"67190640641":[12,94.72],"68190240297":[12,76.91],"68190640105":[13,676.97],"68190640611":[13,659.54],"69190240214":[13,641.73],"69190240249":[13,623.7],"69190640261":[13,606.11],"69190640289":[13,588.3],"69190640436":[13,570.49],"69190640517":[13,552.68],"69190640580":[13,534.87],"69190640896":[13,517.06],"66200140423":[13,499.25],"66200140748":[13,481.44],"67200140413":[13,463.63],"68200140443":[13,445.82],"68200140520":[13,428.01],"68200140791":[13,410.2],"68200140902":[13,392.38],"65210041159":[13,374.73],"65210044376":[13,356.92],"66210040207":[13,338.95],"66210040987":[13,321.3],"66210041277":[13,303.49],"66210041523":[13,285.52],"66210041929":[13,267.87],"66210042672":[13,249.9],"66210043325":[13,232.09],"66210043677":[13,214.28],"67210040051":[13,196.47],"67210040350":[13,178.82],"67210040686":[13,161.23],"67210040750":[13,143.42],"67210040824":[13,125.61],"67210040936":[13,107.95],"67210041351":[13,90.14],"67210041649":[13,72.55],"67210041669":[14,676.97],"67210042101":[14,659.32],"67210042345":[14,641.51],"67210042390":[14,623.7],"67210042620":[14,605.89],"67210042859":[14,588.3],"67210043041":[14,570.49],"67210043223":[14,552.46],"67210043865":[14,534.65],"67210043935":[14,516.84],"67210043942":[14,499.03],"67210044242":[14,481.22],"68210040070":[14,463.63],"68210040131":[14,445.82],"68210040700":[14,428.01],"68210041262":[14,410.2],"68210041444":[14,392.38],"68210041637":[14,374.57],"68210041767":[14,356.92],"68210042061":[14,338.95],"68210042388":[14,321.3],"68210042456":[14,303.49],"68210042584":[14,285.68],"68210043055":[14,267.87],"68210043309":[14,249.9],"68210043680":[14,232.09],"68210043710":[14,214.28],"68210043765":[14,196.47],"68210043992":[14,179.04],"68210044081":[14,161.23],"68210044247":[14,143.42],"68210044375":[14,125.61],"69210040064":[14,107.95],"69210040352":[14,90.14],"69210040398":[14,72.55],"69210040558":[15,680.23],"69210041232":[15,662.42],"69210042114":[15,644.77],"69210042280":[15,627.18],"69210042330":[15,609.15],"69210042499":[15,591.34],"69210042644":[15,573.53],"69210043230":[15,555.94],"69210043797":[15,538.13],"69210043892":[15,520.1],"69210044088":[15,502.29],"69210044134":[15,484.32],"69210044299":[15,466.51],"69210044479":[15,448.7],"69210044509":[15,431.05],"69210044538":[15,413.23],"69210044655":[15,395.64],"69210044679":[15,377.83],"69210044822":[15,360.02],"69210044864":[15,341.99],"66230340011":[15,324.18],"66230340529":[15,306.37],"67230140245":[15,288.56],"67230140304":[15,270.75],"67230140511":[15,252.78],"67230140546":[15,235.13],"67230140881":[15,217.16],"67230142179":[15,199.35],"67230142405":[15,181.7],"67230341446":[15,164.11],"67230341554":[15,146.3],"67230341929":[15,128.65],"68230140011":[15,110.68],"68230140541":[15,93.02],"68230141205":[15,75.21],"68230141346":[16,680.43],"68230141418":[16,662.84],"68230141520":[16,645.03],"68230141542":[16,627.22],"68230141913":[16,609.41],"68230142411":[16,591.6],"68230340527":[16,573.79],"68230340763":[16,555.98],"68230340813":[16,537.95],"68230340826":[16,520.14],"68230340893":[16,502.33],"68230340910":[16,484.51],"68230340938":[16,466.92],"68230341827":[16,449.11],"68230342068":[16,431.3],"68230342206":[16,413.49],"68230342220":[16,395.68],"68230342367":[16,377.87],"68230342536":[16,360.06],"69230140342":[16,342.25],"69230140403":[16,324.44],"69230140548":[16,306.63],"69230141008":[16,288.82],"69230141190":[16,271.01],"69230141248":[16,253.2],"69230141633":[16,235.39],"69230142001":[16,217.36],"69230142476":[16,199.77],"69230142618":[16,182.11],"69230142643":[16,164.52],"69230340120":[16,146.49],"69230340175":[16,128.9],"69230340197":[16,111.09],"69230340470":[16,93.28],"69230340566":[16,75.63],"69230340845":[17,679.51],"69230341121":[17,661.86],"69230342078":[17,644.05],"69230342689":[17,626.24],"68263140035":[17,608.43],"68263140121":[17,590.46],"68263140305":[17,572.81],"68263240337":[17,555.0],"68263340059":[17,537.03],"68263340327":[17,519.38],"68264240097":[17,501.57],"68264240211":[17,483.76],"68264640022":[17,465.95],"68264640044":[17,448.14],"68264640082":[17,430.33],"68264640109":[17,412.73],"68264640110":[17,394.92],"68264640257":[17,377.11],"69263240075":[17,359.3],"69263240107":[17,341.49],"69263240118":[17,323.68],"69263240136":[17,305.87],"69263340012":[17,288.06],"69263340067":[17,270.25],"69263340070":[17,252.44],"69263340261":[17,234.63],"69263340324":[17,216.82],"69263440154":[17,198.79],"69264240252":[17,181.2]};

// 2. ฟังก์ชันวาดเครื่องหมายถูก, รหัสนักศึกษา (Debug) และตัดหน้า PDF
async function generatePdfWithCheckmarks() {
    const info = (typeof currentReportJobInfo !== 'undefined') ? currentReportJobInfo : null;
    if (!info || !Array.isArray(info.data) || !info.data.length) {
        showAlert('กรุณาสร้างรายงานการเบิกจ่ายก่อน', 'warning');
        return;
    }
    const ids = [...new Set(info.data.map(st => String(st.studentId || '').replace(/^'/, '').trim()).filter(Boolean))];
    const matched = ids.filter(id => Object.prototype.hasOwnProperty.call(STUDENT_PDF_2570_MAP, id));
    const missing = ids.filter(id => !Object.prototype.hasOwnProperty.call(STUDENT_PDF_2570_MAP, id));
    if (!matched.length) {
        Swal.fire('ไม่พบรายชื่อ', 'รหัสนักศึกษาที่เลือกไม่มีในประกาศรายชื่อ ปีงบประมาณ 2570 ครั้งที่ 1 กรุณาตรวจสอบปีงบประมาณและรายชื่อ', 'warning');
        return;
    }
    if (missing.length) {
        const sample = missing.slice(0, 10).join(', ');
        const response = await Swal.fire({
            icon: 'warning',
            title: 'มีรายชื่อไม่พบในประกาศปี 2570',
            text: `พบ ${matched.length} รายการ และไม่พบ ${missing.length} รหัส (${sample}${missing.length > 10 ? ', ...' : ''}) ระบบจะไม่ทำเครื่องหมายให้รหัสที่ไม่พบ ต้องการออกรายงานเฉพาะรายชื่อที่ตรวจพบหรือไม่`,
            showCancelButton: true,
            confirmButtonText: 'ออกเฉพาะรายชื่อที่พบ',
            cancelButtonText: 'ยกเลิก'
        });
        if (!response.isConfirmed) return;
    }
    showLoading();
    const token = sessionStorage.getItem('sessionToken') || localStorage.getItem('sessionToken') || '';
    google.script.run.withSuccessHandler(async result => {
        if (!result || !result.success) {
            hideLoading();
            Swal.fire('ไม่สามารถโหลด PDF ปี 2570', result && result.message ? result.message : 'ไม่พบไฟล์ประกาศใน Google Drive', 'error');
            return;
        }
        try {
            const raw = atob(result.data);
            const bytes = Uint8Array.from(raw, c => c.charCodeAt(0));
            const {PDFDocument, rgb, StandardFonts} = PDFLib;
            const doc = await PDFDocument.load(bytes);
            const pages = doc.getPages();
            if (pages.length !== 18) throw new Error('ไฟล์ประกาศไม่ตรงกับรายชื่อปี 2570 ครั้งที่ 1 ที่ตั้งค่าตำแหน่งไว้ (ต้องมี 18 หน้า)');
            const idFont = await doc.embedFont(StandardFonts.Helvetica);
            const keep = new Set([0]);
            matched.forEach(id => {
                const [pageIndex, y] = STUDENT_PDF_2570_MAP[id];
                if (!pages[pageIndex]) throw new Error('ตำแหน่งหน้า PDF ไม่ถูกต้อง: ' + id);
                pages[pageIndex].drawSvgPath('M 0 5 L 4 10 L 12 0', {
                    x: 525, y: y, borderColor: rgb(0, 0.42, 0), borderWidth: 2.5, scale: 0.9
                });
                // แสดงรหัสนักศึกษาตัวเล็กต่อท้ายเครื่องหมายถูก เพื่อยืนยันตัวตนแม้แถว PDF คลาดเคลื่อน
                pages[pageIndex].drawText(id, {
                    x: 542, y: y + 1, font: idFont, size: 5.5,
                    color: rgb(0, 0.30, 0)
                });
                keep.add(pageIndex);
            });
            for (let i = pages.length - 1; i >= 0; i--) if (!keep.has(i)) doc.removePage(i);
            const output = await doc.save();
            const url = URL.createObjectURL(new Blob([output], {type: 'application/pdf'}));
            const a = document.createElement('a');
            a.href = url;
            a.download = 'รายชื่อแนบ_ปีงบประมาณ2570_ครั้งที่1.pdf';
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 10000);
            hideLoading();
        } catch (e) {
            hideLoading();
            Swal.fire('ไม่สามารถสร้าง PDF', String(e.message || e), 'error');
        }
    }).withFailureHandler(err => {
        hideLoading();
        Swal.fire('ไม่สามารถโหลด PDF', String(err.message || err), 'error');
    }).getOfficialPdfBase64(token);
}

// --- สร้างตัวแปรและฟังก์ชันสำหรับหน่วยงานที่ "ยุบรวมแล้ว" (เฉพาะหน้าเอกสาร) ---
const MERGED_DEPARTMENTS = [
    "งานอำนวยการ",
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
