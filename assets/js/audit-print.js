// --- JavaScript สำหรับ Audit Report ---

// 1. ประกาศตัวแปร Global
var auditDataCache = []; 

// 2. เชื่อมต่อปุ่มเมนู
setupNavClick('navAuditReport', 'auditReportSection', function() {
    loadAuditReport();
});

// 3. ฟังก์ชันโหลดข้อมูล
function loadAuditReport() {
    showLoading();
    // เคลียร์ค่าเก่า
    document.getElementById('noAuditData').style.display = 'block';
    document.getElementById('noAuditData').textContent = "กำลังโหลดข้อมูล...";
    const tbody = document.querySelector('#auditTable tbody');
    if(tbody) tbody.innerHTML = ''; 

    // เรียก Server
    google.script.run.withSuccessHandler(function(res) {
        hideLoading();
        if(res.success) {
            auditDataCache = res.data;
            renderAuditTable(auditDataCache);
            updateAuditSummary(auditDataCache);
        } else {
            showAlert('ไม่สามารถดึงข้อมูลได้: ' + res.message, 'error');
        }
    }).withFailureHandler(function(err) {
        hideLoading();
        showAlert('เกิดข้อผิดพลาด: ' + err.message, 'error');
    }).getSystemWideDisbursementReport();
}

// 4. ฟังก์ชันแสดงตาราง
function renderAuditTable(data) {
    const tbody = document.querySelector('#auditTable tbody');
    const noData = document.getElementById('noAuditData');
    tbody.innerHTML = '';
    
    if(data.length === 0) {
        noData.textContent = "ไม่พบข้อมูลการเบิกจ่าย";
        noData.style.display = 'block';
        return;
    }
    noData.style.display = 'none';

    data.forEach(function(item, index) {
        const row = tbody.insertRow();
        
        // Tooltip แสดงรายละเอียดงาน
        let jobTooltip = item.jobDetails.map(j => `• ${j.date}: ${j.title} (${j.amount}บ.)`).join('\n');
        
        // แสดง 2 งานล่าสุดในตาราง
        let jobDisplay = item.jobDetails.slice(0, 2).map(j => `<div style="font-size:12px; color:#555;">- ${j.title}</div>`).join('');
        if(item.jobDetails.length > 2) {
            jobDisplay += `<div style="font-size:11px; color:#999;">...และอีก ${item.jobDetails.length - 2} งาน</div>`;
        }

        row.innerHTML = `
            <td style="text-align: center;">${index + 1}</td>
            <td style="font-weight:bold;">${item.studentId}</td>
            <td>${item.name}</td>
            <td><small>${item.faculty}</small></td>
            <td style="text-align: center;">${item.jobCount}</td>
            <td style="text-align: right; font-weight:bold; color:var(--secondary-color);">${item.totalAmount.toLocaleString()}</td>
            <td title="${jobTooltip}" style="cursor:help;">${jobDisplay}</td>
        `;
    });
}

// 5. ฟังก์ชันอัปเดตยอดรวม
function updateAuditSummary(data) {
    const totalStudent = data.length;
    const totalMoney = data.reduce((sum, item) => sum + item.totalAmount, 0);
    
    if(document.getElementById('auditStudentCount')) 
        document.getElementById('auditStudentCount').textContent = totalStudent.toLocaleString();
    
    if(document.getElementById('auditTotalAmount')) 
        document.getElementById('auditTotalAmount').textContent = totalMoney.toLocaleString();
}

// 6. ฟังก์ชันค้นหา (Filter)
function filterAuditTable() {
    const text = document.getElementById('auditSearchInput').value.toLowerCase();
    const filtered = auditDataCache.filter(item => {
        const str = `${item.studentId} ${item.name} ${item.faculty}`.toLowerCase();
        return str.includes(text);
    });
    renderAuditTable(filtered);
}

function exportAuditCSV() {
    if (!auditDataCache || auditDataCache.length === 0) {
        showAlert('ไม่มีข้อมูลให้ดาวน์โหลด', 'warning');
        return;
    }

    let csv = [];
    csv.push(`"ลำดับ","รหัสนักศึกษา","ชื่อ-สกุล","คณะ","วันที่ทำงาน","ชื่องาน","หน่วยงาน","จำนวนเงิน(บาท)","สถานะ"`);

    let rowIdx = 1;
    auditDataCache.forEach(st => {
        st.jobDetails.forEach(job => {
            // [แก้ไขบรรทัดนี้] ลบ ' ออกจากหน้า ${st.studentId}
            // เดิม: "'${st.studentId}"
            // ใหม่: "${st.studentId}"
            csv.push(`"${rowIdx}","${st.studentId}","${st.name}","${st.faculty}","${job.date}","${job.title}","${job.agency}","${job.amount}","${job.status}"`);
        });
        rowIdx++;
    });

    const csvFile = new Blob(["\uFEFF" + csv.join("\n")], { type: "text/csv;charset=utf-8;" });
    const downloadLink = document.createElement("a");
    downloadLink.download = `Audit_Report_${new Date().toISOString().slice(0,10)}.csv`;
    downloadLink.href = window.URL.createObjectURL(csvFile);
    downloadLink.style.display = "none";
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
}
// --- แก้ไขฟังก์ชัน scanForAnomalies ---

// --- แก้ไขฟังก์ชัน scanForAnomalies เดิม ---

function scanForAnomalies() {
    showLoading();
    
    // เรียกฟังก์ชันใหม่ที่ Code.gs
    google.script.run.withSuccessHandler(res => {
        hideLoading();
        
        if (res.success) {
            const list = res.data;
            
            if (list.length === 0) {
                Swal.fire({
                    icon: 'success',
                    title: 'ตรวจสอบเรียบร้อย',
                    text: 'ไม่พบรายการผิดปกติ (เวลาไม่ซ้อนทับ และยอดเงินถูกต้อง)',
                    confirmButtonText: 'ตกลง',
                    confirmButtonColor: '#28a745'
                });
            } else {
                // แสดงผลใน Modal (ใช้ ID เดิมจากโค้ดก่อนหน้านี้)
                document.getElementById('modalAnomalyCount').textContent = list.length;
                const tbody = document.getElementById('modalAnomalyBody');
                tbody.innerHTML = '';
                
                list.forEach(item => {
                    const tr = document.createElement('tr');
                    
                    let typeBadge = '';
                    if(item.type.includes('ซ้อนทับ')) typeBadge = `<span class="vf-badge" style="background:#ffebee; color:#c62828;">เวลาชนกัน</span>`;
                    else if(item.type.includes('ซ้ำ')) typeBadge = `<span class="vf-badge" style="background:#e3f2fd; color:#1565c0;">ข้อมูลซ้ำ</span>`;
                    else typeBadge = `<span class="vf-badge" style="background:#fff3e0; color:#ef6c00;">ยอดเกิน</span>`;

                    tr.innerHTML = `
                        <td>${typeBadge}</td>
                        <td style="font-weight:bold;">${item.studentId}</td>
                        <td>${item.name}</td>
                        <td style="font-size:14px; color:#555;">${item.detail}</td>
                        <td style="text-align:right; font-weight:bold; color:#d32f2f;">${item.amount.toLocaleString()}</td>
                    `;
                    tbody.appendChild(tr);
                });
                
                document.getElementById('anomalyModal').style.display = 'flex';
            }
        }
    }).checkTimeLogAnomalies(); // <-- เปลี่ยนชื่อฟังก์ชันตรงนี้
}
// --- Helper Functions ---

// ฟังก์ชันช่วยดึงค่าจาก Object โดยไม่สนใจตัวพิมพ์เล็ก/ใหญ่ (Case-insensitive)
function getVal(item, keys) {
    if (!item) return '';
    if (!Array.isArray(keys)) keys = [keys];
    
    for (let key of keys) {
        // 1. ลองดึงตรงๆ
        if (item[key] !== undefined && item[key] !== null && item[key] !== "") return item[key];
        
        // 2. ลองดึงแบบตัวพิมพ์เล็กหมด (lowercase)
        let lowerKey = key.toLowerCase();
        for (let k in item) {
            if (k.toLowerCase() === lowerKey && item[k] !== undefined && item[k] !== null && item[k] !== "") {
                return item[k];
            }
        }
    }
    return '';
}
// --- ฟังก์ชันดาวน์โหลดสรุปยอดเงินรายบุคคล (Summary Export) ---
function exportAuditSummaryCSV() {
    if (!auditDataCache || auditDataCache.length === 0) {
        showAlert('ไม่มีข้อมูลให้ดาวน์โหลด', 'warning');
        return;
    }

    let csv = [];
    // หัวตาราง
    csv.push(`"ลำดับ","รหัสนักศึกษา","ชื่อ-สกุล","คณะ","จำนวนงานที่ทำ","ยอดเงินรวมสุทธิ (บาท)"`);

    let rowIdx = 1;
    
    auditDataCache.forEach(st => {
        // [แก้ไขบรรทัดนี้] ลบ ' ออกจากหน้า ${st.studentId}
        // เดิม: "'${st.studentId}"
        // ใหม่: "${st.studentId}"
        csv.push(`"${rowIdx}","${st.studentId}","${st.name}","${st.faculty}","${st.jobCount}","${st.totalAmount}"`);
        rowIdx++;
    });

    const csvFile = new Blob(["\uFEFF" + csv.join("\n")], { type: "text/csv;charset=utf-8;" });
    const downloadLink = document.createElement("a");
    downloadLink.download = `Audit_Summary_Total_${new Date().toISOString().slice(0,10)}.csv`;
    downloadLink.href = window.URL.createObjectURL(csvFile);
    downloadLink.style.display = "none";
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
}
// --- ฟังก์ชันสำหรับปุ่มลบ (สีแดง) ---
function actionDeleteGroup(key) {
    // ดึงข้อมูลกลุ่มจาก Cache ตาม Key
    const group = window.submittedGroupsCache[key];
    
    if (!group) {
        Swal.fire('ข้อผิดพลาด', 'ไม่พบข้อมูลกลุ่มนี้ กรุณารีเฟรชหน้าเว็บ', 'error');
        return;
    }

    // ถามยืนยันก่อนลบ
    Swal.fire({
        title: 'ยืนยันการลบถาวร',
        html: `คุณต้องการลบรายการของ <b>${group.studentName}</b><br>
               ประจำเดือน <b>${group.monthLabel}</b><br>
               จำนวน <b>${group.count} รายการ</b> ออกจากระบบใช่หรือไม่<br>
               <small style="color:red; font-weight:bold;">ข้อมูลจะหายไปถาวรและกู้คืนไม่ได้</small>`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33', // สีแดง
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'ยืนยันลบถาวร',
        cancelButtonText: 'ยกเลิก'
    }).then((result) => {
        if (result.isConfirmed) {
            showLoading(); // แสดงตัวโหลด

            // ส่งไปให้หลังบ้านลบ (Code.gs)
            google.script.run.withSuccessHandler(res => {
                hideLoading();
                if (res.success) {
                    Swal.fire('ลบสำเร็จ', res.message, 'success');
                    loadSubmittedLogs(); // รีโหลดตารางใหม่ทันที
                } else {
                    Swal.fire('เกิดข้อผิดพลาด', res.message, 'error');
                }
            }).processBatchDelete(group.logIds); // ส่งรายการ ID ทั้งหมดในกลุ่มไปลบ
        }
    });
}
// --- ฟังก์ชันสำหรับปุ่มคืนรายการทั้งหมด (สีส้ม) ---
function actionReturnGroup(key) {
    // 1. ดึงข้อมูลกลุ่ม
    const group = window.submittedGroupsCache[key];
    
    if (!group) {
        Swal.fire('ข้อผิดพลาด', 'ไม่พบข้อมูลกลุ่มนี้ กรุณารีเฟรชหน้าเว็บ', 'error');
        return;
    }

    // 2. แสดง Popup ขอเหตุผล
    Swal.fire({
        title: 'ยืนยันการคืนรายการ (ทั้งหมด)',
        html: `คุณต้องการส่งคืนรายการของ <b>${group.studentName}</b><br>
               ประจำเดือน <b>${group.monthLabel}</b> จำนวน <b>${group.count} รายการ</b><br>
               กลับไปให้นักศึกษาแก้ไขใช่หรือไม่`,
        icon: 'warning',
        input: 'text',
        inputPlaceholder: 'ระบุเหตุผลการตีกลับ (จำเป็น)...',
        showCancelButton: true,
        confirmButtonColor: '#ff9800', // สีส้ม
        confirmButtonText: 'ยืนยันตีกลับ',
        cancelButtonText: 'ยกเลิก',
        inputValidator: (value) => {
            if (!value) {
                return 'กรุณาระบุเหตุผล';
            }
        }
    }).then((result) => {
        if (result.isConfirmed) {
            const reason = result.value;
            showLoading();

            // 3. ส่งไปหลังบ้าน
            google.script.run.withSuccessHandler(res => {
                hideLoading();
                if (res.success) {
                    Swal.fire('สำเร็จ', res.message, 'success');
                    loadSubmittedLogs(); // รีโหลดตาราง
                } else {
                    Swal.fire('เกิดข้อผิดพลาด', res.message, 'error');
                }
            }).processBatchReturn(group.logIds, reason); // ส่ง ID ทั้งกลุ่ม + เหตุผล
        }
    });
}
// --- [UPDATED] ฟังก์ชันพิมพ์ใบลงเวลา (รายกิจกรรม) ---
function printSingleJobTimesheet(regId) {
    showLoading();
    google.script.run.withSuccessHandler(res => {
        hideLoading();
        if(!res.success) {
            showAlert(res.message, 'error');
            return;
        }

        const d = res.data;

        // 1. [แก้ไข] Logic แปลงชื่อหน่วยงาน (ถ้าอยู่ในกลุ่มงานสวัสดิการ ให้เปลี่ยนชื่อ)
        const WELFARE_SUB_UNITS = [
            "ทุนการศึกษา",
            "กองทุนเงินให้กู้ยืมเพื่อการศึกษา",
            "แนะแนวและให้คําปรึกษาสุขภาพจิต",
            "จัดหางานและจ้างงานระหว่างเรียน"
        ];
        
        let agencyDisplay = d.jobAgency;
        if (WELFARE_SUB_UNITS.includes(agencyDisplay)) {
            agencyDisplay = "งานสวัสดิการนักศึกษา";
        }

        // 2. กำหนดเวลาและค่าตอบแทนตาม Slot
        let start = "-", end = "-", hours = 0, amount = 0;
        if(d.timeSlot === 'morning') { start="08:30"; end="12:00"; hours=3.5; amount=150; }
        else if(d.timeSlot === 'afternoon') { start="13:00"; end="16:30"; hours=3.5; amount=150; }
        else if(d.timeSlot === 'evening') { start="16:30"; end="20:00"; hours=3.5; amount=150; }
        else if(d.timeSlot === 'full') { start="08:30"; end="16:30"; hours=7; amount=300; }

        // 3. หยอดข้อมูลลงในแบบฟอร์ม
        document.getElementById('printName').textContent = d.studentName;
        document.getElementById('printId').textContent = d.studentId;
        document.getElementById('printFaculty').textContent = d.faculty;
        document.getElementById('printAgency').textContent = agencyDisplay; // ใช้ชื่อที่แปลงแล้ว
        
        // 4. [แก้ไข] ประจำเดือน ให้แสดงเฉพาะ "เดือน ปี"
        let workDateObj = new Date(d.workDate);
        if (isNaN(workDateObj.getTime())) {
             // กรณีวันที่เป็น string ไทย หรือ format อื่น ให้พยายามแปลง
             workDateObj = parseDateString(d.workDate) || new Date(); 
        }
        
        const thMonths = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
        let mStr = thMonths[workDateObj.getMonth()];
        let yStr = workDateObj.getFullYear();
        if (yStr < 2400) yStr += 543; // แปลง พ.ศ.
        
        document.getElementById('printMonth').textContent = `${mStr} ${yStr}`; // แสดงแค่ เดือน ปี

        // 5. สร้างแถวตาราง
        const tbody = document.getElementById('printTableBody');
        tbody.innerHTML = ''; 

        // ใช้วันที่แบบเต็ม (มีวันเลขที่) ในตาราง
        const fullDateStr = formatDate(d.workDate);

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="text-align:center; border:1px solid #000;">1</td>
            <td style="text-align:center; border:1px solid #000;">${fullDateStr}</td>
            <td style="text-align:center; border:1px solid #000;">${start}</td>
            <td style="text-align:center; border:1px solid #000;">${end}</td>
            <td style="text-align:center; border:1px solid #000;">${hours}</td>
            <td style="text-align:center; border:1px solid #000;">${amount}</td>
            <td style="text-align:left; padding-left:5px; border:1px solid #000;">${d.jobTitle}</td>
            <td style="border:1px solid #000;"></td>
        `;
        tbody.appendChild(tr);

        // 6. อัปเดตยอดรวมท้ายตาราง
        document.getElementById('printTotalAmount').textContent = amount.toLocaleString();
        
        // 7. [แก้ไข] ตัวอักษรจำนวนเงิน (ลบวงเล็บใน HTML ออก เพราะฟังก์ชัน BAHTTEXT มักจะมีวงเล็บมาให้แล้ว)
        if (typeof BAHTTEXT === 'function') {
            // เช็คว่าใน HTML เดิมมีวงเล็บครอบ span ไหม ถ้ามีให้เอาออก หรือใช้ code นี้เขียนทับไปเลย
            const tfoot = document.querySelector('#printTimeSheetArea tfoot');
            if(tfoot) {
                tfoot.innerHTML = `
                <tr style="height: 30px;">
                    <td colspan="5" style="text-align: center !important; vertical-align: middle; font-weight: bold; border: 1px solid #000;">
                        รวมเป็นเงินทั้งสิ้น
                    </td>
                    <td style="text-align: center; vertical-align: middle; font-weight: bold; border: 1px solid #000;">
                        ${amount.toLocaleString()}
                    </td>
                    <td colspan="2" style="text-align: center; vertical-align: middle; border: 1px solid #000;">
                        <span id="printTotalAmountText">${BAHTTEXT(amount)}</span>
                    </td>
                </tr>`;
            }
        }
        
        // ล้างชื่อผู้ลงนาม
        if(document.getElementById('printSignName')) {
             document.getElementById('printSignName').textContent = d.studentName;
        }

        // 8. สั่งพิมพ์
        document.body.classList.add('print-mode-timesheet');
        window.print();
        document.body.classList.remove('print-mode-timesheet');

    }).getRegistrationDetailForPrint(regId);
}

setupNavClick('navQuarterlyAnalysis', 'quarterlyAnalysisSection', () => loadStrategicData());
setupNavClick('navFacultyStats', 'facultyStatsSection', () => loadStrategicData());
setupNavClick('navBudgetForecast', 'budgetForecastSection', () => loadStrategicData());

let chartQ = null;
let chartF = null;
let chartFC = null;

function loadStrategicData() {
    showLoading();
    const year = document.getElementById('quarterYearFilter') ? document.getElementById('quarterYearFilter').value : '2569';

    google.script.run.withSuccessHandler(res => {
        hideLoading();
        if(res.success) {
            renderQuarterly(res.data.quarterly);
            renderFacultyStats(res.data.facultyStats);
            renderForecast(res.data.monthlyTrend, res.data.totalBudget);
        }
    }).getStrategicData(year);
}

function renderQuarterly(data) {
    const ctx = document.getElementById('quarterChart').getContext('2d');
    const tbody = document.getElementById('quarterTableBody');
    tbody.innerHTML = '';

    const labels = [data.Q1.label, data.Q2.label, data.Q3.label, data.Q4.label];
    const values = [data.Q1.amount, data.Q2.amount, data.Q3.amount, data.Q4.amount];

    Object.values(data).forEach(q => {
        tbody.innerHTML += `<tr><td>${q.label}</td><td style="text-align:right; font-weight:bold;">${q.amount.toLocaleString()}</td></tr>`;
    });

    // Chart
    if(chartQ) chartQ.destroy();
    chartQ = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: ['#ffcd56', '#36a2eb', '#ff6384', '#4bc0c0']
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

function renderFacultyStats(stats) {
    let app = 0, hired = 0;
    stats.forEach(s => { 
        app += s.applied; 
        hired += s.hired; 
    });
    
    let notHiredTotal = app - hired;
    if (notHiredTotal < 0) notHiredTotal = 0;

    if(document.getElementById('sumApplied')) document.getElementById('sumApplied').innerText = app.toLocaleString();
    if(document.getElementById('sumHired')) document.getElementById('sumHired').innerText = hired.toLocaleString();
    if(document.getElementById('sumRatio')) document.getElementById('sumRatio').innerText = app > 0 ? ((hired/app)*100).toFixed(1)+"%" : "0%";
    let notHiredCard = document.getElementById('cardNotHiredSummary');
    if (!notHiredCard) {
        const grid = document.querySelector('.stats-summary-grid');
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = `
            <div id="cardNotHiredSummary" class="summary-card">
                <div class="sc-icon" style="background:#ffebee; color:#c62828;"><i class="material-icons">person_off</i></div>
                <div class="sc-info">
                    <h4>ยังไม่ได้งาน</h4>
                    <p class="num" id="sumNotHired">0</p>
                </div>
            </div>
        `;
        if (grid.children.length >= 3) {
            grid.insertBefore(tempDiv.firstElementChild, grid.children[2]);
        } else {
            grid.appendChild(tempDiv.firstElementChild);
        }
    }
    if(document.getElementById('sumNotHired')) document.getElementById('sumNotHired').innerText = notHiredTotal.toLocaleString();

    const top = stats.slice(0, 10);
    const ctx = document.getElementById('facultyRatioChart').getContext('2d');
    if(chartF) chartF.destroy();
    
    chartF = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: top.map(s => s.name),
            datasets: [
                { label: 'ได้งาน', data: top.map(s => s.hired), backgroundColor: '#4caf50' },
                { label: 'สมัครทั้งหมด', data: top.map(s => s.applied), backgroundColor: '#ddd' }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    const tbody = document.querySelector('#facultyStatsTable tbody');
    const thead = document.querySelector('#facultyStatsTable thead tr');
    
    thead.innerHTML = `
        <th>คณะ / หน่วยงาน (คลิกที่คณะเพื่อดูรายชื่อ)</th>
        <th style="text-align:center">ผู้สมัคร (คน)</th>        
        <th style="text-align:center">ได้งานทำ (คน)</th>       
        <th style="text-align:center; color:#c62828;">ยังไม่ได้งาน (คน)</th> 
        <th style="text-align:center">คิดเป็นร้อยละ (%)</th>
    `;

    tbody.innerHTML = '';
    
    stats.forEach(s => {
        let barColor = parseFloat(s.ratio) > 50 ? '#28a745' : '#dc3545';
        
        let notHired = s.applied - s.hired;
        if(notHired < 0) notHired = 0;

        tbody.innerHTML += `
    <tr>
        <td onclick="openFacultyDetail('${s.name}')" class="faculty-name-cell">
            ${s.name}
        </td>
        <td style="text-align:center">${s.applied.toLocaleString()}</td> <td style="text-align:center">${s.hired.toLocaleString()}</td>   <td style="text-align:center; font-weight:bold; color:#c62828; background-color:#fff5f5;">
            ${notHired.toLocaleString()} </td>
        <td>
            <div style="display:flex; justify-content:space-between; font-size:11px;">
                <span>${s.ratio}%</span>
            </div>
            <div class="progress-container">
                <div class="progress-bar" style="width:${s.ratio}%; background:${barColor};"></div>
            </div>
        </td>
    </tr>
`;
    });
}

let fcChart = null; 
let monthlyCSVData = []; 

function renderForecast(monthlyTrend, totalBudget) {
    if (!monthlyTrend || !Array.isArray(monthlyTrend)) {
        console.error("renderForecast: monthlyTrend is missing");
        return;
    }

    const canvas = document.getElementById('forecastChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const monthsLabel = ["ต.ค.","พ.ย.","ธ.ค.","ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย."];
    const now = new Date();
    const filterEl = document.getElementById('quarterYearFilter');
    const selectedYear = filterEl ? parseInt(filterEl.value) : (now.getFullYear() + 543);
    const currentFiscalYear = (now.getMonth() >= 9) ? (now.getFullYear() + 543 + 1) : (now.getFullYear() + 543);

    let currentMonthReal = now.getMonth(); 
    let currentFiscalIdx = (currentMonthReal >= 9) ? currentMonthReal - 9 : currentMonthReal + 3;
    let actualLimitIndex = -1; 
    if (selectedYear < currentFiscalYear) {
        actualLimitIndex = 11; 
    } else if (selectedYear === currentFiscalYear) {
        actualLimitIndex = currentFiscalIdx; 
    }

    const yearDisplay = document.getElementById('fcFiscalYearDisplay');
    if(yearDisplay) yearDisplay.innerText = selectedYear;

    let cumulativeData = [];
    let forecastData = []; 
    let sum = 0;
    let pastSum = 0;
    let monthsPassed = 0;
    let maxMonthlySpend = 0;
    let maxMonthName = "-";

    monthlyTrend.forEach((val, i) => {
        let amount = parseFloat(val) || 0;
        if (i <= actualLimitIndex) {
            sum += amount;
            cumulativeData.push(sum);
            forecastData.push(null);
            
            pastSum += amount;
            monthsPassed++;
            
            if (amount > maxMonthlySpend) {
                maxMonthlySpend = amount;
                maxMonthName = monthsLabel[i];
            }
        }
    });

    let avgBurnRate = monthsPassed > 0 ? (pastSum / monthsPassed) : 0;
    let projectedSum = sum; 
    
    for (let i = 0; i < 12; i++) {
        if (i > actualLimitIndex) {
            if (i === actualLimitIndex + 1 && actualLimitIndex >= 0) {
                forecastData[i-1] = sum; 
            }
            projectedSum += avgBurnRate;
            forecastData[i] = projectedSum;
            cumulativeData.push(null);
        }
    }

    const fmt = (n) => Number(n).toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 0});
    const balance = totalBudget - sum;
    const projectedEndBalance = totalBudget - projectedSum;

    if(document.getElementById('fcKpiBudget')) document.getElementById('fcKpiBudget').innerText = fmt(totalBudget);
    if(document.getElementById('fcKpiUsed')) document.getElementById('fcKpiUsed').innerText = fmt(sum);
    
    let usedPct = totalBudget > 0 ? ((sum / totalBudget) * 100).toFixed(1) : 0;
    if(document.getElementById('fcKpiUsedPercent')) document.getElementById('fcKpiUsedPercent').innerText = `(${usedPct}%)`;
    if(document.getElementById('fcKpiProjected')) document.getElementById('fcKpiProjected').innerText = fmt(projectedSum);
    
    const elBal = document.getElementById('fcKpiBalance');
    if(elBal) elBal.innerText = fmt(balance);
    if(document.getElementById('fcAvgBurn')) document.getElementById('fcAvgBurn').innerText = `฿${fmt(avgBurnRate)}`;
    if(document.getElementById('fcMaxMonth')) document.getElementById('fcMaxMonth').innerText = `${maxMonthName} (฿${fmt(maxMonthlySpend)})`;

    let emptyIndex = -1;
    let runningTotal = sum;
    
    // เช็คจากเดือนถัดไปจนจบปี
    for (let i = actualLimitIndex + 1; i < 12; i++) {
        runningTotal += avgBurnRate;
        if (runningTotal > totalBudget) {
            emptyIndex = i;
            break;
        }
    }
    if (sum > totalBudget) emptyIndex = actualLimitIndex;

    const badgeEmpty = document.getElementById('fcEmptyMonthBadge');
    const txtInsight = document.getElementById('fcInsightText');
    const boxHealth = document.getElementById('budgetHealthBox');
    
    if (emptyIndex !== -1) {
        let mName = monthsLabel[emptyIndex] || "สิ้นปี";
        if(badgeEmpty) {
            badgeEmpty.innerText = `${mName}`;
            badgeEmpty.className = "vf-badge"; 
            badgeEmpty.style.background = "#ffebee";
            badgeEmpty.style.color = "#c62828";
        }
        if(txtInsight) {
            txtInsight.innerHTML = `
                <span style="color:#d32f2f; font-weight:bold;">ข้อควรระวัง:</span> จากอัตราการเบิกจ่ายปัจจุบัน 
                คาดว่าร้อยละ <b>${((projectedSum/totalBudget)*100).toFixed(1)}%</b> ของงบประมาณจะถูกใช้ 
                และงบอาจไม่เพียงพอในช่วงเดือน <b>${mName}</b>
            `;
        }
        if(boxHealth) {
             if(document.getElementById('forecastStatusTitle')) document.getElementById('forecastStatusTitle').innerText = "⚠️ งบไม่พอ";
             boxHealth.style.background = "linear-gradient(135deg, #d32f2f, #ef5350)";
        }
    } else {
        if(badgeEmpty) {
            badgeEmpty.innerText = "เพียงพอตลอดปี";
            badgeEmpty.className = "vf-badge";
            badgeEmpty.style.background = "#e8f5e9";
            badgeEmpty.style.color = "#2e7d32";
        }
        if(txtInsight) {
            txtInsight.innerHTML = `
                <span style="color:#2e7d32; font-weight:bold;">สถานะปกติ:</span> การบริหารงบประมาณเป็นไปตามแผน 
                คาดการณ์สิ้นปีงบประมาณจะมีเงินคงเหลือประมาณ <b>${fmt(projectedEndBalance)}</b> บาท
            `;
        }
        if(boxHealth) {
             if(document.getElementById('forecastStatusTitle')) document.getElementById('forecastStatusTitle').innerText = "✅ งบเพียงพอ";
             boxHealth.style.background = "linear-gradient(135deg, #2e7d32, #66bb6a)";
        }
    }

    if (fcChart) { fcChart.destroy(); fcChart = null; }
    fcChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: monthsLabel,
            datasets: [
                { label: 'เบิกจ่ายจริง (Actual)', data: cumulativeData, borderColor: '#1976D2', backgroundColor: '#1976D2', borderWidth: 3, fill: false },
                { label: 'พยากรณ์ (Forecast)', data: forecastData, borderColor: '#7b1fa2', borderDash: [5, 5], fill: false },
                { 
                    label: 'งบประมาณ (Limit)', 
                    data: new Array(12).fill(totalBudget), 
                    borderColor: '#ef5350', 
                    borderWidth: 1, 
                    pointRadius: 0,
                    fill: { target: 'origin', above: 'rgba(255, 0, 0, 0.0)', below: 'rgba(56, 142, 60, 0.05)' } 
                }
            ]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return context.dataset.label + ': ' + Number(context.raw).toLocaleString() + ' บาท';
                        }
                    }
                }
            },
            scales: {
                y: { ticks: { callback: (val) => (val/1000).toLocaleString() + 'k' } }
            }
        }
    });

    const tbody = document.getElementById('forecastTableBody');
    if (tbody) {
        tbody.innerHTML = '';
        monthlyCSVData = []; 

        for(let i = 0; i < 12; i++) {
            let isForecast = (i > actualLimitIndex);
            let monthlyAmount = isForecast ? avgBurnRate : (monthlyTrend[i] || 0);
            let cumVal = isForecast ? forecastData[i] : cumulativeData[i];
            
            if (cumVal === null || cumVal === undefined) continue;

            let remaining = totalBudget - cumVal;
            let percentUsed = totalBudget > 0 ? (cumVal / totalBudget) * 100 : 0;
            
            let displayYear = selectedYear;
            if (i <= 2) { 
                displayYear = selectedYear - 1;
            }
            let monthLabelFull = `${monthsLabel[i]} ${displayYear}`;

            let typeText = isForecast ? 'Forecast' : 'Actual';
            let rowClass = isForecast ? 'fc-row-forecast' : 'fc-row-actual';
            let badge = isForecast ? '<span class="trend-badge trend-forecast">Forecast</span>' : '<span class="trend-badge trend-actual">Actual</span>';

            monthlyCSVData.push({
                month: monthLabelFull,
                type: typeText,
                monthly: monthlyAmount,
                accumulated: cumVal,
                remaining: remaining,
                percent: percentUsed.toFixed(1) + "%"
            });

            let barColor = percentUsed > 100 ? '#d32f2f' : (percentUsed > 80 ? '#f57c00' : '#1976D2');
            const tr = document.createElement('tr');
            tr.className = rowClass;
            tr.innerHTML = `
                <td>${monthLabelFull}</td>
                <td style="text-align:center;">${badge}</td>
                <td style="text-align:right;">${fmt(monthlyAmount)}</td>
                <td style="text-align:right; color:#1565c0;">${fmt(cumVal)}</td>
                <td style="text-align:right; color:${remaining < 0 ? 'red' : 'green'}">${fmt(remaining)}</td>
                <td style="text-align:center;">
                    <div style="width:60px; height:4px; background:#e0e0e0; display:inline-block; vertical-align:middle;">
                        <div style="width:${Math.min(percentUsed, 100)}%; height:100%; background-color:${barColor}"></div>
                    </div>
                    <span style="font-size:11px; margin-left:5px;">${percentUsed.toFixed(1)}%</span>
                </td>
            `;
            tbody.appendChild(tr);
        }
    }
}

function downloadMonthlyCSV() {
    if (!monthlyCSVData || monthlyCSVData.length === 0) {
        Swal.fire('แจ้งเตือน', 'ไม่มีข้อมูลสำหรับดาวน์โหลด หรือยังไม่ได้โหลดกราฟ', 'warning');
        return;
    }

    let csvContent = "\uFEFF"; 
    csvContent += "เดือน/ปี,ประเภท,เบิกจ่าย (บาท),สะสม (บาท),คงเหลือ (บาท),% การใช้\n";

    monthlyCSVData.forEach(row => {
        let rowString = [
            `"${row.month}"`,
            `"${row.type}"`,
            `"${row.monthly}"`,
            `"${row.accumulated}"`,
            `"${row.remaining}"`,
            `"${row.percent}"`
        ].join(",");
        csvContent += rowString + "\n";
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const d = new Date();
    const fileName = `Budget_Plan_${d.getFullYear()}${d.getMonth()+1}${d.getDate()}.csv`;
    
    link.setAttribute("href", url);
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

let userIP = "Unknown";

(function initAuditWhenDomReady() {
  const run = () => {
    fetch('https://api.ipify.org?format=json')
        .then(response => response.json())
        .then(data => {
            userIP = data.ip;
            console.log("Client IP Detected:", userIP);
        })
        .catch(error => {
            console.error("IP Fetch Error:", error);
            userIP = "N/A";
        });
    setupNavClick('navSystemLog', 'systemLogSection', () => loadSystemLogs());

  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();
})();

function trackUserAction(action, detail) {
    if (!currentUser) return;
    google.script.run.clientSideLog(action, detail, currentUser, userIP);
}
