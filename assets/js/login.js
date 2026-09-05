(function () {
  'use strict';

  let appBootPromise = null;

  const APP_DEPENDENCIES = [
    'https://cdn.jsdelivr.net/npm/chart.js',
    'https://unpkg.com/pdf-lib/dist/pdf-lib.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
  ];

  const APP_SCRIPTS = [
    './assets/js/core.js',
    './assets/js/users.js',
    './assets/js/budget.js',
    './assets/js/disbursement.js',
    './assets/js/timekeeping.js',
    './assets/js/analytics-docs.js',
    './assets/js/audit-print.js',
    './assets/js/auth-pdf.js',
    './assets/js/history.js',
    './assets/js/router.js'
  ];

  function showLoadingLocal() {
    const el = document.getElementById('customLoader');
    if (el) el.style.display = 'flex';
  }

  function hideLoadingLocal() {
    const el = document.getElementById('customLoader');
    if (el) el.style.display = 'none';
  }

  function alertLocal(message, type) {
    type = type || 'success';
    if (!window.Swal) {
      window.alert(String(message || ''));
      return;
    }
    if (type === 'success') {
      Swal.fire({ icon: 'success', title: 'สำเร็จ', text: message, confirmButtonText: 'ตกลง' });
    } else if (type === 'warning') {
      Swal.fire({ icon: 'warning', title: 'แจ้งเตือน', text: message, confirmButtonText: 'ตกลง' });
    } else {
      Swal.fire({ icon: 'error', title: 'แจ้งเตือน', text: message, confirmButtonText: 'ตกลง' });
    }
  }

  function showAuthSection(sectionId) {
    document.querySelectorAll('#authLayout .section').forEach(function (section) {
      section.classList.remove('active');
      section.style.display = 'none';
    });
    const target = document.getElementById(sectionId);
    if (target) {
      target.classList.add('active');
      target.style.display = '';
    }
    const auth = document.getElementById('authLayout');
    if (auth) auth.style.display = 'block';
    window.scrollTo(0, 0);
  }

  window.showSection = function (sectionId) {
     
    if (!document.getElementById('appLayout')) {
      showAuthSection(sectionId);
      return;
    }
     
    showAuthSection(sectionId);
  };

  window.togglePassword = function (inputId, iconElement) {
    const input = document.getElementById(inputId);
    if (!input) return;
    if (input.type === 'password') {
      input.type = 'text';
      if (iconElement) iconElement.innerText = 'visibility';
    } else {
      input.type = 'password';
      if (iconElement) iconElement.innerText = 'visibility_off';
    }
  };

   
  window.showLoading = showLoadingLocal;
  window.hideLoading = hideLoadingLocal;
  window.showAlert = alertLocal;

  function apiCall(action) {
    const args = Array.prototype.slice.call(arguments, 1);
    if (!window.GAS_API || typeof window.GAS_API.call !== 'function') {
      return Promise.reject(new Error('ไม่พบตัวเชื่อมต่อ API'));
    }
    return window.GAS_API.call(action, args);
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (document.querySelector('script[data-ubu-src="' + src.replace(/"/g, '') + '"]')) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.async = false;
      script.dataset.ubuSrc = src;
      script.onload = resolve;
      script.onerror = function () { reject(new Error('โหลดไฟล์ไม่สำเร็จ: ' + src)); };
      document.head.appendChild(script);
    });
  }

  async function loadProtectedApplication() {
    if (appBootPromise) return appBootPromise;

    appBootPromise = (async function () {
      const token = sessionStorage.getItem('sessionToken');
      const userRaw = sessionStorage.getItem('currentUser');
      if (!token || !userRaw) throw new Error('Unauthorized: กรุณาเข้าสู่ระบบ');

      showLoadingLocal();
      const shell = await apiCall('getProtectedAppShell');
      if (typeof shell !== 'string' || shell.indexOf('id="appLayout"') === -1) {
        throw new Error('ไม่สามารถโหลดหน้าระบบได้');
      }

      const mount = document.getElementById('protectedAppMount');
      mount.innerHTML = shell;

       
      for (const src of APP_DEPENDENCIES) await loadScript(src);
      if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      }

       
       
      for (const src of APP_SCRIPTS) await loadScript(src);

      window.__UBU_APP_MODULES_READY__ = true;
      if (typeof window.__UBU_RUN_CORE_INIT__ !== 'function') {
        throw new Error('ไม่พบตัวเริ่มต้นระบบหลังเข้าสู่ระบบ');
      }

       
      const auth = document.getElementById('authLayout');
      if (auth) auth.style.display = 'none';
      const app = document.getElementById('appLayout');
      if (app) app.style.display = 'flex';

      window.__UBU_RUN_CORE_INIT__();
      hideLoadingLocal();

       
      try {
        const user = JSON.parse(sessionStorage.getItem('currentUser') || 'null');
        if (user && ['admin', 'staff', 'executive'].includes(String(user.role || '').toLowerCase()) && typeof window.showSecurityNotice === 'function') {
          window.showSecurityNotice(function () {});
        }
        if (typeof window.trackUserAction === 'function') {
          window.trackUserAction('Login', 'เข้าสู่ระบบสำเร็จ');
        }
      } catch (_) {}

      return true;
    })().catch(function (error) {
      appBootPromise = null;
      hideLoadingLocal();
      throw error;
    });

    return appBootPromise;
  }

  window.loadProtectedApplication = loadProtectedApplication;

  async function finalizeLogin(res) {
    if (!res || !res.user || !res.token) {
      throw new Error('ข้อมูล Session ไม่สมบูรณ์');
    }
    sessionStorage.setItem('currentUser', JSON.stringify(res.user));
    sessionStorage.setItem('sessionToken', res.token);
    sessionStorage.removeItem('tempLoginId');
    await loadProtectedApplication();
  }

  function bindLogin() {
    const form = document.getElementById('loginForm');
    if (!form) return;
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      showLoadingLocal();
      const studentId = document.getElementById('loginStudentId').value.trim();
      const password = document.getElementById('loginPassword').value;
      try {
        const res = await apiCall('login', studentId, password);
        hideLoadingLocal();
        if (!res || !res.success) {
          alertLocal(res && res.message ? res.message : 'ไม่สามารถเข้าสู่ระบบได้', 'error');
          return;
        }
        if (res.requireOtp) {
          document.getElementById('otpEmailHint').textContent = res.emailHint || '';
          document.getElementById('otpCodeInput').value = '';
          sessionStorage.setItem('tempLoginId', studentId);
          showAuthSection('otpSection');
          return;
        }
        await finalizeLogin(res);
      } catch (err) {
        hideLoadingLocal();
        alertLocal(err.message || 'ไม่สามารถเข้าสู่ระบบได้', 'error');
      }
    });
  }

  function bindOtp() {
    const form = document.getElementById('otpForm');
    if (form) form.addEventListener('submit', async function (e) {
      e.preventDefault();
      const otpCode = document.getElementById('otpCodeInput').value.trim();
      const studentId = sessionStorage.getItem('tempLoginId');
      if (!studentId) {
        showAuthSection('loginSection');
        alertLocal('เซสชั่นหมดอายุ กรุณาเข้าสู่ระบบใหม่', 'error');
        return;
      }
      showLoadingLocal();
      try {
        const res = await apiCall('verifyOTP', studentId, otpCode);
        hideLoadingLocal();
        if (!res || !res.success) {
          alertLocal(res && res.message ? res.message : 'OTP ไม่ถูกต้อง', 'error');
          document.getElementById('otpCodeInput').value = '';
          return;
        }
        await finalizeLogin(res);
      } catch (err) {
        hideLoadingLocal();
        alertLocal(err.message || 'ไม่สามารถตรวจสอบ OTP ได้', 'error');
      }
    });

    const resend = document.getElementById('resendOtpBtn');
    if (resend) resend.addEventListener('click', async function (e) {
      e.preventDefault();
      const studentId = sessionStorage.getItem('tempLoginId');
      if (!studentId) return;
      showLoadingLocal();
      try {
        const res = await apiCall('resendOTP', studentId);
        hideLoadingLocal();
        if (res && res.success) alertLocal('ส่งรหัส OTP ใหม่ไปที่อีเมลแล้ว', 'success');
        else alertLocal(res && res.message ? res.message : 'ส่ง OTP ไม่สำเร็จ', 'error');
      } catch (err) {
        hideLoadingLocal();
        alertLocal(err.message || 'ส่ง OTP ไม่สำเร็จ', 'error');
      }
    });
  }

  function bindEligibilityAndSignup() {
    const eligibility = document.getElementById('eligibilityForm');
    if (eligibility) eligibility.addEventListener('submit', async function (e) {
      e.preventDefault();
      const studentId = document.getElementById('checkEligibleId').value.trim();
      if (!studentId) return;
      showLoadingLocal();
      try {
        const res = await apiCall('checkStudentEligibilityForSignup', studentId);
        hideLoadingLocal();
        if (!res || !res.allowed) {
          alertLocal(res && res.message ? res.message : 'ไม่สามารถลงทะเบียนได้', 'error');
          return;
        }
        showAuthSection('signupSection');
        const idEl = document.getElementById('signupStudentId');
        idEl.value = studentId;
        idEl.readOnly = true;
        idEl.style.backgroundColor = '#e9ecef';
        if (res.data) {
          if (res.data.prefix) document.getElementById('signupPrefix').value = res.data.prefix;
          if (res.data.faculty) document.getElementById('signupFaculty').value = res.data.faculty;
        }
        document.getElementById('signupFirstName').value = '';
        document.getElementById('signupLastName').value = '';
      } catch (err) {
        hideLoadingLocal();
        alertLocal(err.message || 'ตรวจสอบสิทธิ์ไม่สำเร็จ', 'error');
      }
    });

    const signup = document.getElementById('signupForm');
    if (signup) signup.addEventListener('submit', async function (e) {
      e.preventDefault();
      showLoadingLocal();
      const data = {
        gmail: document.getElementById('signupGmail').value,
        prefix: document.getElementById('signupPrefix').value,
        firstName: document.getElementById('signupFirstName').value,
        lastName: document.getElementById('signupLastName').value,
        studentId: document.getElementById('signupStudentId').value,
        faculty: document.getElementById('signupFaculty').value,
        phone: document.getElementById('signupPhone').value,
        password: document.getElementById('signupPassword').value,
        role: 'user'
      };
      try {
        const res = await apiCall('signUp', data);
        hideLoadingLocal();
        if (res && res.success) {
          alertLocal(res.message || 'ลงทะเบียนสำเร็จ', 'success');
          signup.reset();
          showAuthSection('loginSection');
        } else {
          alertLocal(res && res.message ? res.message : 'ลงทะเบียนไม่สำเร็จ', 'error');
        }
      } catch (err) {
        hideLoadingLocal();
        alertLocal(err.message || 'ลงทะเบียนไม่สำเร็จ', 'error');
      }
    });
  }

  async function loadPublicAnnouncements() {
    const container = document.getElementById('publicPrContainer');
    if (!container) return;
    try {
      const res = await apiCall('getActiveAnnouncements', 'student');
      const list = res && res.success && Array.isArray(res.data) ? res.data : [];
      container.replaceChildren();
      if (!list.length) return;

      const wrap = document.createElement('div');
      wrap.style.cssText = 'border-top:1px solid #e2e8f0;margin-top:30px;padding-top:20px;text-align:left;';
      const title = document.createElement('h4');
      title.textContent = 'ข่าวประชาสัมพันธ์';
      title.style.cssText = 'color:#e91e63;font-size:16px;margin:0 0 15px;font-weight:700;';
      wrap.appendChild(title);
      list.forEach(function (item) {
        const card = document.createElement('div');
        card.style.cssText = 'background:#f8fafc;border-left:3px solid #e91e63;padding:12px;margin-bottom:10px;border-radius:4px;';
        const h = document.createElement('div');
        h.textContent = item.title || '';
        h.style.fontWeight = '700';
        const d = document.createElement('div');
        d.textContent = item.detail || '';
        d.style.cssText = 'color:#475569;font-size:13px;line-height:1.5;white-space:pre-wrap;';
        card.append(h, d);
        wrap.appendChild(card);
      });
      container.appendChild(wrap);
    } catch (_) {}
  }

  function takeSsoTokenFromUrl() {
    try {
      const rawHash = String(window.location.hash || '').replace(/^#/, '');
      if (!rawHash) return '';
      const params = new URLSearchParams(rawHash);
      const token = String(params.get('sso') || '').trim();
      if (token) {
        history.replaceState(null, '', window.location.pathname + window.location.search);
      }
      return token;
    } catch (_) {
      return '';
    }
  }

  async function loginWithSsoToken(signedToken) {
    if (!signedToken || signedToken.length > 2048) {
      throw new Error('ข้อมูล Single Sign-On ไม่ถูกต้อง');
    }

    sessionStorage.removeItem('sessionToken');
    sessionStorage.removeItem('currentUser');
    sessionStorage.removeItem('tempLoginId');

    const res = await apiCall('ssoLogin', signedToken);
    if (!res || res.success !== true || !res.user || !res.token) {
      throw new Error(res && res.message ? res.message : 'Single Sign-On ไม่สำเร็จ');
    }

    await finalizeLogin(res);
  }

  async function bootstrapAuthentication() {
    const ssoToken = takeSsoTokenFromUrl();

    if (ssoToken) {
      showLoadingLocal();
      try {
        await loginWithSsoToken(ssoToken);
        hideLoadingLocal();
        return;
      } catch (err) {
        hideLoadingLocal();
        sessionStorage.removeItem('sessionToken');
        sessionStorage.removeItem('currentUser');
        sessionStorage.removeItem('tempLoginId');
        showAuthSection('loginSection');
        alertLocal(
          err && err.message
            ? err.message
            : 'Single Sign-On ไม่สำเร็จ กรุณาเปิดระบบจาก S-MIS PORTAL ใหม่',
          'error'
        );
        return;
      }
    }

    await restoreExistingSession();
  }

  async function restoreExistingSession() {
    const token = sessionStorage.getItem('sessionToken');
    const user = sessionStorage.getItem('currentUser');
    if (!token || !user) {
      showAuthSection('loginSection');
      hideLoadingLocal();
      return;
    }
    try {
      await loadProtectedApplication();
    } catch (_) {
      sessionStorage.removeItem('sessionToken');
      sessionStorage.removeItem('currentUser');
      sessionStorage.removeItem('tempLoginId');
      const mount = document.getElementById('protectedAppMount');
      if (mount) mount.replaceChildren();
      showAuthSection('loginSection');
      hideLoadingLocal();
    }
  }

  bindLogin();
  bindOtp();
  bindEligibilityAndSignup();
  loadPublicAnnouncements();
  bootstrapAuthentication();
})();
