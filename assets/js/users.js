// ==========================================
    // --- ส่วนจัดการผู้ใช้งาน (USER MANAGEMENT) ---
    // ==========================================

    let allUsersCache = [];
    let currentUserPage = 1;
    const usersPerPage = 10;
    let currentRoleFilter = 'all'; 
    let currentUserSearchQuery = ''; 

function loadUsersForAdmin() {
        showLoading();
        // 🛡️ ดึง Token ออกมาก่อน
        const token = sessionStorage.getItem('sessionToken'); 

        google.script.run.withSuccessHandler(users => {
            hideLoading();
            allUsersCache = users;
            updateUserBadges();
            switchUserTab('all');
        }).getAllUsers(token); // 🛡️ ส่ง token เข้าไปในวงเล็บเป็นพารามิเตอร์แรกเสมอ
    }

    const searchUserInput = document.getElementById('searchUserInput');
    if(searchUserInput) {
        searchUserInput.addEventListener('input', (e) => {
            currentUserSearchQuery = e.target.value.toLowerCase().trim();
            currentUserPage = 1; 
            renderUserTable(); 
        });
    }

    function updateUserBadges() {
    if (!allUsersCache) return;
    
    const countAll = allUsersCache.length;
    const countUser = allUsersCache.filter(u => u.role === 'user' || !u.role).length; 
    const countStaff = allUsersCache.filter(u => u.role === 'staff').length;
    const countAdmin = allUsersCache.filter(u => u.role === 'admin').length;
    
    // [เพิ่ม] นับจำนวนผู้บริหาร
    const countExec = allUsersCache.filter(u => u.role === 'executive').length;

    // อัปเดตตัวเลขบนปุ่ม
    const elAll = document.getElementById('countAllUsers'); if(elAll) elAll.textContent = countAll;
    const elUser = document.getElementById('countStudentUsers'); if(elUser) elUser.textContent = countUser;
    const elStaff = document.getElementById('countStaffUsers'); if(elStaff) elStaff.textContent = countStaff;
    const elAdmin = document.getElementById('countAdminUsers'); if(elAdmin) elAdmin.textContent = countAdmin;
    
    // [เพิ่ม] อัปเดตตัวเลขปุ่มผู้บริหาร
    const elExec = document.getElementById('countExecUsers'); if(elExec) elExec.textContent = countExec;
}

    function switchUserTab(role) {
    currentRoleFilter = role;
    currentUserPage = 1; 

    // เลือกปุ่มทั้งหมดใน container นี้
    const tabs = document.querySelectorAll('#manageUsersSection .reg-tab-btn');
    tabs.forEach(btn => btn.classList.remove('active'));

    // กำหนดปุ่ม Active ตามลำดับ (0=All, 1=User, 2=Staff, 3=Admin, 4=Executive)
    if(role === 'all' && tabs[0]) tabs[0].classList.add('active');
    if(role === 'user' && tabs[1]) tabs[1].classList.add('active');
    if(role === 'staff' && tabs[2]) tabs[2].classList.add('active');
    if(role === 'admin' && tabs[3]) tabs[3].classList.add('active');
    
    // [เพิ่ม] เงื่อนไขสำหรับ Executive (ปุ่มลำดับที่ 5 หรือ index 4)
    if(role === 'executive' && tabs[4]) tabs[4].classList.add('active');

    renderUserTable();
}

    function renderUserTable() {
        const tbody = document.querySelector('#usersTable tbody');
        const noDataMsg = document.getElementById('noUsers');
        const pagination = document.getElementById('userPagination');
        
        tbody.innerHTML = '';

        let filteredUsers = allUsersCache;
        
        if (currentRoleFilter !== 'all') {
            if (currentRoleFilter === 'user') {
                filteredUsers = allUsersCache.filter(u => u.role === 'user' || !u.role);
            } else {
                filteredUsers = allUsersCache.filter(u => u.role === currentRoleFilter);
            }
        }

        if (currentUserSearchQuery) {
            filteredUsers = filteredUsers.filter(u => {
                const searchText = `${u.studentId} ${u.prefix}${u.firstName} ${u.lastName} ${u.faculty}`.toLowerCase();
                return searchText.includes(currentUserSearchQuery);
            });
        }

        if (filteredUsers.length === 0) {
            noDataMsg.style.display = 'block';
            if(currentUserSearchQuery) noDataMsg.textContent = `ไม่พบข้อมูลที่ตรงกับ "${currentUserSearchQuery}"`; 
            else noDataMsg.textContent = 'ไม่พบข้อมูลผู้ใช้งานในกลุ่มนี้';
            
            pagination.style.display = 'none';
            return;
        }

        noDataMsg.style.display = 'none';
        pagination.style.display = 'flex';

        const start = (currentUserPage - 1) * usersPerPage;
        const end = start + usersPerPage;
        const displayedUsers = filteredUsers.slice(start, end);

        displayedUsers.forEach(u => {
            const row = tbody.insertRow();
            
            let studentIdDisplay = u.studentId;
            if(currentUserSearchQuery && u.studentId.toLowerCase().includes(currentUserSearchQuery)) {
                 studentIdDisplay = `<span style="background-color: #fff3cd;">${u.studentId}</span>`;
            }
            row.insertCell().innerHTML = `<strong>${studentIdDisplay}</strong>`;
            
            row.insertCell().textContent = `${u.prefix}${u.firstName} ${u.lastName}`;
            
            row.insertCell().innerHTML = `<small style="color:#666">${u.faculty}</small>`;
            

let roleBadge = '<span style="background:#f0f2f5; color:#333; padding:4px 8px; border-radius:12px; font-size:12px; border:1px solid #ccc;">นักศึกษา</span>';
const userRole = (u.role || 'user').toLowerCase();

if(userRole === 'admin') {
    roleBadge = '<span style="background:#343a40; color:#fff; padding:4px 8px; border-radius:12px; font-size:12px;">ผู้ตรวจสอบรายการ</span>';
} else if(userRole === 'staff') {
    roleBadge = '<span style="background:#1976D2; color:#fff; padding:4px 8px; border-radius:12px; font-size:12px;">ผู้ทำรายการ (หน่วยงาน)</span>';
} else if(userRole === 'executive') {
    // [NEW] Badge สำหรับผู้บริหาร
    roleBadge = '<span style="background:#7b1fa2; color:#fff; padding:4px 8px; border-radius:12px; font-size:12px;">ผู้บริหาร</span>';
}
            
            row.insertCell().innerHTML = roleBadge;
            
            const ac = row.insertCell();
            ac.style.textAlign = 'center';
            const btn = document.createElement('button'); 
            btn.className = 'btn btn-info'; 
            btn.innerHTML = '<i class="material-icons" style="font-size:16px;">edit</i>'; 
            btn.style.padding='6px 10px';
            btn.onclick = () => { editUser(u); };
            ac.appendChild(btn);
        });

        renderUserPaginationButtons(filteredUsers.length);
    }

    function renderUserPaginationButtons(totalItems) {
        const totalPages = Math.ceil(totalItems / usersPerPage);
        const container = document.getElementById('userPageButtons');
        const info = document.getElementById('userPageInfo');
        
        container.innerHTML = '';
        info.textContent = `หน้า ${currentUserPage} / ${totalPages} (รวม ${totalItems} คน)`;

        const prevBtn = document.createElement('button');
        prevBtn.className = 'page-btn';
        prevBtn.innerHTML = '<i class="material-icons" style="font-size:14px; vertical-align:middle;">chevron_left</i>';
        prevBtn.disabled = currentUserPage === 1;
        prevBtn.onclick = () => { currentUserPage--; renderUserTable(); };
        container.appendChild(prevBtn);

        for (let i = 1; i <= totalPages; i++) {
            if (i === 1 || i === totalPages || (i >= currentUserPage - 1 && i <= currentUserPage + 1)) {
                const btn = document.createElement('button');
                btn.className = `page-btn ${i === currentUserPage ? 'active' : ''}`;
                btn.textContent = i;
                btn.onclick = () => { currentUserPage = i; renderUserTable(); };
                container.appendChild(btn);
            } else if (i === currentUserPage - 2 || i === currentUserPage + 2) {
                const dots = document.createElement('span');
                dots.textContent = '...';
                dots.style.padding = '0 5px';
                dots.style.color = '#999';
                container.appendChild(dots);
            }
        }

        const nextBtn = document.createElement('button');
        nextBtn.className = 'page-btn';
        nextBtn.innerHTML = '<i class="material-icons" style="font-size:14px; vertical-align:middle;">chevron_right</i>';
        nextBtn.disabled = currentUserPage === totalPages || totalPages === 0;
        nextBtn.onclick = () => { currentUserPage++; renderUserTable(); };
        container.appendChild(nextBtn);
    }

    // --- User Modal Logic with Toggle Fields ---
    const deleteUserBtnInModal = document.getElementById('deleteUserBtnInModal');
    
    // Toggle Logic Function
function toggleUserRoleFields() {
    const role = document.getElementById('modalUserRole').value;
    const idLabel = document.getElementById('lblUserStudentId');
    const divFacultyText = document.getElementById('divUserFacultyText');
    const divDepartmentSelect = document.getElementById('divUserDepartmentSelect');
    const modalStudentId = document.getElementById('modalUserStudentId');

    // รีเซ็ตการแสดงผลก่อน (ซ่อนทั้งคู่)
    divFacultyText.style.display = 'none';
    divDepartmentSelect.style.display = 'none';

    if (role === 'user') {
        // [นักศึกษา] : แสดงช่องคณะ
        idLabel.textContent = 'รหัสนักศึกษา';
        divFacultyText.style.display = 'block'; 
        modalStudentId.placeholder = 'ระบุรหัสนักศึกษา 11 หลัก';
    } 
    else if (role === 'staff') {
        // [เจ้าหน้าที่หน่วยงาน] : แสดงช่องเลือกหน่วยงาน
        idLabel.textContent = 'เลขประจำตัวประชาชน / User ID';
        divDepartmentSelect.style.display = 'block'; 
        modalStudentId.placeholder = 'เลขประจำตัวประชาชน หรือ รหัสผู้ใช้งาน';
    } 
    else {
        // [Admin และ Executive] : ไม่ต้องแสดงสังกัด (ส่วนกลาง)
        idLabel.textContent = 'เลขประจำตัวประชาชน / User ID';
        modalStudentId.placeholder = 'เลขประจำตัวประชาชน หรือ รหัสผู้ใช้งาน';
    }
}


    function editUser(user) {
        document.getElementById('userModalTitle').textContent = 'แก้ไขข้อมูลผู้ใช้งาน';
        document.getElementById('userId').value = user.id;
        document.getElementById('modalUserGmail').value = user.gmail;
        document.getElementById('modalUserPrefix').value = user.prefix;
        document.getElementById('modalUserFirstName').value = user.firstName;
        document.getElementById('modalUserLastName').value = user.lastName;
        document.getElementById('modalUserStudentId').value = user.studentId;
        document.getElementById('modalUserPhone').value = user.phone;
        document.getElementById('modalUserRole').value = user.role || 'user';
        
        // Trigger Toggle to set correct visibility
        toggleUserRoleFields();

        // Set value after toggle
        if(user.role === 'staff') {
             document.getElementById('modalUserDepartment').value = user.faculty;
        } else {
             document.getElementById('modalUserFaculty').value = user.faculty;
        }

        document.getElementById('modalUserPassword').value = ''; 
        
        deleteUserBtnInModal.style.display = 'block';
        deleteUserBtnInModal.onclick = () => {
            if(confirm('ยืนยันลบบัญชีนี้?')) {
               document.getElementById('userModal').style.display = 'none';
               confirmDeleteUser(user.id);
            }
        };
        document.getElementById('userModal').style.display = 'flex';
    }
    
    document.getElementById('addUserBtn').onclick = () => {
        document.getElementById('userForm').reset();
        document.getElementById('userId').value = '';
        document.getElementById('userModalTitle').textContent = 'เพิ่มผู้ใช้งานใหม่ (นักศึกษา)';
        document.getElementById('modalUserRole').value = 'user'; // Default
        toggleUserRoleFields();
        
        deleteUserBtnInModal.style.display = 'none';
        document.getElementById('userModal').style.display = 'flex';
    };
    // --- เพิ่มโค้ดส่วนนี้เข้าไปครับ ---
document.getElementById('addAdminBtn').onclick = () => {
    document.getElementById('userForm').reset();
    document.getElementById('userId').value = '';
    
    // ตั้งชื่อหัวข้อ Modal
    document.getElementById('userModalTitle').textContent = 'เพิ่มผู้ตรวจสอบรายการ (Checker)';
    
    // บังคับให้เลือก Role เป็น admin
    document.getElementById('modalUserRole').value = 'admin'; 
    
    // เรียกฟังก์ชันเพื่อซ่อนคณะ และแสดงช่องเลือกหน่วยงาน
    toggleUserRoleFields();

    deleteUserBtnInModal.style.display = 'none';
    document.getElementById('userModal').style.display = 'flex';
};

    // New Button for Adding Staff specifically
    document.getElementById('addStaffBtn').onclick = () => {
        document.getElementById('userForm').reset();
        document.getElementById('userId').value = '';
        document.getElementById('userModalTitle').textContent = 'เพิ่มผู้ใช้ระดับหน่วยงาน';
        document.getElementById('modalUserRole').value = 'staff'; // Set to Staff
        toggleUserRoleFields();

        deleteUserBtnInModal.style.display = 'none';
        document.getElementById('userModal').style.display = 'flex';
    };

    // [NEW] ปุ่มเพิ่มผู้บริหาร
document.getElementById('addExecBtn').onclick = () => {
    document.getElementById('userForm').reset();
    document.getElementById('userId').value = '';
    
    // ตั้งชื่อหัวข้อ Modal
    document.getElementById('userModalTitle').textContent = 'เพิ่มผู้บริหาร (Executive View)';
    
    // บังคับเลือก Role เป็น executive
    document.getElementById('modalUserRole').value = 'executive'; 
    
    // ปรับหน้าจอ input ให้เหมาะสม
    toggleUserRoleFields();

    // ซ่อนปุ่มลบ (เพราะเป็นการเพิ่มใหม่)
    const deleteBtn = document.getElementById('deleteUserBtnInModal');
    if(deleteBtn) deleteBtn.style.display = 'none';
    
    // แสดง Modal
    document.getElementById('userModal').style.display = 'flex';
};

document.getElementById('userForm').onsubmit = (e) => {
    e.preventDefault();
    
    const id = document.getElementById('userId').value;
    const role = document.getElementById('modalUserRole').value;
    
    // --- [จุดที่แก้ไข] กำหนดค่าสังกัดตามสิทธิ์ ---
    let facultyValue = 'ส่วนกลาง'; // ค่าเริ่มต้นสำหรับ Admin/Executive
    
    if (role === 'user') {
         // นักศึกษา -> ใช้ค่าจากช่องคณะ
         facultyValue = document.getElementById('modalUserFaculty').value;
    } 
    else if (role === 'staff') {
         // เจ้าหน้าที่ -> ใช้ค่าจากช่องหน่วยงาน และต้องตรวจสอบว่าเลือกหรือยัง
         facultyValue = document.getElementById('modalUserDepartment').value;
         if(!facultyValue) { 
             showAlert('กรุณาเลือกหน่วยงาน', 'warning'); 
             return; 
         }
    }
    // กรณี Admin หรือ Executive จะใช้ค่า 'ส่วนกลาง' ที่ตั้งไว้ตอนแรกอัตโนมัติ

    // เตรียม Object ข้อมูล
    const data = {
         gmail: document.getElementById('modalUserGmail').value, 
         prefix: document.getElementById('modalUserPrefix').value,
         firstName: document.getElementById('modalUserFirstName').value, 
         lastName: document.getElementById('modalUserLastName').value,
         studentId: document.getElementById('modalUserStudentId').value, 
         
         faculty: facultyValue, // ค่าที่กำหนดตามเงื่อนไขด้านบน
         
         phone: document.getElementById('modalUserPhone').value, 
         role: role
    };

    // ... โค้ดด้านบน ...
    const pw = document.getElementById('modalUserPassword').value.trim();
    if(pw !== '') data.password = pw;

    showLoading();
    
    const token = sessionStorage.getItem('sessionToken');

    const handler = google.script.run.withSuccessHandler(res => {
        hideLoading();
        if(res.success) { 
            document.getElementById('userModal').style.display = 'none'; 
            showAlert('บันทึกข้อมูลเรียบร้อย', 'success'); 
            loadUsersForAdmin(); 
        } else {
            showAlert(res.message, 'error');
        }
    }).withFailureHandler(err => {
        hideLoading();
        showAlert('เกิดข้อผิดพลาด: ' + err.message, 'error');
    });

    if(id) handler.updateUser(token, id, data); 
    else handler.createUser(token, data);
};

function confirmDeleteUser(id) {
        showLoading();
        // 🛡️ ดึง Token ออกมาก่อน
        const token = sessionStorage.getItem('sessionToken');

        google.script.run.withSuccessHandler(res => {
            hideLoading();
            if(res.success) { showAlert('ลบเรียบร้อย'); loadUsersForAdmin(); } 
            else showAlert(res.message, 'error');
        }).deleteUser(token, id); // 🛡️ ส่ง token นำหน้า id เสมอ
    }
    // --- Admin: Registrations ---
    let allRegistrationsCache = []; 
    let currentSelectedJobId = null;

function loadRegistrationsForAdmin() {
    showLoading();
    // Reset View
    document.getElementById('regMasterView').style.display = 'block';
    document.getElementById('regDetailView').style.display = 'none';

    google.script.run.withSuccessHandler(regs => {
        hideLoading();

        allRegistrationsCache = regs; 
        renderRegMasterTable(regs);
    })
   .withFailureHandler(err => { // เพิ่มตัวดัก Error ด้วย
        hideLoading();
        console.error("Server Error:", err);
        showAlert("เกิดข้อผิดพลาดในการดึงข้อมูล: " + err.message, 'error');
    })
    .getAllRegistrations(sessionStorage.getItem('sessionToken')); // 🛡️ แนบ Token
}

function renderRegMasterTable(regs) {
    const tbody = document.querySelector('#regMasterTable tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!regs || !Array.isArray(regs) || regs.length === 0) {
        document.getElementById('noRegMaster').style.display = 'block';
        document.getElementById('noRegMaster').innerText = "ไม่พบข้อมูลใบสมัครในระบบ";
        return;
    }

    document.getElementById('noRegMaster').style.display = 'none';
    let filteredRegs = regs;

    // กรองตามหน่วยงาน (Staff)
    if (currentUser && currentUser.role === 'staff') {
        const myAgency = String(currentUser.faculty || '').trim();
        filteredRegs = regs.filter(r => {
            const jobAgency = String(r.jobAgency || '').trim();
            return jobAgency === myAgency;
        });
    }

    if (filteredRegs.length === 0) {
        document.getElementById('noRegMaster').style.display = 'block';
        document.getElementById('noRegMaster').innerText = "ไม่พบรายการสมัครงานของหน่วยงานท่าน";
        return;
    }

    // จัดกลุ่มตามรหัสงาน
    const grouped = filteredRegs.reduce((acc, r) => {
        const actId = r.activityId || 'unknown'; 
        if (!acc[actId]) acc[actId] = [];
        acc[actId].push(r);
        return acc;
    }, {});

    // --- กรองตาม Tab อดีต/อนาคต ---
    const now = new Date();
    const todayTime = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(); // เที่ยงคืนวันนี้
    
    let displayGroups = [];

    Object.keys(grouped).forEach(activityId => {
        const group = grouped[activityId];
        const first = group[0];
        let jobDateObj = null;
        
        let dateStr = first.activityDate;
        if (dateStr) {
            // ถ้าเป็นงานเหมา (มี |) ให้เอาวันสุดท้ายมาเป็นเกณฑ์
            if (dateStr.includes('|')) dateStr = dateStr.split('|')[1]; 
            jobDateObj = parseDateString(dateStr); 
        }
        
        let includeGroup = true;
        if (currentRegJobFilter !== 'all' && jobDateObj) {
            const jobTime = new Date(jobDateObj.getFullYear(), jobDateObj.getMonth(), jobDateObj.getDate()).getTime();
            
            if (currentRegJobFilter === 'upcoming') {
                includeGroup = jobTime >= todayTime; // งานวันนี้ หรือ อนาคต
            } else if (currentRegJobFilter === 'past') {
                includeGroup = jobTime < todayTime;  // งานที่ผ่านไปแล้ว
            }
        }
        
        if(includeGroup) {
            displayGroups.push({ activityId, group, first, jobDateObj });
        }
    });

    // เรียงลำดับวันที่
    displayGroups.sort((a, b) => {
        const timeA = a.jobDateObj ? a.jobDateObj.getTime() : 0;
        const timeB = b.jobDateObj ? b.jobDateObj.getTime() : 0;
        // หากดูงานในอดีต ให้เอาอดีตที่เพิ่งผ่านไปขึ้นก่อน (มากไปน้อย)
        if (currentRegJobFilter === 'past') return timeB - timeA; 
        // หากดูงานอนาคต ให้เอางานใกล้สุดขึ้นก่อน (น้อยไปมาก)
        return timeA - timeB; 
    });

    if (displayGroups.length === 0) {
        document.getElementById('noRegMaster').style.display = 'block';
        document.getElementById('noRegMaster').innerText = "ไม่พบรายการในหมวดหมู่นี้";
        return;
    }

    displayGroups.forEach(item => {
        const { activityId, group, first } = item;
        const totalApplicants = group.length;
        const pendingCount = group.filter(r => r.status === 'pending').length; // คนที่ยังไม่ได้ตรวจ
        const row = tbody.insertRow();
        
        row.insertCell().innerHTML = `
            <strong>${first.jobTitle || 'ไม่ระบุชื่องาน'}</strong><br>
            <small style="color:gray">หน่วยงาน: ${first.jobAgency || '-'}</small>
        `;
        
        // จัดการวันที่แสดงผล (รองรับแบบเหมา)
        let dateDisplay = first.activityDate || '-';
        if (dateDisplay.includes('|')) {
            const parts = dateDisplay.split('|');
            dateDisplay = `${formatDate(parts[0])} - ${formatDate(parts[1])}`;
        } else {
            dateDisplay = formatDate(dateDisplay);
        }
        row.insertCell().innerHTML = `<div style="white-space: nowrap;">${dateDisplay}</div>`;
        
        // แจ้งเตือนถ้ายอดรอยืนยันมีเหลืออยู่
        let badgeHtml = `<span class="badge-count">${totalApplicants} คน</span>`;
        if(pendingCount > 0) {
            badgeHtml += `<div style="font-size:11px; color:#ff9800; margin-top:3px; font-weight:bold;">
                            <i class="material-icons" style="font-size:12px; vertical-align:middle;">error_outline</i> รอตรวจ ${pendingCount}
                          </div>`;
        }

        row.insertCell().innerHTML = `<div style="text-align:center;">${badgeHtml}</div>`;

        const actionCell = row.insertCell();
        actionCell.style.textAlign = 'center';

        const btn = document.createElement('button');
        btn.className = 'btn btn-primary';
        btn.innerHTML = '<i class="material-icons" style="vertical-align:middle; font-size:18px;">visibility</i> ดูผู้สมัคร';
        
        btn.onclick = () => openRegDetail(activityId, first.jobTitle, first.activityDate);

        actionCell.appendChild(btn);
    });
}

function openRegDetail(activityId, jobTitle, jobDate) {
    currentSelectedJobId = activityId;
    
    document.getElementById('detailJobTitle').textContent = jobTitle || 'ไม่ระบุชื่องาน';
    let dateDisplay = jobDate || '-';
    if (dateDisplay.includes('|')) {
        const parts = dateDisplay.split('|');
        dateDisplay = `${formatDate(parts[0])} - ${formatDate(parts[1])}`;
    } else {
        dateDisplay = formatDate(jobDate);
    }
    document.getElementById('detailJobDate').textContent = dateDisplay;

    const jobRegs = allRegistrationsCache.filter(r => String(r.activityId) === String(activityId));
    
    document.getElementById('countPending').textContent = jobRegs.filter(r => r.status === 'pending').length;
    document.getElementById('countConfirmed').textContent = jobRegs.filter(r => r.status === 'confirmed').length;
    document.getElementById('countCancelled').textContent = jobRegs.filter(r => r.status === 'cancelled').length;
    document.getElementById('regMasterView').style.display = 'none';
    document.getElementById('regDetailView').style.display = 'block';

    switchRegTab('pending'); 
}

function switchRegTab(status) {
    // จัดการปุ่ม Active
    document.querySelectorAll('#regDetailView .reg-tab-btn').forEach(btn => btn.classList.remove('active'));
    const btns = document.querySelectorAll('#regDetailView .reg-tab-btn');
    if(status === 'pending') btns[0].classList.add('active');
    if(status === 'confirmed') btns[1].classList.add('active');
    if(status === 'cancelled') btns[2].classList.add('active');

    // กรองข้อมูล
    const filteredData = allRegistrationsCache.filter(r => 
        String(r.activityId) === String(currentSelectedJobId) && r.status === status
    );

    const tbody = document.querySelector('#regDetailTable tbody');
    tbody.innerHTML = '';

    if (filteredData.length === 0) {
        document.getElementById('noRegDetail').style.display = 'block';
    } else {
        document.getElementById('noRegDetail').style.display = 'none';
        filteredData.forEach(r => {
            const row = tbody.insertRow();                  
            const displayName = r.studentName || r.userName || 'ไม่ระบุชื่อ';
            const displayId = r.studentId || r.userStudentId || '-';
            const displayPhone = r.phone || r.userPhone || '-';
            const displayFaculty = r.faculty || r.userFaculty || '-';

            row.insertCell().innerHTML = `<strong>${displayName}</strong><br><small style="color:#666">${displayId}</small>`;
            row.insertCell().textContent = r.timeSlot === 'morning' ? 'เช้า' : (r.timeSlot === 'afternoon' ? 'บ่าย' : 'เย็น');
            row.insertCell().innerHTML = `${displayPhone}<br><small>${displayFaculty}</small>`;
            
            let statusHtml = '';
            if(r.status === 'pending') statusHtml = '<span style="color:#ffc107; font-weight:bold;">รอพิจารณา</span>';
            if(r.status === 'confirmed') statusHtml = '<span style="color:#28a745; font-weight:bold;">รับแล้ว</span>';
            if(r.status === 'cancelled') statusHtml = '<span style="color:#dc3545; font-weight:bold;">ไม่ผ่าน</span>';
            row.insertCell().innerHTML = statusHtml;

            const actionCell = row.insertCell();
            actionCell.style.textAlign = 'center';
            const editBtn = document.createElement('button');
            editBtn.className = 'btn btn-info';
            editBtn.innerHTML = '<i class="material-icons" style="font-size:16px;">edit</i>';
            editBtn.style.padding = '5px 10px';
            editBtn.onclick = () => {
                document.getElementById('editRegId').value = r.id;
                document.getElementById('editRegUserName').value = displayName;
                document.getElementById('editRegJobInfo').value = `${r.jobTitle} (${r.timeSlot})`;
                document.getElementById('editRegStatus').value = r.status;
                document.getElementById('editRegistrationModal').style.display = 'flex';
            };
            actionCell.appendChild(editBtn);
        });
    }
}
function backToRegMaster() {
    document.getElementById('regDetailView').style.display = 'none';
    document.getElementById('regMasterView').style.display = 'block';
    currentSelectedJobId = null;
}


document.getElementById('editRegistrationForm').onsubmit = (e) => {
    e.preventDefault(); 
    
    const regId = document.getElementById('editRegId').value;
    const newStatus = document.getElementById('editRegStatus').value;

    showLoading();
    // 🛡️ ดึง Token ก่อนส่ง
    const token = sessionStorage.getItem('sessionToken');

    google.script.run.withSuccessHandler(res => {
        hideLoading(); 
        if(res.success) { 
            document.getElementById('editRegistrationModal').style.display = 'none'; 
            showAlert('อัปเดตสถานะเรียบร้อย');
            
            const regIndex = allRegistrationsCache.findIndex(r => r.id == regId);
            if(regIndex !== -1) {
                allRegistrationsCache[regIndex].status = newStatus;
            }

            const currentJobTitle = document.getElementById('detailJobTitle').textContent;
            const currentJobDate = document.getElementById('detailJobDate').textContent;
            
            openRegDetail(currentSelectedJobId, currentJobTitle, currentJobDate);
            switchRegTab(newStatus);

        } else {
            showAlert(res.message, 'error');
        }
    }).updateRegistration(token, regId, {status: newStatus}); // 🛡️ แนบ Token ตรงนี้
};

function loadDashboardOverview() {
    showLoading();
    
    let agencyParam = null;
    if (currentUser.role === 'staff' && sessionStorage.getItem('impersonate_mode') === 'true') {
        agencyParam = currentUser.faculty;
    }

    google.script.run.withSuccessHandler(res => {
        hideLoading();
        
        if (res.success && res.stats) {
            document.getElementById('statTotalAllocated').innerText = Number(res.stats.allocated || 0).toLocaleString();
            document.getElementById('statTotalUsed').innerText = Number(res.stats.used || 0).toLocaleString();
            document.getElementById('statTotalBalance').innerText = Number(res.stats.balance || 0).toLocaleString();
            
            const cardRed = document.getElementById('cardNotHiredContainer');
            const cardPurple = document.getElementById('cardEligibleContainer');
            if(cardRed) cardRed.style.display = 'flex'; 
            if(cardPurple) cardPurple.style.display = 'flex'; 

            document.getElementById('statNotHired').innerText = Number(res.stats.notHiredCount || 0).toLocaleString();
            if(document.getElementById('statEligibleCount')) {
                document.getElementById('statEligibleCount').innerText = Number(res.stats.eligibleCount || 0).toLocaleString();
            }

            const cardLocal = document.getElementById('cardHiredLocalContainer'); 
            const cardGlobal = document.getElementById('cardHiredGlobalContainer'); 
            const cardRegGlobal = document.getElementById('cardRegisteredGlobalContainer'); 

            if (currentUser.role === 'admin' || currentUser.role === 'executive') {
                cardGlobal.style.display = 'flex';
                cardLocal.style.display = 'none';
                
                if(cardRegGlobal) {
                    cardRegGlobal.style.display = 'flex';
                    document.getElementById('statRegisteredGlobal').innerText = Number(res.stats.totalRegisteredGlobal || 0).toLocaleString();
                }
                
                document.getElementById('statHiredGlobal').innerText = Number(res.stats.hiredCountGlobal || 0).toLocaleString();
                document.getElementById('dashTitle').innerHTML = '<i class="material-icons" style="vertical-align: bottom;">analytics</i> ภาพรวมงบประมาณ ปี 2569 (มหาวิทยาลัยอุบลราชธานี)';
                document.getElementById('dashSubtitle').innerText = 'ข้อมูลสรุปยอดรวมจากทุกหน่วยงานในระบบ';

            } else {
                cardGlobal.style.display = 'none';
                cardLocal.style.display = 'flex';
                
                if(cardRegGlobal) cardRegGlobal.style.display = 'none';
                
                document.getElementById('statHiredLocal').innerText = Number(res.stats.hiredCountLocal || 0).toLocaleString();
                document.getElementById('dashTitle').innerHTML = `<i class="material-icons" style="vertical-align: bottom;">analytics</i> ภาพรวมงบประมาณ (${currentUser.faculty})`;
                document.getElementById('dashSubtitle').innerText = 'ข้อมูลเฉพาะหน่วยงานของท่าน';
            }
        }
    }).getFinancialOverview(currentUser.id, agencyParam);
}

    function base64ToBlob(base64, mimeType) {
        const byteString = atob(base64); const arrayBuffer = new ArrayBuffer(byteString.length); const uint8Array = new Uint8Array(arrayBuffer);
        for (let i = 0; i < byteString.length; i++) uint8Array[i] = byteString.charCodeAt(i);
        return new Blob([arrayBuffer], { type: mimeType });
    }
    const handleDownload = (filterType) => {
        showLoading();
        const start = document.getElementById('downloadStartDate').value; const end = document.getElementById('downloadEndDate').value;
        google.script.run.withSuccessHandler(res => {
            hideLoading();
            if(res.success) {
                const blob = base64ToBlob(res.data, 'text/csv;charset=utf-8;');
                const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = res.filename; link.click();
            } else showAlert(res.message, 'error');
        }).downloadFilteredRegistrations(filterType, start, end, 'csv');
    };

    document.querySelectorAll('.close-button, .close-modal-btn').forEach(b => b.addEventListener('click', function() { this.closest('.modal').style.display='none';}));

    function populateAllocDept() {
        populateDepartments('allocDepartment');
    }
