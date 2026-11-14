/* UBU Student Jobs • Fiscal Intelligence V6 • read-only reports */
(function () {
  'use strict';
  const V = '20261114-fiscal-reports-v6';
  const sections = {
    historyLogSection: 'ประวัติการเบิกจ่ายงบประมาณ',
    monthlyReportSection: 'รายงานสรุปประจำเดือน',
    execReportSection: 'รายงานสรุปการเบิกจ่ายสำหรับผู้บริหาร',
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

  function fiscalYearNow() { const d=new Date(); return d.getFullYear()+543+(d.getMonth()>=9?1:0); }
  function number(n) { return Number(n || 0).toLocaleString('th-TH',{maximumFractionDigits:2}); }
  function money(n) { return n==null?'ไม่มีข้อมูล':number(n)+' บาท'; }
  function pct(n) { return n==null?'—':number(n)+'%'; }
  function esc(s) { return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function el(id) { return document.getElementById(id); }
  function status(s) { return s==='paid'?'โอนเงินสำเร็จ':'อนุมัติรอโอนเงิน'; }
  function fyRange(year) { return `1 ต.ค. ${year-1} – 30 ก.ย. ${year}`; }
  function css() {
    if(el('frStyles')) return;
    const st=document.createElement('style');st.id='frStyles';
    st.textContent=`
      .fr-shell{font-family:inherit;color:#19324c;max-width:100%;}
      .fr-head{display:flex;gap:18px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;border-bottom:1px solid #e4ecf4;padding-bottom:18px;margin-bottom:18px}
      .fr-head h2{font-size:clamp(20px,2.3vw,25px);font-weight:800;margin:0 0 6px;line-height:1.25;color:#12304e}
      .fr-head p,.fr-sub{font-size:13px;line-height:1.7;color:#61758c;margin:0}
      .fr-controls{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      .fr-input,.fr-btn{height:39px;border:1px solid #cddbe8;border-radius:9px;padding:7px 12px;font:inherit;font-size:13px;background:#fff;color:#1d3954;max-width:100%}
      .fr-input:focus{outline:2px solid #b9d9fa;border-color:#4c90d3}
      .fr-btn{cursor:pointer;font-weight:650;background:#f2f7fc}
      .fr-btn.primary{background:#145cad;border-color:#145cad;color:#fff}.fr-btn:hover{filter:brightness(.97)}
      .fr-note{padding:11px 14px;border:1px solid #e2eaf4;border-radius:10px;color:#536b82;background:#f6f9fd;font-size:12px;line-height:1.7;margin:14px 0}
      .fr-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(172px,1fr));gap:12px;margin:16px 0}
      .fr-kpi{background:white;border:1px solid #dfe9f1;border-radius:14px;padding:16px 17px;box-shadow:0 3px 14px rgba(20,55,90,.04);min-width:0}
      .fr-kpi b{font-size:25px;color:#174c87;display:block;line-height:1.35;margin-top:6px;overflow-wrap:anywhere}.fr-kpi span{color:#587089;font-size:12px}
      .fr-panel{background:#fff;border:1px solid #e0e9f1;border-radius:12px;padding:16px;margin:14px 0;min-width:0}
      .fr-panel h3{font-size:16px;margin:0 0 12px;color:#183c62}
      .fr-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px}
      .fr-scroll{overflow-x:auto;max-width:100%;border-radius:8px;border:1px solid #e4eaf0}
      .fr-table{border-collapse:collapse;font-size:13px;width:100%;min-width:730px}
      .fr-table th{position:sticky;top:0;background:#edf4fb;color:#234660;text-align:left;padding:11px 12px;font-size:12px;white-space:nowrap}
      .fr-table td{border-top:1px solid #e8eef5;padding:11px 12px;vertical-align:middle;line-height:1.5}
      .fr-table tbody tr:nth-child(even){background:#fafcff}.fr-table tbody tr:hover{background:#f1f8ff}
      .fr-right{text-align:right!important;font-variant-numeric:tabular-nums}.fr-muted{color:#7d8da1}.fr-strong{font-weight:700}
      .fr-filter{display:flex;gap:9px;align-items:center;flex-wrap:wrap;margin-bottom:13px}
      .fr-filter .fr-input{flex:1;min-width:160px}.fr-chart{height:290px;position:relative}
      .fr-status{display:inline-block;padding:3px 8px;border-radius:99px;background:#e5f4ea;color:#25683d;font-size:11px;font-weight:700;white-space:nowrap}
      .fr-status.pending{background:#fff2d9;color:#8a5d06}.fr-progress{height:8px;background:#e7eff7;border-radius:30px;overflow:hidden;min-width:90px}
      .fr-progress i{display:block;background:#3887cc;height:100%;border-radius:30px}
      .fr-error{padding:20px;background:#fff5f5;color:#a62828;border-radius:10px}
      .fr-empty{text-align:center;padding:22px;color:#7b8d9e}.fr-loading{padding:25px;text-align:center;color:#4a7aa3}
      .fr-footer{padding:8px;color:#748698;font-size:11px}
      @media(max-width:650px){.fr-grid{grid-template-columns:1fr}.fr-cards{grid-template-columns:repeat(2,minmax(0,1fr))}.fr-kpi b{font-size:20px}.fr-panel{padding:11px}.fr-head{gap:10px}}
      @media print{.sidebar,.navbar,.fr-controls,.fr-filter,.fr-btn{display:none!important}.fr-shell,.fr-panel{box-shadow:none!important;border:0!important}.fr-scroll{overflow:visible!important}.fr-table{min-width:0!important;font-size:10px!important}.fr-table th,.fr-table td{padding:6px!important}}
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
  function table(id, heads) {return `<div class="fr-scroll"><table class="fr-table" id="${id}"><thead><tr>${heads.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody><tr><td colspan="${heads.length}" class="fr-loading">กำลังโหลดข้อมูลปีงบประมาณ…</td></tr></tbody></table></div>`;}
  function base(id,title) {
    return `<div class="fr-shell" data-fr-report="${id}"><div class="fr-head"><div><h2>${title}</h2><p>แยกข้อมูลตามปีงบประมาณ • ${esc(fyRange(activeYear))}</p></div>
    <div class="fr-controls">${yearSelect()}<button class="fr-btn" data-fr-refresh>โหลดข้อมูลใหม่</button><button class="fr-btn" data-fr-print>พิมพ์รายงาน</button><button class="fr-btn primary" data-fr-export="${id}">ส่งออก CSV</button></div></div>
    <div class="fr-note" id="frNotes_${id}">กำลังตรวจสอบข้อมูลสำหรับปีงบประมาณ ${activeYear}…</div><div id="frBody_${id}" class="fr-loading">กำลังโหลดรายงาน…</div>
    <div class="fr-footer" id="frFoot_${id}">ระบบรายงานเชิงวิเคราะห์ • ข้อมูลจาก Google Sheets</div></div>`;
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
          activeYear=year;
          document.querySelectorAll('[data-fr-year]').forEach(x=>x.value=String(year));
          load(id);
        } else if(e.target.matches('[data-fr-month],[data-fr-dept],[data-fr-faculty],[data-fr-quarter],[data-fr-date-from],[data-fr-date-to]'))render(id);
      });
      root.addEventListener('input',e=>{if(e.target.matches('[data-fr-query]'))render(id);});
      root.addEventListener('click',e=>{
        const refresh=e.target.closest('[data-fr-refresh]');
        const exportBtn=e.target.closest('[data-fr-export]');
        if(refresh)load(id,true);
        if(e.target.closest('[data-fr-print]'))window.print();
        if(exportBtn)download(id);
        if(e.target.closest('[data-fr-export-unit]'))downloadAgencies();
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
      const result=await fetchYear(requestYear,!!force);
      if(requestYear!==activeYear)return;
      data=result;lastRefresh=Date.now();
      render(id);
      if(notes)notes.innerHTML=`<b>ปีงบประมาณ ${activeYear}:</b> ${esc(fyRange(activeYear))} • ข้อมูล ณ ${esc(data.asOf)}<div style="margin-top:6px">${(data.warnings||[]).map(w=>`• ${esc(w)}`).join('<br>')}</div>`;
    }catch(error){
      if(requestYear!==activeYear)return;
      body.innerHTML=`<div class="fr-error">${esc(error&&error.message||error)}<div style="margin-top:12px"><button class="fr-btn" data-fr-refresh>ลองใหม่</button></div></div>`;
      if(notes)notes.textContent='ไม่สามารถโหลดข้อมูลปีงบประมาณ '+activeYear;
    }
  }
  function kpi(name,value) {return `<div class="fr-kpi"><span>${esc(name)}</span><b>${esc(String(value))}</b></div>`;}
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
  function facultyFilter(){return(el('frBody_facultyStatsSection')?.querySelector('[data-fr-query]')?.value||'').trim().toLocaleLowerCase('th');}
  function drawFaculty(init) {
    const id='facultyStatsSection',t=data.totals;
    if(init){area(id,`<div class="fr-cards">${kpi('ผู้สมัครไม่ซ้ำ',number(t.applicants))}${kpi('ได้รับการจ้างงาน',number(t.hired))}${kpi('ผู้สมัครที่ยังไม่พบการจ้าง',number(t.notHired))}${kpi('สัดส่วนผู้สมัครที่ได้งาน',pct(t.successRate))}${kpi('นักศึกษาที่ได้รับเงินแล้ว',number(t.paidStudents))}${kpi('จำนวนเงินโอนสำเร็จ',money(t.paidAmount))}${kpi('หน่วยงานยังไม่มีผู้ได้รับจ้าง',number(data.agencies.filter(a=>a.hired===0).length))}</div>
      <div class="fr-filter"><input class="fr-input" data-fr-query placeholder="ค้นหาคณะหรือหน่วยงาน…" aria-label="ค้นหาคณะ/หน่วยงาน"><button class="fr-btn" data-fr-export-unit>ส่งออกรายหน่วยงาน CSV</button></div>
      ${panel('รายคณะ • เปรียบเทียบผู้สมัครกับการจ้างงาน',`<div class="fr-chart"><canvas id="frFacultyChart"></canvas></div>`)}
      ${panel('สรุปข้อมูลรายคณะ',table('frFacultyTable',['คณะ','ผู้สมัคร (คน)','สัดส่วนผู้สมัคร (%)','ได้รับการจ้าง (คน)','สัดส่วนผู้ได้งาน (%)','ยังไม่ได้งาน (คน)','อัตราได้งาน (%)','ได้รับเงินแล้ว (คน)','จำนวนเงินที่จ่ายแล้ว (บาท)']))}
      ${panel('ความคืบหน้าการจ้างงานรายหน่วยงาน',table('frAgencyTable',['หน่วยงาน','ผู้สมัคร (คน)','จ้างแล้ว (คน)','ผู้สมัครที่ยังไม่ได้งาน (คน)','อัตราได้งาน','จ่ายแล้ว (บาท)','รอโอน (บาท)']))}`);}
    const query=facultyFilter();
    const faculty=data.faculty.filter(x=>!query||x.name.toLocaleLowerCase('th').includes(query));
    const agency=data.agencies.filter(x=>!query||x.name.toLocaleLowerCase('th').includes(query));
    trRows('frFacultyTable',faculty,r=>[esc(r.name),number(r.applied),pct(t.applicants?100*r.applied/t.applicants:null),number(r.hired),pct(t.hired?100*r.hired/t.hired:null),number(r.notHired),pct(r.ratio),number(r.paidStudents),number(r.paidAmount)]);
    trRows('frAgencyTable',agency,r=>[esc(r.name),number(r.applied),number(r.hired),number(r.notHired),`<div class="fr-progress"><i style="width:${Math.max(0,Math.min(100,r.ratio||0))}%"></i></div><small>${pct(r.ratio)}</small>`,number(r.paidAmount),number(r.approvedAmount)]);
    const top=faculty.slice(0,10);
    chart('frFacultyChart','bar',top.map(x=>x.name),[
      {label:'ผู้สมัคร',data:top.map(x=>x.applied),backgroundColor:'#82aaca'},
      {label:'ได้งาน',data:top.map(x=>x.hired),backgroundColor:'#2d8e75'},
      {label:'ยังไม่ได้งาน',data:top.map(x=>x.notHired),backgroundColor:'#e3ae65'}]);
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
    const query=facultyFilter(), rows=data.agencies.filter(r=>!query||r.name.toLocaleLowerCase('th').includes(query));
    exportRows('สถิติหน่วยงาน',['หน่วยงาน','ผู้สมัคร','จ้างแล้ว','ยังไม่ได้งาน','อัตราได้งาน (%)','จ่ายแล้ว (บาท)','รอโอน (บาท)','งบจัดสรร (บาท)','อัตราใช้งบ (%)'],
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
      facultyStatsSection:['สถิติรายคณะ',['คณะ','ผู้สมัคร','สัดส่วนผู้สมัคร (%)','จ้างแล้ว','สัดส่วนผู้ได้งาน (%)','ยังไม่ได้งาน','อัตราได้งาน (%)','ได้รับเงินแล้ว','เงินโอนแล้ว'],a.faculty.map(r=>[r.name,r.applied,a.totals.applicants?100*r.applied/a.totals.applicants:null,r.hired,a.totals.hired?100*r.hired/a.totals.hired:null,r.notHired,r.ratio,r.paidStudents,r.paidAmount])],
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
  window.printFacultyStatsReport=()=>download('facultyStatsSection');
  window.frReportVersion=V;
  build();
})();
