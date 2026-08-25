/**
 * UBU Job Student - Hash Router for GitHub Pages
 *
 * Keeps the existing SPA behavior intact while reflecting sidebar navigation
 * in the URL, e.g. #dashboard, #budget, #timekeeping.
 *
 * This file does NOT replace google.script.run compatibility or Apps Script API.
 * Load it AFTER all application scripts.
 */
(() => {
  'use strict';

  const NAV_ROUTES = Object.freeze({
    navUserDashboard: 'dashboard',
    navDashboard: 'dashboard',
    navPaymentInfo: 'payment-info',
    navStudentFinance: 'finance',
    navJobSearch: 'jobs',
    navRegularJob: 'timekeeping',

    navManageUsers: 'users',
    navManageStatus: 'student-status',
    navSystemLog: 'system-log',
    navManageAnnouncements: 'announcements',
    navYearEndClose: 'year-end',
    navImportHistory: 'import-history',

    navVerifyStudent: 'verify-student',
    navManageSubmitted: 'submitted',
    navManageBudget: 'budget',
    navManageRegular: 'regular-employees',

    navManageJobs: 'manage-jobs',
    navManageRegistrations: 'registrations',
    navDownloadData: 'download',

    navPayroll: 'payroll',
    navSpecialPayroll: 'special-payroll',
    navReportDisbursed: 'approve-disbursement',
    navAdminReport: 'report',
    navDocumentRepo: 'documents',
    navRecordTransfer: 'transfers',
    navRecordDisbursement: 'disbursement',

    navCheckStudentPay: 'check-payment',
    navAuditReport: 'audit',

    navHistoryLog: 'history',
    navMonthlyReport: 'monthly-report',
    navExecReport: 'executive-report',
    navFeedbackReport: 'feedback-report',

    navQuarterlyAnalysis: 'quarterly-analysis',
    navFacultyStats: 'faculty-stats',
    navBudgetForecast: 'budget-forecast',

    navFeedback: 'feedback',
    navManual: 'manual'
  });

  const ROUTE_TITLES = Object.freeze({
    dashboard: 'หน้าหลัก',
    'payment-info': 'ข้อมูลพร้อมเพย์',
    finance: 'ประวัติการเบิกจ่าย',
    jobs: 'ค้นหาและสมัครงาน',
    timekeeping: 'ลงเวลาปฏิบัติงาน',
    users: 'จัดการผู้ใช้งาน',
    'student-status': 'อัปเดตสถานะนักศึกษา',
    'system-log': 'ประวัติการทำงานในระบบ',
    announcements: 'ประกาศประชาสัมพันธ์',
    'year-end': 'ปิดบัญชีสิ้นปี',
    'import-history': 'นำเข้าข้อมูลย้อนหลัง',
    'verify-student': 'ตรวจสอบรายชื่อนักศึกษา',
    submitted: 'การคืน/จำหน่ายรายการ',
    budget: 'บริหารจัดการงบประมาณ',
    'regular-employees': 'ตั้งค่าจ้างงานนักศึกษา',
    'manage-jobs': 'ลงประกาศจ้างงาน',
    registrations: 'ตรวจสอบผู้สมัคร',
    download: 'ดาวน์โหลดข้อมูล',
    payroll: 'เบิกจ่ายค่าตอบแทน',
    'special-payroll': 'เบิกจ่ายด้วยวิธีพิเศษ',
    'approve-disbursement': 'อนุมัติรายการเบิกจ่าย',
    report: 'สร้างรายงานเบิกจ่าย',
    documents: 'จัดเก็บเอกสาร',
    transfers: 'บันทึกวันที่โอนเงิน',
    disbursement: 'บันทึกการปิดบัญชี',
    'check-payment': 'ตรวจสอบการเบิกจ่ายรายบุคคล',
    audit: 'ตรวจสอบทั้งระบบ',
    history: 'ประวัติการเบิกจ่าย',
    'monthly-report': 'รายงานประจำเดือน',
    'executive-report': 'รายงานผู้บริหาร',
    'feedback-report': 'รายงานผลประเมินระบบ',
    'quarterly-analysis': 'งบประมาณรายไตรมาส',
    'faculty-stats': 'สถิตินักศึกษารายคณะ',
    'budget-forecast': 'ประมาณการงบประมาณ',
    feedback: 'ประเมินความพึงพอใจ',
    manual: 'คู่มือการใช้งาน'
  });

  const ROLE_CLASS = Object.freeze({
    admin: 'admin-nav',
    staff: 'staff-nav',
    executive: 'exec-nav',
    user: 'user-nav'
  });

  const ROUTE_NAV = Object.create(null);
  Object.entries(NAV_ROUTES).forEach(([navId, route]) => {
    if (!ROUTE_NAV[route]) ROUTE_NAV[route] = [];
    ROUTE_NAV[route].push(navId);
  });

  let routeEventScheduled = false;

  function getCurrentUserSafe() {
    if (typeof currentUser !== 'undefined' && currentUser) return currentUser;
    try {
      const raw = sessionStorage.getItem('currentUser');
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function currentRoute() {
    return decodeURIComponent((window.location.hash || '').replace(/^#/, '')).trim();
  }

  function getDefaultNavId() {
    const user = getCurrentUserSafe();
    if (!user) return null;
    return ['admin', 'staff', 'executive'].includes(user.role)
      ? 'navDashboard'
      : 'navUserDashboard';
  }

  function getDefaultRoute() {
    const navId = getDefaultNavId();
    return navId ? NAV_ROUTES[navId] : '';
  }

  function findMappedNavFromTarget(target) {
    let node = target instanceof Element ? target : null;
    while (node && node !== document.documentElement) {
      if (node.id && NAV_ROUTES[node.id]) return node;
      node = node.parentElement;
    }
    return null;
  }

  function isNavAllowed(navId) {
    const user = getCurrentUserSafe();
    const el = document.getElementById(navId);
    if (!user || !el) return false;

    // This menu is granted dynamically by checkRegularJobAccess().
    if (navId === 'navRegularJob') {
      return user.role === 'user' && el.style.display !== 'none';
    }

    const item = el.closest('.nav-item');
    if (!item) return true;

    const permissionClasses = Object.values(ROLE_CLASS);
    const hasPermissionClass = permissionClasses.some(cls => item.classList.contains(cls));
    if (!hasPermissionClass) return true;

    const requiredClass = ROLE_CLASS[user.role];
    return Boolean(requiredClass && item.classList.contains(requiredClass));
  }

  function resolveNavForRoute(route) {
    const candidates = ROUTE_NAV[route] || [];
    if (!candidates.length) return null;

    // #dashboard is shared by student and staff/admin dashboards.
    if (route === 'dashboard') return getDefaultNavId();

    return candidates.find(isNavAllowed) || null;
  }

  function openParentSubmenu(el) {
    const submenu = el ? el.closest('.submenu-list') : null;
    if (!submenu) return;

    submenu.style.display = 'block';
    const toggle = submenu.previousElementSibling;
    if (toggle) {
      toggle.classList.add('active');
      const arrow = toggle.querySelector('.arrow-icon');
      if (arrow) arrow.style.transform = 'rotate(180deg)';
    }
  }

  function setDocumentTitle(route) {
    const pageTitle = ROUTE_TITLES[route];
    if (pageTitle) {
      document.title = `${pageTitle} | ระบบจ้างงานระหว่างเรียน`;
    } else {
      document.title = 'ระบบจ้างงานระหว่างเรียน';
    }
  }

  function replaceHash(route) {
    const url = route
      ? `${window.location.pathname}${window.location.search}#${encodeURIComponent(route)}`
      : `${window.location.pathname}${window.location.search}`;
    history.replaceState({ ubuRoute: route || null }, '', url);
    setDocumentTitle(route);
  }

  function pushHash(route) {
    if (!route || currentRoute() === route) {
      setDocumentTitle(route);
      return;
    }
    history.pushState({ ubuRoute: route }, '', `#${encodeURIComponent(route)}`);
    setDocumentTitle(route);
  }

  function goDefault({ replace = true, click = true } = {}) {
    const navId = getDefaultNavId();
    if (!navId) return false;
    const route = NAV_ROUTES[navId];

    if (replace) replaceHash(route);
    else pushHash(route);

    if (click) {
      const el = document.getElementById(navId);
      if (el) el.click();
    }
    return true;
  }

  function applyRouteFromLocation() {
    const route = currentRoute();
    const user = getCurrentUserSafe();

    if (!user) {
      if (route && route !== 'dashboard') {
        sessionStorage.setItem('pendingHashRoute', route);
      }
      return;
    }

    if (!route) {
      goDefault({ replace: true, click: false });
      return;
    }

    const navId = resolveNavForRoute(route);
    if (!navId || !isNavAllowed(navId)) {
      goDefault({ replace: true, click: true });
      return;
    }

    const el = document.getElementById(navId);
    if (!el) return;

    openParentSubmenu(el);
    setDocumentTitle(route);
    el.click();
  }

  function scheduleRouteApply() {
    if (routeEventScheduled) return;
    routeEventScheduled = true;
    setTimeout(() => {
      routeEventScheduled = false;
      applyRouteFromLocation();
    }, 0);
  }

  // Existing element click handlers run first. This delegated handler only mirrors
  // successful sidebar navigation into the URL, without changing existing callbacks.
  document.addEventListener('click', (event) => {
    const nav = findMappedNavFromTarget(event.target);
    if (!nav) return;

    const navId = nav.id;
    const route = NAV_ROUTES[navId];
    if (!route) return;

    const pending = sessionStorage.getItem('pendingHashRoute');
    const isDefaultNav = navId === 'navDashboard' || navId === 'navUserDashboard';

    // If the user opened a deep link before login, honor it immediately after login
    // instead of replacing it with #dashboard.
    if (pending && isDefaultNav && pending !== 'dashboard') {
      const pendingNavId = resolveNavForRoute(pending);
      if (pendingNavId && isNavAllowed(pendingNavId)) {
        sessionStorage.removeItem('pendingHashRoute');
        setTimeout(() => {
          replaceHash(pending);
          const pendingEl = document.getElementById(pendingNavId);
          if (pendingEl) {
            openParentSubmenu(pendingEl);
            pendingEl.click();
          }
        }, 0);
        return;
      }
      sessionStorage.removeItem('pendingHashRoute');
    }

    pushHash(route);
  }, false);

  // Back/Forward buttons and manually edited fragments.
  window.addEventListener('popstate', scheduleRouteApply);
  window.addEventListener('hashchange', scheduleRouteApply);

  // Run after the application's own DOMContentLoaded handlers restore the session.
  const initHashRouter = () => {
    setTimeout(() => {
      const user = getCurrentUserSafe();
      if (!user) {
        const route = currentRoute();
        if (route) sessionStorage.setItem('pendingHashRoute', route);
        return;
      }

      if (currentRoute()) applyRouteFromLocation();
      else goDefault({ replace: true, click: false });
    }, 0);
  };

  if (document.readyState === 'complete') initHashRouter();
  else window.addEventListener('load', initHashRouter, { once: true });

  // Clear hash routing state when the application logs out.
  function resetToLoginUrl() {
    try {
      sessionStorage.removeItem('pendingHashRoute');
    } catch (_) {}

    const cleanUrl = `${window.location.pathname}${window.location.search}`;
    history.replaceState({ ubuRoute: null }, '', cleanUrl);
    document.title = 'ระบบจ้างงานระหว่างเรียน';
  }

  // Keep the existing application's logout behavior, then clean the URL.
  // router.js is loaded last, so the original logout() already exists here.
  if (typeof window.logout === 'function' && !window.logout.__ubuHashRouterWrapped) {
    const originalLogout = window.logout;
    const wrappedLogout = function(...args) {
      const result = originalLogout.apply(this, args);
      resetToLoginUrl();
      return result;
    };
    wrappedLogout.__ubuHashRouterWrapped = true;
    window.logout = wrappedLogout;
  }

  // Public helper for debugging from DevTools if needed.
  window.UBUHashRouter = Object.freeze({
    routes: NAV_ROUTES,
    apply: applyRouteFromLocation,
    currentRoute,
    goDefault,
    reset: resetToLoginUrl
  });
})();
