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
    const dataReady = new Promise((resolve, reject) => {
        google.script.run.withSuccessHandler(resolve).withFailureHandler(reject).getExecutiveStats();
    });
    Promise.all([window.ensureUbuLibrary('chart'), dataReady]).then((results) => {
        const res = results[1];
        if (res && res.success) renderExecCharts(res.data);
        else showAlert((res && res.message) || 'ไม่สามารถโหลดข้อมูลกราฟได้', 'error');
    }).catch((error) => {
        showAlert((error && error.message) || String(error), 'error');
    }).finally(() => hideLoading());
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
// [START] SERVER-SIDE IMPERSONATION — Admin ทำรายการแทนบัญชีจริง
// =======================================================

let realAdminName = '';

function openImpersonateModal() {
  if (!currentUser || currentUser.role !== 'admin') {
    showAlert('เมนูทำรายการแทนใช้ได้เฉพาะผู้ดูแลระบบ', 'error');
    return;
  }

  const token = sessionStorage.getItem('sessionToken');
  Swal.fire({
    allowOutsideClick: false,
    didOpen: () => {
      Swal.showLoading();

      // HOTFIX: ใช้ getAllUsers() ซึ่งเป็น API เดิมที่ระบบใช้งานอยู่แล้ว
      // แล้วกรองเฉพาะบัญชี role=staff ฝั่ง Browser แทนการพึ่ง API ใหม่
      // getImpersonationStaffTargets() ในขั้นตอนเปิด Modal
      google.script.run
        .withSuccessHandler(users => {
          const list = (Array.isArray(users) ? users : [])
            .filter(u => String(u && u.role || '').trim().toLowerCase() === 'staff')
            .map(u => {
              const prefix = String(u.prefix || '').trim();
              const firstName = String(u.firstName || '').trim();
              const lastName = String(u.lastName || '').trim();
              const personName = `${prefix}${firstName}${lastName ? ' ' + lastName : ''}`.trim();
              const faculty = String(u.faculty || '').trim();
              const fallback = String(u.studentId || u.id || 'บัญชีหน่วยงาน').trim();
              return {
                id: String(u.id || '').trim(),
                name: faculty
                  ? `${faculty}${personName ? ' — ' + personName : ''}`
                  : (personName || fallback),
                faculty: faculty,
                displayName: personName || fallback
              };
            })
            .filter(u => u.id)
            .sort((a, b) => a.name.localeCompare(b.name, 'th'));

          showRoleSelectionPopup(list);
        })
        .withFailureHandler(err => {
          Swal.fire(
            'ไม่สามารถโหลดบัญชีหน่วยงานได้',
            (err && err.message) ? err.message : 'ไม่สามารถดึงข้อมูลบัญชีผู้ใช้งานได้',
            'error'
          );
        })
        .getAllUsers(token);
    }
  });
}

function showRoleSelectionPopup(staffTargets) {
  const list = Array.isArray(staffTargets) ? staffTargets : [];
  const unitOptions = list
    .map(u => `<option value="${escapeHtmlAttrForImpersonation_(u.id)}">${escapeHtmlForImpersonation_(u.name)}</option>`)
    .join('');

  Swal.fire({
    title: '<h3 style="font-family:Sarabun; margin-bottom:5px;">ทำรายการแทนผู้ใช้งาน</h3><small style="color:#666; font-size:14px; font-weight:normal;">ระบบจะใช้งานด้วยสิทธิ์ของบัญชีที่เลือกจริง และบันทึกผู้ดูแลระบบผู้ดำเนินการไว้</small>',
    width: '680px',
    html: `
      <div style="text-align:left; font-family:Sarabun;">
        <div class="role-grid">
          <div class="role-card active" data-role="admin" onclick="selectRoleCard('admin')">
            <i class="material-icons role-icon">admin_panel_settings</i>
            <div class="role-label">บัญชี Admin</div>
          </div>
          <div class="role-card" data-role="unit" onclick="selectRoleCard('unit')">
            <i class="material-icons role-icon">business</i>
            <div class="role-label">แทนบัญชีหน่วยงาน</div>
          </div>
          <div class="role-card" data-role="student" onclick="selectRoleCard('student')">
            <i class="material-icons role-icon">school</i>
            <div class="role-label">แทนบัญชีนักศึกษา</div>
          </div>
        </div>

        <input type="hidden" id="selectedRoleValue" value="admin">

        <div id="dynamicInputArea" class="input-transition-box" style="display:none;">
          <div id="unitInputGroup" style="display:none;">
            <label style="font-weight:bold; color:#059669; display:block; margin-bottom:5px;">เลือกบัญชีเจ้าหน้าที่หน่วยงาน</label>
            <select id="imp-unit-select" class="swal2-input" style="width:100%; margin:0; font-size:16px;">
              <option value="">-- กรุณาเลือกบัญชี --</option>
              ${unitOptions}
            </select>
            ${list.length === 0 ? '<small style="color:#dc2626; display:block; margin-top:8px;">ยังไม่พบบัญชี role staff ในระบบ</small>' : ''}
          </div>

          <div id="studentInputGroup" style="display:none;">
            <label style="font-weight:bold; color:#d97706; display:block; margin-bottom:5px;">ระบุรหัสนักศึกษา</label>
            <input id="imp-student-id" class="swal2-input" placeholder="เช่น 66xxxxxxxx" style="width:100%; margin:0; font-size:16px;">
          </div>
        </div>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: 'เริ่มทำรายการแทน',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#1e3a8a',
    didOpen: () => {
      window.selectRoleCard = (role) => {
        document.querySelectorAll('.role-card').forEach(el => el.classList.remove('active'));
        const card = document.querySelector(`.role-card[data-role="${role}"]`);
        if (card) card.classList.add('active');
        document.getElementById('selectedRoleValue').value = role;

        const inputArea = document.getElementById('dynamicInputArea');
        const unitGroup = document.getElementById('unitInputGroup');
        const studentGroup = document.getElementById('studentInputGroup');

        if (role === 'admin') {
          inputArea.style.display = 'none';
        } else {
          inputArea.style.display = 'block';
          unitGroup.style.display = role === 'unit' ? 'block' : 'none';
          studentGroup.style.display = role === 'student' ? 'block' : 'none';
        }
      };
    },
    preConfirm: () => {
      const mode = document.getElementById('selectedRoleValue').value;
      if (mode === 'admin') return { mode: 'admin' };

      if (mode === 'unit') {
        const sel = document.getElementById('imp-unit-select');
        if (!sel || !sel.value) return Swal.showValidationMessage('กรุณาเลือกบัญชีหน่วยงาน');
        const option = sel.options[sel.selectedIndex];
        return {
          mode: 'unit',
          targetId: sel.value,
          targetName: option ? option.textContent : 'บัญชีหน่วยงาน'
        };
      }

      const sid = document.getElementById('imp-student-id').value.trim();
      if (!sid) return Swal.showValidationMessage('กรุณากรอกรหัสนักศึกษา');

      return new Promise(resolve => {
        google.script.run
          .withSuccessHandler(res => {
            if (res && res.found) {
              resolve({
                mode: 'student',
                targetId: (res.info && res.info.id) || res.realUserId || '',
                studentId: (res.info && res.info.studentId) || sid,
                targetName: res.name || sid
              });
            } else {
              Swal.showValidationMessage('ไม่พบบัญชีนักศึกษานี้ในระบบ');
              resolve(false);
            }
          })
          .withFailureHandler(err => {
            Swal.showValidationMessage(err.message || 'ตรวจสอบบัญชีไม่สำเร็จ');
            resolve(false);
          })
          .verifyStudentExist(sid);
      });
    }
  }).then(result => {
    if (result.isConfirmed) startImpersonation(result.value);
  });
}

function startImpersonation(data) {
  if (!data || data.mode === 'admin') return;
  if (!currentUser || currentUser.role !== 'admin') {
    showAlert('คุณไม่มีสิทธิ์ใช้งานโหมดทำรายการแทน', 'error');
    return;
  }

  const adminToken = sessionStorage.getItem('sessionToken');
  if (!adminToken) {
    showAlert('ไม่พบ Session ของผู้ดูแลระบบ กรุณาเข้าสู่ระบบใหม่', 'error');
    return;
  }

  const request = {
    mode: data.mode,
    targetUserId: data.targetId || '',
    studentId: data.studentId || ''
  };

  showLoading();
  google.script.run
    .withSuccessHandler(res => {
      if (!res || !res.success || !res.impersonationToken || !res.targetUser) {
        hideLoading();
        showAlert((res && res.message) || 'ไม่สามารถเริ่มทำรายการแทนได้', 'error');
        return;
      }

      // Keep the real Admin identity and token separately.
      sessionStorage.setItem('admin_backup', JSON.stringify(currentUser));
      sessionStorage.setItem('admin_session_token', adminToken);

      // From this point every API call uses the temporary target-account token.
      sessionStorage.setItem('sessionToken', res.impersonationToken);
      sessionStorage.setItem('impersonate_mode', 'true');
      sessionStorage.setItem('impersonate_target_name', res.targetName || data.targetName || 'ผู้ใช้งาน');
      sessionStorage.setItem('impersonated_user', JSON.stringify(res.targetUser));
      sessionStorage.setItem('currentUser', JSON.stringify(res.targetUser));

      currentUser = res.targetUser;
      forceRefreshSystem();

      const Toast = Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 2600 });
      Toast.fire({ icon: 'success', title: `กำลังทำรายการแทน ${res.targetName || data.targetName || ''}` });
      hideLoading();
    })
    .withFailureHandler(err => {
      hideLoading();
      showAlert(err.message || 'ไม่สามารถเริ่มทำรายการแทนได้', 'error');
    })
    .beginImpersonationSession(adminToken, request);
}

function exitImpersonation() {
  const isImpersonating = sessionStorage.getItem('impersonate_mode') === 'true';
  if (!isImpersonating) return;

  const impersonationToken = sessionStorage.getItem('sessionToken');
  const adminToken = sessionStorage.getItem('admin_session_token');
  const adminBackup = sessionStorage.getItem('admin_backup');

  if (!adminToken || !adminBackup) {
    showAlert('ไม่พบ Session ผู้ดูแลระบบ กรุณาออกจากระบบแล้วเข้าสู่ระบบใหม่', 'error');
    return;
  }

  showLoading();
  google.script.run
    .withSuccessHandler(() => {
      // Restore the REAL Admin session only after the server revoked the temp token.
      sessionStorage.setItem('sessionToken', adminToken);
      sessionStorage.setItem('currentUser', adminBackup);
      currentUser = JSON.parse(adminBackup);

      clearImpersonationBrowserState_();
      forceRefreshSystem();

      const Toast = Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 2200 });
      Toast.fire({ icon: 'success', title: 'กลับสู่บัญชีผู้ดูแลระบบแล้ว' });
      hideLoading();
    })
    .withFailureHandler(err => {
      hideLoading();
      showAlert(err.message || 'ไม่สามารถออกจากโหมดทำรายการแทนได้', 'error');
    })
    .endImpersonationSession(impersonationToken);
}

function clearImpersonationBrowserState_() {
  sessionStorage.removeItem('admin_backup');
  sessionStorage.removeItem('admin_session_token');
  sessionStorage.removeItem('impersonate_mode');
  sessionStorage.removeItem('impersonate_target_name');
  sessionStorage.removeItem('impersonated_user');
  sessionStorage.removeItem('impersonation_started_at');
}

function forceRefreshSystem() {
  // Rehydrate the active account before any role-based UI logic runs.
  if ((!currentUser || typeof currentUser !== 'object') && typeof ensureCurrentUserReady_ === 'function') {
    ensureCurrentUserReady_();
  }
  if (!currentUser || typeof currentUser !== 'object') {
    hideLoading();
    console.error('forceRefreshSystem aborted: currentUser is not ready');
    if (typeof showAlert === 'function') {
      showAlert('ไม่สามารถโหลดข้อมูลบัญชีผู้ใช้งานได้ กรุณาเข้าสู่ระบบใหม่', 'error');
    }
    return;
  }
  currentUser.role = String(currentUser.role || 'user').trim().toLowerCase();

  updateNavbar();
  if (typeof updateAdminButtonVisibility === 'function') updateAdminButtonVisibility();

  if (currentUser.role === 'admin' || currentUser.role === 'staff' || currentUser.role === 'executive') {
    showSection('adminDashboardSection');
    loadDashboardOverview();
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    const navDash = document.getElementById('navDashboard');
    if (navDash) navDash.classList.add('active');
  } else {
    showSection('userDashboardSection');
    updateUserDashboard();
    loadUserRegistrations();
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    const navUser = document.getElementById('navUserDashboard');
    if (navUser) navUser.classList.add('active');
  }
  hideLoading();
}

function reInitializeSystem() {
  showLoading();
  const isImp = sessionStorage.getItem('impersonate_mode') === 'true';
  const storedUser = isImp
    ? sessionStorage.getItem('impersonated_user')
    : sessionStorage.getItem('currentUser');

  if (!storedUser) {
    hideLoading();
    if (typeof logout === 'function') logout();
    return;
  }

  try {
    currentUser = JSON.parse(storedUser);
    if (!currentUser || typeof currentUser !== 'object') throw new Error('Invalid user session');
    currentUser.role = String(currentUser.role || 'user').trim().toLowerCase();
  } catch (_) {
    hideLoading();
    if (typeof logout === 'function') logout();
    return;
  }

  const bar = document.getElementById('impersonation-bar');
  const target = document.getElementById('imp-target-name');
  const adminBtn = document.getElementById('admin-tools-btn');

  if (bar) bar.style.display = isImp ? 'block' : 'none';
  if (target && isImp) target.innerText = sessionStorage.getItem('impersonate_target_name') || '-';
  if (adminBtn) adminBtn.style.display = (currentUser.role === 'admin' || isImp) ? 'block' : 'none';

  updateNavbar();
  forceRefreshSystem();
}

function escapeHtmlForImpersonation_(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeHtmlAttrForImpersonation_(value) {
  return escapeHtmlForImpersonation_(value);
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
    const verifySelectedYear = Number((document.getElementById('verifyFiscalYear') || {}).value || 0);
    if (![2569,2570].includes(verifySelectedYear)) { showAlert('กรุณาเลือกปีงบประมาณ 2569 หรือ 2570 ก่อนค้นหา', 'warning'); return; }

    const id = document.getElementById('verifyInputId').value.trim();
    if(!id) { showAlert('กรุณาระบุรหัสนักศึกษา', 'warning'); return; }

    const verifyRequestSerial = (window.__verifyFiscalRequestId = (window.__verifyFiscalRequestId || 0) + 1);
    showLoading();
    google.script.run.withSuccessHandler(res => {
        if (verifyRequestSerial !== window.__verifyFiscalRequestId || Number((document.getElementById('verifyFiscalYear') || {}).value) !== verifySelectedYear) { hideLoading(); return; }
        hideLoading();
        const resultArea = document.getElementById('verifyResultArea');
        const notFoundMsg = document.getElementById('vfNotFound');

        if (res.success && res.data) {
            const d = res.data;
            currentVerifyDataCache = d;
            const vyLabel = document.getElementById('vfSelectedYearLabel'); if (vyLabel) vyLabel.textContent = 'ข้อมูลรายชื่อประจำปีงบประมาณ พ.ศ. ' + verifySelectedYear; // เก็บข้อมูลไว้ใช้พิมพ์

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
            showAlert((res && res.message) || 'ไม่พบรายชื่อในปีงบประมาณที่เลือก', 'error');
        }
    }).getStudentDetailsBySheet(token, id, verifySelectedYear);
}

function prepareAndPrintProfile() {
    if (!currentVerifyDataCache) {
        showAlert('กรุณาค้นหาข้อมูลนักศึกษาก่อน', 'warning');
        return;
    }

    const d = currentVerifyDataCache;
    const selectedVerifyFiscalYear = Number(d.fiscalYear || (document.getElementById('verifyFiscalYear') || {}).value);
    if (![2569,2570].includes(selectedVerifyFiscalYear)) { showAlert('กรุณาเลือกปีงบประมาณก่อนพิมพ์ประวัติ', 'warning'); return; }
    showLoading();
    
    // 🛡️ ดึง Token จากระบบ
    const token = sessionStorage.getItem('sessionToken');

    // เรียกดึงประวัติการทำงานของนักศึกษาคนนี้
    google.script.run.withSuccessHandler(resHistory => {
        hideLoading();
        
        // กรอกข้อมูลส่วนตัว
        var printFY=document.getElementById('ppFiscalYear'); if(printFY)printFY.textContent=String(selectedVerifyFiscalYear);
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

        // Payment history is year-scoped by WorkDate; rows without parseable dates are excluded.
        var verifyFiscalOfWorkDate = function(value) {
          var raw=String(value||'').trim(),m=raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/),y,mo,day;
          if(m){y=+m[1];mo=+m[2];day=+m[3];}
          else {m=raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);if(!m)return null;day=+m[1];mo=+m[2];y=+m[3];}
          if(y>=2400)y-=543;
          var d=new Date(y,mo-1,day);
          if(d.getFullYear()!==y||d.getMonth()!==mo-1||d.getDate()!==day)return null;
          return y+543+(mo>=10?1:0);
        };
        historyList=historyList.filter(function(item){return verifyFiscalOfWorkDate(item.workDate)===selectedVerifyFiscalYear && String(item.status||'').trim()!=='ยกเลิก';});
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
let docYearToSelectAfterSave = '';
let docFiscalFilterInitialized = false;

function documentCurrentFiscalYear() {
    const date = new Date();
    return date.getFullYear() + 543 + (date.getMonth() >= 9 ? 1 : 0);
}
function documentFiscalYearForDate(dateText) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateText || ''));
    if (!match) return null;
    const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    const checked = new Date(Date.UTC(year, month - 1, day));
    if (checked.getUTCFullYear() !== year || checked.getUTCMonth() !== month - 1 || checked.getUTCDate() !== day) return null;
    return year + 543 + (month >= 10 ? 1 : 0);
}
function updateDocumentFiscalYearPreview() {
    const date = document.getElementById('docBookDate');
    const preview = document.getElementById('docFiscalYearPreview');
    const year = documentFiscalYearForDate(date && date.value);
    if (preview) preview.textContent = year ? `ปีงบประมาณ ${year} · เลขจัดเก็บออกโดยระบบอัตโนมัติ` : 'กรุณาเลือกวันที่ในหนังสือ';
}
function documentEscapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}
function populateDocumentFiscalYears(docs) {
    const select = document.getElementById('docFiscalYearFilter');
    if (!select) return;
    const chosen = docYearToSelectAfterSave || (docFiscalFilterInitialized ? select.value : String(documentCurrentFiscalYear()));
    const years = new Set([documentCurrentFiscalYear()]);
    (docs || []).forEach(d => {if (Number(d.fiscalYear) > 2400) years.add(Number(d.fiscalYear));});
    if (/^\d{4}$/.test(chosen)) years.add(Number(chosen));
    select.replaceChildren(new Option('ทุกปีงบประมาณ', ''));
    [...years].sort((a,b)=>b-a).forEach(y=>select.add(new Option('ปีงบประมาณ ' + y, String(y))));
    select.value = chosen;
    docYearToSelectAfterSave = '';
    docFiscalFilterInitialized = true;
}


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
    }).getAllDocumentsV2(sessionStorage.getItem('sessionToken')); // <--- เรียกฟังก์ชันชื่อใหม่
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
    updateDocumentFiscalYearPreview();
    
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
                    docYearToSelectAfterSave = String(res.fiscalYear || '');
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
            }).deleteDocument(sessionStorage.getItem('sessionToken'), docId); // *ต้องมีฟังก์ชันนี้ใน Code.gs
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
    const fiscal = document.getElementById('docFiscalYearFilter')?.value || '';

    filteredDocsCache = allDocumentsCache.filter(doc => {
        // แปลงชื่อหน่วยงานของเอกสารเก่าที่เป็นงานย่อย ให้เป็นชื่องานหลักก่อนตรวจสอบ
        let docDeptMapped = getOfficialAgencyName(doc.department || '');

        const matchSearch = ((doc.archiveNo || '') + (doc.bookNo || '') + (doc.subject || '')).toLowerCase().includes(search);
        const matchFiscal = !fiscal || String(doc.fiscalYear || '') === fiscal;
        // เช็คกับชื่อที่ถูกแปลงแล้ว
        const matchDept = dept === "" || docDeptMapped === dept; 
        const matchType = type === "" || doc.category === type;
        
        return matchSearch && matchDept && matchType && matchFiscal;
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

        const safeDocUrl = /^https:\/\/(?:drive\.google\.com|docs\.google\.com)\//i.test(String(doc.fileUrl || '')) ? doc.fileUrl : '';
        const viewBtn = safeDocUrl ? 
            `<a href="${documentEscapeHtml(safeDocUrl)}" target="_blank" class="btn btn-info" style="padding: 4px 8px; font-size: 12px; text-decoration: none; color: white;">
                <i class="material-icons" style="font-size: 14px; vertical-align: middle;">visibility</i> ดูไฟล์
             </a>` : '-';
        
        const deleteBtn = `<button class="btn btn-danger" onclick="deleteDocument('${documentEscapeHtml(doc.id)}', '${documentEscapeHtml(doc.fileName || 'เอกสาร')}')" style="padding: 4px 8px; font-size: 12px; margin-left: 5px;">
                                <i class="material-icons" style="font-size: 14px;">delete</i>
                           </button>`;

        let dateShow = doc.bookDate ? String(doc.bookDate).split('T')[0] : '-';
        let createdShow = doc.createdAt ? String(doc.createdAt).split('T')[0] : '-';

        // แปลงชื่อในตารางให้แสดงเป็น "งานสวัสดิการนักศึกษา" เสมอ แม้เอกสารเก่าจะใช้ชื่อย่อย
        let displayDept = getOfficialAgencyName(doc.department || '-');

        // ใส่เลขลำดับ <td>${seqNo}</td> ลงไปในแถวแรก
        tr.innerHTML = `
            <td style="text-align:center; font-weight:bold; color:#555;">${seqNo}</td>
            <td style="font-weight:600;color:#1d4ed8;">${documentEscapeHtml(doc.archiveNo || 'เดิม (ไม่มีเลขจัดเก็บ)')}</td>
            <td style="text-align:center;">${formatDate(createdShow)}</td>
            <td>${documentEscapeHtml(doc.bookNo || '-')}</td>
            <td>
                <div style="font-weight:600; color:#333;">${documentEscapeHtml(doc.subject || '-')}</div>
                <small style="color:#777;">ลงวันที่: ${formatDate(dateShow)}</small>
            </td>
            <td>${documentEscapeHtml(displayDept)}</td>
            <td><span class="vf-badge" style="background:#f0f0f0;">${documentEscapeHtml(doc.category || '-')}</span></td>
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
            populateDocumentFiscalYears([]);
            filteredDocsCache = [];
            renderDocumentTableWithPagination();
            return;
        }
        allDocumentsCache = data;
        // The API already returns newest entries first; Thai-formatted dates should not be parsed with new Date().
        populateDocumentFiscalYears(allDocumentsCache);
        filterDocuments(); // เรียก Filter เพื่อเริ่มวาดตารางหน้า 1
    }).withFailureHandler(err => {
        hideLoading();
        showAlert('โหลดไม่สำเร็จ: ' + err.message, 'error');
    }).getAllDocumentsV2(sessionStorage.getItem('sessionToken'));
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
        // Print from the same submitted group; do not modify its status.
        const actionBox = tr.lastElementChild && tr.lastElementChild.querySelector('div');
        if (actionBox && typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'admin') {
            const printBtn = document.createElement('button');
            printBtn.type = 'button';
            printBtn.className = 'btn btn-primary';
            printBtn.title = 'พิมพ์ใบลงเวลาที่นักศึกษาส่งเบิกแล้ว';
            printBtn.style.cssText = 'padding:5px 9px;font-size:12px;white-space:nowrap;';
            printBtn.innerHTML = '<i class="material-icons" style="font-size:16px;vertical-align:middle;">print</i> พิมพ์ใบลงเวลา';
            printBtn.addEventListener('click', () => printAdminSubmittedTimesheetByGroupKey(key));
            actionBox.appendChild(printBtn);
            actionBox.style.flexWrap = 'wrap';
        }
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
    if (window.__ubuBudgetCutSaving === true) return;
    const cutButton = document.querySelector('button[onclick="confirmCutBudget()"]');
    if (window.paymentReportBudgetStatusReady !== true) {
        Swal.fire('ไม่สามารถตัดงบประมาณ', 'กรุณาสร้างรายงานใหม่เพื่อโหลดข้อมูลปีงบประมาณและเลขครั้งที่จากระบบ', 'error');
        return;
    }
    const report = (typeof currentReportJobInfo !== 'undefined') ? currentReportJobInfo : null;
    const itemIds = report && Array.isArray(report.itemIds) ? report.itemIds : [];
    if (!itemIds.length || itemIds.some(id => !/^PAYROW-[1-9]\d*$/.test(String(id)))) {
        Swal.fire('ไม่สามารถตัดงบประมาณ', 'ไม่พบรายการ Payroll ที่อ้างอิงได้ กรุณาสร้างรายงานใหม่และตรวจสอบรายการ', 'error');
        return;
    }
    const get = id => document.getElementById(id);
    const runNo = Number(get('inputRunNo')?.value);
    const year = Number(get('inputFiscalYear')?.value);
    const month = String(get('inputMonth')?.value || '').trim();
    const prevBalance = Number(get('inputPrevBalance')?.value);
    const sourceCode = String(get('inputSourceCode')?.value || '').trim();
    const currentWithdrawal = Number(String(get('repGrandTotal')?.textContent || '').replace(/,/g, '').trim());
    const token = sessionStorage.getItem('sessionToken');
    if (!token || !Number.isInteger(runNo) || runNo < 1 || !Number.isInteger(year) ||
        !Number.isFinite(prevBalance) || prevBalance < 0 || !Number.isFinite(currentWithdrawal) || currentWithdrawal <= 0) {
        Swal.fire('ข้อมูลไม่ครบ', 'กรุณาสร้างรายงานใหม่ ตรวจสอบยอดเงิน และเข้าสู่ระบบใหม่หาก Session หมดอายุ', 'error');
        return;
    }
    if (currentWithdrawal > prevBalance) {
        Swal.fire('งบประมาณไม่เพียงพอ', 'ยอดขอเบิกสูงกว่างบประมาณคงเหลือ ระบบจะไม่บันทึกตัดงบ', 'error');
        return;
    }
    Swal.fire({
        title: 'ยืนยันการบันทึกตัดงบ',
        html: `<div style="text-align:left;font-size:14px"><b>ครั้งที่:</b> ${runNo}/${year}<br><b>เดือน:</b> ${month.replace(/</g,'&lt;')}<br><b>จำนวนรายการ:</b> ${itemIds.length}<br><b>ยอดยกมา:</b> ${prevBalance.toLocaleString()} บาท<br><b>ตัดเบิก:</b> ${currentWithdrawal.toLocaleString()} บาท</div>`,
        icon: 'warning', showCancelButton: true, confirmButtonText: 'บันทึกและตัดยอด', cancelButtonText: 'ยกเลิก'
    }).then(result => {
        if (!result.isConfirmed || window.__ubuBudgetCutSaving === true) return;
        window.__ubuBudgetCutSaving = true;
        if (cutButton) cutButton.disabled = true;
        showLoading();
        const finish = () => {
            window.__ubuBudgetCutSaving = false;
            hideLoading();
        };
        try {
            google.script.run
              .withSuccessHandler(res => {
                  finish();
                  if (!res || res.success !== true) {
                      if (cutButton) cutButton.disabled = false;
                      Swal.fire('บันทึกไม่สำเร็จ', res && res.message ? res.message : 'Backend ไม่ตอบรับรายการ', 'error');
                      return;
                  }
                  // Deliberately keep Save disabled: this report has been cut already.
                  window.paymentReportBudgetStatusReady = false;
                  const newBalance = Number(res.newBalance);
                  if (get('inputPrevBalance') && Number.isFinite(newBalance)) get('inputPrevBalance').value = newBalance;
                  if (get('inputRunNo')) get('inputRunNo').value = Number(res.runNo) + 1;
                  if (get('inputAlreadyWithdrawn')) get('inputAlreadyWithdrawn').value = Number(res.withdrawnBefore || 0) + currentWithdrawal;
                  if (typeof updatePrintPreview === 'function') updatePrintPreview();
                  Swal.fire('บันทึกสำเร็จ', `ตัดงบครั้งที่ ${res.runNo}/${year} เรียบร้อย คงเหลือ ${newBalance.toLocaleString('th-TH')} บาท กรุณาสร้างรายงานใหม่ก่อนบันทึกครั้งถัดไป`, 'success');
              })
              .withFailureHandler(err => {
                  finish();
                  // A server failure may occur after committing the sheet. Do NOT retry blindly.
                  // Force fresh status to avoid duplicate budget deductions.
                  window.paymentReportBudgetStatusReady = false;
                  Swal.fire('ตรวจสอบผลการบันทึก', 'การติดต่อเซิร์ฟเวอร์ขัดข้อง: ' + (err && err.message ? err.message : String(err)) + ' กรุณาเปิดประวัติการตัดงบก่อนทำรายการใหม่', 'error');
              })
              .saveBudgetRunNo(token, {
                  runNo: runNo, year: year, itemIds: itemIds, month: month,
                  prevBalance: prevBalance, withdrawn: currentWithdrawal, sourceCode: sourceCode
              });
        } catch (err) {
            finish();
            window.paymentReportBudgetStatusReady = false;
            Swal.fire('ข้อผิดพลาด', String(err && err.message || err) + ' กรุณาตรวจสอบประวัติการตัดงบก่อนลองอีกครั้ง', 'error');
        }
    });
}



// Admin-only: print the submitted monthly timesheet without returning or editing TimeLogs.
function adminSubmittedEscape_(text) {
    return String(text == null ? '' : text).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function adminSubmittedThaiDate_(iso) {
    const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${Number(m[3])}/${Number(m[2])}/${Number(m[1]) + 543}` : String(iso || '-');
}
function adminSubmittedPrintHtml_(payload) {
    if (!payload || payload.success !== true || !Array.isArray(payload.logs) || !payload.logs.length) {
        throw new Error('ไม่พบข้อมูลใบลงเวลาสำหรับพิมพ์');
    }
    const months = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
        'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
    const parts = String(payload.monthKey || '').split('-');
    const month = Number(parts[1]);
    const year = Number(parts[0]);
    const monthLabel = month >= 1 && month <= 12 && year >= 1900
        ? `${months[month-1]} ${year+543}` : '-';
    const groups = new Map();
    payload.logs.forEach(log => {
        const key = String(log.date || '');
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(log);
    });
    let total = 0;
    let index = 0;
    let rows = '';
    for (const [day, entries] of groups) {
        const hours = entries.reduce((n, row) => n + (Number(row.hours) || 0), 0);
        // Match the student's timesheet summary for regular 3.5h / 7h workdays.
        const rawAmount = entries.reduce((n, row) => n + (Number(row.amount) || 0), 0);
        const amount = hours >= 7 ? 300 : hours >= 3.5 ? 150 : rawAmount;
        total += amount;
        entries.forEach((log, j) => {
            rows += `<tr><td class="center">${++index}</td>`;
            if (j === 0) rows += `<td class="center" rowspan="${entries.length}">${adminSubmittedEscape_(adminSubmittedThaiDate_(day))}</td>`;
            rows += `<td class="center">${adminSubmittedEscape_(log.checkIn || '-')}</td>`;
            rows += `<td class="center">${adminSubmittedEscape_(log.checkOut || '-')}</td>`;
            if (j === 0) rows += `<td class="center" rowspan="${entries.length}">${hours.toLocaleString('th-TH')}</td><td class="center" rowspan="${entries.length}">${amount.toLocaleString('th-TH', {maximumFractionDigits:0})}</td>`;
            rows += `<td>${adminSubmittedEscape_(log.details || '-')}</td><td></td></tr>`;
        });
    }
    const moneyWords = typeof BAHTTEXT === 'function' ? BAHTTEXT(total) : `(${total.toLocaleString('th-TH')} บาท)`;
    const E = adminSubmittedEscape_;
    return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>ใบลงเวลา ${E(payload.studentId)} ${E(monthLabel)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link id="ubuSarabunFontStylesheet" rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700&amp;display=swap">
<style>
@page{size:A4 portrait;margin:12mm 10mm}*{box-sizing:border-box}
body{margin:0;background:#f1f5f9;color:#000;font-family:'Sarabun','TH Sarabun PSK','TH-Sarabun-PSK','TH Sarabun New',sans-serif;font-size:14px}
.toolbar{padding:14px;display:flex;gap:10px;align-items:center;justify-content:center;background:#e9f3ff}
.toolbar button{border:0;background:#0d47a1;color:white;border-radius:7px;padding:10px 18px;cursor:pointer;font-size:14px}
.sheet{width:210mm;min-height:297mm;padding:15mm 12mm;background:white;margin:15px auto;box-shadow:0 2px 20px #0002;line-height:1.4}
h2{text-align:center;font-size:20px;line-height:1.3;margin:0 0 15px;font-weight:700}
.header{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:5px;font-size:16px;line-height:1.8}
table{width:100%;border-collapse:collapse;margin-top:15px;font-size:14px}th,td{border:1px solid #333;padding:5px 4px;vertical-align:top}th{background:#f8fafc;text-align:center}.center{text-align:center;vertical-align:middle}
tr{break-inside:avoid}thead{display:table-header-group}
.notes{margin-top:20px;font-size:14px;line-height:1.5}
.signatures{display:flex;justify-content:space-between;gap:24px;margin-top:60px;text-align:center;break-inside:avoid}
.signatures>div{width:48%}.muted{color:#64748b;font-size:12px}
@media print{body{background:white}.toolbar{display:none!important}.sheet{width:auto;min-height:0;margin:0;padding:0;box-shadow:none}.sheet,.sheet *{font-family:'Sarabun','TH Sarabun PSK','TH-Sarabun-PSK','TH Sarabun New',sans-serif!important}th{background:white}}
</style></head><body>
<div class="toolbar"><button type="button" onclick="window.ubuAdminPrintTimesheet()">พิมพ์ / บันทึกเป็น PDF</button><span class="muted">ข้อมูลจากรายการส่งเบิกแล้ว · ไม่เปลี่ยนสถานะรายการ</span></div>
<main class="sheet"><h2>แบบลงเวลาทำงานระหว่างเรียน มหาวิทยาลัยอุบลราชธานี</h2>
<div class="header"><span><b>หน่วยงาน :</b> ${E(payload.agency)}</span><span><b>ประจำเดือน :</b> ${E(monthLabel)}</span></div>
<div class="header"><span><b>ชื่อ–นามสกุล :</b> ${E(payload.studentName)}</span><span><b>รหัสนักศึกษา :</b> ${E(payload.studentId)}</span><span><b>คณะ :</b> ${E(payload.faculty || '-')}</span></div>
<table><colgroup><col style="width:5%"><col style="width:10%"><col style="width:10%"><col style="width:10%"><col style="width:10%"><col style="width:13%"><col><col style="width:13%"></colgroup><thead><tr><th>ลำดับ</th><th>วัน/เดือน/ปี</th><th>เวลามา</th><th>เวลากลับ</th><th>จำนวน (ชม.)</th><th>ค่าตอบแทน (บาท)</th><th>รายละเอียด</th><th>ลายมือชื่อ</th></tr></thead><tbody>${rows}</tbody>
<tfoot><tr><td colspan="5" class="center"><b>รวมเป็นเงินทั้งสิ้น</b></td><td class="center"><b>${total.toLocaleString('th-TH', {maximumFractionDigits:0})}</b></td><td colspan="2" class="center">${E(moneyWords)}</td></tr></tfoot></table>
<div class="notes"><b>อัตราค่าตอบแทน</b><div>1) ปฏิบัติงาน 3.5 ชั่วโมง ค่าตอบแทน 150 บาท</div><div>2) ปฏิบัติงาน 7 ชั่วโมง ค่าตอบแทน 300 บาท (ไม่นับรวมเวลาหยุดพัก 12.00–13.00 น.)</div></div>
<div class="signatures"><div>ลงชื่อ..........................................................<div>(${E(payload.studentName)})</div><div>ผู้ปฏิบัติงาน</div></div><div>ลงชื่อ..........................................................<div>(..........................................................)</div><div>ตำแหน่ง ...................................................</div><div>ผู้รับรองการปฏิบัติงาน</div></div></div>
</main></body></html>`;
}
function printAdminSubmittedTimesheetByGroupKey(key) {
    if (!currentUser || String(currentUser.role || '').toLowerCase() !== 'admin') {
        Swal.fire('ไม่มีสิทธิ์', 'เฉพาะ Admin สามารถพิมพ์รายการส่งเบิกย้อนหลังได้', 'error');
        return;
    }
    const group = window.submittedGroupsCache && window.submittedGroupsCache[key];
    if (!group || !Array.isArray(group.logIds) || !group.logIds.length) {
        Swal.fire('ไม่พบข้อมูล', 'กรุณารีเฟรชรายการส่งเบิกแล้วลองใหม่', 'warning');
        return;
    }
    const token = sessionStorage.getItem('sessionToken');
    if (!token) { Swal.fire('Session หมดอายุ', 'กรุณาเข้าสู่ระบบใหม่', 'warning'); return; }
    const popup = window.open('', '_blank'); // Must be opened by the user's click to avoid popup blocking.
    if (!popup) {
        Swal.fire('ไม่สามารถเปิดหน้าพิมพ์', 'โปรดอนุญาต Pop-ups สำหรับเว็บไซต์นี้แล้วลองใหม่', 'warning');
        return;
    }
    popup.document.open();
    popup.document.write('<!doctype html><html lang="th"><meta charset="utf-8"><title>กำลังเตรียมใบลงเวลา</title><body style="font-family:sans-serif;padding:30px">กำลังตรวจสอบข้อมูลใบลงเวลาจากระบบ...</body></html>');
    popup.document.close();
    google.script.run.withSuccessHandler(result => {
        try {
            const html = adminSubmittedPrintHtml_(result);
            if (popup.closed) return;
            popup.document.open();
            popup.document.write(html);
            popup.document.close();
            // Unlike the main student page, the new about:blank window does not inherit
            // the Sarabun webfont. Wait for that font before opening Windows print preview.
            popup.ubuAdminPrintTimesheet = async function() {
                try {
                    if (popup.document.fonts) {
                        await popup.document.fonts.load('400 14px Sarabun');
                        await popup.document.fonts.ready;
                    }
                } catch (fontError) {
                    console.warn('Sarabun webfont unavailable: printer may use locally installed TH Sarabun PSK.', fontError);
                }
                if (!popup.closed) { popup.focus(); popup.print(); }
            };
            popup.focus();
        } catch (err) {
            if (!popup.closed) popup.close();
            Swal.fire('ไม่สามารถสร้างใบลงเวลา', err && err.message ? err.message : String(err), 'error');
        }
    }).withFailureHandler(err => {
        if (!popup.closed) popup.close();
        Swal.fire('พิมพ์ใบลงเวลาไม่สำเร็จ', (err && err.message) || String(err), 'error');
    }).getSubmittedTimesheetForAdmin(token, group.logIds.slice());
}
