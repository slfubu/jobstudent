/**
 * ============================================================================
 * ไฟล์: js/admin.js
 * สำหรับ: จัดการฟังก์ชันการทำงานของฝั่งเจ้าหน้าที่ (Staff), ผู้ตรวจสอบ (Admin), ผู้บริหาร
 * ============================================================================
 */

// ==========================================
// 1. ภาพรวมระบบ (Admin Dashboard)
// ==========================================

async function loadDashboardOverview() {
    if (!currentUser) return;
    
    // กำหนดว่าถ้าเป็น Staff ให้ดูข้อมูลเฉพาะหน่วยงานตัวเอง ถ้าเป็น Admin ดูภาพรวม
    const isStaff = currentUser.role === 'staff';
    const targetAgency = isStaff ? currentUser.faculty : null;

    try {
        const res = await callBackendAPI('getFinancialOverview', { 
            userId: currentUser.id, 
            viewAsAgency: targetAgency 
        });

        if (res.success) {
            const stats = res.stats;
            
            // อัปเดตตัวเลข
            document.getElementById('statTotalAllocated').textContent = Number(stats.allocated).toLocaleString();
            document.getElementById('statTotalUsed').textContent = Number(stats.used).toLocaleString();
            document.getElementById('statTotalBalance').textContent = Number(stats.balance).toLocaleString();

            // แสดง Card ตามระดับสิทธิ์
            if (isStaff) {
                document.getElementById('cardHiredLocalContainer').style.display = 'flex';
                document.getElementById('statHiredLocal').textContent = stats.hiredCountLocal;
            } else {
                document.getElementById('cardHiredGlobalContainer').style.display = 'flex';
                document.getElementById('cardNotHiredContainer').style.display = 'flex';
                document.getElementById('cardRegisteredGlobalContainer').style.display = 'flex';
                
                document.getElementById('statHiredGlobal').textContent = stats.hiredCountGlobal;
                document.getElementById('statNotHired').textContent = stats.notHiredCount;
                document.getElementById('statRegisteredGlobal').textContent = stats.totalRegisteredGlobal;
            }
        }
    } catch (e) {
        console.error("Dashboard Load Error:", e);
    }
}

// ==========================================
// 2. บริหารจัดการจ้างงาน (Manage Jobs)
// ==========================================

let adminJobsCache = [];

async function loadJobsForAdmin() {
    try {
        const res = await callBackendAPI('getAllActivities');
        adminJobsCache = res || [];
        renderAdminJobsTable(adminJobsCache);
    } catch (e) {
        showAlert('ไม่สามารถโหลดข้อมูลงานได้', 'error');
    }
}

function renderAdminJobsTable(jobs) {
    const tbody = document.querySelector('#jobsTable tbody');
    const noData = document.getElementById('noJobsAdmin');
    tbody.innerHTML = '';

    // Staff เห็นเฉพาะงานหน่วยงานตัวเอง Admin เห็นทั้งหมด
    const filteredJobs = currentUser.role === 'staff' 
        ? jobs.filter(j => j.jobAgency === currentUser.faculty)
        : jobs;

    if (filteredJobs.length === 0) {
        noData.style.display = 'block';
        return;
    }
    noData.style.display = 'none';

    filteredJobs.forEach(job => {
        let totalQuota = parseInt(job.totalQuota) || 0;
        let regCount = (parseInt(job.morningRegistered) || 0) + 
                       (parseInt(job.afternoonRegistered) || 0) + 
                       (parseInt(job.eveningRegistered) || 0) + 
                       (parseInt(job.multiRegistered) || 0);
        
        let status = job.isLocked === 'TRUE' ? '<span class="vf-badge" style="background:#ffebee; color:#c62828;">ปิดรับสมัคร</span>' : '<span class="vf-badge" style="background:#e8f5e9; color:#2e7d32;">เปิดรับสมัคร</span>';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${job.date}</td>
            <td><strong>${job.jobTitle}</strong><br><small>${job.jobAgency}</small></td>
            <td style="text-align:center;">${totalQuota}</td>
            <td style="text-align:center;">${regCount}</td>
            <td style="text-align:center;">${status}</td>
            <td style="text-align:center;">
                <button class="btn btn-info" style="padding:4px 8px; font-size:12px;" onclick="editJob('${job.id}')">แก้ไข</button>
                <button class="btn btn-danger" style="padding:4px 8px; font-size:12px;" onclick="deleteJob('${job.id}')">ลบ</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// เปิดหน้าต่างเพิ่มงานใหม่
document.getElementById('addJobBtn')?.addEventListener('click', () => {
    document.getElementById('jobForm').reset();
    document.getElementById('jobId').value = '';
    document.getElementById('jobModalTitle').textContent = 'สร้างประกาศรับสมัครงาน';
    
    // ถ้าเป็น Staff ให้ล็อกชื่อหน่วยงาน
    const agencySelect = document.getElementById('jobAgency');
    if (currentUser.role === 'staff') {
        agencySelect.innerHTML = `<option value="${currentUser.faculty}" selected>${currentUser.faculty}</option>`;
    }

    document.getElementById('jobModal').style.display = 'flex';
});

// บันทึกประกาศงาน
document.getElementById('jobForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const jobId = document.getElementById('jobId').value;
    
    const payload = {
        jobtitle: document.getElementById('jobTitle').value,
        jobagency: document.getElementById('jobAgency').value,
        jobdescription: document.getElementById('jobDescription').value,
        date: document.getElementById('jobDate').value,
        totalquota: document.getElementById('jobTotalQuota').value,
        morningquota: document.getElementById('jobMorningQuota').value,
        afternoonquota: document.getElementById('jobAfternoonQuota').value,
        eveningquota: document.getElementById('jobEveningQuota').value,
        islocked: 'FALSE'
    };

    try {
        const action = jobId ? 'updateActivity' : 'addActivity';
        if (jobId) payload.id = jobId;

        const res = await callBackendAPI(action, { token: currentUser.token, activityData: payload, activityId: jobId });
        if (res.success) {
            showAlert('บันทึกประกาศงานสำเร็จ', 'success');
            document.getElementById('jobModal').style.display = 'none';
            loadJobsForAdmin();
        } else {
            showAlert(res.message, 'error');
        }
    } catch (e) {
        showAlert('บันทึกไม่สำเร็จ', 'error');
    }
});

function deleteJob(jobId) {
    Swal.fire({
        title: 'ยืนยันการลบประกาศงาน?',
        text: "ข้อมูลผู้สมัครในงานนี้จะถูกลบด้วย",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6'
    }).then(async (result) => {
        if (result.isConfirmed) {
            const res = await callBackendAPI('deleteActivity', { token: currentUser.token, activityId: jobId });
            if (res.success) {
                showAlert('ลบงานเรียบร้อยแล้ว', 'success');
                loadJobsForAdmin();
            } else {
                showAlert('ลบไม่สำเร็จ', 'error');
            }
        }
    });
}


// ==========================================
// 3. จัดการบัญชีผู้ใช้งาน (Manage Users) - Admin Only
// ==========================================

let usersCache = [];

async function loadUsersForAdmin() {
    try {
        const res = await callBackendAPI('getAllUsers', { token: currentUser.token });
        usersCache = res || [];
        renderUsersTable(usersCache);
    } catch (e) {
        showAlert('โหลดข้อมูลผู้ใช้ล้มเหลว', 'error');
    }
}

function renderUsersTable(users) {
    const tbody = document.querySelector('#usersTable tbody');
    tbody.innerHTML = '';
    
    document.getElementById('countAllUsers').textContent = users.length;

    users.forEach(u => {
        let roleName = 'นักศึกษา';
        let roleBadge = 'background:#e3f2fd; color:#1565c0;';
        if (u.role === 'admin') { roleName = 'ผู้ตรวจสอบ'; roleBadge = 'background:#ffebee; color:#c62828;'; }
        else if (u.role === 'staff') { roleName = 'หน่วยงาน'; roleBadge = 'background:#e8f5e9; color:#2e7d32;'; }
        else if (u.role === 'executive') { roleName = 'ผู้บริหาร'; roleBadge = 'background:#f3e5f5; color:#7b1fa2;'; }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${u.studentId || u.id}</td>
            <td>${u.prefix || ''}${u.firstName} ${u.lastName}</td>
            <td>${u.faculty || '-'}</td>
            <td><span class="vf-badge" style="${roleBadge}">${roleName}</span></td>
            <td style="text-align:center;">
                <button class="btn btn-info" style="padding:4px 8px; font-size:12px;" onclick="openEditUserModal('${u.id}')">จัดการ</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// ค้นหาผู้ใช้งาน
document.getElementById('searchUserInput')?.addEventListener('keyup', (e) => {
    const kw = e.target.value.toLowerCase();
    const filtered = usersCache.filter(u => 
        (u.studentId && u.studentId.toLowerCase().includes(kw)) ||
        (u.firstName && u.firstName.toLowerCase().includes(kw)) ||
        (u.faculty && u.faculty.toLowerCase().includes(kw))
    );
    renderUsersTable(filtered);
});


// ==========================================
// 4. จัดการผู้สมัครงาน (Manage Registrations)
// ==========================================

let regMasterCache = [];

async function loadRegistrationsForAdmin() {
    try {
        const res = await callBackendAPI('getAllRegistrations', { token: currentUser.token });
        regMasterCache = res || [];
        renderRegMasterTable();
    } catch (e) {
        showAlert('โหลดข้อมูลผู้สมัครล้มเหลว', 'error');
    }
}

function renderRegMasterTable() {
    const tbody = document.querySelector('#regMasterTable tbody');
    tbody.innerHTML = '';
    
    // จัดกลุ่มตามงาน
    const jobGroups = {};
    regMasterCache.forEach(reg => {
        // กรองหน่วยงานสำหรับ Staff
        if (currentUser.role === 'staff' && reg.jobAgency !== currentUser.faculty) return;

        const key = reg.activityId;
        if (!jobGroups[key]) {
            jobGroups[key] = {
                title: reg.jobTitle,
                agency: reg.jobAgency,
                date: reg.activityDate,
                count: 0
            };
        }
        jobGroups[key].count++;
    });

    Object.keys(jobGroups).forEach(jobId => {
        const g = jobGroups[jobId];
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${g.title}</strong><br><small>${g.agency}</small></td>
            <td>${g.date}</td>
            <td style="text-align: center;"><span class="badge-count" style="font-size:14px; padding:4px 10px;">${g.count} คน</span></td>
            <td style="text-align: center;">
                <button class="btn btn-primary" style="padding:5px 15px;" onclick="openRegDetailView('${jobId}')">พิจารณา/ตรวจรับ</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function openRegDetailView(activityId) {
    document.getElementById('regMasterView').style.display = 'none';
    document.getElementById('regDetailView').style.display = 'block';
    
    // ดึงเฉพาะคนสมัครงานนี้
    const students = regMasterCache.filter(r => r.activityId === activityId);
    if(students.length > 0) {
        document.getElementById('detailJobTitle').textContent = students[0].jobTitle;
        document.getElementById('detailJobDate').textContent = students[0].activityDate;
    }
    
    renderRegDetailTable(students);
}

function backToRegMaster() {
    document.getElementById('regMasterView').style.display = 'block';
    document.getElementById('regDetailView').style.display = 'none';
}


// ==========================================
// 5. การเบิกจ่าย (Payroll)
// ==========================================

async function loadPayrollList() {
    // ฟังก์ชันสำหรับหน่วยงานเรียกดูนักศึกษาเพื่อสั่งจ่ายเงิน (ดึงข้อมูล Timesheet ย่อยที่อนุมัติแล้ว)
    try {
        const agency = currentUser.faculty;
        const res = await callBackendAPI('getSubmittedTimeLogsForPayroll', { userId: currentUser.id, targetAgency: agency });
        
        // เติมข้อมูลลงตาราง #payrollListContainer ...
        // (ตรรกะจะเหมือนในไฟล์ Code.gs ที่ดึงรวบยอดแล้วสร้าง UI card)
        
    } catch (e) {
        showAlert('ดึงข้อมูลการลงเวลาล้มเหลว', 'error');
    }
}

// ยืนยันการสั่งเบิกจ่าย
async function submitPayrollRequest(data) {
    try {
        const payload = { ...data, payerId: currentUser.id, agency: currentUser.faculty };
        const res = await callBackendAPI('approveTimeSheetToPayroll', { token: currentUser.token, data: payload });
        
        if (res.success) {
            showAlert(res.message, 'success');
            loadPayrollList();
        } else {
            showAlert(res.message, 'error');
        }
    } catch (e) {
        showAlert('ส่งเบิกไม่สำเร็จ', 'error');
    }
}


// ==========================================
// 6. บริหารจัดการงบประมาณ (Manage Budget) - Admin
// ==========================================

async function loadBudgetOverview() {
    try {
        const res = await callBackendAPI('getBudgetOverview', { userId: currentUser.id });
        if (res.success) {
            const tbody = document.querySelector('#budgetTable tbody');
            tbody.innerHTML = '';
            
            res.stats.forEach(bg => {
                const balance = parseFloat(bg.allocated) - parseFloat(bg.used);
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${bg.department}</strong><br><small>${bg.budgetName}</small></td>
                    <td style="text-align: right; color:#0d47a1;">${Number(bg.allocated).toLocaleString()}</td>
                    <td style="text-align: right; color:#d32f2f;">${Number(bg.used).toLocaleString()}</td>
                    <td style="text-align: right; color:#2e7d32; font-weight:bold;">${balance.toLocaleString()}</td>
                    <td style="text-align: center;">
                        <button class="btn btn-warning" style="padding:4px 8px; font-size:12px;" onclick="openEditBudgetModal('${bg.id}')">แก้ไข</button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }
    } catch (e) {
        showAlert('ดึงข้อมูลระบบงบประมาณล้มเหลว', 'error');
    }
}


// ==========================================
// 7. การทำรายงาน (Export & Generate Report)
// ==========================================

function exportTableToCSV(tableId, filename) {
    const table = document.getElementById(tableId);
    let csvContent = "\uFEFF"; // รองรับภาษาไทย (BOM)
    
    const rows = table.querySelectorAll('tr');
    rows.forEach(row => {
        const cols = row.querySelectorAll('td, th');
        const data = Array.from(cols).map(c => `"${c.innerText.replace(/"/g, '""')}"`);
        csvContent += data.join(",") + "\n";
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}


// ==========================================
// 8. เชื่อมต่อ Event Listener ควบคุมเมนู Admin
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    // การตั้งค่า Event Menu (คล้ายๆ ของ User)
    const adminMenuMap = {
        'navDashboard': () => { loadDashboardOverview(); },
        'navManageJobs': () => { loadJobsForAdmin(); },
        'navManageUsers': () => { loadUsersForAdmin(); },
        'navManageRegistrations': () => { loadRegistrationsForAdmin(); },
        'navPayroll': () => { loadPayrollList(); },
        'navManageBudget': () => { loadBudgetOverview(); }
    };

    for (const [navId, callback] of Object.entries(adminMenuMap)) {
        const el = document.getElementById(navId);
        if (el) {
            el.addEventListener('click', () => {
                if (callback) callback();
            });
        }
    }
});

// ฟังก์ชันปิด Modal ทั่วไป
document.querySelectorAll('.close-modal-btn, .close-button').forEach(btn => {
    btn.addEventListener('click', function() {
        const modal = this.closest('.modal');
        if (modal) modal.style.display = 'none';
    });
});
