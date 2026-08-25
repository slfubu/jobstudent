// --- ตัวแปรเก็บ Instance ของกราฟ (เพื่อทำลายก่อนสร้างใหม่) ---
let barChartInstance = null;
let pieChartInstance = null;

// --- 1. ตั้งค่าเมนู ---
setupNavClick('navExecReport', 'execReportSection', () => {
    loadExecChartData();
});

// --- 2. โหลดข้อมูลและวาดกราฟ ---
function loadExecChartData() {
    showLoading();
    google.script.run.withSuccessHandler(res => {
        hideLoading();
        if (res.success) {
            renderExecCharts(res.data);
        } else {
            showAlert('ไม่สามารถโหลดข้อมูลกราฟได้', 'error');
        }
    }).getExecutiveStats(); // เรียก Backend
}

// --- 3. ฟังก์ชันวาดกราฟ (ใช้ Chart.js) ---
function renderExecCharts(data) {
    // data = { labels: [...], allocated: [...], used: [...] }

    // --- กราฟที่ 1: Bar Chart (เปรียบเทียบ) ---
    const ctxBar = document.getElementById('deptBudgetChart').getContext('2d');
    
    // ทำลายกราฟเก่าถ้ามี (ป้องกันภาพซ้อน)
    if (barChartInstance) barChartInstance.destroy();

    barChartInstance = new Chart(ctxBar, {
        type: 'bar',
        data: {
            labels: data.labels, // ชื่อหน่วยงาน
            datasets: [
                {
                    label: 'งบได้รับจัดสรร',
                    data: data.allocated,
                    backgroundColor: 'rgba(54, 162, 235, 0.6)', // สีฟ้า
                    borderColor: 'rgba(54, 162, 235, 1)',
                    borderWidth: 1
                },
                {
                    label: 'เบิกจ่ายจริง',
                    data: data.used,
                    backgroundColor: 'rgba(255, 99, 132, 0.6)', // สีแดงอมชมพู
                    borderColor: 'rgba(255, 99, 132, 1)',
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) { return '฿' + value.toLocaleString(); } // ใส่หน่วยเงิน
                    }
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return context.dataset.label + ': ' + Number(context.raw).toLocaleString() + ' บาท';
                        }
                    }
                }
            }
        }
    });

    // --- กราฟที่ 2: Doughnut Chart (สัดส่วน) ---
    const ctxPie = document.getElementById('deptUsagePieChart').getContext('2d');
    if (pieChartInstance) pieChartInstance.destroy();

    pieChartInstance = new Chart(ctxPie, {
        type: 'doughnut',
        data: {
            labels: data.labels,
            datasets: [{
                data: data.used, // ใช้ข้อมูลการเบิกจ่ายจริง
                backgroundColor: [
                    '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', 
                    '#C9CBCF', '#E7E9ED', '#71B37C', '#E6B0AA', '#D7BDE2'
                ],
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right' },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const val = Number(context.raw);
                            const total = context.chart._metasets[context.datasetIndex].total;
                            const percentage = ((val / total) * 100).toFixed(1) + '%';
                            return context.label + ': ' + val.toLocaleString() + ' บาท (' + percentage + ')';
                        }
                    }
                }
            }
        }
    });
}
function confirmRevoke(studentId) {
    Swal.fire({
        title: 'ยืนยันการถอนสิทธิ์',
        text: `ต้องการลบสิทธิ์นักศึกษารหัส ${studentId} ใช่หรือไม่`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'ใช่ ถอนสิทธิ์',
        cancelButtonText: 'ยกเลิก'
    }).then((result) => {
        if (result.isConfirmed) {
            showLoading(); // แสดงหน้าจอโหลด
            
            // --- จุดเชื่อมต่อสำคัญ ---
            google.script.run
                .withSuccessHandler(res => {
                    hideLoading();
                    if(res.success) {
                        showAlert(res.message, 'success');
                        loadRegularEmployees(); // รีโหลดตารางใหม่เพื่ออัปเดตข้อมูลหน้าจอ
                    } else {
                        showAlert(res.message, 'error');
                    }
                })
                .withFailureHandler(err => {
                    hideLoading();
                    showAlert("ติดต่อ Server ไม่ได้: " + err, 'error');
                })
                .revokeRegularPermission(studentId); // ชื่อต้องตรงกับใน Code.gs
        }
    });
}
// =======================================================
// [START] IMPERSONATION LOGIC (แก้ไขใหม่ให้ทำงานจริง)
// =======================================================

let realAdminName = '';   // เก็บชื่อ Admin จริงๆ

// 1. ฟังก์ชันเปิด Popup เลือกสิทธิ์
function openImpersonateModal() {
  Swal.fire({
    allowOutsideClick: false,
    didOpen: () => {
      Swal.showLoading();
      google.script.run
        .withSuccessHandler(showRoleSelectionPopup)
        .withFailureHandler(err => Swal.fire('Error', err.message, 'error'))
        .getUnitListForImpersonation();
    }
  });
}

// 2. แสดง Popup (ปรับดีไซน์ใหม่)
function showRoleSelectionPopup(unitList) {
  let unitOptions = unitList.map(u => `<option value="${u.id}">${u.name}</option>`).join('');

  Swal.fire({
    title: '<h3 style="font-family:Sarabun; margin-bottom:5px;">เลือกรูปแบบการเข้าใช้งาน</h3><small style="color:#666; font-size:14px; font-weight:normal;">กรุณาเลือกสิทธิ์ที่ต้องการดำเนินการ</small>',
    width: '650px',
    html: `
      <div style="text-align: left; font-family: Sarabun;">
        
        <div class="role-grid">
            <div class="role-card active" data-role="admin" onclick="selectRoleCard('admin')">
                <i class="material-icons role-icon">admin_panel_settings</i>
                <div class="role-label">ส่วนตัว (Admin)</div>
            </div>
            <div class="role-card" data-role="unit" onclick="selectRoleCard('unit')">
                <i class="material-icons role-icon">business</i>
                <div class="role-label">แทนหน่วยงาน</div>
            </div>
            <div class="role-card" data-role="student" onclick="selectRoleCard('student')">
                <i class="material-icons role-icon">school</i>
                <div class="role-label">แทนนักศึกษา</div>
            </div>
        </div>

        <input type="hidden" id="selectedRoleValue" value="admin">

        <div id="dynamicInputArea" class="input-transition-box">
            
            <div id="unitInputGroup" style="display:none;">
                <label style="font-weight:bold; color:#059669; display:block; margin-bottom:5px;">เลือกหน่วยงานที่ต้องการ</label>
                <select id="imp-unit-select" class="swal2-input" style="width: 100%; margin: 0; font-size:16px;">
                    <option value="">-- กรุณาเลือกหน่วยงาน --</option>
                    ${unitOptions}
                </select>
            </div>

            <div id="studentInputGroup" style="display:none;">
                <label style="font-weight:bold; color:#d97706; display:block; margin-bottom:5px;">ระบุรหัสนักศึกษา</label>
                <input id="imp-student-id" class="swal2-input" placeholder="เช่น 66xxxxxxxx" style="width: 100%; margin: 0; font-size:16px;">
            </div>

        </div>

      </div>
    `,
    showCancelButton: true,
    confirmButtonText: 'เข้าสู่ระบบ',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#1e3a8a',
    didOpen: () => {
      // ฟังก์ชันจัดการการคลิกการ์ด (ทำงานภายใน Popup)
      window.selectRoleCard = (role) => {
          // 1. อัปเดต UI การ์ด
          document.querySelectorAll('.role-card').forEach(el => el.classList.remove('active'));
          document.querySelector(`.role-card[data-role="${role}"]`).classList.add('active');

          // 2. อัปเดตค่า Hidden Input
          document.getElementById('selectedRoleValue').value = role;

          // 3. จัดการพื้นที่ Input
          const inputArea = document.getElementById('dynamicInputArea');
          const unitGroup = document.getElementById('unitInputGroup');
          const studentGroup = document.getElementById('studentInputGroup');

          if (role === 'admin') {
              inputArea.style.display = 'none'; // ซ่อนกล่อง Input ทั้งหมด
          } else {
              inputArea.style.display = 'block'; // แสดงกล่อง
              
              if (role === 'unit') {
                  unitGroup.style.display = 'block';
                  studentGroup.style.display = 'none';
                  document.getElementById('imp-unit-select').focus();
              } else {
                  unitGroup.style.display = 'none';
                  studentGroup.style.display = 'block';
                  document.getElementById('imp-student-id').focus();
              }
          }
      };
    },
    preConfirm: () => {
      const mode = document.getElementById('selectedRoleValue').value;
      
      if (mode === 'unit') {
        const sel = document.getElementById('imp-unit-select');
        if (!sel.value) return Swal.showValidationMessage('กรุณาเลือกหน่วยงาน');
        // ส่งกลับข้อมูลหน่วยงาน
        return { mode: 'unit', targetId: sel.value, targetName: sel.value, info: { faculty: sel.value } };
      } 
      else if (mode === 'student') {
        const sid = document.getElementById('imp-student-id').value.trim();
        if (!sid) return Swal.showValidationMessage('กรุณากรอกรหัสนักศึกษา');
        
        // เช็คกับ Server ว่ามีนศ.คนนี้จริงไหม
        return new Promise((resolve) => {
           google.script.run.withSuccessHandler(res => {
               if(res.found){
                 resolve({ mode: 'student', targetId: res.realUserId, targetName: res.name, info: res.info });
               } else {
                 Swal.showValidationMessage('ไม่พบรหัสนักศึกษานี้ในระบบ');
                 resolve(false);
               }
             }).verifyStudentExist(sid);
        });
      }
      return { mode: 'admin' };
    }
  }).then((result) => {
    if (result.isConfirmed) {
      startImpersonation(result.value);
    }
  });
}

function startImpersonation(data) {
  if (data.mode === 'admin') return;

  // 🛡️ [SECURITY] ตรวจสอบก่อนว่าคนกดมีสิทธิ์จริงไหม (ต้องเป็น admin/exec)
  if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'executive')) {
      showAlert("คุณไม่มีสิทธิ์ใช้งานโหมดนี้", "error");
      return;
  }

  // 1. สำรองข้อมูล Admin ตัวจริงไว้
  sessionStorage.setItem('admin_backup', JSON.stringify(currentUser));
  sessionStorage.setItem('impersonate_mode', 'true');
  sessionStorage.setItem('impersonate_target_name', data.targetName);

  // 2. สร้าง User ปลอม (เป็นข้อมูลของเป้าหมาย 100%)
  let fakeUser = JSON.parse(JSON.stringify(currentUser)); 

  if (data.mode === 'unit') {
      fakeUser.role = 'staff';
      fakeUser.faculty = data.targetName; 
      fakeUser.firstName = data.targetName; 
      fakeUser.lastName = ''; 
      fakeUser.prefix = '';
  } 
  else if (data.mode === 'student') {
      fakeUser.role = 'user';
      fakeUser.id = data.targetId || (data.info && data.info.id) || '';
      fakeUser.studentId = (data.info && data.info.studentId) ? data.info.studentId : document.getElementById('imp-student-id').value;
      fakeUser.faculty = (data.info && data.info.faculty) ? data.info.faculty : '-';
      
      // ป้องกันปัญหา undefined: หากไม่มี firstName ส่งมา ให้ใช้ชื่อเต็มจาก targetName แทน
      fakeUser.firstName = (data.info && data.info.firstName) ? data.info.firstName : (data.targetName || ''); 
      fakeUser.lastName = (data.info && data.info.lastName) ? data.info.lastName : '';   
      fakeUser.prefix = (data.info && data.info.prefix) ? data.info.prefix : '';
      
      fakeUser.BankName = (data.info && data.info.BankName) ? data.info.BankName : '';
      fakeUser.PromptPay = (data.info && data.info.PromptPay) ? data.info.PromptPay : '';
  }

  // 3. เปลี่ยน currentUser เป็นข้อมูลเป้าหมาย
  currentUser = fakeUser;
  sessionStorage.setItem('currentUser', JSON.stringify(currentUser));

  forceRefreshSystem();
}

// 2. ออกจากการสวมสิทธิ์ (แก้ไขจุดนี้เพื่อแก้หน้าขาว)
function exitImpersonation() {
  showLoading();

  // 2.1 คืนร่าง Admin
  const adminBackup = sessionStorage.getItem('admin_backup');
  if (adminBackup) {
      currentUser = JSON.parse(adminBackup);
      sessionStorage.setItem('currentUser', adminBackup);
  }

  // 2.2 ล้างค่าขยะ
  sessionStorage.removeItem('admin_backup');
  sessionStorage.removeItem('impersonate_mode');
  sessionStorage.removeItem('impersonate_target_name');
  
  // 2.3 บังคับรีเฟรชระบบกลับสู่หน้า Admin
  setTimeout(() => {
      forceRefreshSystem(); // เรียกฟังก์ชันกลาง
      
      const Toast = Swal.mixin({
        toast: true, position: 'top-end', showConfirmButton: false, timer: 2000
      });
      Toast.fire({ icon: 'success', title: 'กลับสู่สิทธิ์ผู้ตรวจสอบรายการ' });

  }, 500); 
}

function forceRefreshSystem() {
    updateNavbar();

    if (typeof updateAdminButtonVisibility === 'function') {
        updateAdminButtonVisibility();
    }

    // [UPDATED] เพิ่ม || currentUser.role === 'executive' ลงไปในเงื่อนไขนี้
    if (currentUser.role === 'admin' || currentUser.role === 'staff' || currentUser.role === 'executive') {
        
        // พาไปหน้า Dashboard
        showSection('adminDashboardSection'); 
        loadDashboardOverview(); 
        
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        const navDash = document.getElementById('navDashboard');
        if(navDash) navDash.classList.add('active');

    } else {
        // กรณีเป็น User (นักศึกษา)
        showSection('userDashboardSection');
        updateUserDashboard();
        loadUserRegistrations();

        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        document.getElementById('navUserDashboard').classList.add('active');
    }
    
    hideLoading();
}

// ==========================================
// ฟังก์ชันรีเซ็ตระบบ (ใช้แทนการ Reload หน้าแก้จอขาว)
// ==========================================
function reInitializeSystem() {
    showLoading(); // บังหน้าจอไว้ก่อน

    // 1. โหลดข้อมูล User จริงจาก Session (User ที่ Login เข้ามาตอนแรก)
    const storedUser = sessionStorage.getItem('currentUser'); 
    
    // ดึงสถานะการสวมสิทธิ์
    const isImp = sessionStorage.getItem('impersonate_mode');
    const impUserStr = sessionStorage.getItem('impersonated_user');

    if (storedUser) {
        // คืนค่า currentUser ให้เป็นตัวจริงก่อน (Admin)
        currentUser = JSON.parse(storedUser); 

        // 2. เช็คว่าต้องแปลงร่างไหม?
        if (isImp === 'true' && impUserStr) {
            // --- กรณีสวมสิทธิ์ (แปลงร่าง) ---
            currentUser = JSON.parse(impUserStr); // ทับด้วยข้อมูลปลอม
            
            // แสดงแถบส้ม
            document.getElementById('impersonation-bar').style.display = 'block';
            document.getElementById('imp-target-name').innerText = sessionStorage.getItem('impersonate_target_name');
            
            // ปุ่ม Admin Tools ยังต้องอยู่ เพื่อให้กดออกได้
            document.getElementById('admin-tools-btn').style.display = 'block';
        } else {
            // --- กรณีปกติ / หรือกดออกจากสวมสิทธิ์แล้ว (กลับเป็น Admin) ---
            
            // ซ่อนแถบส้ม
            document.getElementById('impersonation-bar').style.display = 'none';
            
            // เช็คว่าเป็น Admin จริงไหม เพื่อโชว์ปุ่มเครื่องมือ
            if (currentUser.role === 'admin') {
                document.getElementById('admin-tools-btn').style.display = 'block';
                // คืนค่าชื่อจริง Admin (เผื่อถูกเปลี่ยนไปตอนสวมสิทธิ์)
                realAdminName = currentUser.firstName; 
            } else {
                document.getElementById('admin-tools-btn').style.display = 'none';
            }
        }

        // 3. อัปเดตเมนู (Navbar) ให้ตรงกับ Role ปัจจุบัน
        updateNavbar();

        // 4. พาไปหน้าแรกของ Role นั้นๆ
        if (currentUser.role === 'admin' || currentUser.role === 'staff') {
            // บังคับโหลด Dashboard ใหม่ (ข้อมูลจะเปลี่ยนไปตาม Role/Unit ทันที)
            loadDashboardOverview(); 
            showSection('adminDashboardSection');
            
            // ปรับ Active Menu
            document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
            document.getElementById('navDashboard').classList.add('active');
        } else {
            // บังคับโหลด User Dashboard ใหม่
            updateUserDashboard();
            loadUserRegistrations();
            showSection('userDashboardSection');
            
            // ปรับ Active Menu
            document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
            document.getElementById('navUserDashboard').classList.add('active');
        }
        
        // ปิด Loading
        setTimeout(() => { hideLoading(); }, 500); 
    } else {
        // ถ้าไม่มีข้อมูล Session ให้กลับไป Login
        hideLoading();
        showSection('loginSection');
    }
}


// =======================================================
// [BLOCK: ปุ่ม Admin Tools] เช็คการแสดงผลปุ่ม
// =======================================================
function updateAdminButtonVisibility() {
    const btn = document.getElementById('admin-tools-btn');
    if (!btn) return;

    // เงื่อนไข 1: เป็น Admin จริงๆ
    const isAdmin = currentUser && currentUser.role === 'admin';
    
    // เงื่อนไข 2: กำลังสวมสิทธิ์อยู่ (ต้องโชว์ปุ่มเพื่อให้กดออกได้ แม้จะเป็น role student)
    const isImpersonating = sessionStorage.getItem('impersonate_mode') === 'true';

    // แสดงปุ่มถ้าเข้าเกณฑ์ข้อใดข้อหนึ่ง
    if (isAdmin || isImpersonating) {
        btn.style.display = 'block';
    } else {
        btn.style.display = 'none';
    }
}

function showSecurityNotice(callback) {
  Swal.fire({
    title: '<h2 style="font-family:Sarabun; margin-bottom:5px; color:#1e3a8a;">ความปลอดภัยและการใช้งานระบบ</h2>',
    html: `
      <div style="text-align: left; font-family: Sarabun; font-size: 16px; line-height: 1.6; color:#333; padding: 0 10px;">
        <p style="margin-bottom: 15px;">
          เพื่อความปลอดภัยในการให้บริการและการตรวจสอบการใช้งาน ระบบมีการจัดเก็บข้อมูลประวัติการใช้งานและข้อมูลจราจรทางอินเทอร์เน็ต (Internet Traffic Log) ของผู้ใช้งานทุกท่าน ตามมาตรฐานด้านความมั่นคงปลอดภัยของข้อมูล และเป็นไปตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562
          ผู้ใช้งานโปรดใช้ระบบด้วยความระมัดระวัง การเข้าถึงหรือการนำข้อมูลของผู้อื่นไปใช้งานโดยมิชอบถือเป็นความผิดตามกฎหมาย และโปรดหลีกเลี่ยงการเปิดเผยข้อมูลส่วนบุคคลหรือข้อมูลสำคัญแก่บุคคลอื่นโดยไม่จำเป็น
        </p>
        <p style="color: #d32f2f; font-weight: 500;">
หากพบความผิดปกติหรือสงสัยว่ามีการเข้าถึงข้อมูลโดยไม่ได้รับอนุญาต โปรดแจ้งผู้ดูแลระบบทันที โทร.092-4058084 (ฝ่าย support ให้บริการทุกวัน 09:30-20:00 น.)
        </p>
      </div>
    `,
    icon: 'info',
    width: '600px',
    allowOutsideClick: false, 
    allowEscapeKey: false,    
    confirmButtonText: '<i class="material-icons" style="vertical-align:middle;">check_circle</i> รับทราบและตกลง',
    confirmButtonColor: '#1e3a8a', 
    customClass: {
      popup: 'swal-wide-popup' 
    }
  }).then((result) => {
    if (result.isConfirmed) {
      if (callback) callback(); // ทำงานต่อเมื่อกดตกลง
    }
  });
}
// [Block 4] JavaScript สำหรับดึงข้อมูลและสั่งพิมพ์

let currentVerifyDataCache = null; // เก็บข้อมูล Profile

// 1. ฟังก์ชันค้นหา (ปรับปรุงให้เก็บ Cache)
function doVerifySearch() {
    const id = document.getElementById('verifyInputId').value.trim();
    if(!id) { showAlert('กรุณาระบุรหัสนักศึกษา', 'warning'); return; }

    showLoading();
    google.script.run.withSuccessHandler(res => {
        hideLoading();
        const resultArea = document.getElementById('verifyResultArea');
        const notFoundMsg = document.getElementById('vfNotFound');

        if (res.success && res.data) {
            const d = res.data;
            currentVerifyDataCache = d; // เก็บข้อมูลไว้ใช้พิมพ์

            if(notFoundMsg) notFoundMsg.style.display = 'none';
            resultArea.style.display = 'block';

            // แสดงผลหน้าจอ (เหมือนเดิม)
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
            currentVerifyDataCache = null;
            resultArea.style.display = 'none';
            if(notFoundMsg) notFoundMsg.style.display = 'block';
            showAlert('ไม่พบข้อมูลนักศึกษารหัสนี้', 'error');
        }
    }).getStudentDetailsBySheet(id);
}

function prepareAndPrintProfile() {
    if (!currentVerifyDataCache) {
        showAlert('กรุณาค้นหาข้อมูลนักศึกษาก่อน', 'warning');
        return;
    }

    const d = currentVerifyDataCache;
    showLoading();
    
    // 🛡️ ดึง Token จากระบบ
    const token = sessionStorage.getItem('sessionToken');

    // เรียกดึงประวัติการทำงานของนักศึกษาคนนี้
    google.script.run.withSuccessHandler(resHistory => {
        hideLoading();
        
        // กรอกข้อมูลส่วนตัว
        document.getElementById('ppStudentId').textContent = d.studentId || '-';
        document.getElementById('ppName').textContent = d.fullName || '-';
        document.getElementById('ppFaculty').textContent = d.faculty || '-';
        document.getElementById('ppMajor').textContent = d.major || '-';
        document.getElementById('ppGpax').textContent = d.gpax || '-';
        document.getElementById('ppLoan').textContent = d.loan || '-';
        document.getElementById('ppScholar').textContent = d.scholarship || '-';
        document.getElementById('ppSkills').textContent = d.skills || '-';
        document.getElementById('ppJobType').textContent = d.jobType || '-';
        document.getElementById('ppReason').textContent = d.reason || '-';
        document.getElementById('ppPhone').textContent = d.mobile || '-';
        document.getElementById('ppEmail').textContent = d.email || '-';

        // วันที่พิมพ์ไทย
        const now = new Date();
        const months = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
        document.getElementById('ppPrintDate').textContent = `${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()+543}`;

        // สร้างตารางประวัติการทำงาน
        const tbody = document.getElementById('ppHistoryTableBody');
        tbody.innerHTML = ''; 

        let historyList = [];
        if (resHistory && resHistory.success && resHistory.data && resHistory.data.history) {
            historyList = resHistory.data.history;
        }

        if (historyList.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px; border: 1px solid #000;">- ไม่มีประวัติการทำงาน -</td></tr>`;
        } else {
            historyList.forEach((item, index) => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td style="text-align:center; border:1px solid #000;">${index + 1}</td>
                    <td style="text-align:center; border:1px solid #000;">${item.workDate || '-'}</td>
                    <td style="border:1px solid #000; padding-left:10px;">${item.jobTitle || item.title || '-'}</td>
                    <td style="text-align:center; border:1px solid #000;">${item.department || item.jobAgency || '-'}</td>
                    <td style="text-align:right; padding-right:10px; border:1px solid #000;">${Number(item.amount).toLocaleString()}</td>
                `;
                tbody.appendChild(tr);
            });
        }

        // สั่งพิมพ์
        document.body.classList.add('print-mode-profile');
        window.print();
        document.body.classList.remove('print-mode-profile');

    }).withFailureHandler(err => {
        hideLoading();
        showAlert(err.message, 'error');
    }).getStudentPaymentHistoryAdmin(token, d.studentId); // 🛡️ แนบ Token
}
// --- Document Repository Variables ---
let allDocumentsCache = [];

// 1. Setup Navigation สำหรับหน้าจัดเก็บเอกสาร
setupNavClick('navDocumentRepo', 'documentRepoSection', () => {
    // เปลี่ยนมาใช้ฟังก์ชันที่ยุบรวมแล้วแทน
    populateMergedDepartments('docDeptFilter');
    populateMergedDepartments('docOwnerDept');
    // โหลดข้อมูลเอกสาร
    loadDocuments();
});

// --- Document Repository Logic (ฉบับแก้ไข V2) ---

// 1. ฟังก์ชันโหลดข้อมูล (เรียก V2)
function loadDocuments() {
    showLoading();
    
    google.script.run.withSuccessHandler(data => {
        hideLoading();
        // ถ้าได้ข้อมูลมาว่างเปล่า
        if (!data || data.length === 0) {
            allDocumentsCache = [];
            renderDocumentTable([]);
            return;
        }

        // เก็บลงตัวแปรและแสดงผล
        allDocumentsCache = data; 
        renderDocumentTable(data); 
        
    }).withFailureHandler(err => {
        hideLoading();
        // ถ้า Error ให้แจ้งเตือน
        showAlert('โหลดข้อมูลไม่สำเร็จ: ' + err.message, 'error');
    }).getAllDocumentsV2(); // <--- เรียกฟังก์ชันชื่อใหม่
}

// 2. ฟังก์ชันแสดงตาราง (ฉบับแก้ไข: เรียก formatDate ทันทีเพื่อแก้ปัญหาวันที่)
function renderDocumentTable(docs) {
    const tbody = document.querySelector('#documentTable tbody');
    const noData = document.getElementById('noDocData');
    const pagination = document.getElementById('docPagination'); // เพิ่มการจัดการ Pagination

    tbody.innerHTML = '';

    // กรณีไม่มีข้อมูล
    if (!docs || docs.length === 0) {
        if(noData) noData.style.display = 'block';
        if(pagination) pagination.style.display = 'none';
        return;
    }
    
    if(noData) noData.style.display = 'none';
    if(pagination) pagination.style.display = 'flex';

    // วนลูปแสดงข้อมูล
    docs.forEach(doc => {
        const tr = document.createElement('tr');
        
        // ปุ่มดูไฟล์ (ถ้ามี URL)
        const viewBtn = doc.fileUrl ? 
            `<a href="${doc.fileUrl}" target="_blank" class="btn btn-info" style="padding: 4px 8px; font-size: 12px; text-decoration: none; color: white;">
                <i class="material-icons" style="font-size: 14px; vertical-align: middle;">visibility</i> ดูไฟล์
             </a>` : '-';
        
        // ปุ่มลบ
        const deleteBtn = `<button class="btn btn-danger" onclick="deleteDocument('${doc.id}', '${doc.fileName || 'เอกสาร'}')" style="padding: 4px 8px; font-size: 12px; margin-left: 5px;">
                                <i class="material-icons" style="font-size: 14px;">delete</i>
                           </button>`;

        // +++++ [จุดสำคัญ] เรียกใช้ formatDate ทันที +++++
        // ไม่ต้องมี if(...) เพื่อให้ฟังก์ชัน formatDate ตัวใหม่ทำงานกับทุกรูปแบบ (รวมถึง 10/1/2026)
        let createdShow = formatDate(doc.createdAt); 
        let dateShow = formatDate(doc.bookDate); 
        // ++++++++++++++++++++++++++++++++++++++++++

        tr.innerHTML = `
            <td style="text-align:center;">${createdShow}</td>
            <td>${doc.bookNo || '-'}</td>
            <td>
                <div style="font-weight:600; color:#333;">${doc.subject || '-'}</div>
                <small style="color:#777;">ลงวันที่: ${dateShow}</small>
            </td>
            <td>${doc.department || '-'}</td>
            <td><span class="vf-badge" style="background:#f0f0f0;">${doc.category || '-'}</span></td>
            <td style="text-align: center;">${viewBtn}</td>
            <td style="text-align: center;">${deleteBtn}</td>
        `;
        tbody.appendChild(tr);
    });

    // เรียกสร้างปุ่มแบ่งหน้า (ถ้าใช้งานระบบ Pagination แบบ Client-side)
    // ถ้าคุณใช้ renderDocumentTableWithPagination ในฟังก์ชันอื่น โค้ดส่วนนี้อาจซ้ำซ้อน 
    // แต่ถ้าใช้ renderDocumentTable เป็นหลัก ควรใส่ไว้ครับ
    if (typeof renderDocPaginationButtons === 'function') {
         // หมายเหตุ: ปกติถ้าใช้ Pagination เราจะส่ง docs ที่ slice มาแล้ว
         // แต่ถ้าฟังก์ชันนี้รับ docs ทั้งหมด อาจต้องปรับ logic การเรียก renderDocPaginationButtons อีกที
         // ตาม Logic เดิมที่คุณเคยให้มา ฟังก์ชันนี้รับ docs ที่ slice มาแล้ว หรือรับทั้งหมด ขึ้นอยู่กับ flow
    }
}

// 4. ฟังก์ชันกรองข้อมูล (Search Filter)
function filterDocuments() {
    const search = document.getElementById('docSearchInput').value.toLowerCase();
    const dept = document.getElementById('docDeptFilter').value;
    const type = document.getElementById('docTypeFilter').value;

    const filtered = allDocumentsCache.filter(doc => {
        const matchSearch = (doc.bookNo + doc.subject).toLowerCase().includes(search);
        const matchDept = dept === "" || doc.department === dept;
        const matchType = type === "" || doc.category === type;
        return matchSearch && matchDept && matchType;
    });

    renderDocumentTable(filtered);
}

// 5. เปิด Modal เพิ่มเอกสาร
function openAddDocumentModal() {
    document.getElementById('addDocumentForm').reset();
    
    // ตั้งค่าวันที่เริ่มต้นเป็น "วันนี้"
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    document.getElementById('docBookDate').value = `${yyyy}-${mm}-${dd}`;
    
    // ตั้งค่าหน่วยงานเริ่มต้นถ้าเป็น Staff (ระบบจะแปลงชื่องานย่อยเป็น 'งานสวัสดิการนักศึกษา' ให้อัตโนมัติ)
    if(currentUser.role === 'staff') {
        const mappedAgency = getOfficialAgencyName(currentUser.faculty);
        document.getElementById('docOwnerDept').value = mappedAgency;
    }
    
    document.getElementById('addDocumentModal').style.display = 'flex';
}

// 6. ส่วนควบคุมการส่งฟอร์มบันทึกเอกสาร
document.getElementById('addDocumentForm').addEventListener('submit', function(e) {
    e.preventDefault();

    const fileInput = document.getElementById('docFile');
    if (fileInput.files.length === 0) {
        showAlert('กรุณาเลือกไฟล์เอกสาร', 'warning');
        return;
    }

    const file = fileInput.files[0];
    const maxMB = 15; // กำหนดเพดานไฟล์ที่ 15MB สำหรับ GAS
    if (file.size > maxMB * 1024 * 1024) {
        showAlert(`ไฟล์มีขนาดใหญ่เกินไป (จำกัดไม่เกิน ${maxMB}MB)`, 'error');
        return;
    }

    showLoading(); 

    const reader = new FileReader();
    reader.onload = function(e) {
        // เตรียมข้อมูลส่งไป Server
        const payload = {
            bookNo: document.getElementById('docBookNo').value,
            bookDate: document.getElementById('docBookDate').value,
            subject: document.getElementById('docSubject').value,
            department: document.getElementById('docOwnerDept').value,
            category: document.getElementById('docCategory').value,
            fileName: file.name,
            mimeType: file.type,
            fileContent: e.target.result, // ส่งก้อน Base64 ทั้งก้อนไป (Backend จะจัดการตัดหัวเอง)
            uploader: currentUser.firstName 
        };

        // 🛡️ ดึง Token จากระบบ (sessionStorage)
        const token = sessionStorage.getItem('sessionToken');

        if (!token) {
            hideLoading();
            showAlert('ไม่พบเซสชั่นการใช้งาน กรุณา Login ใหม่', 'error');
            return;
        }

        // เรียกฟังก์ชัน Server โดยส่ง Token เป็นตัวแรก
        google.script.run
            .withSuccessHandler(res => {
                hideLoading();
                if (res.success) {
                    document.getElementById('addDocumentModal').style.display = 'none';
                    showAlert(res.message, 'success');
                    loadDocuments(); // รีโหลดตาราง
                } else {
                    showAlert(res.message, 'error');
                }
            })
            .withFailureHandler(err => {
                hideLoading();
                showAlert('การเชื่อมต่อล้มเหลว: ' + err, 'error');
            })
            .saveDocumentWithFile(token, payload); // 🛡️ ส่ง 2 ค่าตามลำดับ
    };
    
    reader.readAsDataURL(file);
});

// 7. ลบเอกสาร
function deleteDocument(docId, fileName) {
    Swal.fire({
        title: 'ยืนยันการลบ',
        text: `ต้องการลบเอกสาร "${fileName}" ใช่หรือไม่`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'ลบ',
        cancelButtonText: 'ยกเลิก'
    }).then((result) => {
        if (result.isConfirmed) {
            showLoading();
            google.script.run.withSuccessHandler(res => {
                hideLoading();
                if(res.success) {
                    showAlert('ลบเรียบร้อย', 'success');
                    loadDocuments();
                } else {
                    showAlert('เกิดข้อผิดพลาด', 'error');
                }
            }).deleteDocument(docId); // *ต้องมีฟังก์ชันนี้ใน Code.gs
        }
    });
}
// --- Document Pagination Variables ---
let currentDocPage = 1;
let docRowsPerPage = 10;
let filteredDocsCache = []; // เก็บผลลัพธ์การค้นหาเพื่อแบ่งหน้า

// 1. ฟังก์ชันเปลี่ยนจำนวนแถว
function changeDocRowsPerPage() {
    docRowsPerPage = parseInt(document.getElementById('docRowsPerPage').value);
    currentDocPage = 1;
    renderDocumentTableWithPagination();
}

// 2. ปรับปรุงฟังก์ชัน Filter ให้ฉลาดขึ้น (มองเห็นงานย่อยเป็นงานหลัก)
function filterDocuments() {
    const search = document.getElementById('docSearchInput').value.toLowerCase();
    const dept = document.getElementById('docDeptFilter').value; // จะได้ค่า "งานสวัสดิการนักศึกษา"
    const type = document.getElementById('docTypeFilter').value;

    filteredDocsCache = allDocumentsCache.filter(doc => {
        // แปลงชื่อหน่วยงานของเอกสารเก่าที่เป็นงานย่อย ให้เป็นชื่องานหลักก่อนตรวจสอบ
        let docDeptMapped = getOfficialAgencyName(doc.department || '');

        const matchSearch = (doc.bookNo + doc.subject).toLowerCase().includes(search);
        // เช็คกับชื่อที่ถูกแปลงแล้ว
        const matchDept = dept === "" || docDeptMapped === dept; 
        const matchType = type === "" || doc.category === type;
        
        return matchSearch && matchDept && matchType;
    });

    currentDocPage = 1;
    renderDocumentTableWithPagination();
}

// 3. ฟังก์ชันวาดตารางแบบมีแบ่งหน้า (พร้อมรันเลขลำดับจากท้ายมาบน / มากไปน้อย)
function renderDocumentTableWithPagination() {
    const docs = filteredDocsCache; 
    const tbody = document.querySelector('#documentTable tbody');
    const noData = document.getElementById('noDocData');
    const pagination = document.getElementById('docPagination');

    tbody.innerHTML = '';

    if (!docs || docs.length === 0) {
        if(noData) noData.style.display = 'block';
        if(pagination) pagination.style.display = 'none';
        return;
    }
    
    if(noData) noData.style.display = 'none';
    if(pagination) pagination.style.display = 'flex';

    // --- Logic แบ่งหน้า ---
    const start = (currentDocPage - 1) * docRowsPerPage;
    const end = start + docRowsPerPage;
    const displayedDocs = docs.slice(start, end);

    // วาดแถว พร้อมคำนวณเลขลำดับ
    displayedDocs.forEach((doc, index) => {
        const tr = document.createElement('tr');
        
        // ⭐️ จุดที่แก้ไข: คำนวณเลขลำดับจากท้ายมาบน (เอาจำนวนทั้งหมดตั้ง ลบด้วย ลำดับของแถวนั้น)
        // เช่น มีเอกสาร 50 ชิ้น แถวแรกจะได้ 50 - (0 + 0) = 50, แถวที่สองได้ 50 - (0 + 1) = 49
        const seqNo = docs.length - (start + index); 

        const viewBtn = doc.fileUrl ? 
            `<a href="${doc.fileUrl}" target="_blank" class="btn btn-info" style="padding: 4px 8px; font-size: 12px; text-decoration: none; color: white;">
                <i class="material-icons" style="font-size: 14px; vertical-align: middle;">visibility</i> ดูไฟล์
             </a>` : '-';
        
        const deleteBtn = `<button class="btn btn-danger" onclick="deleteDocument('${doc.id}', '${doc.fileName || 'เอกสาร'}')" style="padding: 4px 8px; font-size: 12px; margin-left: 5px;">
                                <i class="material-icons" style="font-size: 14px;">delete</i>
                           </button>`;

        let dateShow = doc.bookDate ? String(doc.bookDate).split('T')[0] : '-';
        let createdShow = doc.createdAt ? String(doc.createdAt).split('T')[0] : '-';

        // แปลงชื่อในตารางให้แสดงเป็น "งานสวัสดิการนักศึกษา" เสมอ แม้เอกสารเก่าจะใช้ชื่อย่อย
        let displayDept = getOfficialAgencyName(doc.department || '-');

        // ใส่เลขลำดับ <td>${seqNo}</td> ลงไปในแถวแรก
        tr.innerHTML = `
            <td style="text-align:center; font-weight:bold; color:#555;">${seqNo}</td>
            <td style="text-align:center;">${formatDate(createdShow)}</td>
            <td>${doc.bookNo || '-'}</td>
            <td>
                <div style="font-weight:600; color:#333;">${doc.subject || '-'}</div>
                <small style="color:#777;">ลงวันที่: ${formatDate(dateShow)}</small>
            </td>
            <td>${displayDept}</td>
            <td><span class="vf-badge" style="background:#f0f0f0;">${doc.category || '-'}</span></td>
            <td style="text-align: center;">${viewBtn}</td>
            <td style="text-align: center;">${deleteBtn}</td>
        `;
        tbody.appendChild(tr);
    });

    // เรียกสร้างปุ่มเปลี่ยนหน้า
    renderDocPaginationButtons(docs.length);
}

// 4. สร้างปุ่มเปลี่ยนหน้า (คล้าย User Pagination)
function renderDocPaginationButtons(totalItems) {
    const totalPages = Math.ceil(totalItems / docRowsPerPage);
    const container = document.getElementById('docPageButtons');
    const info = document.getElementById('docPageInfo');
    
    container.innerHTML = '';
    info.textContent = `หน้า ${currentDocPage} / ${totalPages} (รวม ${totalItems} รายการ)`;

    // ปุ่มย้อนกลับ
    const prevBtn = document.createElement('button');
    prevBtn.className = 'page-btn';
    prevBtn.innerHTML = '<i class="material-icons" style="font-size:14px; vertical-align:middle;">chevron_left</i>';
    prevBtn.disabled = currentDocPage === 1;
    prevBtn.onclick = () => { currentDocPage--; renderDocumentTableWithPagination(); };
    container.appendChild(prevBtn);

    // ปุ่มตัวเลข (แสดงแบบย่อ ถ้าหน้าเยอะ)
    const createPageBtn = (i) => {
        const btn = document.createElement('button');
        btn.className = `page-btn ${i === currentDocPage ? 'active' : ''}`;
        btn.textContent = i;
        btn.onclick = () => { currentDocPage = i; renderDocumentTableWithPagination(); };
        container.appendChild(btn);
    };

    if (totalPages <= 7) {
        for (let i = 1; i <= totalPages; i++) createPageBtn(i);
    } else {
        // Logic ย่อหน้าแบบ ... (1 2 ... 5 ... 10)
        createPageBtn(1);
        if (currentDocPage > 3) container.appendChild(document.createTextNode('...'));
        
        let start = Math.max(2, currentDocPage - 1);
        let end = Math.min(totalPages - 1, currentDocPage + 1);
        
        for (let i = start; i <= end; i++) createPageBtn(i);
        
        if (currentDocPage < totalPages - 2) container.appendChild(document.createTextNode('...'));
        createPageBtn(totalPages);
    }

    const nextBtn = document.createElement('button');
    nextBtn.className = 'page-btn';
    nextBtn.innerHTML = '<i class="material-icons" style="font-size:14px; vertical-align:middle;">chevron_right</i>';
    nextBtn.disabled = currentDocPage === totalPages || totalPages === 0;
    nextBtn.onclick = () => { currentDocPage++; renderDocumentTableWithPagination(); };
    container.appendChild(nextBtn);
}

function loadDocuments() {
    showLoading();
    google.script.run.withSuccessHandler(data => {
        hideLoading();
        if (!data || data.length === 0) {
            allDocumentsCache = [];
            filteredDocsCache = [];
            renderDocumentTableWithPagination();
            return;
        }
        allDocumentsCache = data;
        // เรียงลำดับจากใหม่ไปเก่า
        allDocumentsCache.sort((a, b) => {
            const dA = a.createdAt ? new Date(a.createdAt) : new Date(0);
            const dB = b.createdAt ? new Date(b.createdAt) : new Date(0);
            return dB - dA;
        });

        filterDocuments(); // เรียก Filter เพื่อเริ่มวาดตารางหน้า 1
    }).withFailureHandler(err => {
        hideLoading();
        showAlert('โหลดไม่สำเร็จ: ' + err.message, 'error');
    }).getAllDocumentsV2();
}
// ฟังก์ชันเมื่อกดปุ่ม "ตรวจสอบ" (ใน index.html)
document.getElementById('eligibilityForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const studentId = document.getElementById('checkEligibleId').value.trim();
    
    if(!studentId) return;

    showLoading();

    google.script.run.withSuccessHandler(res => {
        hideLoading();
        if (res.allowed) {
            Swal.fire({
                icon: 'success',
                title: 'ยืนยันสิทธิ์สำเร็จ',
                text: 'ท่านมีสิทธิ์ลงทะเบียนใช้งานระบบ',
                timer: 1500,
                showConfirmButton: false
            }).then(() => {
                showSection('signupSection');
                
                // 1. รหัสนักศึกษา (ยังคงดึงมาและล็อกไว้ เพื่อความถูกต้อง)
                document.getElementById('signupStudentId').value = studentId;
                document.getElementById('signupStudentId').readOnly = true; 
                document.getElementById('signupStudentId').style.backgroundColor = "#e9ecef";

                // 2. ส่วนข้อมูลอื่นๆ
                if (res.data) {
                    // คำนำหน้า (ถ้าต้องการให้เลือกเอง ก็ลบบรรทัดนี้ออกครับ)
                    if(res.data.prefix) document.getElementById('signupPrefix').value = res.data.prefix;

                    // --- [จุดที่แก้ไข] ไม่ต้องดึงชื่อ-สกุล มาใส่ (ปล่อยให้ User พิมพ์เอง) ---
                    // document.getElementById('signupFirstName').value = res.data.firstName;  <-- คอมเมนต์ออกหรือลบ
                    // document.getElementById('signupLastName').value = res.data.lastName;    <-- คอมเมนต์ออกหรือลบ
                    
                    // สั่งเคลียร์ค่าให้ว่าง (เผื่อมีค่าตกค้าง)
                    document.getElementById('signupFirstName').value = '';
                    document.getElementById('signupLastName').value = '';

                    // คณะ (ถ้าข้อมูลคณะถูกต้อง แนะนำให้คงไว้ครับ แต่ถ้าผิดก็ลบออกได้เช่นกัน)
                    if(res.data.faculty) document.getElementById('signupFaculty').value = res.data.faculty;
                }
            });
        } else {
            Swal.fire({
                icon: 'error',
                title: 'ไม่สามารถลงทะเบียนได้',
                text: res.message,
                confirmButtonColor: '#d33'
            });
        }
    }).withFailureHandler(err => {
        hideLoading();
        showAlert('เกิดข้อผิดพลาด: ' + err.message, 'error');
    }).checkStudentEligibilityForSignup(studentId);
});
setupNavClick('navFeedback', 'feedbackSection', () => {
    document.getElementById('feedbackForm').reset();
});

setupNavClick('navFeedbackReport', 'feedbackReportSection', () => {
    loadFeedbackReport();
    checkAdminFeedbackToggleStatus(); // ดึงสถานะปุ่มเปิด-ปิดมาโชว์แอดมิน
});
// ส่งข้อมูลประเมิน
document.getElementById('feedbackForm').addEventListener('submit', (e) => {
    e.preventDefault();
    
    // เช็คว่าตอบครบหรือยัง
    for(let i=1; i<=10; i++) {
        if (!document.querySelector(`input[name="q${i}"]:checked`)) {
            showAlert(`กรุณาให้คะแนนในข้อที่ ${i} ด้วยครับ`, 'warning');
            return;
        }
    }

    const data = {
        userId: currentUser.id,
        userName: `${currentUser.prefix}${currentUser.firstName} ${currentUser.lastName}`,
        userRole: currentUser.role,
        faculty: currentUser.faculty,
        q1: document.querySelector('input[name="q1"]:checked').value,
        q2: document.querySelector('input[name="q2"]:checked').value,
        q3: document.querySelector('input[name="q3"]:checked').value,
        q4: document.querySelector('input[name="q4"]:checked').value,
        q5: document.querySelector('input[name="q5"]:checked').value,
        q6: document.querySelector('input[name="q6"]:checked').value,
        q7: document.querySelector('input[name="q7"]:checked').value,
        q8: document.querySelector('input[name="q8"]:checked').value,
        q9: document.querySelector('input[name="q9"]:checked').value,
        q10: document.querySelector('input[name="q10"]:checked').value,
        comment: document.getElementById('feedbackText').value
    };

    showLoading();
    google.script.run.withSuccessHandler(res => {
        hideLoading();
        if(res.success) {
            Swal.fire({
                icon: 'success',
                title: 'ขอบคุณสำหรับคำประเมิน',
                text: 'ข้อมูลของท่านถูกส่งเรียบร้อยแล้ว',
                confirmButtonColor: '#28a745'
            }).then(() => {
                showSection('userDashboardSection'); 
            });
            document.getElementById('feedbackForm').reset();
        } else {
            showAlert(res.message, 'error');
        }
    }).saveFeedback(data);
});
// 1. เชื่อมต่อเมนู
setupNavClick('navFeedbackReport', 'feedbackReportSection', () => {
    loadFeedbackReport();
});

function loadFeedbackReport() {
    showLoading();
    google.script.run.withSuccessHandler(res => {
        hideLoading();
        const tbody = document.querySelector('#feedbackTable tbody');
        tbody.innerHTML = '';

        if (!res.success || !res.data || res.data.length === 0) {
            document.getElementById('noFeedbackData').style.display = 'block';
            return;
        }
        
        document.getElementById('noFeedbackData').style.display = 'none';

        document.getElementById('fbTotalUsers').innerText = res.stats.total;
        document.getElementById('fbGrandAvg').innerText = res.stats.avgTotal;
        
        // เติมคะแนน 10 ข้อ
        for(let i=1; i<=10; i++) {
            let el = document.getElementById(`avgQ${i}`);
            if(el) el.innerText = res.stats[`avgQ${i}`];
        }

        res.data.forEach(item => {
            let dateStr = item.timestamp;
            try {
                let d = new Date(item.timestamp);
                dateStr = d.toLocaleDateString('th-TH') + " " + d.toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'});
            } catch(e){}

            let color = item.avgScore >= 4 ? 'green' : (item.avgScore >= 3 ? 'orange' : 'red');

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><small style="color:#666;">${dateStr}</small></td>
                <td>
                    <div style="font-weight:bold;">${item.name}</div>
                    <small style="color:#1976D2;">${item.faculty}</small>
                </td>
                <td style="text-align:center;">
                    <span style="font-weight:bold; color:${color}; font-size:16px;">${item.avgScore}</span>
                </td>
                <td style="color:#444;">${item.comment || '-'}</td>
            `;
            tbody.appendChild(tr);
        });

    }).getFeedbackReport();
}

// ดึงสถานะมาอัปเดตปุ่มสวิตช์ในหน้าแอดมิน
function checkAdminFeedbackToggleStatus() {
    google.script.run.withSuccessHandler(res => {
        const btn = document.getElementById('toggleFeedbackBtn');
        const txt = document.getElementById('feedbackStatusText');
        if(btn && txt) {
            btn.checked = res.isOpen;
            txt.textContent = res.isOpen ? "สถานะ: เปิดให้ประเมิน" : "สถานะ: ปิดการประเมิน";
            txt.style.color = res.isOpen ? "#059669" : "#dc2626";
        }
    }).getFeedbackStatus();
}

// เมื่อแอดมินกดเปิด-ปิดสวิตช์
function changeFeedbackStatus(el) {
    const isChecked = el.checked;
    showLoading();
    google.script.run.withSuccessHandler(res => {
        hideLoading();
        if(res.success) {
            showAlert(isChecked ? 'เปิดระบบประเมินแล้ว' : 'ปิดระบบประเมินแล้ว');
            checkAdminFeedbackToggleStatus();
        }
    }).setFeedbackStatus(isChecked);
}

// ฟังก์ชันเช็คการแสดงผลปุ่มทำแบบประเมิน
function applyFeedbackMenuVisibility() {
    const navItem = document.getElementById('navFeedback').closest('li');
    
    // 1. ถ้าเป็น "แอดมิน" หรือ "ผู้บริหาร" ให้บังคับซ่อนเมนูทำประเมินไปเลย (ให้ดูแค่หน้า Report พอ)
    if(currentUser && (currentUser.role === 'admin' || currentUser.role === 'executive')) {
        navItem.style.display = 'none';
        navItem.classList.remove('show');
        return;
    }

    // 2. ถ้าเป็น "หน่วยงาน (Staff)" ให้มองเห็นเมนูเพื่อเข้าไปประเมินได้
    if(currentUser && currentUser.role === 'staff') {
        navItem.style.display = '';
        navItem.classList.add('show');
        return;
    }

    // 3. ถ้าเป็น "นักศึกษา (User)" ต้องดึงสถานะเปิด/ปิดจากระบบมาเช็ค
    google.script.run.withSuccessHandler(res => {
        if(res.isOpen) {
            navItem.style.display = '';
            navItem.classList.add('show');
        } else {
            navItem.style.display = 'none'; // ถ้าแอดมินปิดสวิตช์ ก็ซ่อนเมนูนี้ทิ้ง
            navItem.classList.remove('show');
        }
    }).getFeedbackStatus();
}
// --- ตัวแปร Global สำหรับเก็บข้อมูล (ต้องอยู่นอกฟังก์ชัน) ---
let submittedLogsCache = []; 

// 1. เชื่อมต่อเมนู
setupNavClick('navManageSubmitted', 'manageSubmittedSection', () => {
    loadSubmittedLogs();
});

// ============================================================================
// [FIX] ส่วนจัดการรายการส่งเบิก (Manage Submitted) - แก้ไขวันที่และปุ่มกด
// ============================================================================

// 1. โหลดข้อมูล
function loadSubmittedLogs() {
    showLoading();
    google.script.run.withSuccessHandler(list => {
        hideLoading();
        submittedLogsCache = list; 
        renderSubmittedSummary(list); 
    }).getSubmittedTimeLogsForAdmin();
}

function renderSubmittedSummary(list) {
    const tbody = document.querySelector('#submittedSummaryTable tbody');
    const noData = document.getElementById('noSubmittedData');
    tbody.innerHTML = '';

    if (!list || list.length === 0) {
        if (noData) noData.style.display = 'block';
        return;
    }
    if (noData) noData.style.display = 'none';

    // --- Helper: แปลงวันที่เพื่อใช้จัดกลุ่ม ---
    const getMonthKey = (dateStr) => {
        let d = parseDateString(dateStr); 
        if (!d) return 'unknown';
        let y = d.getFullYear();
        let m = d.getMonth() + 1;
        if (y > 2400) y -= 543; 
        return `${y}-${String(m).padStart(2, '0')}`;
    };

    const getMonthLabel = (monthKey) => {
        if (monthKey === 'unknown') return '-';
        const [y, m] = monthKey.split('-').map(Number);
        const thMonth = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
        return `${thMonth[m - 1]} ${y + 543}`;
    };

    // --- 1. จัดกลุ่มข้อมูล (Grouping) ---
    const groups = {};
    list.forEach(item => {
        const cleanId = String(item.studentId).replace(/'/g, '').trim();
        const mKey = getMonthKey(item.date);
        
        // สร้าง Key ที่ไม่ซ้ำกัน (ID_Month_Agency)
        const uniqueKey = `${cleanId}_${mKey}_${String(item.agency).replace(/\s/g, '')}`;

        if (!groups[uniqueKey]) {
            groups[uniqueKey] = {
                key: uniqueKey, // เก็บ Key ไว้ใช้ส่งไปฟังก์ชัน
                studentId: cleanId,
                studentName: item.studentName,
                agency: item.agency,
                monthKey: mKey,
                monthLabel: getMonthLabel(mKey),
                count: 0,
                logIds: [],
                rawItems: []
            };
        }
        groups[uniqueKey].count++;
        groups[uniqueKey].logIds.push(item.logId);
        groups[uniqueKey].rawItems.push(item);
    });

    // --- 2. เก็บข้อมูลลงตัวแปร Global (สำคัญมาก เพื่อให้ Modal เรียกใช้ได้) ---
    window.submittedGroupsCache = groups; 

    // --- 3. เรียงลำดับ (ตามเดือนล่าสุด -> ชื่อหน่วยงาน) ---
    const sortedKeys = Object.keys(groups).sort((a, b) => {
        const diffDate = groups[b].monthKey.localeCompare(groups[a].monthKey);
        if(diffDate !== 0) return diffDate;
        return groups[a].agency.localeCompare(groups[b].agency);
    });

    // --- 4. วาดตาราง ---
    let index = 1;
    sortedKeys.forEach(key => {
        const group = groups[key];

        // คำนวณเงินรวมของกลุ่มนี้
        let dailyMap = {};
        group.rawItems.forEach(log => {
             let dObj = parseDateString(log.date);
             let dKey = dObj ? dObj.toISOString().split('T')[0] : 'unknown';
             if (!dailyMap[dKey]) dailyMap[dKey] = 0;
             dailyMap[dKey] += parseFloat(log.hours || 0);
        });

        let totalMoney = 0;
        for (let d in dailyMap) {
            let h = dailyMap[d];
            // Logic: >=7ชม. ได้ 300, >=3.5ชม. ได้ 150, อื่นๆ 150
            if (h >= 7) totalMoney += 300;
            else if (h >= 3.5) totalMoney += 150;
            else totalMoney += 150; 
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="text-align: center;">${index++}</td>
            <td><span class="vf-badge vf-badge-blue" style="font-size:13px;">${group.monthLabel}</span></td>
            <td>
                <div style="font-weight:bold; font-size:14px; color:#0d47a1;">${group.studentName}</div>
                <div style="font-size:12px; color:#666;">${group.studentId}</div>
            </td>
            <td><small>${group.agency}</small></td>
            <td style="text-align: center;"><span class="badge-count">${group.count} รายการ</span></td>
            <td style="text-align: right; font-weight: bold; color: var(--secondary-color);">
                ${totalMoney.toLocaleString()} บ.
            </td>
            <td style="text-align: center;">
                <div style="display:flex; justify-content:center; gap:5px;">
                    <button class="btn btn-info" onclick="openSubmittedModalByGroupKey('${key}')" style="padding: 4px 8px; font-size: 12px;" title="ตรวจสอบรายละเอียด">
                         <i class="material-icons" style="font-size:16px; vertical-align:middle;">visibility</i>
                    </button>
                    
                    <button class="btn btn-warning" onclick="actionReturnGroup('${key}')" style="padding: 4px 8px; font-size: 12px; color:#fff; background-color:#ff9800; border:none;" title="คืนรายการทั้งหมด">
                         <i class="material-icons" style="font-size:16px; vertical-align:middle;">undo</i>
                    </button>

                    <button class="btn btn-danger" onclick="actionDeleteGroup('${key}')" style="padding: 4px 8px; font-size: 12px;" title="ลบรายการทั้งหมด (ถาวร)">
                         <i class="material-icons" style="font-size:16px; vertical-align:middle;">delete</i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}
// 3. ฟังก์ชันเปิด Modal แบบใช้ Key (แม่นยำกว่าการกรองใหม่)
function openSubmittedModalByGroupKey(key) {
    const group = window.submittedGroupsCache[key];
    
    if (!group) {
        Swal.fire('ข้อผิดพลาด', 'ไม่พบข้อมูลในหน่วยความจำ กรุณารีเฟรชหน้าเว็บ', 'error');
        return;
    }

    // ใส่ข้อมูล Header Modal
    document.getElementById('modalDetailName').textContent = group.studentName;
    document.getElementById('modalDetailId').textContent = `รหัส: ${group.studentId} | ประจำเดือน: ${group.monthLabel}`;

    // ส่งรายการดิบ (Raw Items) ไปให้ตารางวาดเลย (ไม่ต้องกรองซ้ำ)
    renderDetailTable(group.rawItems);
    
    // เปิด Modal
    document.getElementById('submittedDetailModal').style.display = 'flex';
}

// 3. เปิด Modal ดูรายละเอียด (แก้ไขการกรองวันที่)
function openSubmittedDetail(studentId, monthKey) {
    // กรองข้อมูลจาก Cache: ต้องตรงทั้ง ID และ เดือน
    const studentLogs = submittedLogsCache.filter(item => {
        let d = parseDateString(item.date);
        if(!d) return false;
        
        let y = d.getFullYear();
        let m = d.getMonth() + 1;
        if (y > 2400) y -= 543;
        
        const itemMonthKey = `${y}-${String(m).padStart(2, '0')}`;
        const itemStudentId = String(item.studentId).replace(/'/g, '').trim();
        
        return itemStudentId === String(studentId).trim() && itemMonthKey === monthKey;
    });
    
    if (studentLogs.length === 0) {
        // กรณีหาไม่เจอ (อาจจะเพราะ parse วันที่ผิด) ลองกรองแค่ ID ดูก่อน
        console.warn("Filter strict failed, trying ID only");
        const fallbackLogs = submittedLogsCache.filter(item => String(item.studentId).replace(/'/g, '').trim() === String(studentId).trim());
        if(fallbackLogs.length > 0) {
             renderDetailTable(fallbackLogs);
             document.getElementById('submittedDetailModal').style.display = 'flex';
             return;
        }
        Swal.fire('ไม่พบข้อมูล', 'เกิดข้อผิดพลาดในการดึงรายละเอียด', 'error');
        return;
    }

    // ใส่ข้อมูล Header Modal
    document.getElementById('modalDetailName').textContent = studentLogs[0].studentName;
    document.getElementById('modalDetailId').textContent = `รหัส: ${studentId} | ประจำเดือน: ${monthKey}`;

    // วาดตาราง
    renderDetailTable(studentLogs);
    
    // เปิด Modal
    document.getElementById('submittedDetailModal').style.display = 'flex';
}

// --- แก้ไขใน <script> index.html ---

function renderDetailTable(logs) {
    const tbody = document.querySelector('#submittedDetailTable tbody');
    if(tbody) tbody.innerHTML = '';
    
    // ใช้ logic รวมวัน
    const groupedByDate = {};
    logs.forEach(item => {
        // ใช้ formatDate แปลงวันที่ให้สวยงามทันที
        const dateKey = formatDate(item.date || item.workDate); 
        
        if (!groupedByDate[dateKey]) {
            groupedByDate[dateKey] = {
                date: dateKey,
                totalHours: 0,
                items: []
            };
        }
        groupedByDate[dateKey].items.push(item);
        groupedByDate[dateKey].totalHours += parseFloat(item.hours || 0);
    });

    Object.values(groupedByDate).forEach(group => {
        // คำนวณเงิน
        let dailyAmount = 0;
        const h = group.totalHours;
        if (h >= 7) dailyAmount = 300;
        else if (h >= 3.5) dailyAmount = 150;
        else dailyAmount = 150; 

        group.items.forEach((item, index) => {
            const tr = document.createElement('tr');
            
            // Col 1: วันที่ (Merge Rows)
            if (index === 0) {
                tr.innerHTML += `<td rowspan="${group.items.length}" style="vertical-align: middle; background: #fff;">${group.date}</td>`;
            }

            // Col 2: รายละเอียดงาน
            tr.innerHTML += `<td>${item.details || item.jobTitle || '-'}</td>`;

            // Col 3: ชั่วโมง (เฉพาะแถวแรกของวัน ถ้าจะโชว์)
            tr.innerHTML += `<td style="text-align:center;">${item.hours || '-'}</td>`;

            // Col 4: ยอดเงิน (Merge Rows)
            if (index === 0) {
                tr.innerHTML += `<td rowspan="${group.items.length}" style="vertical-align: middle; text-align: right; font-weight: bold; color: var(--secondary-color);">
                    ${dailyAmount.toLocaleString()}
                </td>`;
            }

            // Col 5: สถานะ
            let statusBadge = `<span class="vf-badge" style="background:#e3f2fd; color:#1976D2;">รอตรวจสอบ</span>`;
            tr.innerHTML += `<td style="text-align: center;">${statusBadge}</td>`;
            
            // Col 6: ปุ่มจัดการรายตัว (คืน)
            tr.innerHTML += `
                <td style="text-align: center;">
                    <button class="btn btn-danger" onclick="actionRevoke('${item.logId}', 'return', '${String(item.studentId).replace(/'/g,'')}')" style="padding: 2px 8px; font-size: 11px;">
                        คืนแก้ไข
                    </button>
                </td>
            `;

            if(tbody) tbody.appendChild(tr);
        });
    });
}

// 6. ฟังก์ชันจัดการ (Revoke/Delete) และรีเฟรช Modal อัตโนมัติ
function actionRevoke(logId, type, studentId) {
    let title = type === 'delete' ? 'ยืนยันการจำหน่ายรายการ' : 'ยืนยันการคืนรายการ';
    let text = type === 'delete' 
        ? 'รายการจะถูกลบออกจากระบบอย่างถาวร' 
        : 'รายการจะถูกส่งกลับสถานะ Pending ให้นักศึกษาแก้ไข';
    let confirmText = type === 'delete' ? 'ลบถาวร' : 'ตีกลับแก้ไข';
    let color = type === 'delete' ? '#d33' : '#ff9800';

    const performAction = (reason) => {
        showLoading();
        google.script.run.withSuccessHandler(res => {
            hideLoading();
            if (res.success) {
                // อัปเดต Cache ท้องถิ่นทันที เพื่อให้หน้าจอลื่นไหล
                submittedLogsCache = submittedLogsCache.filter(item => String(item.logId) !== String(logId));
                
                // รีโหลดข้อมูลใน Modal (ถ้ายังมีรายการเหลือ)
                const remainingLogs = submittedLogsCache.filter(item => String(item.studentId) === String(studentId));
                
                if (remainingLogs.length > 0) {
                    // ถ้ายังเหลือรายการ ให้วาดตารางใน Modal ใหม่
                    renderDetailTable(remainingLogs);
                } else {
                    // ถ้าหมดแล้ว ปิด Modal และรีเฟรชตารางหลัก
                    document.getElementById('submittedDetailModal').style.display = 'none';
                    renderSubmittedSummary(submittedLogsCache);
                }

                // รีเฟรชตารางหลักเสมอเพื่ออัปเดตยอดเงิน/จำนวน
                renderSubmittedSummary(submittedLogsCache);
                
                Swal.fire({ icon: 'success', title: 'สำเร็จ', text: res.message, timer: 1500, showConfirmButton: false });

            } else {
                Swal.fire('ผิดพลาด', res.message, 'error');
            }
        }).processRevokeTimeLog(logId, type, reason);
    };

    if (type === 'return') {
        Swal.fire({
            title: title, text: text, input: 'text', inputPlaceholder: 'ระบุเหตุผล...', icon: 'warning',
            showCancelButton: true, confirmButtonColor: color, confirmButtonText: confirmText, cancelButtonText: 'ยกเลิก',
            inputValidator: (value) => { if (!value) return 'กรุณาระบุเหตุผล!'; }
        }).then((result) => {
            if (result.isConfirmed) performAction(result.value);
        });
    } else {
        Swal.fire({
            title: title, text: text, icon: 'warning',
            showCancelButton: true, confirmButtonColor: color, confirmButtonText: confirmText, cancelButtonText: 'ยกเลิก'
        }).then((result) => {
            if (result.isConfirmed) performAction('');
        });
    }
}
// --- [UPDATED] Logic ควบคุมหน้าดาวน์โหลด (UI ใหม่) ---

// 1. เริ่มต้นหน้าจอ (Reset UI)
function initDownloadMenu() {
    // รีเซ็ต Dropdown และปุ่ม
    const jobSelect = document.getElementById('dlJobSelect');
    const btnDl = document.getElementById('btnExecuteDownload');
    
    jobSelect.innerHTML = '<option value="">-- กรุณาเลือกหน่วยงานก่อน --</option>';
    jobSelect.disabled = true;
    jobSelect.style.backgroundColor = "#f9f9f9";
    
    btnDl.disabled = true;
    btnDl.style.opacity = "0.6";
    btnDl.style.boxShadow = "none";

    // ตรวจสอบสิทธิ์
    const agencyBox = document.getElementById('dlAdminAgencyBox');
    
    if (currentUser.role === 'admin') {
        // ADMIN: โชว์กล่องเลือกหน่วยงาน
        agencyBox.style.display = 'block';
        
        // โหลดรายชื่อหน่วยงาน
        showLoading();
        google.script.run.withSuccessHandler(agencies => {
            hideLoading();
            const select = document.getElementById('dlAgencySelect');
            select.innerHTML = '<option value="">-- กรุณาเลือกหน่วยงาน --</option>';
            agencies.forEach(ag => {
                const opt = document.createElement('option');
                opt.value = ag;
                opt.textContent = ag;
                select.appendChild(opt);
            });
        }).getAgenciesWithJobs();
        
    } else {
        // STAFF: ซ่อนกล่องหน่วยงาน แล้วโหลดงานของตัวเองเลย
        agencyBox.style.display = 'none';
        loadJobsForDownload(currentUser.faculty);
    }
}

// 2. โหลดงานใส่ Dropdown (เมื่อเลือกหน่วยงาน)
function loadJobsForDownload(agencyName) {
    const jobSelect = document.getElementById('dlJobSelect');
    
    if (!agencyName) {
        jobSelect.innerHTML = '<option value="">-- กรุณาเลือกหน่วยงานก่อน --</option>';
        jobSelect.disabled = true;
        checkDownloadButton();
        return;
    }

    showLoading();
    
    // เปลี่ยนข้อความระหว่างโหลด
    jobSelect.innerHTML = '<option>กำลังโหลดข้อมูล...</option>';

    google.script.run.withSuccessHandler(jobs => {
        hideLoading();
        jobSelect.innerHTML = '<option value="">-- คลิกเพื่อเลือกงานที่ต้องการ --</option>';
        
        if (jobs.length === 0) {
            jobSelect.innerHTML = '<option value="">-- ไม่พบรายการงานในหน่วยงานนี้ --</option>';
            jobSelect.disabled = true;
        } else {
            jobs.forEach(job => {
                const opt = document.createElement('option');
                opt.value = job.id; 
                opt.textContent = `${job.title} (${job.date})`; // โชว์ชื่อ+วันที่
                jobSelect.appendChild(opt);
            });
            
            // ปลดล็อคช่องเลือกงาน
            jobSelect.disabled = false;
            jobSelect.style.backgroundColor = "#fff";
            jobSelect.style.borderColor = "#28a745"; // สีเขียวให้รู้ว่าพร้อมเลือก
        }
        checkDownloadButton(); // อัปเดตสถานะปุ่ม
    }).getJobsByAgencyForDownload(agencyName);
}

// 3. เช็คสถานะปุ่มดาวน์โหลด (เปิด/ปิด)
function checkDownloadButton() {
    const jobId = document.getElementById('dlJobSelect').value;
    const btn = document.getElementById('btnExecuteDownload');
    
    if(jobId) {
        btn.disabled = false;
        btn.style.opacity = "1";
        btn.style.cursor = "pointer";
        btn.style.boxShadow = "0 4px 15px rgba(40, 167, 69, 0.4)"; // เพิ่มเงาให้ดูเด่น
    } else {
        btn.disabled = true;
        btn.style.opacity = "0.6";
        btn.style.cursor = "not-allowed";
        btn.style.boxShadow = "none";
    }
}

// 4. สั่งดาวน์โหลด
function executeDownloadByJob() {
    const jobId = document.getElementById('dlJobSelect').value;
    if (!jobId) return;

    showLoading();
    google.script.run.withSuccessHandler(res => {
        hideLoading();
        if (res.success) {
            const blob = base64ToBlob(res.data, 'text/csv;charset=utf-8;');
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = res.filename;
            link.click();
            
            // แจ้งเตือนเล็กน้อย
            const Toast = Swal.mixin({
                toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, timerProgressBar: true
            });
            Toast.fire({ icon: 'success', title: 'เริ่มการดาวน์โหลดแล้ว' });
            
        } else {
            showAlert(res.message, 'error');
        }
    }).downloadRegistrationsByJobId(jobId);
}

// 5. [NEW] ฟังก์ชันเปิด/ปิด ส่วนเพิ่มเติม (Toggle)
function toggleAdvancedDownload() {
    const box = document.getElementById('dlAdvancedBox');
    const icon = document.getElementById('iconAdvDl');
    
    if (box.style.display === 'none') {
        box.style.display = 'block';
        // อนิเมชั่นเล็กน้อย
        box.style.animation = 'fadeIn 0.3s ease-in-out';
        icon.innerText = 'expand_less';
    } else {
        box.style.display = 'none';
        icon.innerText = 'expand_more';
    }
}
// --- แก้ไขฟังก์ชัน confirmCutBudget ในหน้า HTML ---

function confirmCutBudget() {
    // 1. ดึงข้อมูลจาก Input (แผงควบคุมสีเหลือง)
    const runNo = document.getElementById('inputRunNo').value;
    const month = document.getElementById('inputMonth').value;
    const allocated = document.getElementById('inputAllocated').value;
    const prevBal = document.getElementById('inputPrevBalance').value;
    const sourceCode = document.getElementById('inputSourceCode').value;

    // 2. ดึงยอดเบิกจ่ายจริง (Withdrawn) จากตารางสรุป
    // ต้องลบลูกน้ำ (,) ออกก่อนแปลงเป็นตัวเลข
    const currentWithdrawalText = document.getElementById('repGrandTotal').innerText.replace(/,/g, '');
    const currentWithdrawal = parseFloat(currentWithdrawalText) || 0;

    if(currentWithdrawal <= 0) {
        Swal.fire('แจ้งเตือน', 'ไม่มียอดเงินให้ตัดเบิก (ยอดเงินเป็น 0)', 'warning');
        return;
    }

    // ถามยืนยัน
    Swal.fire({
        title: 'ยืนยันการบันทึกตัดงบ',
        html: `
            <div style="text-align:left; font-size:14px;">
                <b>ลำดับที่:</b> ${runNo}<br>
                <b>ประจำเดือน:</b> ${month}<br>
                <b>ยอดยกมา:</b> ${parseFloat(prevBal).toLocaleString()} บาท<br>
                <b>ตัดเบิกครั้งนี้:</b> <span style="color:red;">-${currentWithdrawal.toLocaleString()}</span> บาท
            </div>
        `,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'บันทึกและตัดยอด',
        confirmButtonColor: '#ff9800',
        cancelButtonText: 'ยกเลิก'
    }).then((result) => {
        if (result.isConfirmed) {
            showLoading();
            
            // เรียกฟังก์ชัน GAS ที่เราเพิ่งเขียน
            google.script.run.withSuccessHandler(res => {
                hideLoading();
                if(res.success) {
                    Swal.fire({
                        icon: 'success',
                        title: 'บันทึกข้อมูลเรียบร้อย',
                        text: `ยอดคงเหลือยกไปรอบหน้า: ${res.newBalance.toLocaleString()} บาท`
                    });
                    
                    // อัปเดตหน้าจอทันที (Optional: ป้องกันกดซ้ำ)
                    document.getElementById('inputPrevBalance').value = res.newBalance;
                    // อาจจะปิดปุ่ม หรือ Disable Input เพิ่มเติม
                } else {
                    Swal.fire('Error', res.message, 'error');
                }
            }).saveBudgetRunNo({
                runNo: runNo,
                month: month,
                allocated: allocated,
                prevBalance: prevBal,
                withdrawn: currentWithdrawal, // ส่งยอดเบิกไปด้วย!
                sourceCode: sourceCode
            });
        }
    });
}
