/**
 * ============================================================================
 * ไฟล์: js/user.js
 * สำหรับ: จัดการฟังก์ชันการทำงานของ "ฝั่งนักศึกษา" (User Role)
 * ============================================================================
 */

// ==========================================
// 1. จัดการข้อมูลส่วนตัวและหน้าแดชบอร์ด
// ==========================================

// อัปเดตข้อมูลส่วนตัวในหน้า Dashboard
function updateUserDashboard() {
    if (!currentUser) return;
    
    document.getElementById('currentUserName').textContent = `${currentUser.prefix || ''}${currentUser.firstName} ${currentUser.lastName}`;
    document.getElementById('currentUserStudentId').textContent = currentUser.studentId;
    document.getElementById('currentUserFaculty').textContent = currentUser.faculty || '-';
    
    // โหลดข้อมูลบัญชี/พร้อมเพย์ลงฟอร์ม
    document.getElementById('userBankName').value = currentUser.BankName || '';
    document.getElementById('userPromptPay').value = currentUser.PromptPay || '';
}

// โหลดรายการงานที่นักศึกษาสมัครไว้
async function loadUserRegistrations() {
    if (!currentUser) return;
    
    try {
        const res = await callBackendAPI('getUserRegistrations', { targetUserId: currentUser.id });
        const tbody = document.querySelector('#userRegistrationsTable tbody');
        const mobileContainer = document.getElementById('mobileRegListContainer');
        
        tbody.innerHTML = '';
        mobileContainer.innerHTML = '';
        
        if (!res || res.length === 0) {
            document.getElementById('noUserRegistrations').style.display = 'block';
            document.querySelector('.table-container').style.display = 'none';
            return;
        }
        
        document.getElementById('noUserRegistrations').style.display = 'none';
        document.querySelector('.table-container').style.display = 'block';
        
        res.forEach(reg => {
            // กำหนดสถานะและสี
            let statusText = 'รอพิจารณา';
            let badgeClass = 'status-pending';
            if (reg.status === 'confirmed') {
                statusText = 'รับเข้าทำงาน';
                badgeClass = 'status-confirmed';
            } else if (reg.status === 'cancelled' || reg.status === 'rejected' || reg.status === 'ไม่ผ่าน') {
                statusText = 'ไม่ผ่าน/ยกเลิก';
                badgeClass = 'status-cancelled';
            }

            // Desktop Table
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${reg.jobTitle || 'ไม่ระบุ'}</td>
                <td>${reg.jobAgency || '-'}</td>
                <td>${reg.activityDate || '-'} <br> <small style="color:#666;">(${reg.timeSlot || ''})</small></td>
                <td><span class="reg-status-badge ${badgeClass}">${statusText}</span></td>
                <td style="text-align: center;">
                    <button class="btn btn-secondary" style="padding: 5px 10px; font-size: 12px;" onclick="viewJobDetail('${reg.activityId}')">ดูรายละเอียด</button>
                </td>
            `;
            tbody.appendChild(tr);

            // Mobile Card
            const card = document.createElement('div');
            card.className = 'reg-list-item';
            card.innerHTML = `
                <div class="reg-job-title">${reg.jobTitle || 'ไม่ระบุ'}</div>
                <div class="reg-job-detail">
                    <span><i class="material-icons" style="font-size:14px; vertical-align:text-bottom;">business</i> ${reg.jobAgency || '-'}</span>
                </div>
                <div class="reg-job-detail">
                    <span><i class="material-icons" style="font-size:14px; vertical-align:text-bottom;">event</i> ${reg.activityDate || '-'} (${reg.timeSlot || ''})</span>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px; border-top:1px dashed #eee; padding-top:10px;">
                    <span class="reg-status-badge ${badgeClass}">${statusText}</span>
                </div>
            `;
            mobileContainer.appendChild(card);
        });
    } catch (error) {
        console.error("Error loading registrations:", error);
    }
}

// ==========================================
// 2. จัดการบัญชีพร้อมเพย์ (Payment Info)
// ==========================================

document.getElementById('paymentInfoForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUser) return;

    const bankName = document.getElementById('userBankName').value;
    const promptPay = document.getElementById('userPromptPay').value;

    if (promptPay.length !== 13) {
        showAlert('กรุณาระบุเลขบัตรประชาชน 13 หลักให้ถูกต้อง', 'warning');
        return;
    }

    try {
        const res = await callBackendAPI('saveUserFinancialInfo', {
            userId: currentUser.id,
            BankName: bankName,
            PromptPay: promptPay
        });

        if (res.success) {
            showAlert('บันทึกข้อมูลพร้อมเพย์เรียบร้อยแล้ว', 'success');
            currentUser.BankName = bankName;
            currentUser.PromptPay = promptPay;
            document.getElementById('paymentStatusAlert').style.display = 'block';
        } else {
            showAlert(res.message, 'error');
        }
    } catch (error) {
        showAlert('เกิดข้อผิดพลาดในการบันทึกข้อมูล', 'error');
    }
});

// ==========================================
// 3. การค้นหาและการสมัครงาน (Job Search & Apply)
// ==========================================

let availableJobsCache = [];

async function loadJobsForStudent() {
    try {
        const res = await callBackendAPI('getAllActivities');
        availableJobsCache = res || [];
        renderJobGrid(availableJobsCache);
    } catch (error) {
        console.error("Error loading jobs:", error);
        showAlert('ไม่สามารถโหลดข้อมูลงานได้', 'error');
    }
}

function renderJobGrid(jobs) {
    const container = document.getElementById('jobListContainer');
    const noData = document.getElementById('noJobsAvailable');
    container.innerHTML = '';
    
    // กรองเฉพาะงานที่ยังไม่ปิดรับสมัคร (isLocked = FALSE)
    const activeJobs = jobs.filter(j => String(j.isLocked).toUpperCase() !== 'TRUE');

    if (activeJobs.length === 0) {
        noData.style.display = 'block';
        container.style.display = 'none';
        return;
    }
    
    noData.style.display = 'none';
    container.style.display = 'grid';

    activeJobs.forEach(job => {
        // เช็คโควตารวม
        let totalQuota = parseInt(job.totalQuota) || 0;
        let registeredCount = (parseInt(job.morningRegistered) || 0) + 
                              (parseInt(job.afternoonRegistered) || 0) + 
                              (parseInt(job.eveningRegistered) || 0) + 
                              (parseInt(job.multiRegistered) || 0);
        
        let isFull = registeredCount >= totalQuota;
        let statusPill = isFull 
            ? `<div class="status-pill pill-full">เต็มแล้ว</div>` 
            : `<div class="status-pill pill-open">เปิดรับสมัคร</div>`;

        const card = document.createElement('div');
        card.className = 'modern-job-card';
        card.innerHTML = `
            <div class="card-top-accent"></div>
            ${statusPill}
            <div class="card-content">
                <div class="agency-tag"><i class="material-icons" style="font-size:14px;">business</i> ${job.jobAgency || '-'}</div>
                <h3 class="modern-title">${job.jobTitle}</h3>
                <div class="modern-desc">${job.jobDescription || 'ไม่มีรายละเอียดเพิ่มเติม'}</div>
            </div>
            <div class="card-footer">
                <div class="meta-info">
                    <span class="date-text"><i class="material-icons" style="font-size:14px; vertical-align:middle;">event</i> ${job.date}</span>
                    <span class="quota-text">รับ ${totalQuota} คน (สมัครแล้ว ${registeredCount})</span>
                </div>
                <button class="btn-apply-modern ${isFull ? 'disabled' : 'active'}" 
                        onclick="openApplyJobPage('${job.id}')" ${isFull ? 'disabled' : ''}>
                    รายละเอียด
                </button>
            </div>
        `;
        container.appendChild(card);
    });
}

// ค้นหางาน
document.getElementById('searchJobInput')?.addEventListener('keyup', (e) => {
    const keyword = e.target.value.toLowerCase();
    const filtered = availableJobsCache.filter(j => 
        (j.jobTitle && j.jobTitle.toLowerCase().includes(keyword)) ||
        (j.jobAgency && j.jobAgency.toLowerCase().includes(keyword)) ||
        (j.jobDescription && j.jobDescription.toLowerCase().includes(keyword))
    );
    renderJobGrid(filtered);
});

// เปิดหน้ากรอกใบสมัคร
function openApplyJobPage(jobId) {
    selectedJobForApply = availableJobsCache.find(j => j.id === jobId);
    if (!selectedJobForApply) return;

    // เติมข้อมูลลงหน้าฟอร์ม
    document.getElementById('appFormJobTitle').textContent = selectedJobForApply.jobTitle;
    document.getElementById('appFormJobAgency').textContent = selectedJobForApply.jobAgency || '-';
    document.getElementById('appFormJobDate').textContent = selectedJobForApply.date;
    
    document.getElementById('appFormStudentName').textContent = `${currentUser.prefix || ''}${currentUser.firstName} ${currentUser.lastName}`;
    document.getElementById('appFormStudentId').textContent = currentUser.studentId;
    document.getElementById('appFormFaculty').textContent = currentUser.faculty || '-';

    renderTimeSlots(selectedJobForApply);
    
    showSection('applyJobSection');
}

function renderTimeSlots(job) {
    const container = document.getElementById('appFormSlotContainer');
    container.innerHTML = '';
    selectedTimeSlot = null;
    document.getElementById('confirmApplyBtn').disabled = true;

    const slots = [
        { id: 'morning', label: 'ช่วงเช้า (08:30-12:00)', quota: job.morningQuota, registered: job.morningRegistered },
        { id: 'afternoon', label: 'ช่วงบ่าย (13:00-16:30)', quota: job.afternoonQuota, registered: job.afternoonRegistered },
        { id: 'evening', label: 'ช่วงเย็น (16:30-20:00)', quota: job.eveningQuota, registered: job.eveningRegistered },
        { id: 'multi', label: 'เหมาหลายวัน/ไม่ระบุช่วงเวลา', quota: job.totalQuota, registered: job.multiRegistered }
    ];

    slots.forEach(slot => {
        let maxQuota = parseInt(slot.quota) || 0;
        // ข้าม slot ที่ไม่ได้กำหนดโควตา
        if (maxQuota <= 0) return; 

        let regCount = parseInt(slot.registered) || 0;
        let isFull = regCount >= maxQuota;

        const btn = document.createElement('div');
        btn.className = `slot-btn ${isFull ? 'disabled' : ''}`;
        btn.innerHTML = `
            <div class="slot-time">${slot.label}</div>
            <div class="slot-quota">${isFull ? 'โควตาเต็มแล้ว' : `ว่าง ${maxQuota - regCount} ที่นั่ง`}</div>
        `;
        
        if (!isFull) {
            btn.onclick = () => {
                document.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                selectedTimeSlot = slot.id;
                document.getElementById('confirmApplyBtn').disabled = false;
            };
        }
        
        container.appendChild(btn);
    });
}

function closeApplyPage() {
    selectedJobForApply = null;
    selectedTimeSlot = null;
    showSection('jobSearchSection');
}

// ยืนยันการสมัครงาน
document.getElementById('confirmApplyBtn')?.addEventListener('click', async () => {
    if (!selectedJobForApply || !selectedTimeSlot || !currentUser) return;

    try {
        const payload = {
            activityId: selectedJobForApply.id,
            timeSlot: selectedTimeSlot,
            userId: currentUser.id,
            studentId: currentUser.studentId,
            prefix: currentUser.prefix,
            firstName: currentUser.firstName,
            lastName: currentUser.lastName,
            faculty: currentUser.faculty,
            phone: currentUser.phone || ''
        };

        const res = await callBackendAPI('registerForActivity', payload);
        if (res.success) {
            Swal.fire({
                icon: 'success',
                title: 'สมัครงานสำเร็จ',
                text: 'สามารถติดตามสถานะการรับสมัครได้ที่เมนู "ข้อมูลส่วนตัวของฉัน"',
                confirmButtonColor: 'var(--secondary-color)'
            }).then(() => {
                closeApplyPage();
                loadJobsForStudent(); // รีเฟรชโควตา
            });
        } else {
            showAlert(res.message, 'error');
        }
    } catch (error) {
        showAlert('เกิดข้อผิดพลาดในการสมัครงาน', 'error');
    }
});


// ==========================================
// 4. การลงเวลาทำงานหน่วยงาน (Timekeeping)
// ==========================================

async function checkRegularJobAccess() {
    if (!currentUser || currentUser.role !== 'user') return;

    try {
        const res = await callBackendAPI('checkStudentRegularAccess', { studentId: currentUser.studentId });
        const navRegular = document.getElementById('navRegularJob');
        
        if (res.hasAccess || res.isSpecial) {
            navRegular.style.display = 'flex'; // เปิดเมนู
            currentUser.isSpecialTimeUser = res.isSpecial;
            currentUser.regularAgency = res.agency;
        } else {
            navRegular.style.display = 'none';
        }
    } catch (e) {
        console.error("Error checking time access:", e);
    }
}

// โหลดข้อมูลการทำงานของเดือนนี้
async function loadTimeLogs() {
    if (!currentUser) return;
    
    try {
        const res = await callBackendAPI('getStudentMonthlyLogs', { studentId: currentUser.studentId });
        const tbody = document.querySelector('#timeLogTable tbody');
        tbody.innerHTML = '';
        
        let sumH = 0;
        let sumA = 0;

        if (res.logs && res.logs.length > 0) {
            res.logs.forEach(log => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${log.date}</td>
                    <td>${log.checkIn}</td>
                    <td>${log.checkOut}</td>
                    <td>${log.details}</td>
                    <td>${log.hours}</td>
                    <td style="text-align: right;">${Number(log.amount).toLocaleString()}</td>
                    <td style="text-align: center;">
                        <button class="btn btn-danger" style="padding:4px 8px; font-size:12px;" onclick="deleteTimeLog('${log.id}')">ลบ</button>
                    </td>
                `;
                tbody.appendChild(tr);
                sumH += parseFloat(log.hours) || 0;
                sumA += parseFloat(log.amount) || 0;
            });
        } else {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#999;">ยังไม่มีรายการทำงานในเดือนนี้ (ที่รอเบิก)</td></tr>';
        }

        document.getElementById('sumHours').textContent = sumH.toFixed(2);
        document.getElementById('sumAmount').textContent = sumA.toLocaleString();

    } catch (e) {
        showAlert('โหลดประวัติการทำงานล้มเหลว', 'error');
    }
}

// บันทึกเวลาด้วยตัวเอง (Manual)
async function saveManualLog() {
    if (!currentUser) return;

    const date = document.getElementById('manualLogDate').value;
    const startTime = document.getElementById('manualLogStartTime')?.value || ''; // สมมติว่ามีช่องกรอก
    const endTime = document.getElementById('manualLogEndTime')?.value || '';   // สมมติว่ามีช่องกรอก
    const detail = document.getElementById('manualLogDetail').value;

    if (!date || !startTime || !endTime || !detail) {
        showAlert('กรุณากรอกข้อมูลให้ครบถ้วน', 'warning');
        return;
    }

    try {
        const payload = {
            studentId: currentUser.studentId,
            agency: currentUser.regularAgency || currentUser.faculty,
            date: date,
            startTime: startTime,
            endTime: endTime,
            details: detail
        };

        const res = await callBackendAPI('saveManualTimeLog', payload);
        if (res.success) {
            showAlert('บันทึกเวลาทำงานสำเร็จ', 'success');
            loadTimeLogs(); // รีเฟรชตาราง
            
            // ล้างฟอร์ม
            document.getElementById('manualLogDate').value = '';
            document.getElementById('manualLogDetail').value = '';
        } else {
            showAlert(res.message, 'error');
        }
    } catch (e) {
        showAlert('เกิดข้อผิดพลาดในการบันทึกเวลา', 'error');
    }
}

// ส่งรายการเบิกเงิน (เดือนนี้)
async function submitMonthlyTimesheet() {
    Swal.fire({
        title: 'ยืนยันการส่งเบิกเงิน?',
        text: "เมื่อส่งแล้วจะไม่สามารถแก้ไขหรือลบวันทำงานได้อีก",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: 'var(--secondary-color)',
        cancelButtonColor: '#d33',
        confirmButtonText: 'ยืนยันส่งเรื่อง',
        cancelButtonText: 'ยกเลิก'
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                const res = await callBackendAPI('submitTimeSheetForApproval', { 
                    studentId: currentUser.studentId,
                    payerId: currentUser.id
                });
                if (res.success) {
                    Swal.fire('สำเร็จ!', res.message, 'success');
                    loadTimeLogs(); // ตารางจะว่างเปล่าเพราะเปลี่ยนสถานะจาก Pending เป็น Submitted แล้ว
                } else {
                    showAlert(res.message, 'error');
                }
            } catch (e) {
                showAlert('การเชื่อมต่อล้มเหลว', 'error');
            }
        }
    });
}

// ลบ Time Log
async function deleteTimeLog(logId) {
    if(confirm('ต้องการลบรายการนี้ใช่หรือไม่?')) {
        try {
            const res = await callBackendAPI('deleteTimeLog', { logId: logId });
            if (res.success) {
                Toast.fire({icon: 'success', title: 'ลบรายการสำเร็จ'});
                loadTimeLogs();
            } else {
                showAlert(res.message, 'error');
            }
        } catch (e) {
            showAlert('ลบรายการไม่สำเร็จ', 'error');
        }
    }
}


// ==========================================
// 5. ประวัติการรับเงินของนักศึกษา (Student Finance)
// ==========================================

async function loadStudentFinance() {
    if (!currentUser) return;

    try {
        const res = await callBackendAPI('getStudentFinancialStats', { targetStudentId: currentUser.id });
        if (res.success) {
            // อัปเดตกล่องยอดเงินด้านบน
            document.getElementById('stPendingTotal').textContent = Number(res.orangeTotal || 0).toLocaleString();
            document.getElementById('stDisbursedTotal').textContent = Number(res.greenTotal || 0).toLocaleString();
            document.getElementById('stGrandTotal').textContent = Number(res.blueTotal || 0).toLocaleString();

            // อัปเดตประวัติการโอนเงิน
            const container = document.getElementById('studentPayContainer');
            const noData = document.getElementById('noStudentPayHistory');
            
            container.innerHTML = '';
            
            if (res.history && res.history.length > 0) {
                noData.style.display = 'none';
                
                let tableHtml = `
                    <div class="table-container">
                    <table class="clean-table">
                        <thead>
                            <tr>
                                <th>วันที่ทำงาน/สะสม</th>
                                <th>ชื่องาน</th>
                                <th style="text-align: right;">จำนวนเงิน (บาท)</th>
                                <th style="text-align: center;">สถานะ</th>
                                <th>วันที่เงินเข้าบัญชี</th>
                            </tr>
                        </thead>
                        <tbody>
                `;

                res.history.forEach(item => {
                    let statusColor = '#555';
                    if(item.status.includes('รอตรวจสอบ')) statusColor = '#ef6c00';
                    else if(item.status.includes('อนุมัติ')) statusColor = '#2e7d32';
                    else if(item.status.includes('สำเร็จ')) statusColor = '#0d47a1';

                    tableHtml += `
                        <tr>
                            <td>${item.workDate || item.date}</td>
                            <td>${item.title}</td>
                            <td style="text-align: right; font-weight: bold;">${Number(item.amount).toLocaleString()}</td>
                            <td style="text-align: center;"><span style="color: ${statusColor}; font-weight: bold;">${item.status}</span></td>
                            <td>${item.transferDate || '-'}</td>
                        </tr>
                    `;
                });

                tableHtml += `</tbody></table></div>`;
                container.innerHTML = tableHtml;
            } else {
                noData.style.display = 'block';
            }

        } else {
            showAlert(res.message, 'error');
        }
    } catch (e) {
        console.error("Finance Error:", e);
    }
}


// ==========================================
// 6. แบบประเมินระบบ (Feedback)
// ==========================================

document.getElementById('feedbackForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUser) return;

    // ดึงค่า Radio Button ข้อ 1-10
    let payload = {
        userId: currentUser.studentId || currentUser.id,
        userName: `${currentUser.prefix || ''}${currentUser.firstName} ${currentUser.lastName}`,
        userRole: currentUser.role,
        faculty: currentUser.faculty || '-',
        comment: document.getElementById('feedbackText').value
    };

    let allAnswered = true;
    for (let i = 1; i <= 10; i++) {
        const selected = document.querySelector(`input[name="q${i}"]:checked`);
        if (selected) {
            payload[`q${i}`] = selected.value;
        } else {
            allAnswered = false;
        }
    }

    if (!allAnswered) {
        showAlert('กรุณาให้คะแนนให้ครบทุกหัวข้อ', 'warning');
        return;
    }

    try {
        const res = await callBackendAPI('saveFeedback', payload);
        if (res.success) {
            Swal.fire({
                icon: 'success',
                title: 'ขอบคุณสำหรับข้อเสนอแนะ!',
                text: 'ระบบได้บันทึกการประเมินของท่านเรียบร้อยแล้ว',
                confirmButtonColor: 'var(--secondary-color)'
            });
            document.getElementById('feedbackForm').reset();
        } else {
            showAlert(res.message, 'error');
        }
    } catch (e) {
        showAlert('เกิดข้อผิดพลาด ไม่สามารถบันทึกได้', 'error');
    }
});

// กำหนดการซ่อน/แสดงเมนูประเมิน (เรียกตอน updateNavbar)
async function applyFeedbackMenuVisibility() {
    try {
        // ขอให้ Backend สร้าง API ชื่อ 'getFeedbackStatus' ตาม Code.gs ด้านบน
        const res = await callBackendAPI('getFeedbackStatus');
        const fbNav = document.getElementById('navFeedback');
        if (fbNav) {
            if (res.isOpen) {
                fbNav.style.display = 'flex';
            } else {
                fbNav.style.display = 'none';
            }
        }
    } catch (e) {
        console.error("Cannot load feedback visibility", e);
    }
}


// ==========================================
// 7. การตั้งค่า Event Listener ของเมนูนักศึกษา
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // ผูก Event Click ของเมนูฝั่งนักศึกษา
    const menuMap = {
        'navUserDashboard': () => { updateUserDashboard(); loadUserRegistrations(); },
        'navPaymentInfo': () => { updateUserDashboard(); }, // อาศัยข้อมูลจากตอน Login
        'navStudentFinance': () => { loadStudentFinance(); },
        'navJobSearch': () => { loadJobsForStudent(); },
        'navRegularJob': () => { loadTimeLogs(); }
    };

    for (const [navId, callback] of Object.entries(menuMap)) {
        const el = document.getElementById(navId);
        if (el) {
            el.addEventListener('click', () => {
                if (callback) callback();
            });
        }
    }
});

// ฟังก์ชันเปิดดูรายละเอียดคู่มือแต่ละ Role (ที่ถูกตัดไปในไฟล์ต้นฉบับ)
function renderManualByRole() {
    const cardStudent = document.getElementById('manualCardStudent');
    const cardStaff = document.getElementById('manualCardStaff');
    const cardAdmin = document.getElementById('manualCardAdmin');

    if (!currentUser) return;

    // ซ่อนทุกอันไว้ก่อน
    if(cardStudent) cardStudent.style.display = 'none';
    if(cardStaff) cardStaff.style.display = 'none';
    if(cardAdmin) cardAdmin.style.display = 'none';

    // เปิดตาม Role
    if (currentUser.role === 'admin' || currentUser.role === 'executive') {
        if(cardStudent) cardStudent.style.display = 'flex';
        if(cardStaff) cardStaff.style.display = 'flex';
        if(cardAdmin) cardAdmin.style.display = 'flex';
    } 
    else if (currentUser.role === 'staff') {
        if(cardStudent) cardStudent.style.display = 'flex';
        if(cardStaff) cardStaff.style.display = 'flex';
    } 
    else {
        if(cardStudent) cardStudent.style.display = 'flex';
    }
}
