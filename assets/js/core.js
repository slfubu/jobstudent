const WELFARE_GROUP_NAME = "งานสวัสดิการนักศึกษา (รวมทุกหน่วยงานย่อย)";
    const WELFARE_SUB_UNITS_LIST = [
         "ทุนการศึกษา",
         "กองทุนเงินให้กู้ยืมเพื่อการศึกษา",
         "แนะแนวและให้คําปรึกษาสุขภาพจิต",
         "จัดหางานและจ้างงานระหว่างเรียน",
         "งานสวัสดิการนักศึกษา"
    ];

    const WELFARE_SUB_UNITS = [
        "ทุนการศึกษา",
        "กองทุนเงินให้กู้ยืมเพื่อการศึกษา",
        "แนะแนวและให้คําปรึกษาสุขภาพจิต",
        "จัดหางานและจ้างงานระหว่างเรียน"
    ];

    function getOfficialAgencyName(agencyName) {
        if (WELFARE_SUB_UNITS.includes(agencyName)) {
            return "งานสวัสดิการนักศึกษา";
        }
        return agencyName; 
    }

    const DEPARTMENT_GROUPS = {
        "งานสวัสดิการนักศึกษา": [ 
            "ทุนการศึกษา",
            "กองทุนเงินให้กู้ยืมเพื่อการศึกษา",
            "แนะแนวและให้คําปรึกษาสุขภาพจิต",
            "จัดหางานและจ้างงานระหว่างเรียน"
        ]
    };
    
    let budgetDataCache = [];
    let currentBudgetSource = 'internal'; 
    
    const DEPARTMENTS = [
        "งานบริหารทั่วไป",
        "งานศิษย์เก่าสัมพันธ์",
        "งานพัฒนานักศึกษา",
        "งานกีฬาและนันทนาการ",
        "งานวินัยและสวัสดิภาพนักศึกษา",
        "งบสำรอง",
        
        "ทุนการศึกษา",
        "กองทุนเงินให้กู้ยืมเพื่อการศึกษา",
        "แนะแนวและให้คําปรึกษาสุขภาพจิต",
        "จัดหางานและจ้างงานระหว่างเรียน" 
    ];

    function populateDepartments(selectId) {
        const select = document.getElementById(selectId);
        if(!select) return;
        select.innerHTML = '<option value="">-- เลือกหน่วยงาน --</option>';
        
        DEPARTMENTS.forEach(dept => {
            const opt = document.createElement('option');
            opt.value = dept;
            opt.textContent = dept;
            select.appendChild(opt);
        });
    }

    const Toast = Swal.mixin({
        toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, timerProgressBar: true,
        didOpen: (toast) => { toast.addEventListener('mouseenter', Swal.stopTimer); toast.addEventListener('mouseleave', Swal.resumeTimer); }
    });

    function showAlert(message, type = 'success') {
        if (type === 'error') {
            Swal.fire({ icon: 'error', title: 'แจ้งเตือน', text: message, confirmButtonText: 'ตกลง', confirmButtonColor: 'var(--danger-color)' });
        } else {
            Toast.fire({ icon: type, title: message });
        }
    }

    function showLoading() { document.getElementById('customLoader').style.display = 'flex'; }
    function hideLoading() { document.getElementById('customLoader').style.display = 'none'; }
    function closeModal(id) { document.getElementById(id).style.display = 'none'; }

    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('mainContent');
    const sidebarToggle = document.getElementById('sidebarToggle');
    const authLayout = document.getElementById('authLayout');
    const appLayout = document.getElementById('appLayout');

    sidebarToggle.addEventListener('click', () => {
        if(window.innerWidth <= 768) { sidebar.classList.toggle('active'); } 
        else { sidebar.classList.toggle('collapsed'); mainContent.classList.toggle('expanded'); }
    });

    function switchLayout(mode) {
        if (mode === 'auth') { authLayout.style.display = 'block'; appLayout.style.display = 'none'; } 
        else { authLayout.style.display = 'none'; appLayout.style.display = 'flex'; }
    }

    document.querySelectorAll('.submenu-toggle').forEach(toggle => {
        toggle.addEventListener('click', function(e) {
            e.preventDefault();
            const submenu = this.nextElementSibling; 
            const arrow = this.querySelector('.arrow-icon');
            
            if (submenu.style.display === 'none') {
                submenu.style.display = 'block';
                arrow.style.transform = 'rotate(180deg)'; 
            } else {
                submenu.style.display = 'none';
                arrow.style.transform = 'rotate(0deg)'; 
            }
        });
    });

    function showSection(sectionId) {
      document.querySelectorAll('.section').forEach(section => {
          section.classList.remove('active');
          section.style.display = ''; 
      });
      
      const target = document.getElementById(sectionId);
      if(target) {
          target.classList.add('active');
      }
      
      window.scrollTo(0, 0);

      // 👇 แก้ไขบรรทัดนี้: เพิ่ม || sectionId === 'otpSection' เข้าไปในเงื่อนไข 👇
      if (sectionId === 'loginSection' || sectionId === 'signupSection' || sectionId === 'checkEligibilitySection' || sectionId === 'otpSection') {
        switchLayout('auth'); 
      } else {
        switchLayout('app');  
      }
    }

    let currentUser = null;
    let jobs = []; 
    let selectedJobForApply = null;
    let selectedTimeSlot = null;
    let allDisbursedCache = []; 
    let currentDisbursedGroup = null; 

function formatDate(dateInput) {
    if (!dateInput) return '-';
    let str = String(dateInput).trim();
    let d = new Date(str);
    if (!isNaN(d.getTime())) {
        const thMonths = [
            "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
            "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."
        ];
        
        let date = d.getDate();
        let month = thMonths[d.getMonth()];
        let year = d.getFullYear();

        // แปลง ค.ศ. เป็น พ.ศ.
        if (year < 2400) year += 543;

        return `${date} ${month} ${year}`;
    }

    return str;
}

function updateNavbar() {
    // 1. ล้างสถานะ active ของเมนูทั้งหมดก่อน
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => link.classList.remove('active'));

    // 2. อัปเดตข้อมูลผู้ใช้ที่แถบด้านบน (Topbar)
    if (currentUser) {
        // --- ตรวจสอบสถานะการศึกษาเพื่อแสดงต่อท้ายชื่อ ---
        let statusText = "";
        const currentStatus = currentUser.studentStatus || currentUser.StudentStatus || "";
        const statusDate = currentUser.statusDate || currentUser.StatusDate || "";

        if (currentStatus === 'สำเร็จการศึกษา' || currentStatus === 'พ้นสภาพ') {
            // ใช้ formatDate ที่มีอยู่แล้วแปลงวันที่ให้สวยงาม
            const displayDate = statusDate ? formatDate(statusDate) : "-";
            statusText = ` <span style="color: #d32f2f; font-size: 13px; font-weight: 500;">(${currentStatus} ${displayDate})</span>`;
        }

        const adminBackupStr = sessionStorage.getItem('admin_backup');
        
        // ประกอบชื่อ + นามสกุล + ป้ายสถานะสีแดง (ถ้ามี)
        let displayNameTopbar = `${currentUser.prefix || ''}${currentUser.firstName} ${currentUser.lastName}`.trim() + statusText;
        
        // กรณีมีการสวมสิทธิ์ (Impersonation)
        if (adminBackupStr) {
            const admin = JSON.parse(adminBackupStr);
            const adminFullName = `${admin.prefix || ''}${admin.firstName} ${admin.lastName}`.trim();
            const targetName = sessionStorage.getItem('impersonate_target_name');
            displayNameTopbar = `${adminFullName} <span style="color: #f97316; font-size: 12px;">(ดำเนินการแทน ${targetName})</span>`;
        }
        
        // ใช้ innerHTML แทน textContent เพื่อให้ Tag <span> สีแดงทำงานได้
        document.getElementById('displayUserName').innerHTML = displayNameTopbar;
        document.getElementById('displayUserFaculty').textContent = currentUser.faculty || 'ส่วนกลาง';
    }

    // 3. จัดการการแสดงผลเมนูด้านซ้าย (Sidebar) ตามสิทธิ์ (Role)
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => item.classList.remove('show'));

    // ซ่อนเมนูลงเวลาประจำไว้ก่อน จะแสดงก็ต่อเมื่อเช็คผ่าน checkRegularJobAccess()
    const navRegular = document.getElementById('navRegularJob');
    if (navRegular) {
        navRegular.style.display = 'none';
        navRegular.classList.remove('show');
    }

    // เปิดเมนูตาม Role
    if (currentUser.role === 'admin') {
        document.querySelectorAll('.admin-nav').forEach(item => item.classList.add('show'));
    } 
    else if (currentUser.role === 'staff') {
        document.querySelectorAll('.staff-nav').forEach(item => item.classList.add('show'));
    } 
    else if (currentUser.role === 'executive') {
        document.querySelectorAll('.exec-nav').forEach(item => item.classList.add('show'));
    } 
    else {
        document.querySelectorAll('.user-nav').forEach(item => item.classList.add('show'));
        checkRegularJobAccess(); // เช็คสิทธิ์ลงเวลาทำงานหน่วยงาน
    }
    
    // ตรวจสอบการแสดงผลเมนู "แบบประเมิน" (เปิด/ปิด จากแอดมิน)
    applyFeedbackMenuVisibility();
}

function setupNavClick(id, sectionId, callback) {
        const el = document.getElementById(id);
        if(el) {
            el.addEventListener('click', (e) => {
                e.preventDefault(); 
                showSection(sectionId);
                document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
                
                el.classList.add('active');
                const parentSubmenu = el.closest('.submenu-list');
                if (parentSubmenu) {
                    const parentToggle = parentSubmenu.previousElementSibling; // ตัวปุ่มเมนูหลัก
                    if(parentToggle) {
                        parentToggle.classList.add('active');
                    }
                }
                if(window.innerWidth <= 768) sidebar.classList.remove('active');
                
                if(callback) callback();
            });
        }
    }

    setupNavClick('navUserDashboard', 'userDashboardSection', () => { updateUserDashboard(); loadUserRegistrations(); });
    setupNavClick('navJobSearch', 'jobSearchSection', () => { loadJobsForStudent(); });
    setupNavClick('navDashboard', 'adminDashboardSection', () => loadDashboardOverview());
    setupNavClick('navManageJobs', 'manageJobsSection', () => loadJobsForAdmin());
    setupNavClick('navManageUsers', 'manageUsersSection', () => loadUsersForAdmin());
    setupNavClick('navManageRegistrations', 'manageRegistrationsSection', () => loadRegistrationsForAdmin());
    setupNavClick('navDownloadData', 'downloadDataSection', () => initDownloadMenu());
    setupNavClick('navRecordTransfer', 'recordTransferSection', () => loadJobsForTransferRecord());

function renderManualByRole() {
    const cardStudent = document.getElementById('manualCardStudent');
    const cardStaff = document.getElementById('manualCardStaff');
    const cardAdmin = document.getElementById('manualCardAdmin');

    if(cardStudent) cardStudent.style.display = 'none';
    if(cardStaff) cardStaff.style.display = 'none';
    if(cardAdmin) cardAdmin.style.display = 'none';

    if (!currentUser) return;

    if (currentUser.role === 'admin' || currentUser.role === 'executive') {
        if(cardStudent) cardStudent.style.display = 'flex';
        if(cardStaff) cardStaff.style.display = 'flex';
        if(cardAdmin) cardAdmin.style.display = 'flex';
    } 
    else if (currentUser.role === 'staff') {
        if(cardStaff) cardStaff.style.display = 'flex';
    } 
    else {
        if(cardStudent) cardStudent.style.display = 'flex';
    }

    // --- ส่วนที่เพิ่มใหม่: เช็คสิทธิ์เพื่อซ่อน/แสดงปุ่มคู่มือแบบ Word ---
    // ระบบจะค้นหาปุ่มที่มีลิงก์เป็นไฟล์ Google Docs (Word) ทุกปุ่มในหน้าคู่มือ
    const wordBtns = document.querySelectorAll('#manualSection a[href*="docs.google.com/document"]');
    wordBtns.forEach(btn => {
        if (currentUser.role === 'admin') {
            btn.style.display = 'inline-flex'; // แสดงปุ่มตามปกติ ถ้าเป็น Admin
        } else {
            btn.style.display = 'none'; // ซ่อนปุ่ม ถ้าเป็นสิทธิ์อื่นๆ
        }
    });
}

    setupNavClick('navManual', 'manualSection', () => {
        renderManualByRole();
    });

setupNavClick('navManageBudget', 'manageBudgetSection', () => {
    loadBudgetInfoForAdmin(); 
});
    setupNavClick('navPayroll', 'payrollSection', () => loadPayrollPage());
    document.getElementById('showSignup').addEventListener('click', (e) => { 
    e.preventDefault(); 
    document.getElementById('checkEligibleId').value = ''; // ล้างค่าเก่า
    showSection('checkEligibilitySection'); 
});
    document.getElementById('showLogin').addEventListener('click', (e) => { e.preventDefault(); showSection('loginSection'); });
    document.getElementById('navLogout').addEventListener('click', confirmLogout);
    
(function initCoreWhenDomReady() {
  const run = () => {
    if (typeof populateDepartments === 'function') {
        populateDepartments('jobAgency');
        populateDepartments('modalUserDepartment');
        populateDepartments('allocDepartment');
    }

    const storedUser = sessionStorage.getItem('currentUser');
    if (storedUser && storedUser !== "undefined" && storedUser !== "null") {
        try {
            currentUser = JSON.parse(storedUser);
            const isImp = sessionStorage.getItem('impersonate_mode');
            const impUserStr = sessionStorage.getItem('impersonated_user');

            if (isImp === 'true' && impUserStr) {
                console.log("System Status: Impersonation Mode Active");
                currentUser = JSON.parse(impUserStr);
            } else {
                console.log("System Status: Normal Mode");
            }
            startSessionTimer();
            forceRefreshSystem();

        } catch (e) {
            console.error("Error parsing user data:", e);
            sessionStorage.clear();
            hideLoading();
            showSection('loginSection');
            showMaintenanceWarning();
        }
    } else {
        hideLoading();
        showSection('loginSection');
        showMaintenanceWarning();
    }

  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();
})();

document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault(); 
    showLoading();
    
    const studentId = document.getElementById('loginStudentId').value;
    const password = document.getElementById('loginPassword').value;
    
    google.script.run.withSuccessHandler(res => {
        hideLoading();
        if(res.success) {
            currentUser = res.user; 
            sessionStorage.setItem('currentUser', JSON.stringify(currentUser));
            startSessionTimer(); 
            if (currentUser.role === 'admin' || currentUser.role === 'staff' || currentUser.role === 'executive') {
                showSecurityNotice(() => {
                    proceedToSystem();
                });

            } else {
                proceedToSystem();
            }
            
        } else {
            showAlert(res.message, 'error');
        }
    }).withFailureHandler(err => { 
        hideLoading(); 
        showAlert(err.message, 'error'); 
    }).login(studentId, password);
});

function proceedToSystem() {
    updateAdminButtonVisibility();
    updateNavbar();
    
    if (currentUser.role === 'admin' || currentUser.role === 'staff' || currentUser.role === 'executive') {
        document.getElementById('navDashboard').click();
    } else {
        document.getElementById('navUserDashboard').click();
    }
}
    document.getElementById('signupForm').addEventListener('submit', async (e) => {
        e.preventDefault(); showLoading();
        const data = {
            gmail: document.getElementById('signupGmail').value, prefix: document.getElementById('signupPrefix').value,
            firstName: document.getElementById('signupFirstName').value, lastName: document.getElementById('signupLastName').value,
            studentId: document.getElementById('signupStudentId').value, faculty: document.getElementById('signupFaculty').value,
            phone: document.getElementById('signupPhone').value, password: document.getElementById('signupPassword').value,
            role: 'user'
        };
        google.script.run.withSuccessHandler(res => {
            hideLoading();
            if(res.success) { showAlert(res.message); showSection('loginSection'); document.getElementById('signupForm').reset(); }
            else showAlert(res.message, 'error');
        }).signUp(data);
    });

function confirmLogout() {
    const isImpersonating = sessionStorage.getItem('impersonate_mode') === 'true';

    if (isImpersonating) {
        Swal.fire({
            title: 'ออกจากการทำรายการเเทน',
            text: "คุณต้องการกลับสู่บัญชีผู้ดูแลระบบใช่หรือไม่",
            icon: 'info',
            showCancelButton: true,
            confirmButtonColor: '#f97316', 
            cancelButtonColor: '#6c757d',
            confirmButtonText: 'กลับสู่เมนูระบบ',
            cancelButtonText: 'ยกเลิก'
        }).then((result) => {
            if (result.isConfirmed) {
                exitImpersonation(); 
            }
        });

    } else {
        Swal.fire({
            title: 'ยืนยันการออกจากระบบ',
            text: "คุณต้องการออกจากระบบนี้ใช่หรือไม่",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#dc3545', 
            cancelButtonColor: '#6c757d',
            confirmButtonText: 'ใช่ ออกจากระบบ',
            cancelButtonText: 'ยกเลิก'
        }).then((result) => {
            if (result.isConfirmed) {
                logout(); 
            }
        });
    }
}

function logout() {
    // เก็บ Token ไว้ชั่วคราวเพื่อยกเลิก Session ฝั่ง Server ก่อนล้าง Browser
    const tokenToRevoke = sessionStorage.getItem('sessionToken') || localStorage.getItem('sessionToken') || '';

    // Fire-and-forget: UX ไม่ต้องรอ Server แต่ Token จะถูกลบจาก CacheService ฝั่ง Apps Script
    if (tokenToRevoke && window.GAS_API && typeof window.GAS_API.call === 'function') {
        window.GAS_API.call('logoutSession', [])
          .catch(err => console.warn('Server logout failed:', err));
    }

    // 1. ล้างข้อมูลในตัวแปร (Memory) เพื่อความปลอดภัย
    currentUser = null;
    allUsersCache = [];
    allRegistrationsCache = [];
    allDocumentsCache = [];
    budgetDataCache = [];
    submittedLogsCache = [];

    // 2. หยุดตัวจับเวลา Session
    if (typeof sessionTimer !== 'undefined') {
        clearTimeout(sessionTimer);
    }

    // 3. ล้าง Storage ใน Browser
    localStorage.removeItem('sessionToken');
    localStorage.removeItem('currentUser');
    sessionStorage.clear();

    // 4. รีเซ็ตฟอร์ม Login
    const loginForm = document.getElementById('loginForm');
    if (loginForm) loginForm.reset();

    // 5. ออกจาก Protected UI จริง: Reload กลับหน้า Login-only
    // ทำให้ AppShell และ application scripts ถูกนำออกจาก DOM/หน่วยความจำของหน้าเดิม
    try {
        history.replaceState(null, '', window.location.pathname.replace(/[^/]*$/, '') || './');
    } catch (_) {}
    window.location.replace('./');
}

function updateUserDashboard() {
    if (currentUser) {
        let statusSuffix = "";
        const currentStatus = currentUser.studentStatus || currentUser.StudentStatus || "";
        const statusDate = currentUser.statusDate || currentUser.StatusDate || "";

        if (currentStatus === 'สำเร็จการศึกษา' || currentStatus === 'พ้นสภาพ') {
            const displayDate = statusDate ? formatDate(statusDate) : "-";
            statusSuffix = ` <span style="color: #d32f2f; font-weight: 500;">(${currentStatus} ${displayDate})</span>`;
        }

        const fullName = `${currentUser.prefix || ''}${currentUser.firstName} ${currentUser.lastName}`;
        document.getElementById('currentUserName').innerHTML = fullName + statusSuffix;
        document.getElementById('currentUserStudentId').textContent = currentUser.studentId;
        document.getElementById('currentUserFaculty').textContent = currentUser.faculty;
    }
}

function loadUserRegistrations() {
    showLoading();
    google.script.run.withSuccessHandler(regs => {
        hideLoading();
        const tbody = document.querySelector('#userRegistrationsTable tbody');
        const mobileContainer = document.getElementById('mobileRegListContainer');
        
        tbody.innerHTML = '';
        mobileContainer.innerHTML = '';
        
        if(regs && regs.length > 0) {
            document.getElementById('noUserRegistrations').style.display = 'none';
            regs.forEach(r => {
                let status = String(r.status).toLowerCase().trim();
                let statusText = 'รอพิจารณา'; 
                let color = 'var(--warning-color)';
                let statusClass = 'status-pending';
                let manageButtonHtml = '';
                if(status === 'confirmed' || status === 'approved' || status === 'รับเข้าทำงาน') { 
                    statusText = 'รับเข้าทำงาน'; 
                    color = 'var(--success-color)'; 
                    statusClass = 'status-confirmed';
  
                    manageButtonHtml = `
                        <button class="btn btn-info" onclick="printSingleJobTimesheet('${r.id}')" style="padding: 6px 12px; font-size: 13px; border-radius: 20px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
                           <i class="material-icons" style="font-size:16px; vertical-align:text-bottom;">print</i> ใบลงเวลา
                        </button>
                    `;
                } 
                else if(status === 'cancelled' || status === 'rejected' || status === 'ไม่ผ่าน') { 
                    statusText = 'ไม่ผ่าน/ยกเลิก'; 
                    color = 'var(--danger-color)'; 
                    statusClass = 'status-cancelled';
                    manageButtonHtml = '<span style="color:#999;">-</span>';
                } 
                else {
                     statusText = 'รอพิจารณา';
                     manageButtonHtml = `
                        <button class="btn btn-danger-outline btn-cancel-reg" data-id="${r.id}" style="padding: 5px 10px; font-size: 12px; border: 1px solid var(--danger-color); color: var(--danger-color); background: #fff;">
                           ยกเลิกสมัคร
                        </button>`;
                }
                
                const row = tbody.insertRow();
                row.insertCell().innerHTML = `<b>${r.jobTitle || 'งานทั่วไป'}</b>`;
                row.insertCell().textContent = r.jobAgency || '-';

                let slotTh = r.timeSlot === 'morning' ? 'เช้า' : (r.timeSlot === 'afternoon' ? 'บ่าย' : 'เย็น');
                row.insertCell().textContent = `${formatDate(r.activityDate)} (${slotTh})`;
                
                const statusCell = row.insertCell();
                statusCell.innerHTML = `<span style="font-weight:bold; color:${color}">${statusText}</span>`;
                
                const actionCell = row.insertCell();
                actionCell.style.textAlign = 'center';
                actionCell.innerHTML = manageButtonHtml;
                
                const mobileCard = document.createElement('div');
                mobileCard.className = 'reg-list-item';
                mobileCard.innerHTML = `
                    <div class="reg-job-title">${r.jobTitle || 'งานทั่วไป'}</div>
                    <div class="reg-job-detail">
                        <div><i class="material-icons" style="font-size:16px; vertical-align:sub; color:#999;">business</i> ${r.jobAgency || '-'}</div>
                        <div style="text-align: right;"><span class="reg-status-badge ${statusClass}">${statusText}</span></div>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #f0f0f0; padding-top: 10px; margin-top: 10px;">
                        <div style="font-size: 14px; color: #555; font-weight: 500;">
                            <i class="material-icons" style="font-size:16px; vertical-align:sub; color:#999;">event</i> ${formatDate(r.activityDate)} (${slotTh})
                        </div>
                        <div>${manageButtonHtml}</div>
                    </div>
                `;
                mobileContainer.appendChild(mobileCard);
            });
            
            document.querySelectorAll('.btn-cancel-reg').forEach(btn => {
                btn.onclick = () => confirmCancelReg(btn.dataset.id);
            });

        } else {
            document.getElementById('noUserRegistrations').style.display = 'block';
        }
    }).getUserRegistrations(sessionStorage.getItem('sessionToken'), currentUser.id); // 🛡️ แนบ Token
}


    function confirmCancelReg(id) {
    Swal.fire({
        title: 'ยืนยันการยกเลิก', text: "คุณต้องการยกเลิกการสมัครงานนี้ใช่หรือไม่", icon: 'warning',
        showCancelButton: true, confirmButtonColor: '#d33', confirmButtonText: 'ยืนยัน', cancelButtonText: 'ปิด'
    }).then((result) => {
        if (result.isConfirmed) {
            showLoading();
            // 🛡️ ดึง Token ก่อนส่งไปหลังบ้าน
            const token = sessionStorage.getItem('sessionToken');
            
            google.script.run.withSuccessHandler(() => { 
                showAlert('ยกเลิกเรียบร้อย', 'success'); 
                loadUserRegistrations(); 
            }).updateRegistration(token, id, {status: 'cancelled'}); // 🛡️ ส่ง token เข้าไปด้วย
        }
    });
}

    function loadJobsForStudent() {
        showLoading();
        google.script.run.withSuccessHandler(data => {
            hideLoading();
            jobs = data;
            renderJobs(jobs);
        }).getAllActivities();
    }

function renderJobs(jobData) {
    const container = document.getElementById('jobListContainer');
    container.innerHTML = '';
    
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const formatPostTime = (dateStr) => {
        if (!dateStr) return '';
        const d = new Date(dateStr.replace(' ', 'T')); 
        if (isNaN(d.getTime())) return dateStr;
        const datePart = d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
        const timePart = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
        return `${datePart} เวลา ${timePart} น.`;
    };

    // --- แก้ไขการกรองวันที่ (รองรับ | สำหรับแบบเหมา) ---
    const activeJobs = jobData.filter(j => {
        let jobDateStr = j.date;
        if(!jobDateStr || j.isLocked === 'TRUE') return false;
        
        // ถ้าเป็นแบบเหมา ให้เอาวันที่สิ้นสุดมาตรวจสอบว่าหมดอายุหรือยัง
        let expireDate = jobDateStr.includes('|') ? jobDateStr.split('|')[1] : jobDateStr;
        return expireDate >= today; 
    });

    if(activeJobs.length === 0) {
        document.getElementById('noJobsAvailable').style.display = 'block';
        return;
    }
    document.getElementById('noJobsAvailable').style.display = 'none';

    activeJobs.forEach(job => {
        const card = document.createElement('div');
        card.className = 'modern-job-card';
        
        const isMulti = job.date && job.date.includes('|');
        const totalQuota = parseInt(job.totalQuota) || 0;
        
        // ถ้ารูปแบบเหมา ให้ใช้ multiRegistered (ที่ส่งมาจาก Backend)
        const filled = isMulti ? parseInt(job.multiRegistered || 0) : (parseInt(job.morningRegistered || 0) + parseInt(job.afternoonRegistered || 0) + parseInt(job.eveningRegistered || 0));
        
        const isFull = filled >= totalQuota;
        const statusPillClass = isFull ? 'pill-full' : 'pill-open';
        const statusText = isFull ? 'เต็มแล้ว' : 'เปิดรับสมัคร';
        const btnClass = isFull ? 'disabled' : 'active';
        const btnText = isFull ? 'ปิดรับ' : 'สมัครทันที';
        const btnIcon = isFull ? 'block' : 'arrow_forward';
        const postTimestamp = formatPostTime(job.createdAt);

        // สร้าง String วันที่เพื่อแสดงผล
        let displayDateText = '';
        if (isMulti) {
            const [dStart, dEnd] = job.date.split('|');
            displayDateText = `${formatDate(dStart)} - ${formatDate(dEnd)}`;
        } else {
            displayDateText = formatDate(job.date);
        }

        card.innerHTML = `
            <div class="card-top-accent"></div>
            <div class="status-pill ${statusPillClass}">${statusText}</div>
            <div class="card-content" style="padding-bottom: 15px;">
                <div style="display: flex; align-items: flex-start; margin-bottom: 15px; border-bottom: 1px dashed #eee; padding-bottom: 10px;">
                    <div style="width: 40px; height: 40px; background: #e3f2fd; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 12px; flex-shrink: 0;">
                        <i class="material-icons" style="color: var(--secondary-color); font-size: 22px;">campaign</i>
                    </div>
                    <div>
                        <div style="font-size: 14px; font-weight: 700; color: #333;">${job.jobAgency || 'ส่วนกลาง'}</div>
                        <div style="font-size: 11px; color: #888; margin-top: 2px;">
                            <i class="material-icons" style="font-size: 10px; vertical-align: middle;">schedule</i> 
                            ประกาศเมื่อ: ${postTimestamp}
                        </div>
                    </div>
                </div>
                
                <h3 class="modern-title" style="margin-bottom: 8px;">${job.jobTitle || 'ประกาศรับสมัครงาน'}</h3>
                
                <div class="modern-desc">
                    ${job.jobDescription || 'ไม่มีรายละเอียดเพิ่มเติม'}
                </div>
            </div>

            <div class="card-footer">
                <div class="meta-info">
                    <div class="date-text" style="display: flex; align-items: center; gap: 5px;">
                        <i class="material-icons" style="font-size:16px; color:var(--secondary-color);">calendar_today</i> 
                        ${isMulti ? `<span class="vf-badge vf-badge-blue" style="font-size:11px; margin-right:5px;">เหมา</span>` : ''} 
                        ปฏิบัติงาน: ${displayDateText}
                    </div>
                    <div class="quota-text" style="margin-left: 24px; color: #555;">
                        รับ ${totalQuota} (ว่าง <span style="color:${isFull ? 'red' : 'green'}; font-weight:bold;">${Math.max(0, totalQuota - filled)}</span>)
                    </div>
                </div>
                
                <button class="btn-apply-modern ${btnClass}" ${isFull ? 'disabled' : ''}>
                    ${btnText} <i class="material-icons" style="font-size:16px;">${btnIcon}</i>
                </button>
            </div>
        `;
        
        if(!isFull) {
            const btn = card.querySelector('button');
            btn.onclick = () => openApplyPage(job);
        }
        
        container.appendChild(card);
    });
}

function openApplyPage(job) {
    selectedJobForApply = job;
    selectedTimeSlot = null;

    const isMulti = job.date && job.date.includes('|');
    let displayDateText = '';
    
    if (isMulti) {
        const [dStart, dEnd] = job.date.split('|');
        displayDateText = `${formatDate(dStart)} - ${formatDate(dEnd)}`;
    } else {
        displayDateText = formatDate(job.date);
    }

    document.getElementById('appFormJobTitle').textContent = job.jobTitle;
    document.getElementById('appFormJobAgency').textContent = job.jobAgency;
    document.getElementById('appFormJobDate').textContent = displayDateText;
    document.getElementById('appFormStudentName').textContent = `${currentUser.prefix}${currentUser.firstName} ${currentUser.lastName}`;
    document.getElementById('appFormStudentId').textContent = `รหัส: ${currentUser.studentId}`;
    document.getElementById('appFormFaculty').textContent = currentUser.faculty;

    const container = document.getElementById('appFormSlotContainer');
    container.innerHTML = '';
    
    const createSlotBtn = (key, label, quota, reg) => {
        const btn = document.createElement('button');
        btn.className = 'slot-btn';
        const left = quota - reg;
        
        let statusHtml = left > 0 
            ? `<div class="slot-quota" style="color:green;">ว่าง ${left} ที่</div>` 
            : `<div class="slot-quota" style="color:red;">เต็ม</div>`;

        btn.innerHTML = `<div class="slot-time">${label}</div>${statusHtml}`;
        
        if(left <= 0) {
            btn.disabled = true;
        } else {
            btn.onclick = () => {
                document.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                selectedTimeSlot = key;
                document.getElementById('confirmApplyBtn').disabled = false;
            };
        }
        container.appendChild(btn);
    };

    // --- ตรวจสอบว่าเป็นแบบเหมาหรือปกติ ---
    if (isMulti) {
        // ถ้ารูปแบบเหมา ให้มีปุ่มเดียว และใช้โควตารวม (totalQuota) ลบกับยอดคนสมัครแบบเหมา (multiRegistered)
        createSlotBtn('multi', 'ปฏิบัติงาน (ตลอดช่วงเวลาที่กำหนด)', job.totalQuota, job.multiRegistered);
    } else {
        // แบบปกติ
        createSlotBtn('morning', 'ช่วงเช้า (08:30-12:00)', job.morningQuota, job.morningRegistered);
        createSlotBtn('afternoon', 'ช่วงบ่าย (13:00-16:30)', job.afternoonQuota, job.afternoonRegistered);
        createSlotBtn('evening', 'ช่วงเย็น (16:30-20:00)', job.eveningQuota, job.eveningRegistered);
    }

    showSection('applyJobSection');
}

    function closeApplyPage() {
        showSection('jobSearchSection');
    }

document.getElementById('confirmApplyBtn').onclick = () => {
        if(!selectedTimeSlot) return;
        
        Swal.fire({
            title: 'ยืนยันการสมัคร', text: "กรุณาตรวจสอบข้อมูลก่อนยืนยัน", icon: 'question',
            showCancelButton: true, confirmButtonText: 'ยืนยัน', cancelButtonText: 'ยกเลิก'
        }).then((result) => {
            if (result.isConfirmed) {
                showLoading();
                
                // 🛡️ ดึง Token จากระบบ
                const token = sessionStorage.getItem('sessionToken');
                
                google.script.run.withSuccessHandler(res => {
                    hideLoading();
                    if(res.success) {
                        showAlert('สมัครงานสำเร็จ รอผลการพิจารณา');
                        showSection('userDashboardSection'); 
                        
                        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
                        document.getElementById('navUserDashboard').classList.add('active');
                        
                        loadUserRegistrations(); 
                    } else {
                        showAlert(res.message, 'error');
                    }
                }).registerForActivity(token, { // 🛡️ แนบ Token เป็นตัวแปรแรก
                    userId: currentUser.id, 
                    activityId: selectedJobForApply.id,
                    date: selectedJobForApply.date, 
                    timeSlot: selectedTimeSlot,
                    prefix: currentUser.prefix, firstName: currentUser.firstName, lastName: currentUser.lastName,
                    studentId: currentUser.studentId, faculty: currentUser.faculty, phone: currentUser.phone,
                    jobTitle: selectedJobForApply.jobTitle, jobAgency: selectedJobForApply.jobAgency
                });
            }
        });
    };


function loadJobsForAdmin() {
    showLoading();
    google.script.run.withSuccessHandler(data => {
        hideLoading();
        const tbody = document.querySelector('#jobsTable tbody'); tbody.innerHTML = '';
        
        // *** Filtering Logic for Staff ***
        let filteredData = data;
        if(currentUser.role === 'staff') {
            // ถ้าเป็น Staff เห็นเฉพาะงานของตัวเอง (Faculty = Job Agency)
            filteredData = data.filter(job => job.jobAgency === currentUser.faculty);
        }

        if(filteredData.length) {
            document.getElementById('noJobsAdmin').style.display = 'none';
            filteredData.sort((a,b) => new Date(b.date) - new Date(a.date)); 
            filteredData.forEach(job => {
                const row = tbody.insertRow();
                row.insertCell().textContent = formatDate(job.date);
                row.insertCell().innerHTML = `<strong>${job.jobTitle || '-'}</strong><br><small style="color:#666">${job.jobAgency || '-'}</small>`;
                row.insertCell().textContent = job.totalQuota;
                
                const filled = (parseInt(job.morningRegistered || 0) + parseInt(job.afternoonRegistered || 0) + parseInt(job.eveningRegistered || 0));
                row.insertCell().textContent = filled;
                
                const statusCell = row.insertCell();
                // ตรวจสอบสถานะการล็อก
                statusCell.innerHTML = (job.isLocked && job.isLocked.toString().toUpperCase() === 'TRUE') 
                    ? '<span style="color:red; font-weight:bold;">ปิดรับ</span>' 
                    : '<span style="color:green;">เปิดรับ</span>';
                    
                const actions = row.insertCell();
                actions.style.whiteSpace = 'nowrap';
                const editBtn = document.createElement('button'); editBtn.className = 'btn btn-info'; 
                editBtn.innerHTML = '<i class="material-icons" style="font-size:16px;">edit</i>'; editBtn.style.padding = '5px 8px'; editBtn.style.marginRight = '4px';
                editBtn.onclick = () => {
                    document.getElementById('jobId').value = job.id;
                    document.getElementById('jobTitle').value = job.jobTitle || '';
                    document.getElementById('jobAgency').value = job.jobAgency || '';
                    document.getElementById('jobDescription').value = job.jobDescription || '';
                    document.getElementById('jobDate').value = job.date.slice(0,10);
                    document.getElementById('jobTotalQuota').value = job.totalQuota;
                    document.getElementById('jobMorningQuota').value = job.morningQuota;
                    document.getElementById('jobAfternoonQuota').value = job.afternoonQuota;
                    document.getElementById('jobEveningQuota').value = job.eveningQuota;
                    document.getElementById('jobModalTitle').textContent = 'แก้ไขประกาศงาน';
                    document.getElementById('jobModal').style.display = 'flex';
                };
                actions.appendChild(editBtn);

                const lockBtn = document.createElement('button'); lockBtn.className = 'btn btn-secondary'; 
                lockBtn.innerHTML = job.isLocked ? '<i class="material-icons" style="font-size:16px;">lock_open</i>' : '<i class="material-icons" style="font-size:16px;">lock</i>'; 
                lockBtn.style.padding = '5px 8px'; lockBtn.style.marginRight = '4px';
                
                // *** ส่วนที่แก้ไข: เรียกฟังก์ชันยืนยันก่อนล็อก/ปลดล็อก ***
                lockBtn.onclick = () => { 
                    confirmLockJob(job.id, job.isLocked); 
                };
                actions.appendChild(lockBtn);

                const deleteBtn = document.createElement('button'); deleteBtn.className = 'btn btn-danger'; 
                deleteBtn.innerHTML = '<i class="material-icons" style="font-size:16px;">delete</i>'; deleteBtn.style.padding = '5px 8px';
                deleteBtn.onclick = () => {
                    Swal.fire({
                         title: 'ลบประกาศนี้?', text: "ข้อมูลผู้สมัครในงานนี้จะหายไป", icon: 'warning',
                         showCancelButton: true, confirmButtonColor: '#d33', confirmButtonText: 'ลบ'
                    }).then((r) => {
                        if(r.isConfirmed) {
                            showLoading();
                            google.script.run.withSuccessHandler(res => {
                                hideLoading();
                                if(res.success) { showAlert('ลบแล้ว'); loadJobsForAdmin(); }
                                else showAlert(res.message, 'error');
                           }).deleteActivity(sessionStorage.getItem('sessionToken'), job.id); // 🛡️ แนบ Token
                            }
                    });
                };
                actions.appendChild(deleteBtn);
            });
            } else document.getElementById('noJobsAdmin').style.display = 'block';
        }).getAllActivities();
    }

    document.getElementById('addJobBtn').onclick = () => { 
        document.getElementById('jobForm').reset(); 
        document.getElementById('jobId').value = ''; 
        document.getElementById('jobModalTitle').textContent = 'สร้างประกาศรับสมัครงานใหม่';
        
        // ถ้าเป็น Staff ให้ล็อกหน่วยงานเป็นของตัวเอง
        if(currentUser.role === 'staff') {
             const agencySelect = document.getElementById('jobAgency');
             agencySelect.value = currentUser.faculty;
             // อาจจะ disable ไม่ให้เปลี่ยนหน่วยงาน
             // agencySelect.disabled = true; 
        }

        document.getElementById('jobModal').style.display = 'flex'; 
    };

document.getElementById('jobForm').onsubmit = (e) => {
    e.preventDefault();
    
    const jobType = document.querySelector('input[name="jobDateType"]:checked').value;
    let finalDate = document.getElementById('jobDate').value;
    const total = parseInt(document.getElementById('jobTotalQuota').value) || 0;
    
    let morning = 0, afternoon = 0, evening = 0;

    if (total <= 0) {
        Swal.fire('ข้อมูลไม่ถูกต้อง', 'กรุณาระบุจำนวนที่รับอย่างน้อย 1 คน', 'warning');
        return;
    }

    if (jobType === 'multi') {
        // กรณีเหมาหลายวัน
        const endDate = document.getElementById('jobEndDate').value;
        if (finalDate > endDate) {
            Swal.fire('ข้อมูลไม่ถูกต้อง', 'วันที่สิ้นสุดต้องมากกว่าหรือเท่ากับวันเริ่มต้น', 'error');
            return;
        }
        finalDate = `${finalDate}|${endDate}`; // บันทึกเป็น "เริ่ม|สิ้นสุด"
    } else {
        // กรณีรายวันปกติ
        morning = parseInt(document.getElementById('jobMorningQuota').value) || 0;
        afternoon = parseInt(document.getElementById('jobAfternoonQuota').value) || 0;
        evening = parseInt(document.getElementById('jobEveningQuota').value) || 0;

        if ((morning + afternoon + evening) !== total) {
            Swal.fire({
                icon: 'error',
                title: 'โควตาไม่ตรงกัน',
                html: `คุณระบุยอดรับรวม <b>${total}</b> คน<br>แต่แบ่งช่วงเวลาได้ <b>${morning + afternoon + evening}</b> คน<br>(เช้า ${morning} + บ่าย ${afternoon} + เย็น ${evening})`,
                confirmButtonText: 'แก้ไข'
            });
            return;
        }
    }

    const id = document.getElementById('jobId').value;
    const data = {
        date: finalDate, // ส่งวันที่ ที่ผ่านการจัดการแล้วไป
        totalQuota: total,
        morningQuota: morning,
        afternoonQuota: afternoon,
        eveningQuota: evening,
        jobTitle: document.getElementById('jobTitle').value,
        jobAgency: document.getElementById('jobAgency').value,
        jobDescription: document.getElementById('jobDescription').value
    };

    showLoading();
    const handler = google.script.run.withSuccessHandler(res => {
        hideLoading();
        if(res.success) { 
            document.getElementById('jobModal').style.display = 'none'; 
            showAlert('บันทึกประกาศงานเรียบร้อย', 'success');
            loadJobsForAdmin(); 
        } else { 
            Swal.fire('เกิดข้อผิดพลาด', res.message, 'error');
        }
    }).withFailureHandler(err => {
        hideLoading();
        Swal.fire('Error', err.message, 'error');
    });

    const token = sessionStorage.getItem('sessionToken'); // 🛡️ ดึง Token
    if(id) handler.updateActivity(token, id, data); else handler.addActivity(token, data);
};
