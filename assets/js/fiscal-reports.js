/* UBU Student Jobs • Fiscal Intelligence V11 • read-only reports */
(function () {
  'use strict';
  const V = '20261115-legacy-reports-v14';
  const sections = {
    historyLogSection: 'ประวัติการเบิกจ่ายงบประมาณ (Log)',
    monthlyReportSection: 'รายงานสรุปประจำเดือน',
    execReportSection: 'รายงานสรุปการเบิกจ่าย (Executive View)',
    quarterlyAnalysisSection: 'วิเคราะห์งบประมาณรายไตรมาส',
    facultyStatsSection: 'สถิติการสมัครและการจ้างงานรายคณะ/หน่วยงาน',
    budgetForecastSection: 'การประมาณการงบประมาณ'
  };
  let activeYear = fiscalYearNow();
  let activeSection = 'historyLogSection';
  let store = new Map();
  let pending = new Map();
  let data = null;
  let charts = {};
  let lastRefresh = 0;
  const facultyDetailCache = new Map();
  let detailState = null;
  let detailSerial = 0;
  let detailReturnFocus = null;

  function fiscalYearNow() { const d=new Date(); return d.getFullYear()+543+(d.getMonth()>=9?1:0); }
  function number(n) { return Number(n || 0).toLocaleString('th-TH',{maximumFractionDigits:2}); }
  function money(n) { return n==null?'ไม่มีข้อมูล':number(n)+' บาท'; }
  function pct(n) { return n==null?'—':number(n)+'%'; }
  function esc(s) { return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function el(id) { return document.getElementById(id); }
  function status(s) { return s==='paid'?'โอนเงินสำเร็จ':s==='approved'?'อนุมัติรอโอนเงิน':'มีรายการ Payroll (สถานะอื่น)'; }
  function fyRange(year) { return `1 ต.ค. ${year-1} – 30 ก.ย. ${year}`; }
  function css() {
    if(el('frStyles')) return;
    const st=document.createElement('style');st.id='frStyles';
    st.textContent=`
      /* Use the existing UBU Student Jobs layout: .card, .form-header, .btn, .clean-table */
      .fr-shell{font-family:inherit;color:var(--text-color,#333);max-width:100%;font-size:15px}
      .fr-shell .fr-main-card{background:#fff;padding:25px;border-radius:4px;border-top:3px solid var(--secondary-color,#233b82);box-shadow:0 1px 3px rgba(0,0,0,.10);margin-bottom:20px}
      .fr-shell .fr-head{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;border-bottom:2px solid var(--secondary-color,#233b82);margin:0 0 20px;padding:0 0 15px}
      .fr-shell .fr-head h2{color:var(--secondary-color,#233b82);font-size:20px;font-weight:700;margin:0 0 5px;padding:0;border:0;line-height:1.4}
      .fr-shell .fr-head h2 .material-icons{font-size:23px;vertical-align:-5px;margin-right:5px}
      .fr-shell .fr-head small{display:block;color:#666;font-size:13px;line-height:1.5}
      .fr-shell .fr-controls{display:flex;gap:9px;align-items:center;flex-wrap:wrap}
      .fr-input{height:40px;max-width:100%;padding:8px 10px;font:inherit;font-size:14px;color:#333;background:#fdfdfd;border:1px solid #ccc;border-radius:4px}
      .fr-input:focus{outline:none;border-color:var(--accent-color,#1976d2);background:white}
      .fr-btn{display:inline-flex;align-items:center;justify-content:center;gap:4px;min-height:40px;border:0;border-radius:4px;padding:8px 15px;cursor:pointer;font:600 14px 'Sarabun',sans-serif;background:#6c757d;color:#fff;text-decoration:none;transition:filter .15s ease}
      .fr-btn:hover{filter:brightness(.92)}.fr-btn.primary{background:var(--success-color,#28a745);color:#fff}
      .fr-btn:disabled{cursor:not-allowed;opacity:.5}
      .fr-note{padding:12px 15px;border:1px solid #bbdefb;border-radius:6px;color:#36526a;background:#e3f2fd;font-size:13px;line-height:1.65;margin:16px 0}
      .fr-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:15px;margin:20px 0}
      .fr-kpi{display:flex;align-items:center;gap:15px;min-width:0;padding:15px;background:#fff;border:1px solid #eee;border-radius:8px;box-shadow:0 2px 5px rgba(0,0,0,.05)}
      .fr-kpi .sc-icon{display:flex;align-items:center;justify-content:center;flex:0 0 48px;height:48px;background:#e3f2fd;color:var(--secondary-color,#1976d2);border-radius:50%}
      .fr-kpi .sc-info{min-width:0}.fr-kpi .sc-info h4{font-size:13px;line-height:1.4;margin:0 0 5px;color:#777;font-weight:600}
      .fr-kpi .sc-info .num{font-size:20px;line-height:1.4;margin:0;color:#333;font-weight:700;overflow-wrap:anywhere}
      .fr-panel{padding:20px;margin:20px 0;background:#fff;border:1px solid #eee;border-radius:8px;min-width:0}
      .fr-panel h3{color:#333;font-size:16px;font-weight:700;margin:0 0 15px}
      .fr-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:18px}
      .fr-scroll{overflow-x:auto;max-width:100%}
      .fr-table{width:100%;min-width:730px;border-collapse:separate;border-spacing:0;border:1px solid #eee;border-radius:6px;font-size:14px}
      .fr-table th{position:sticky;top:0;background:#f1f3f5;color:#495057;font-weight:700;text-align:left;padding:12px 15px;border-bottom:2px solid #ddd;white-space:nowrap}
      .fr-table td{padding:12px 15px;border-bottom:1px solid #eee;color:#333;vertical-align:middle;line-height:1.5}
      .fr-table tbody tr:hover{background:#f8f9fa}
      .fr-right{text-align:right!important;font-variant-numeric:tabular-nums}.fr-muted{color:#777}.fr-strong{font-weight:700}
      .fr-filter{display:flex;align-items:center;flex-wrap:wrap;gap:10px;padding:15px;margin:0 0 20px;background:#f8f9fa;border:1px solid #eee;border-radius:8px}
      .fr-filter .fr-input{flex:1;min-width:145px}.fr-chart{height:290px;position:relative}
      .fr-status{display:inline-block;padding:3px 8px;border-radius:4px;color:#26713c;background:#e8f5e9;font-size:12px;font-weight:700;white-space:nowrap}
      .fr-status.pending{color:#995c04;background:#fff3e0}
      .fr-progress{height:7px;min-width:90px;background:#eee;border-radius:4px;overflow:hidden}.fr-progress i{display:block;height:100%;background:var(--secondary-color,#1976d2)}
      .fr-table.fr-compact{min-width:620px}.fr-table.fr-compact th:first-child,.fr-table.fr-compact td:first-child{position:sticky;left:0;z-index:1;background:#fff;min-width:180px;max-width:300px;text-align:left!important;white-space:normal}
      .fr-table.fr-compact th:first-child{z-index:3;background:#f1f3f5}
      .fr-table td.fr-num{text-align:right!important;font-variant-numeric:tabular-nums;white-space:nowrap}.fr-table td.fr-left{text-align:left!important}
      .fr-table tbody tr.fr-total td{font-weight:700;background:#f1f3f5!important;border-top:2px solid #ddd}
      .fr-table tbody tr.fr-total td:first-child{background:#f1f3f5!important}
      .fr-sub,.fr-subtle{font-size:13px;line-height:1.65;color:#666;margin:10px 0}
      .fr-section-caption{display:flex;justify-content:space-between;gap:12px;align-items:start;flex-wrap:wrap;margin-bottom:12px}
      .fr-section-caption .fr-filter{margin:0}.fr-panels{display:grid;grid-template-columns:1fr;gap:12px}
      .fr-big-number{font-size:18px;font-weight:700;color:var(--secondary-color,#1976d2)}
      .fr-warning{background:#fff3e0;border-left:3px solid #f0a738;padding:10px 12px;border-radius:4px;color:#795118;font-size:13px;margin-top:10px}
      .fr-error{padding:20px;background:#fff5f5;color:#a62828;border-radius:6px}
      .fr-empty{text-align:center;padding:22px;color:#777}.fr-loading{padding:25px;text-align:center;color:#666}
      .fr-fac-link{background:none;border:0;color:var(--secondary-color,#1976d2);font:inherit;font-weight:700;cursor:pointer;text-align:left;padding:2px 0;text-decoration:underline;text-underline-offset:3px}
      .fr-fac-link:hover{filter:brightness(.8)}.fr-action{white-space:nowrap}
      .fr-mini{font-size:12px;color:#777}.fr-reconcile summary{font-weight:700;cursor:pointer}
      .fr-detail-backdrop[hidden]{display:none!important}
      .fr-detail-backdrop{position:fixed;inset:0;z-index:25000;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px}
      .fr-detail-dialog{display:flex;flex-direction:column;width:min(1020px,100%);max-height:calc(100dvh - 32px);background:#fff;color:#333;border-radius:6px;box-shadow:0 8px 26px rgba(0,0,0,.25);overflow:hidden}
      .fr-detail-header{display:flex;align-items:start;justify-content:space-between;gap:14px;padding:18px 20px;border-bottom:2px solid var(--secondary-color,#233b82)}
      .fr-detail-header h3{font-size:20px;margin:0 0 3px;color:var(--secondary-color,#233b82)}
      .fr-detail-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:12px 20px;background:#f8f9fa;border-bottom:1px solid #eee}
      .fr-detail-bar .fr-input{min-width:140px;flex:1}.fr-detail-main{overflow:auto;padding:0 20px 14px;min-height:100px}
      .fr-detail-table{min-width:720px}.fr-detail-footer{display:flex;gap:8px;justify-content:space-between;align-items:center;flex-wrap:wrap;padding:10px 20px;border-top:1px solid #eee;font-size:12px}
      .fr-tab[aria-pressed=true]{background:var(--secondary-color,#233b82);color:white}
      .fr-footer{padding:8px 0;color:#777;font-size:12px;text-align:right}
      @media(max-width:650px){.fr-shell .fr-main-card{padding:15px}.fr-grid{grid-template-columns:1fr}.fr-cards{grid-template-columns:repeat(2,minmax(0,1fr))}.fr-kpi{padding:12px;gap:8px}.fr-kpi .sc-icon{display:none}.fr-kpi .sc-info .num{font-size:18px}.fr-panel{padding:12px}.fr-shell .fr-head{gap:10px}.fr-detail-backdrop{padding:0}.fr-detail-dialog{border-radius:0;max-height:100dvh;height:100dvh}.fr-detail-header,.fr-detail-bar,.fr-detail-main,.fr-detail-footer{padding-left:12px;padding-right:12px}.fr-detail-bar .fr-input{flex-basis:100%}}
      @media print{.sidebar,.navbar,.fr-controls,.fr-filter,.fr-btn{display:none!important}.fr-shell,.fr-panel,.fr-main-card{box-shadow:none!important;border:0!important}.fr-scroll{overflow:visible!important}.fr-table{min-width:0!important;font-size:10px!important}.fr-table th,.fr-table td{padding:6px!important}}
    `;
    document.head.appendChild(st);
  }
  function yearSelect() {
    const years=Array.from({length:6},(_,i)=>fiscalYearNow()+1-i);
    if(!years.includes(activeYear))years.push(activeYear);
    years.sort((a,b)=>b-a);
    return `<select class="fr-input" data-fr-year aria-label="เลือกปีงบประมาณ">${years.map(y=>`<option value="${y}" ${y===activeYear?'selected':''}>ปีงบประมาณ ${y}</option>`).join('')}</select>`;
  }
  function panel(title, content) {return `<div class="fr-panel"><h3>${esc(title)}</h3>${content}</div>`;}
  function table(id, heads) {return `<div class="fr-scroll table-container"><table class="fr-table clean-table" id="${id}"><thead><tr>${heads.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody><tr><td colspan="${heads.length}" class="fr-loading">กำลังโหลดข้อมูลปีงบประมาณ…</td></tr></tbody></table></div>`;}
  function base(id,title) {
    const icons={historyLogSection:'manage_search',monthlyReportSection:'summarize',execReportSection:'analytics',quarterlyAnalysisSection:'pie_chart',facultyStatsSection:'school',budgetForecastSection:'trending_up'};
    return `<div class="fr-shell" data-fr-report="${id}"><div class="card fr-main-card">
    <div class="form-header fr-head"><div><h2><i class="material-icons" aria-hidden="true">${icons[id]||'assessment'}</i>${esc(title)}</h2><small>แยกข้อมูลตามปีงบประมาณ • ${esc(fyRange(activeYear))}</small></div>
    <div class="fr-controls">${yearSelect()}<button type="button" class="fr-btn btn btn-secondary" data-fr-refresh><i class="material-icons" style="font-size:17px" aria-hidden="true">refresh</i> รีเฟรชข้อมูล</button><button type="button" class="fr-btn btn btn-secondary" data-fr-print><i class="material-icons" style="font-size:17px" aria-hidden="true">print</i> พิมพ์รายงาน</button><button type="button" class="fr-btn btn btn-success primary" data-fr-export="${id}"><i class="material-icons" style="font-size:17px" aria-hidden="true">download</i> ส่งออก CSV</button></div></div>
    <div class="fr-note" id="frNotes_${id}">กำลังตรวจสอบข้อมูลสำหรับปีงบประมาณ ${activeYear}…</div><div id="frBody_${id}" class="fr-loading">กำลังโหลดรายงาน…</div>
    <div class="fr-footer" id="frFoot_${id}">ระบบรายงานเชิงวิเคราะห์ • ข้อมูลจากระบบทำงานระหว่างเรียน</div></div></div>`;
  }
  function build() {
    css();
    Object.entries(sections).forEach(([id,title])=>{
      const root=el(id);if(!root)return;
      root.innerHTML=base(id,title);
      root.addEventListener('change',e=>{
        if(e.target.matches('[data-fr-year]')) {
          const year=Number(e.target.value);
          if(!Number.isInteger(year))return;
          closeFacultyDetail();
          activeYear=year;
          document.querySelectorAll('[data-fr-year]').forEach(x=>x.value=String(year));
          load(id);
        } else if(e.target.matches('[data-fr-month],[data-fr-dept],[data-fr-faculty],[data-fr-quarter],[data-fr-date-from],[data-fr-date-to],[data-fr-fac-sort],[data-fr-unit-sort]'))render(id);
      });
      root.addEventListener('input',e=>{if(e.target.matches('[data-fr-query],[data-fr-fac-query],[data-fr-unit-query]'))render(id);});
      root.addEventListener('click',e=>{
        const refresh=e.target.closest('[data-fr-refresh]');
        const exportBtn=e.target.closest('[data-fr-export]');
        if(refresh)load(id,true);
        if(e.target.closest('[data-fr-print]'))printFiscalReport(id);
        if(exportBtn)download(id);
        if(e.target.closest('[data-fr-export-unit]'))downloadAgencies();
        if(e.target.closest('[data-fr-export-fac]'))download('facultyStatsSection');
        const facultyButton=e.target.closest('[data-fr-fac-detail]');
        if(facultyButton)openFiscalFacultyDetail(facultyButton.getAttribute('data-fr-fac-detail'),facultyButton);
      });
    });
  }
  async function fetchYear(year,force) {
    if(!force&&store.has(year))return store.get(year);
    if(!force&&pending.has(year))return pending.get(year);
    const request=new Promise((resolve,reject)=>{
      const token=sessionStorage.getItem('sessionToken')||'';
      if(!token){reject(new Error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่'));return;}
      google.script.run.withSuccessHandler(r=>r&&r.success?resolve(r.data):reject(new Error((r&&r.message)||'ไม่สามารถดึงรายงาน')))
        .withFailureHandler(reject).getFiscalReportingDashboard(token,year);
    });
    pending.set(year,request);
    try {const response=await request;store.set(year,response);return response;}
    finally {pending.delete(year);}
  }
  async function load(id,force) {
    activeSection=id||activeSection;
    const requestYear=activeYear;
    const notes=el('frNotes_'+id),body=el('frBody_'+id);
    if(!body)return;
    body.innerHTML='<div class="fr-loading">กำลังรวบรวมข้อมูลตามปีงบประมาณ…</div>';
    try{
      if(force)facultyDetailCache.clear();
      const result=await fetchYear(requestYear,!!force);
      if(requestYear!==activeYear)return;
      data=result;lastRefresh=Date.now();
      render(id);
      if(notes){
        const warns=data.warnings||[];
        if(id==='facultyStatsSection'){
          const audit=warns.filter(w=>!(/^(ผู้สมัคร:|มีรายการเบิก \(คน\):|ยังไม่มีรายการเบิก =|ปีงบประมาณของ Payroll)/.test(w)));
          notes.innerHTML=`<b>ปีงบประมาณ ${activeYear}</b> • ${esc(fyRange(activeYear))} • ข้อมูล ณ ${esc(data.asOf)}`+
            (audit.length?`<details style="margin-top:8px"><summary style="cursor:pointer">ข้อสังเกตที่ควรตรวจสอบ (${audit.length})</summary><div style="margin-top:8px">${audit.map(w=>`• ${esc(w)}`).join('<br>')}</div></details>`:'');
        } else notes.innerHTML=`<b>ปีงบประมาณ ${activeYear}:</b> ${esc(fyRange(activeYear))} • ข้อมูล ณ ${esc(data.asOf)}<div style="margin-top:6px">${warns.map(w=>`• ${esc(w)}`).join('<br>')}</div>`;
      }
    }catch(error){
      if(requestYear!==activeYear)return;
      body.innerHTML=`<div class="fr-error">${esc(error&&error.message||error)}<div style="margin-top:12px"><button class="fr-btn" data-fr-refresh>ลองใหม่</button></div></div>`;
      if(notes)notes.textContent='ไม่สามารถโหลดข้อมูลปีงบประมาณ '+activeYear;
    }
  }
  function kpi(name,value) {return `<div class="fr-kpi summary-card"><span class="sc-icon" aria-hidden="true"><i class="material-icons">assessment</i></span><div class="sc-info"><h4>${esc(name)}</h4><p class="num">${esc(String(value))}</p></div></div>`;}
  function trRows(id,rows,cells) {
    const tableEl=el(id);if(!tableEl)return;
    const tbody=tableEl.tBodies[0];
    tbody.innerHTML=rows.length?rows.map(row=>`<tr>${cells(row).map((c,i)=>`<td class="${i?'fr-right':''}">${c}</td>`).join('')}</tr>`).join('')
      :`<tr><td colspan="${tableEl.tHead.rows[0].cells.length}" class="fr-empty">ไม่พบข้อมูลตามเงื่อนไข</td></tr>`;
  }
  function select(name,values,label,key) {
    return `<select class="fr-input" data-fr-${name} aria-label="${esc(label)}"><option value="">${esc(label)}ทั้งหมด</option>${values.map(v=>`<option value="${esc(v[key]||v)}">${esc(v[key]||v)}</option>`).join('')}</select>`;
  }
  function area(id, html) {
    const node=el('frBody_'+id);if(!node)return;
    const prev={};node.querySelectorAll('[data-fr-month],[data-fr-dept],[data-fr-faculty],[data-fr-quarter],[data-fr-query],[data-fr-date-from],[data-fr-date-to]').forEach(x=>prev[x.dataset.frMonth?'month':x.dataset.frDept?'dept':x.dataset.frFaculty?'faculty':x.dataset.frQuarter?'quarter':x.dataset.frDateFrom?'dateFrom':x.dataset.frDateTo?'dateTo':'query']=x.value);
    node.innerHTML=html;
    node.querySelectorAll('[data-fr-month],[data-fr-dept],[data-fr-faculty],[data-fr-quarter],[data-fr-query],[data-fr-date-from],[data-fr-date-to]').forEach(x=>{const k=x.dataset.frMonth?'month':x.dataset.frDept?'dept':x.dataset.frFaculty?'faculty':x.dataset.frQuarter?'quarter':x.dataset.frDateFrom?'dateFrom':x.dataset.frDateTo?'dateTo':'query';if(prev[k])x.value=prev[k];});
  }
  function filterHistory() {
    let rows=data.history||[];
    const dept=el('frBody_historyLogSection')?.querySelector('[data-fr-dept]')?.value||'';
    const query=(el('frBody_historyLogSection')?.querySelector('[data-fr-query]')?.value||'').trim().toLocaleLowerCase('th');
    const statusFilter=el('frBody_historyLogSection')?.querySelector('[data-fr-quarter]')?.value||'';
    if(dept)rows=rows.filter(r=>r.department===dept);
    if(statusFilter)rows=rows.filter(r=>r.status===statusFilter);
    const start=el('frBody_historyLogSection')?.querySelector('[data-fr-date-from]')?.value||'';
    const end=el('frBody_historyLogSection')?.querySelector('[data-fr-date-to]')?.value||'';
    if(start)rows=rows.filter(r=>r.date>=start);if(end)rows=rows.filter(r=>r.date<=end);
    if(query)rows=rows.filter(r=>[r.department,r.project,r.faculty,r.date].some(x=>String(x||'').toLocaleLowerCase('th').includes(query)));
    return rows;
  }
  function drawHistory(init) {
    const id='historyLogSection';
    if(init){
      area(id,`<div class="fr-cards">${kpi('รายการ Payroll ที่มีสถานะอนุมัติ/จ่ายแล้ว',number(data.totals.payrollRows))}${kpi('โอนเงินสำเร็จ',money(data.totals.paidAmount))}${kpi('อนุมัติรอโอนเงิน',money(data.totals.approvedAmount))}</div>
      <div class="fr-filter"><input class="fr-input" data-fr-query placeholder="ค้นหาโครงการ/หน่วยงาน/คณะ…" aria-label="ค้นหา">${select('dept',data.agencies,'หน่วยงาน','name')}
      <input type="date" class="fr-input" data-fr-date-from title="ตั้งแต่วันที่" aria-label="ตั้งแต่วันที่"/><input type="date" class="fr-input" data-fr-date-to title="ถึงวันที่" aria-label="ถึงวันที่"/>
      <select class="fr-input" data-fr-quarter><option value="">ทุกสถานะ</option><option value="paid">โอนเงินสำเร็จ</option><option value="approved">อนุมัติรอโอนเงิน</option></select></div>
      ${table('frHistory',['วันที่ปฏิบัติงาน','โครงการ/งาน','หน่วยงาน','คณะ','สถานะ','ยอดเงิน (บาท)','คงเหลือหน่วยงาน*'])}
      <p class="fr-sub" style="margin-top:10px">* งบคงเหลือแสดงเฉพาะหน่วยงานที่มีงบจัดสรรยืนยันตามปีงบประมาณ และหักเฉพาะรายการโอนสำเร็จ</p>`);
    }
    const rows=filterHistory();
    trRows('frHistory',rows,r=>[esc(r.date||'—'),esc(r.project||'ไม่ระบุ'),esc(r.department),esc(r.faculty),`<span class="fr-status ${r.status==='approved'?'pending':''}">${esc(status(r.status))}</span>`,number(r.amount),r.balanceAfter==null?'—':number(r.balanceAfter)]);
  }
  function monthFilter() { return el('frBody_monthlyReportSection')?.querySelector('[data-fr-month]')?.value||''; }
  function deptFilter() { return el('frBody_monthlyReportSection')?.querySelector('[data-fr-dept]')?.value||''; }
  function monthlyRows() {
    let rows=data.history;
    const month=monthFilter(),dept=deptFilter();
    if(month!=='')rows=rows.filter(r=>r.monthIndex===Number(month));
    if(dept)rows=rows.filter(r=>r.department===dept);
    return rows;
  }
  function drawMonthly(init) {
    const id='monthlyReportSection';
    if(init){
      area(id,`<div class="fr-filter"><select class="fr-input" data-fr-month><option value="">ทั้งปีงบประมาณ</option>${data.months.map(m=>`<option value="${m.index}">${esc(m.label)}</option>`).join('')}</select>${select('dept',data.agencies,'หน่วยงาน','name')}</div>
      <div id="frMonthSummary" class="fr-cards"></div>
      ${panel('แนวโน้มรายเดือน',`<div class="fr-chart"><canvas id="frMonthChart"></canvas></div>`)}
      ${panel('ข้อมูลรายการเบิกจ่าย',table('frMonthly',['วันที่','หน่วยงาน','โครงการ/งาน','สถานะ','จำนวนเงิน (บาท)']))}`);
    }
    const rows=monthlyRows(),approved=rows.filter(r=>r.status==='approved'),paid=rows.filter(r=>r.status==='paid');
    el('frMonthSummary').innerHTML=kpi('จำนวนรายการ',number(rows.length))+kpi('โอนสำเร็จ',money(paid.reduce((s,r)=>s+r.amount,0)))+kpi('อนุมัติรอโอน',money(approved.reduce((s,r)=>s+r.amount,0)))+kpi('หน่วยงานที่มีรายการ',number(new Set(rows.map(r=>r.department)).size));
    trRows('frMonthly',rows,r=>[esc(r.date),esc(r.department),esc(r.project),esc(status(r.status)),number(r.amount)]);
    chart('frMonthChart','bar',data.months.map(m=>m.label),[
      {label:'จ่ายแล้ว',data:data.months.map(m=>m.paid),backgroundColor:'#276cb0'},
      {label:'รอโอน',data:data.months.map(m=>m.approved),backgroundColor:'#f2b84a'}]);
  }
  function drawExecutive(init) {
    const id='execReportSection',t=data.totals;
    if(init){area(id,`<div class="fr-cards">${kpi('งบจัดสรรที่ยืนยันได้',money(t.budget))}${kpi('จ่ายแล้ว',money(t.paidAmount))}${kpi('รอโอนเงิน',money(t.approvedAmount))}${kpi('คงเหลือตามยอดจ่าย',money(t.remaining))}</div>
      <div class="fr-grid">${panel('เบิกจ่ายและงบจัดสรรรายหน่วยงาน',`<div class="fr-chart"><canvas id="frExecChart"></canvas></div>`)}
      ${panel('สัดส่วนจ่ายจริงรายหน่วยงาน',`<div class="fr-chart"><canvas id="frExecPie"></canvas></div>`)}</div>
      ${panel('ประสิทธิภาพการบริหารงบรายหน่วยงาน',table('frExecTable',['หน่วยงาน','งบจัดสรร (บาท)','โอนแล้ว (บาท)','รอโอน (บาท)','% ใช้งบ','ผู้ได้รับการจ้าง (คน)']))}`);}
    trRows('frExecTable',data.agencies,r=>[esc(r.name),r.allocated==null?'—':number(r.allocated),number(r.paidAmount),number(r.approvedAmount),pct(r.budgetRatio),number(r.hired)]);
    const top=data.agencies.slice(0,12);
    chart('frExecChart','bar',top.map(x=>x.name),[
      {label:'จัดสรร (เฉพาะข้อมูลที่ยืนยัน)',data:top.map(x=>x.allocated==null?0:x.allocated),backgroundColor:'#6f9dc7'},
      {label:'จ่ายแล้ว',data:top.map(x=>x.paidAmount),backgroundColor:'#246bb3'},
      {label:'รอโอน',data:top.map(x=>x.approvedAmount),backgroundColor:'#eab053'}]);
    const filled=top.filter(x=>x.paidAmount>0);
    chart('frExecPie','doughnut',filled.map(x=>x.name),[{label:'ยอดจ่าย',data:filled.map(x=>x.paidAmount),backgroundColor:['#2f6bb0','#68abce','#d4a94a','#49a6a0','#876ac1','#e98d61','#7795a9','#94bf87','#ba86ac','#b69f72','#558fb6','#b8c7d6']}]);
  }
  function quarterFilter(){return el('frBody_quarterlyAnalysisSection')?.querySelector('[data-fr-quarter]')?.value||'';}
  function drawQuarterly(init) {
    const id='quarterlyAnalysisSection';
    if(init){area(id,`<div class="fr-filter"><select class="fr-input" data-fr-quarter><option value="">ครบทั้ง 4 ไตรมาส</option>${data.quarters.map((q,i)=>`<option value="${i}">${q.name}</option>`).join('')}</select></div>
      <div id="frQuarterSummary" class="fr-cards"></div>
      <div class="fr-grid">${panel('การใช้จ่ายเปรียบเทียบไตรมาส',`<div class="fr-chart"><canvas id="frQuarterChart"></canvas></div>`)}
      ${panel('สัดส่วนการโอนสำเร็จในแต่ละไตรมาส',`<div class="fr-chart"><canvas id="frQuarterPie"></canvas></div>`)}</div>
      ${panel('สรุปรายไตรมาส',table('frQuarterTable',['ไตรมาส','โอนสำเร็จ (บาท)','อนุมัติรอโอน (บาท)','จำนวนรายการ','สัดส่วนยอดโอนทั้งปี']))}`);}
    const selected=quarterFilter(),qData=selected===''?data.quarters:[data.quarters[Number(selected)]];
    const paid=qData.reduce((s,q)=>s+q.paid,0),pendingAmt=qData.reduce((s,q)=>s+q.approved,0);
    el('frQuarterSummary').innerHTML=kpi('ยอดจ่ายแล้ว',money(paid))+kpi('ยอดอนุมัติรอโอน',money(pendingAmt))+kpi('จำนวนรายการ',number(qData.reduce((s,q)=>s+q.count,0)));
    trRows('frQuarterTable',qData,q=>[esc(q.name),number(q.paid),number(q.approved),number(q.count),pct(data.totals.paidAmount?100*q.paid/data.totals.paidAmount:null)]);
    chart('frQuarterChart','bar',data.quarters.map(q=>q.label),[
      {label:'โอนสำเร็จ',data:data.quarters.map(q=>q.paid),backgroundColor:'#307cba'},
      {label:'รอโอน',data:data.quarters.map(q=>q.approved),backgroundColor:'#f3bd5f'}]);
    chart('frQuarterPie','doughnut',data.quarters.map(q=>q.label),[{label:'สัดส่วน',data:data.quarters.map(q=>q.paid),backgroundColor:['#2b72b7','#71b4d1','#e3b663','#65b7a5']}]);
  }
  function frViewRows(rows, query, sortBy) {
    let found=(rows||[]).filter(x=>!query||String(x.name||'').toLocaleLowerCase('th').includes(query));
    if(sortBy==='name')found.sort((a,b)=>a.name.localeCompare(b.name,'th'));
    else found.sort((a,b)=>Number(b[sortBy]||0)-Number(a[sortBy]||0)||a.name.localeCompare(b.name,'th'));
    return found;
  }
  function facultyFilter(){return(el('frBody_facultyStatsSection')?.querySelector('[data-fr-fac-query]')?.value||'').trim().toLocaleLowerCase('th');}
  function unitFilter(){return(el('frBody_facultyStatsSection')?.querySelector('[data-fr-unit-query]')?.value||'').trim().toLocaleLowerCase('th');}
  function facultyRows(){
    const body=el('frBody_facultyStatsSection'),sort=body?.querySelector('[data-fr-fac-sort]')?.value||'applied';
    return frViewRows(data.faculty,facultyFilter(),sort);
  }
  function agencyRows(){
    const body=el('frBody_facultyStatsSection'),sort=body?.querySelector('[data-fr-unit-sort]')?.value||'applied';
    return frViewRows(data.agencies,unitFilter(),sort);
  }
function drawFaculty(init) {
  const id='facultyStatsSection',t=data.totals,c=data.coverage||{};
  const ready=!!c.rosterReady;
  if(init){area(id,`
    <div class="fr-cards">${kpi('ผู้สมัครตามทะเบียน',ready?number(t.applicants)+' คน':'ตรวจสอบชีต')}${kpi('ผู้สมัครที่มีรายการ Payroll',number(t.matchedPayrollApplicants)+' คน')}${kpi('ผู้สมัครที่ยังไม่มีรายการ Payroll',ready?number(t.notHired)+' คน':'—')}${kpi('โอนสำเร็จปีนี้',money(t.paidAmount))}</div>
    <div class="fr-note"><b>ข้อมูลเฉพาะปีงบประมาณ ${activeYear}</b> (${esc(fyRange(activeYear))}) • นับรหัสนักศึกษาไม่ซ้ำ • <b>เลือกชื่อคณะหรือกด “ดูรายชื่อ” เพื่อดูรายละเอียด</b><br>
    ผู้สมัคร: รายชื่อนักศึกษา B/D/Q • มีรายการเบิก: Payroll C/F/K/M • ยอดเงิน: Payroll H/K/M • หน่วยงาน: คอลัมน์ N ของทะเบียนและ J ของ Payroll</div>
    ${panel('สรุปผู้สมัครและการเบิกจ่ายรายคณะ',`
      <div class="fr-filter"><input class="fr-input" data-fr-fac-query aria-label="ค้นหาคณะ" placeholder="ค้นหาคณะ…" />
      <select class="fr-input" data-fr-fac-sort aria-label="เรียงคณะ"><option value="applied">ผู้สมัครมากไปน้อย</option><option value="hiredMatched">ผู้สมัครที่มีรายการเบิกมากไปน้อย</option><option value="notHired">ผู้สมัครที่ยังไม่มีรายการเบิกมากไปน้อย</option><option value="name">ชื่อคณะ ก–ฮ</option></select></div>
      ${table('frFacultyTable',['คณะ','ผู้สมัคร','มีรายการเบิก','ยังไม่มีรายการเบิก','อัตรา (%)','โอนสำเร็จ (บาท)','รายละเอียด'])}
      <p class="fr-subtle" style="margin-top:10px">ยอดจำนวนคนอ้างอิงผู้สมัครในทะเบียนของคณะเดียวกันและปีเดียวกัน ส่วนยอดโอนสำเร็จจัดตาม Payroll.StudentFaculty หากชื่อคณะในสองชีตต่างกันให้ตรวจสอบในส่วนรายการผิดปกติด้านล่าง</p>`)}
    ${panel('ความคืบหน้าการจ้างงานรายหน่วยงาน',`
      <div class="fr-filter"><input class="fr-input" data-fr-unit-query aria-label="ค้นหาหน่วยงาน" placeholder="ค้นหาหน่วยงาน/ลักษณะงานที่ต้องการ…" />
      <select class="fr-input" data-fr-unit-sort aria-label="เรียงหน่วยงาน"><option value="applied">ผู้สมัครมากไปน้อย</option><option value="hired">มีรายการเบิกมากไปน้อย</option><option value="notHired">ยังไม่มีรายการเบิกมากไปน้อย</option><option value="name">ชื่อ ก–ฮ</option></select>
      <button class="fr-btn" data-fr-export-unit>ส่งออกหน่วยงาน CSV</button></div>
      ${table('frAgencyTable',['หน่วยงาน/ลักษณะงาน (N/J)','ผู้สมัคร','มีรายการ Payroll','ตรงทะเบียน','ยังไม่มีรายการ Payroll','อัตรา (%)','โอนสำเร็จ (บาท)'])}
      <p class="fr-subtle" style="margin-top:10px">รายการ Payroll ที่ชื่อหน่วยงานไม่ตรงกับคอลัมน์ N จะไม่ถูกนำไปหักจำนวนผู้สมัครของหน่วยงานอื่น</p>`)}
    <div class="fr-panel fr-reconcile"><details><summary>ตรวจสอบข้อมูลที่จับคู่ไม่ได้ / ความคลาดเคลื่อน</summary>
      <div id="frReconcileInfo" class="fr-note">กำลังตรวจสอบ…</div>
      ${table('frUnmatchedAgencyTable',['ชื่อ Payroll.Department (J) ที่ไม่พบในรายชื่อคอลัมน์ N','จำนวนรายการ'])}
    </details></div>
  `);
    ['frFacultyTable','frAgencyTable'].forEach(tableId=>el(tableId)?.classList.add('fr-compact'));
  }
  const msg=[
    'ปีงบประมาณ '+activeYear,
    'ทะเบียนในปีนี้ '+number(c.rosterMatchedRows)+' แถว',
    'ทะเบียนปีอื่น '+number(c.rosterSkippedOtherYears)+' แถว (ไม่นับ)',
    'ทะเบียนไม่ระบุปี '+number(c.rosterUnknownYear)+' แถว (ไม่นับ)',
    'Payroll ปีนี้ '+number(c.payrollFYRows)+' รายการ',
    'Payroll ปีอื่น '+number(c.payrollSkippedOtherYears)+' รายการ (ไม่นับ)',
    'Payroll ไม่พบ WorkDate '+number(c.payrollUnknownYear)+' รายการ',
    'คณะไม่ตรง D/M '+number(c.payrollFacultyMismatch)+' คู่',
    'หน่วยงานไม่ตรง N/J '+number(c.payrollDeptMismatch)+' คู่',
    'Payroll ไม่อยู่ในทะเบียนปีนี้ '+number(c.payrollWithoutRoster)+' คน'
  ];
  const info=el('frReconcileInfo');
  if(info)info.textContent=msg.join(' • ')+(ready?'':' • โปรดตรวจสอบหัวคอลัมน์ของชีต');
  trRows('frUnmatchedAgencyTable',c.payrollUnmatchedUnits||[],r=>[esc(r.name),number(r.rows)]);
  const faculty=facultyRows(),agency=agencyRows();
  trRows('frFacultyTable',faculty,r=>[
    `<button type="button" class="fr-fac-link" data-fr-fac-detail="${esc(r.name)}" title="เปิดรายชื่อปีงบประมาณ ${activeYear}">${esc(r.name)}</button>`,
    number(r.applied),number(r.hiredMatched),number(r.notHired),pct(r.ratio),number(r.paidAmount),
    `<button type="button" class="fr-btn fr-action" data-fr-fac-detail="${esc(r.name)}">ดูรายชื่อ</button>`
  ]);
  trRows('frAgencyTable',agency,r=>[
    esc(r.name),number(r.applied),number(r.hired),number(r.hiredMatched),number(r.notHired),pct(r.ratio),number(r.paidAmount)
  ]);
}

function ensureFacultyDialog() {
  if(el('frDetailOverlay'))return el('frDetailOverlay');
  const overlay=document.createElement('div');
  overlay.id='frDetailOverlay';overlay.className='fr-detail-backdrop';overlay.hidden=true;
  overlay.setAttribute('role','presentation');
  overlay.innerHTML=`<div class="fr-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="frDetailTitle">
    <div class="fr-detail-header"><div><h3 id="frDetailTitle">รายชื่อนักศึกษา</h3><div id="frDetailSubtitle" class="fr-mini"></div></div><button type="button" class="fr-btn" data-fr-detail-close aria-label="ปิดหน้าต่าง">ปิด ×</button></div>
    <div class="fr-detail-bar"><button class="fr-btn fr-tab" data-fr-detail-tab="all" aria-pressed="true">ทั้งหมด</button><button class="fr-btn fr-tab" data-fr-detail-tab="hired" aria-pressed="false">มีรายการเบิก</button><button class="fr-btn fr-tab" data-fr-detail-tab="not_hired" aria-pressed="false">ยังไม่มีรายการเบิก</button>
    <input class="fr-input" data-fr-detail-query aria-label="ค้นหาชื่อนักศึกษาหรือรหัส" placeholder="ค้นหารหัส / ชื่อ–สกุล…" />
    <button class="fr-btn" data-fr-detail-csv>ส่งออก CSV</button><button class="fr-btn" data-fr-detail-print>พิมพ์รายชื่อ</button></div>
    <div class="fr-detail-main" id="frDetailMain"><div class="fr-loading">กำลังโหลดรายชื่อ…</div></div>
    <div class="fr-detail-footer"><span id="frDetailCount"></span><div style="display:flex;gap:8px;align-items:center"><button class="fr-btn" data-fr-detail-prev>ก่อนหน้า</button><span id="frDetailPage"></span><button class="fr-btn" data-fr-detail-next>ถัดไป</button></div></div>
  </div>`;
  overlay.addEventListener('click',event=>{
    if(event.target===overlay||event.target.closest('[data-fr-detail-close]')){closeFacultyDetail();return;}
    const tab=event.target.closest('[data-fr-detail-tab]');
    if(tab&&detailState){detailState.tab=tab.dataset.frDetailTab;detailState.page=0;renderFacultyDetail();return;}
    if(event.target.closest('[data-fr-detail-prev]')&&detailState){detailState.page=Math.max(0,detailState.page-1);renderFacultyDetail();return;}
    if(event.target.closest('[data-fr-detail-next]')&&detailState){detailState.page++;renderFacultyDetail();return;}
    if(event.target.closest('[data-fr-detail-csv]'))exportFacultyDetail();
    if(event.target.closest('[data-fr-detail-print]'))printFiscalFacultyDetail();
  });
  overlay.addEventListener('input',event=>{
    if(event.target.matches('[data-fr-detail-query]')&&detailState){detailState.query=event.target.value;detailState.page=0;renderFacultyDetail();}
  });
  document.body.appendChild(overlay);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!overlay.hidden)closeFacultyDetail();});
  return overlay;
}
function closeFacultyDetail() {
  detailSerial++;
  const overlay=el('frDetailOverlay');if(overlay)overlay.hidden=true;
  document.body.classList.remove('fr-print-faculty');
  detailState=null;
  if(detailReturnFocus&&typeof detailReturnFocus.focus==='function'&&detailReturnFocus.isConnected)detailReturnFocus.focus();
  detailReturnFocus=null;
}
async function openFiscalFacultyDetail(faculty,fromElement){
  if(!faculty||!data)return;
  const requestYear=activeYear;
  const overlay=ensureFacultyDialog();
  detailReturnFocus=fromElement||document.activeElement;
  detailState={faculty,year:requestYear,tab:'all',query:'',page:0,students:[]};
  overlay.hidden=false;
  el('frDetailTitle').textContent='รายชื่อนักศึกษา: '+faculty;
  el('frDetailSubtitle').textContent='ปีงบประมาณ '+requestYear+' • '+fyRange(requestYear)+' • เฉพาะผู้สมัครในทะเบียนของปีที่เลือก';
  el('frDetailMain').innerHTML='<div class="fr-loading">กำลังอ่านรายชื่อเฉพาะคณะและปีงบประมาณ…</div>';
  el('frDetailCount').textContent='';el('frDetailPage').textContent='';
  overlay.querySelector('[data-fr-detail-query]').value='';
  overlay.querySelector('[data-fr-detail-close]').focus();
  const serial=++detailSerial,key=requestYear+'|'+faculty;
  try{
    let response=facultyDetailCache.get(key);
    if(!response){
      const token=sessionStorage.getItem('sessionToken')||'';
      if(!token)throw new Error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
      response=await new Promise((resolve,reject)=>{
        google.script.run.withSuccessHandler(res=>res&&res.success?resolve(res.data):reject(new Error(res&&res.message||'ไม่สามารถอ่านรายชื่อ')))
          .withFailureHandler(reject).getFiscalFacultyStudents(token,requestYear,faculty);
      });
      facultyDetailCache.set(key,response);
    }
    if(serial!==detailSerial||!detailState||detailState.year!==requestYear)return;
    detailState.students=Array.isArray(response.students)?response.students:[];
    detailState.ready=true;renderFacultyDetail();
  }catch(error){
    if(serial!==detailSerial)return;
    el('frDetailMain').innerHTML=`<div class="fr-error">${esc(error&&error.message||error)}</div>`;
    el('frDetailCount').textContent='ไม่สามารถโหลดรายชื่อ';
  }
}
function filteredFacultyStudents(){
  if(!detailState)return [];
  const query=(detailState.query||'').trim().toLocaleLowerCase('th');
  return detailState.students.filter(s=>{
    if(detailState.tab==='hired'&&!s.hasPayroll)return false;
    if(detailState.tab==='not_hired'&&s.hasPayroll)return false;
    return !query||[s.studentId,s.name,s.workType].some(x=>String(x||'').toLocaleLowerCase('th').includes(query));
  });
}
function renderFacultyDetail(printAll=false){
  if(!detailState||!detailState.ready)return;
  const rows=filteredFacultyStudents(),size=25,pages=Math.max(1,Math.ceil(rows.length/size));
  detailState.page=Math.max(0,Math.min(detailState.page,pages-1));
  const visible=printAll?rows:rows.slice(detailState.page*size,(detailState.page+1)*size);
  const main=el('frDetailMain');
  const heads=['ลำดับ','รหัสนักศึกษา','ชื่อ–นามสกุล','ลักษณะงานที่ต้องการ','สถานะ','งานล่าสุด','โอนสำเร็จ (บาท)'];
  main.innerHTML=`<div class="fr-scroll"><table class="fr-table fr-detail-table"><thead><tr>${heads.map(esc).map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${visible.length?visible.map((s,i)=>`<tr>
    <td>${number((printAll?0:detailState.page*size)+i+1)}</td><td>${esc(s.studentId)}</td><td>${esc(s.name)}</td><td>${esc(s.workType||'—')}</td>
    <td><span class="fr-status ${s.hasPayroll?'':'pending'}">${s.hasPayroll?'มีรายการเบิก':'ยังไม่มีรายการเบิก'}</span></td><td>${esc(s.lastJob||'—')}</td><td class="fr-right">${number(s.paidAmount)}</td></tr>`).join(''):`<tr><td colspan="${heads.length}" class="fr-empty">ไม่พบรายชื่อตามเงื่อนไข</td></tr>`}</tbody></table></div>`;
  el('frDetailCount').textContent='พบ '+number(rows.length)+' คน (จากทั้งหมด '+number(detailState.students.length)+' คน)';
  el('frDetailPage').textContent='หน้า '+(detailState.page+1)+' / '+pages;
  el('frDetailOverlay').querySelector('[data-fr-detail-prev]').disabled=detailState.page===0;
  el('frDetailOverlay').querySelector('[data-fr-detail-next]').disabled=detailState.page>=pages-1;
  el('frDetailOverlay').querySelectorAll('[data-fr-detail-tab]').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.frDetailTab===detailState.tab)));
}
function exportFacultyDetail(){
  if(!detailState||!detailState.ready)return;
  const rows=filteredFacultyStudents();
  exportRows('รายชื่อนักศึกษา_'+detailState.faculty,['รหัสนักศึกษา','ชื่อ-สกุล','ลักษณะงานที่ต้องการ','สถานะ','งานล่าสุด','โอนสำเร็จ (บาท)'],
    rows.map(s=>[s.studentId,s.name,s.workType,s.hasPayroll?'มีรายการเบิก':'ยังไม่มีรายการเบิก',s.lastJob,s.paidAmount]));
}
// Print in an isolated same-origin document. Printing the SPA body can be blank
// because the active section is nested within containers hidden by other views.
// No authentication token or other session information is placed in the document.
function fiscalPrintPage(title, subtitle, bodyHtml) {
  const iframe=document.createElement('iframe');
  iframe.setAttribute('title','เอกสารสำหรับพิมพ์รายงาน');
  iframe.setAttribute('aria-hidden','true');
  iframe.style.cssText='position:fixed;top:0;left:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none;';
  const cssPrint=`
    @page{size:A4 landscape;margin:12mm}
    html,body{margin:0;background:#fff;color:#142b42;font:12px/1.55 Sarabun,'Noto Sans Thai',Arial,sans-serif}
    h1{font-size:20px;margin:0 0 5px}h2,h3{font-size:15px;margin:12px 0 6px}
    .subtitle{font-size:11px;color:#496078;margin-bottom:14px}
    .fr-shell,.fr-panel{display:block!important;position:static!important;box-shadow:none!important;background:#fff!important;border:0!important;padding:0!important;max-width:100%!important}
    .fr-head{border:0;border-bottom:1px solid #ccd7e3;margin-bottom:12px;padding-bottom:10px}
    .fr-head h2{font-size:18px;margin:0 0 4px}.fr-head p{margin:0}
    .fr-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .fr-cards{display:flex;flex-wrap:wrap;gap:9px;margin:8px 0}
    .fr-kpi{border:1px solid #cad5e0;padding:8px 10px;min-width:130px;break-inside:avoid}
    .fr-kpi b{display:block;font-size:17px}.fr-kpi span{display:block;font-size:11px}
    .fr-panel{margin:12px 0}.fr-panel h3{font-weight:700}
    .fr-note,.fr-warning{margin:10px 0;color:#3f5870;font-size:11px}
    .fr-scroll,.fr-detail-main{display:block!important;overflow:visible!important;max-height:none!important}
    .fr-table,.fr-detail-table{min-width:0!important;width:100%!important;table-layout:auto;border-collapse:collapse;font-size:10px}
    .fr-table th,.fr-table td,.fr-detail-table th,.fr-detail-table td{position:static!important;display:table-cell!important;white-space:normal!important;overflow-wrap:anywhere;padding:4px 5px!important;border:1px solid #b8c6d4!important;vertical-align:top;background:white!important;color:#172e43!important}
    .fr-table th,.fr-detail-table th{background:#e7eef5!important;font-weight:700}
    thead{display:table-header-group}tr{page-break-inside:avoid;break-inside:avoid}
    .fr-right,.fr-num{text-align:right!important}.fr-progress{min-width:65px;height:6px;background:#e0e8ef}.fr-progress i{display:block;background:#4d8cb8;height:100%}
    .fr-chart{height:auto!important;min-height:100px}.fr-chart img{display:block;max-width:100%;height:auto;max-height:220px}
    canvas,.fr-controls,.fr-filter,.fr-btn,.fr-footer,.fr-action,.fr-detail-bar,.fr-detail-footer{display:none!important}
    details{display:block!important}details>summary{font-weight:700}
    .fr-section-caption{margin-top:9px}
    .fr-status{font-size:10px}.fr-muted,.fr-subtle,.fr-mini{color:#586e84}
    .fr-detail-backdrop{position:static!important;background:transparent!important}
    .fr-detail-dialog{display:block!important;max-height:none!important;box-shadow:none!important;overflow:visible!important}
    .fr-detail-header{border-bottom:1px solid #ccd7e3;margin-bottom:10px;padding-bottom:8px}
    .fr-detail-header h3{font-size:17px;margin:0}
    @media print{html,body{height:auto!important;overflow:visible!important}}
  `;
  const html='<!doctype html><html lang="th"><head><meta charset="UTF-8"><title>'+esc(title)+'</title><style>'+cssPrint+'</style></head><body>'+ 
    '<h1>'+esc(title)+'</h1><p class="subtitle">'+esc(subtitle)+'</p>'+bodyHtml+'</body></html>';
  let cleaned=false;
  const cleanup=()=>{if(cleaned)return;cleaned=true;setTimeout(()=>iframe.remove(),1200);};
  iframe.onload=function(){
    try{
      const win=iframe.contentWindow;
      if(!win)throw new Error('ไม่สามารถเปิดเอกสารพิมพ์ได้');
      win.addEventListener('afterprint',cleanup,{once:true});
      // A frame document is independent of hidden SPA tab containers.
      win.focus();win.print();
      setTimeout(cleanup,60000);
    }catch(err){cleanup();window.alert('ไม่สามารถพิมพ์รายงานได้: '+(err&&err.message||err));}
  };
  iframe.srcdoc=html;
  document.body.appendChild(iframe);
}
function printFiscalReport(id){
  const source=el(id)?.querySelector('.fr-shell');
  if(!source||!data){window.alert('กรุณาโหลดข้อมูลรายงานก่อนพิมพ์');return;}
  const copy=source.cloneNode(true);
  copy.querySelectorAll('.fr-controls,.fr-filter,.fr-btn,.fr-footer,[data-fr-fac-detail],.fr-detail-backdrop').forEach(node=>node.remove());
  const actualCanvases=source.querySelectorAll('canvas');
  const clonedCanvases=copy.querySelectorAll('canvas');
  clonedCanvases.forEach((canvas,index)=>{
    const img=document.createElement('img');img.alt='กราฟประกอบรายงาน';
    try{img.src=actualCanvases[index].toDataURL('image/png');}catch(_){img.alt='ไม่สามารถแนบกราฟได้';}
    canvas.replaceWith(img);
  });
  // Report content is already escaped when rendered by the read-only report module.
  fiscalPrintPage(sections[id]||'รายงาน', 'ปีงบประมาณ '+activeYear+' • '+fyRange(activeYear),copy.outerHTML);
}
function printFiscalFacultyDetail(){
  if(!detailState||!detailState.ready){window.alert('กรุณาโหลดรายชื่อก่อนพิมพ์');return;}
  const rows=filteredFacultyStudents();
  const title='รายชื่อนักศึกษา: '+detailState.faculty;
  const tabLabel=detailState.tab==='hired'?'มีรายการเบิก':detailState.tab==='not_hired'?'ยังไม่มีรายการเบิก':'ทั้งหมด';
  const heads=['ลำดับ','รหัสนักศึกษา','ชื่อ–นามสกุล','ลักษณะงานที่ต้องการ','สถานะ','งานล่าสุด','โอนสำเร็จ (บาท)'];
  const html='<div class="fr-scroll"><table class="fr-detail-table"><thead><tr>'+heads.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+ 
    (rows.length?rows.map((s,i)=>'<tr><td>'+number(i+1)+'</td><td>'+esc(s.studentId)+'</td><td>'+esc(s.name)+'</td><td>'+esc(s.workType||'—')+'</td><td>'+esc(s.hasPayroll?'มีรายการเบิก':'ยังไม่มีรายการเบิก')+'</td><td>'+esc(s.lastJob||'—')+'</td><td class="fr-right">'+number(s.paidAmount)+'</td></tr>').join(''):'<tr><td colspan="7">ไม่พบรายชื่อตามเงื่อนไข</td></tr>')+
    '</tbody></table></div>';
  fiscalPrintPage(title,'ปีงบประมาณ '+detailState.year+' • '+fyRange(detailState.year)+' • '+tabLabel+' • '+number(rows.length)+' คน',html);
}

  function forecastValues() {
    const d=data, fy=d.fiscalYear, elapsed=d.forecast.elapsedIndex;
    let cum=0;
    const avg=elapsed>=0?d.months.slice(0,elapsed+1).reduce((s,m)=>s+m.paid,0)/(elapsed+1):0;
    const rows=d.months.map((m,i)=>{
      const actual=i<=elapsed;
      const amount=actual?m.paid:(fy<data.currentYear?m.paid:(elapsed<0?null:avg));
      if(amount!=null)cum+=amount;
      return {...m,isForecast:!actual && fy>=data.currentYear,amount:amount,cumulative:amount==null?null:cum,
        balance:d.totals.budget==null||amount==null?null:d.totals.budget-cum};
    });
    return {rows:rows,avg:avg,projected:elapsed>=0?cum:null};
  }
  function drawForecast(init) {
    const id='budgetForecastSection',t=data.totals,f=forecastValues();
    if(init){area(id,`<div id="frForecastSummary" class="fr-cards"></div>
      ${panel('แนวโน้มการเบิกจ่ายและการประมาณการ',`<div class="fr-chart"><canvas id="frForecastChart"></canvas></div>`)}
      ${panel('ตารางแนวโน้ม 12 เดือนของปีงบประมาณ',table('frForecastTable',['เดือน/ปี','ประเภท','จ่ายแล้ว/คาดการณ์ (บาท)','สะสม (บาท)','คงเหลือประมาณการ (บาท)']))}
      <p class="fr-sub">ประมาณการใช้สมมติฐานยอดจ่ายเฉลี่ยรายเดือนถึงปัจจุบัน ไม่ใช่ยอดเงินที่ผูกพันหรือได้รับอนุมัติจริง</p>`);}
    el('frForecastSummary').innerHTML=kpi('งบจัดสรร',money(t.budget))+kpi('จ่ายจริงสะสม',money(t.paidAmount))+kpi('อัตราใช้จ่ายเฉลี่ยต่อเดือน',f.avg?money(f.avg):'—')+kpi(data.fiscalYear<data.currentYear?'ยอดจริงสิ้นปี':'คาดการณ์สิ้นปี',f.projected==null?'ไม่มีข้อมูล':money(f.projected))+kpi('คงเหลือคาดการณ์',t.budget!=null&&f.projected!=null?money(t.budget-f.projected):'ไม่มีข้อมูล');
    trRows('frForecastTable',f.rows,r=>[esc(r.label),r.isForecast?'คาดการณ์':'ข้อมูลจริง',r.amount==null?'—':number(r.amount),r.cumulative==null?'—':number(r.cumulative),r.balance==null?'—':number(r.balance)]);
    chart('frForecastChart','line',f.rows.map(r=>r.label),[
      {label:'จ่ายจริง/คาดการณ์สะสม',data:f.rows.map(r=>r.cumulative),borderColor:'#2778bc',backgroundColor:'#2778bc',tension:.25},
      ...(t.budget!=null?[{label:'กรอบงบประมาณ',data:f.rows.map(()=>t.budget),borderColor:'#d98a57',borderDash:[6,6],pointRadius:0}]:[])]);
  }
  function chart(id,type,labels,datasets) {
    if(!el(id))return;
    const paint=()=>{
      if(!el(id)||typeof window.Chart!=='function')return;
      if(charts[id])try{charts[id].destroy();}catch(_){}
      charts[id]=new Chart(el(id),{type,data:{labels,datasets},options:{responsive:true,maintainAspectRatio:false,animation:false,
        plugins:{legend:{position:'bottom'},tooltip:{mode:'index',intersect:false}},
        ...(type==='doughnut'?{}:{scales:{y:{beginAtZero:true}}})}});
    };
    if(typeof window.Chart==='function')paint();
    else if(typeof window.ensureUbuLibrary==='function')window.ensureUbuLibrary('chart').then(paint).catch(()=>{});
  }
  function render(id) {
    if(!data)return;
    const init=!!(el('frBody_'+id)&&!el('frBody_'+id).querySelector('table'));
    try{
      if(id==='historyLogSection')drawHistory(init);
      else if(id==='monthlyReportSection')drawMonthly(init);
      else if(id==='execReportSection')drawExecutive(init);
      else if(id==='quarterlyAnalysisSection')drawQuarterly(init);
      else if(id==='facultyStatsSection')drawFaculty(init);
      else if(id==='budgetForecastSection')drawForecast(init);
    }catch(e){console.error('[Fiscal reports]',e);const target=el('frBody_'+id);if(target)target.innerHTML=`<div class="fr-error">แสดงรายงานไม่สำเร็จ: ${esc(e.message)}</div>`;}
  }
  function csvCell(v) {
    let s=String(v==null?'':v);
    if(/^[\s\u0000-\u001f]*[=+@\-]/.test(s))s="'"+s;
    return '"'+s.replace(/"/g,'""')+'"';
  }
  function exportRows(filename,headers,rows) {
    const csv=[['รายงาน UBU Student Jobs','ปีงบประมาณ '+activeYear,fyRange(activeYear)].map(csvCell).join(','),headers.map(csvCell).join(','),...rows.map(r=>r.map(csvCell).join(','))].join('\r\n');
    const blob=new Blob(['\uFEFF',csv],{type:'text/csv;charset=utf-8;'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=filename+'_FY'+activeYear+'.csv';document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1200);
  }
  function downloadAgencies() {
    if(!data)return;
    const rows=agencyRows();
    exportRows('สถิติหน่วยงาน',['หน่วยงาน','ผู้สมัคร','มีรายการเบิก','ยังไม่มีรายการเบิก','อัตราจับคู่กับผู้สมัคร (%)','จ่ายแล้ว (บาท)','รอโอน (บาท)','งบจัดสรร (บาท)','อัตราใช้งบ (%)'],
      rows.map(r=>[r.name,r.applied,r.hired,r.notHired,r.ratio,r.paidAmount,r.approvedAmount,r.allocated,r.budgetRatio]));
  }
  function download(id) {
    if(!data){if(typeof showAlert==='function')showAlert('ยังไม่มีข้อมูลสำหรับส่งออก','warning');return;}
    const a=data;
    const dict={
      historyLogSection:['ประวัติเบิกจ่าย',['วันที่ปฏิบัติงาน','งาน','หน่วยงาน','คณะ','สถานะ','จำนวนเงิน','คงเหลือหน่วยงาน'],filterHistory().map(r=>[r.date,r.project,r.department,r.faculty,status(r.status),r.amount,r.balanceAfter])],
      monthlyReportSection:['รายงานประจำเดือน',['วันที่','หน่วยงาน','งาน','สถานะ','จำนวนเงิน'],monthlyRows().map(r=>[r.date,r.department,r.project,status(r.status),r.amount])],
      execReportSection:['ExecutiveView',['หน่วยงาน','งบจัดสรร','จ่ายแล้ว','อนุมัติรอโอน','% ใช้งบ','จ้างแล้ว'],a.agencies.map(r=>[r.name,r.allocated,r.paidAmount,r.approvedAmount,r.budgetRatio,r.hired])],
      quarterlyAnalysisSection:['รายไตรมาส',['ไตรมาส','จ่ายแล้ว','รอโอน','จำนวนรายการ'],(quarterFilter()===''?a.quarters:[a.quarters[Number(quarterFilter())]]).map(r=>[r.name,r.paid,r.approved,r.count])],
      facultyStatsSection:['สถิติรายคณะ',['คณะ','ผู้สมัคร (คน)','ผู้สมัครที่มีรายการ Payroll (คน)','ยังไม่มีรายการ Payroll (คน)','อัตรา (%)','ยอดโอนสำเร็จ (บาท)'],facultyRows().map(r=>[r.name,r.applied,r.hiredMatched,r.notHired,r.ratio,r.paidAmount])],
      budgetForecastSection:['ประมาณการงบ',['เดือน/ปี','ประเภท','จ่ายแล้วหรือคาดการณ์','สะสม','คงเหลือ'],forecastValues().rows.map(r=>[r.label,r.isForecast?'คาดการณ์':'จริง',r.amount,r.cumulative,r.balance])]
    };
    const d=dict[id];if(!d)return;
    exportRows(d[0],d[1],d[2]);
  }
  // Preserve legacy navigation callbacks without adding duplicate listeners or API requests.
  window.loadHistoryData=()=>load('historyLogSection');
  window.loadMonthlyReportData=()=>load('monthlyReportSection');
  window.exportMonthlyReportCSV=()=>download('monthlyReportSection');
  window.loadExecChartData=()=>load('execReportSection');
  window.loadStrategicData=()=>{
    const active=document.querySelector('.section.active');
    const id=active&&sections[active.id]?active.id:'quarterlyAnalysisSection';
    return load(id);
  };
  window.exportForecastTable=()=>download('budgetForecastSection');
  window.printFacultyStatsReport=()=>printFiscalReport('facultyStatsSection');
  window.frReportVersion=V;
  build();
})();
