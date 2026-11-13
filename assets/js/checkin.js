/* UBU Student Jobs — daily check-in production UI. Server enforces access, proof, approval, print gate. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const clean = v => String(v == null ? '' : v);
  const h = v => clean(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const state = {studentItems:[],days:[],agencies:[],attendance:[],busy:false};
  const token = () => sessionStorage.getItem('sessionToken')||'';
  function api(action,...args) {
    if(window.GAS_API&&typeof window.GAS_API.call==='function')return window.GAS_API.call(action,[token(),...args]);
    return new Promise((resolve,reject)=>google.script.run.withSuccessHandler(resolve).withFailureHandler(reject)[action](token(),...args));
  }
  function alertMessage(message,type='info'){
    if(window.Swal)return Swal.fire({icon:type,title:type==='error'?'เกิดข้อผิดพลาด':type==='success'?'ดำเนินการสำเร็จ':'แจ้งเตือน',text:clean(message),confirmButtonText:'ตกลง'});
    alert(message);return Promise.resolve();
  }
  async function ask(message){
    if(window.Swal){const r=await Swal.fire({title:'ยืนยันการดำเนินการ',text:message,icon:'question',showCancelButton:true,confirmButtonText:'ยืนยัน',cancelButtonText:'ยกเลิก'});return r.isConfirmed;}
    return confirm(message);
  }
  function fail(e){console.error('[Check-in]',e);return alertMessage(e&&e.message?e.message:String(e),'error');}
  function busy(b){state.busy=b;document.querySelectorAll('.ci-action').forEach(el=>el.disabled=b);}
  function dayNow(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()).replace(/\//g,'-');}
  function prettyDay(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(clean(s)))return clean(s);const [y,m,d]=s.split('-');return `${Number(d)}/${Number(m)}/${Number(y)+543}`;}
  function slot(s){return ({morning:'08.30–12.00 น.',afternoon:'13.00–16.30 น.',evening:'16.30–20.00 น.',full:'08.30–16.30 น.'})[clean(s).toLowerCase()]||clean(s||'—');}
  function status(s){return ({NotCheckedIn:'ยังไม่ได้บันทึกเวลาเข้า',CheckedIn:'บันทึกเวลาเข้าแล้ว',PendingReview:'รอเจ้าหน้าที่ตรวจสอบ',Approved:'รับรองการปฏิบัติงานแล้ว',Rejected:'ไม่รับรองการปฏิบัติงาน'})[s]||clean(s||'—');}
  function statusTag(s){const key=['NotCheckedIn','CheckedIn','PendingReview','Approved','Rejected'].includes(s)?s:'NotCheckedIn';return `<span class="ci-tag ci-tag--${key}">${h(status(s))}</span>`;}
  function studentSelection(){return state.studentItems.find(x=>(x.registrationId+'|'+x.shiftNo)===$('ciStudentJob').value)||null;}
  const timeLabel = v => /^\d{4}-\d{2}-\d{2}T(\d{2}:\d{2})/.test(clean(v)) ? clean(v).slice(11,16) : '—';
  function gpsDistance(a,b,c,d){
    const toRad=n=>n*Math.PI/180,R=6371000,dl=toRad(c-a),dg=toRad(d-b);
    const x=Math.sin(dl/2)**2+Math.cos(toRad(a))*Math.cos(toRad(c))*Math.sin(dg/2)**2;
    return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(Math.max(0,1-x)));
  }
  function gpsStatus(text,ok){const el=$('ciGpsStatus');if(el){el.textContent=text;el.classList.toggle('ci-gps-valid',!!ok);}}
  async function verifyGPS(){
    const item=studentSelection();if(!item)return alertMessage('กรุณาเลือกรายการงานก่อน','warning');
    if(!Number.isFinite(Number(item.latitude))||!Number.isFinite(Number(item.longitude))||!Number.isFinite(Number(item.radiusM)))
      throw Error('หน่วยงานยังไม่ได้กำหนดจุด GPS ที่ถูกต้องสำหรับช่วงนี้');
    gpsStatus('กำลังอ่านตำแหน่ง GPS ความแม่นยำสูง…');
    try{
      const pos=await locate(),dist=gpsDistance(pos.latitude,pos.longitude,Number(item.latitude),Number(item.longitude));
      const accurate=pos.accuracy<=item.maxAccuracyM,inside=dist+pos.accuracy<=item.radiusM,ok=accurate&&inside;
      gpsStatus('GPS: ห่างจุดปฏิบัติงาน '+Math.round(dist)+' เมตร | คลาดเคลื่อน ±'+Math.round(pos.accuracy)+' เมตร | รัศมีที่กำหนด '+item.radiusM+' เมตร — '+(ok?'ผ่านการประเมินตำแหน่งเบื้องต้น':'ยังไม่ผ่านเกณฑ์ GPS'),ok);
      return {pos,ok};
    }catch(e){gpsStatus('ไม่สามารถอ่านตำแหน่ง GPS ได้: '+(e.message||e));throw e;}
  }
  function refreshStudentSelection(){
    const item=studentSelection(),detail=$('ciStudentDetail'),info=$('ciStudentSchedule');
    if(!detail||!info)return;
    info.classList.remove('ci-summary--ready','ci-summary--waiting');
    gpsStatus('ยังไม่ได้ตรวจสอบ GPS กรุณาเปิดบริการตำแหน่งและกดตรวจสอบพิกัด');
    if(!item){
      detail.textContent='ยังไม่ได้เลือกรายการงาน';
      info.innerHTML='<i class="material-icons" aria-hidden="true">info_outline</i><span>โปรดเลือกรายการงานและช่วงเวลาปฏิบัติงาน</span>';
      $('ciInBtn').hidden=true;$('ciOutBtn').hidden=true;
      return;
    }
    const rec=item.record,statusValue=rec?rec.status:'NotCheckedIn',opened=!!(item.configured&&item.enabled);
    info.classList.add(opened?'ci-summary--ready':'ci-summary--waiting');
    info.innerHTML=`<i class="material-icons" aria-hidden="true">${opened?'check_circle_outline':'schedule'}</i><span>${opened?'เปิดให้บันทึกเวลาตามช่วงที่กำหนด':'หน่วยงานยังไม่เปิดให้บันทึกเวลา'} — ${h(prettyDay(item.workDate))} | ช่วงที่ ${h(item.shiftNo)}</span>`;
    detail.innerHTML=`<div class="ci-job-title">${h(item.title)} <span class="ci-tag">ช่วงที่ ${h(item.shiftNo)}</span></div>`+
      `<div class="ci-meta">หน่วยงาน: ${h(item.agency)}</div><div style="margin-top:11px">${statusTag(statusValue)}</div>`+
      `<div class="ci-job-meta">`+
      `<div><span>วันที่ปฏิบัติงาน</span><strong>${h(prettyDay(item.workDate))}</strong></div>`+
      `<div><span>สถานที่ปฏิบัติงาน</span><strong>${h(item.locationName||'ยังไม่ระบุ')}</strong></div>`+
      `<div><span>เปิดบันทึกเข้างาน</span><strong>${h(item.checkInOpen||'—')}–${h(item.checkInClose||'—')} น.</strong></div>`+
      `<div><span>เปิดบันทึกออกงาน</span><strong>${h(item.checkOutOpen||'—')}–${h(item.checkOutClose||'—')} น.</strong></div>`+
      `<div><span>เวลาที่บันทึกเข้างานจริง</span><strong>${rec?.checkInAt?h(rec?.checkInTime||timeLabel(rec?.checkInAt))+' น.':'—'}</strong></div>`+
      `<div><span>เวลาที่บันทึกออกงานจริง</span><strong>${rec?.checkOutAt?h(rec?.checkOutTime||timeLabel(rec?.checkOutAt))+' น.':'—'}</strong></div>`+
      `<div><span>รัศมี GPS / ค่าคลาดเคลื่อนสูงสุด</span><strong>${h(item.radiusM??'—')} / ${h(item.maxAccuracyM??'—')} เมตร</strong></div>`+
      `<div><span>ชั่วโมงทำงานที่บันทึกได้</span><strong>${rec?.workedHours!=null&&rec.checkOutAt?h(rec.workedHours)+' ชั่วโมง':'—'}</strong></div></div>`;
    $('ciInBtn').hidden=!!rec||!item.checkInAvailable;
    $('ciOutBtn').hidden=!rec||rec.status!=='CheckedIn'||!item.checkOutAvailable;
    if(opened&&$('ciInBtn').hidden&&$('ciOutBtn').hidden&&statusValue!=='Approved')
      detail.insertAdjacentHTML('beforeend','<p class="ci-inline-hint">หากไม่มีปุ่มบันทึกเวลา โปรดตรวจสอบช่วงเวลาที่เปิดให้บริการและสถานะการบันทึกที่ผ่านมา</p>');
  }
  async function studentLoad(){
    if(!$('ciStudentJob'))return;busy(true);
    try{
      const r=await api('ciStudentJobs');if(!r||!r.success)throw Error(r&&r.message||'โหลดรายการงานไม่ได้');
      state.studentItems=r.items||[];const select=$('ciStudentJob'),previous=select.value;
      select.replaceChildren(new Option('— เลือกงานที่ได้รับอนุมัติ —',''));
      state.studentItems.forEach(x=>select.add(new Option(`${prettyDay(x.workDate)} | ช่วงที่ ${x.shiftNo} | ${x.title} (${x.agency})`,x.registrationId+'|'+x.shiftNo)));
      if(state.studentItems.some(x=>(x.registrationId+'|'+x.shiftNo)===previous))select.value=previous;
      $('ciStudentEmpty').textContent=state.studentItems.length?'':'ขณะนี้ไม่มีรายการงานที่ได้รับอนุมัติให้ปฏิบัติงาน';
      refreshStudentSelection();
    }catch(e){await fail(e)}finally{busy(false)}
  }
  function locate(){
    if(!window.isSecureContext)return Promise.reject(Error('ต้องเปิดผ่าน HTTPS เพื่อใช้งาน GPS'));
    if(!navigator.geolocation)return Promise.reject(Error('อุปกรณ์หรือเบราว์เซอร์ไม่รองรับ GPS'));
    return new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(p=>resolve({latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy}),
      e=>reject(Error('ไม่สามารถอ่านตำแหน่งได้: '+e.message+' กรุณาเปิด GPS และอนุญาตตำแหน่งที่แม่นยำ')),
      {enableHighAccuracy:true,maximumAge:0,timeout:25000}));
  }
  async function send(phase){
    const item=studentSelection();if(!item)return alertMessage('กรุณาเลือกรายการงานก่อน','warning');
    if((phase==='in'&&!item.checkInAvailable)||(phase==='out'&&!item.checkOutAvailable))
      return alertMessage('ยังไม่อยู่ในช่วงเวลาที่หน่วยงานอนุญาตให้บันทึก','warning');
    if(!$('ciConsent').checked)return alertMessage('กรุณายืนยันการอนุญาตใช้งานตำแหน่ง GPS','warning');
    if(state.busy||!await ask('ยืนยันการบันทึกเวลา'+(phase==='in'?'เข้า':'ออก')+'งาน ช่วงที่ '+item.shiftNo+' โดยใช้พิกัด GPS ที่ตรวจสอบ ณ เวลาบันทึก ใช่หรือไม่?'))return;
    busy(true);
    try{
      // Measure afresh for each submission; never reuse an earlier location observation.
      const check=await verifyGPS();
      if(!check.ok)throw Error('พิกัด GPS ยังไม่ผ่านเกณฑ์รัศมีและความแม่นยำของหน่วยงาน กรุณาตรวจสอบตำแหน่งใหม่');
      const result=await api('ciSubmitGPS',{registrationId:item.registrationId,shiftNo:item.shiftNo,phase,position:check.pos,consent:true});
      if(!result||!result.success)throw Error(clean(result?.message||'ไม่สามารถบันทึกเวลาได้')+(result?.code?' ['+result.code+']':''));
      await alertMessage(result.message,'success');await studentLoad();
    }catch(e){
      let found=false;
      try{
        const r=await api('ciStudentJobs'),current=(r.items||[]).find(x=>x.registrationId===item.registrationId&&x.shiftNo===item.shiftNo);
        if(current?.record&&(phase==='in'?!!current.record.checkInAt:!!current.record.checkOutAt)){
          found=true;state.studentItems=r.items;refreshStudentSelection();
          await alertMessage('ตรวจพบว่าระบบบันทึกเวลา'+(phase==='in'?'เข้า':'ออก')+'งานช่วงที่ '+item.shiftNo+' เรียบร้อยแล้ว เวลา '+(phase==='in'?current.record.checkInTime:current.record.checkOutTime)+' น. ไม่ต้องกดซ้ำ','success');
        }
      }catch(_){}
      if(!found)await fail(e);
    }finally{busy(false)}
  }
  const selectedAgency=()=>clean($('ciAdminAgency')?.value||'');
  const selectedDay=()=>clean($('ciAdminWorkDate')?.value||'');
  const selectedConfig=()=>state.days.find(x=>x.agency===selectedAgency()&&x.workDate===selectedDay());
  function updateShift2Fields(){
    const enabled=!!$('ciShift2Enabled')?.checked;
    ['ciStart2','ciEnd2','ciOutStart2','ciOutEnd2'].forEach(id=>{if($(id))$(id).disabled=!enabled;});
  }
  function fillConfig(){
    const p=selectedConfig();
    $('ciLocationName').value=p?p.locationName:'';$('ciLat').value=p?p.latitude:'';$('ciLng').value=p?p.longitude:'';
    $('ciRadius').value=p?p.radiusM:100;$('ciAccuracy').value=p?p.maxAccuracyM:30;
    $('ciStart').value=p?p.checkInOpen:'08:00';$('ciEnd').value=p?p.checkInClose:'09:00';
    $('ciOutStart').value=p?p.checkOutOpen:'11:30';$('ciOutEnd').value=p?p.checkOutClose:'12:30';
    $('ciShift2Enabled').checked=!!p&&p.shift2Enabled;
    $('ciStart2').value=p&&p.shift2CheckInOpen?p.shift2CheckInOpen:'13:00';
    $('ciEnd2').value=p&&p.shift2CheckInClose?p.shift2CheckInClose:'13:30';
    $('ciOutStart2').value=p&&p.shift2CheckOutOpen?p.shift2CheckOutOpen:'16:00';
    $('ciOutEnd2').value=p&&p.shift2CheckOutClose?p.shift2CheckOutClose:'16:30';
    $('ciJobEnabled').checked=!!p&&p.enabled;updateShift2Fields();
    $('ciDeleteLocation').hidden=!p;
    $('ciAdminChosen').textContent=selectedAgency()?`หน่วยงาน: ${selectedAgency()} | วันที่ ${prettyDay(selectedDay())}`:'กรุณาเลือกหน่วยงานและวันที่ปฏิบัติงาน';
    const statusBox=$('ciAdminDayStatus');
    statusBox.classList.remove('ci-summary--ready','ci-summary--waiting');
    if(p)statusBox.classList.add(p.enabled?'ci-summary--ready':'ci-summary--waiting');
    statusBox.innerHTML=!p
      ?'<i class="material-icons" aria-hidden="true">info_outline</i><span>ยังไม่ได้กำหนดจุดพิกัดและช่วงเวลาสำหรับวันที่เลือก</span>'
      :p.enabled
      ?`<i class="material-icons" aria-hidden="true">check_circle_outline</i><span>เปิดใช้งาน — วันที่ ${h(prettyDay(p.workDate))} | ช่วงที่ 1 เข้า ${h(p.checkInOpen)}–${h(p.checkInClose)} / ออก ${h(p.checkOutOpen)}–${h(p.checkOutClose)} น. ${p.shift2Enabled?`| ช่วงที่ 2 เข้า ${h(p.shift2CheckInOpen)}–${h(p.shift2CheckInClose)} / ออก ${h(p.shift2CheckOutOpen)}–${h(p.shift2CheckOutClose)} น.`:''}</span>`
      :`<i class="material-icons" aria-hidden="true">pause_circle_outline</i><span>ปิดการบันทึกเวลา — วันที่ ${h(prettyDay(p.workDate))} (สามารถแก้ไขและเปิดใช้งานอีกครั้งได้)</span>`;
  }
  function renderDailyList(){
    const tbody=$('ciDailyScheduleBody');if(!tbody)return;
    const daily=state.days.filter(x=>!selectedAgency()||x.agency===selectedAgency()).sort((a,b)=>b.workDate.localeCompare(a.workDate));
    tbody.innerHTML=daily.length?daily.map(p=>`<tr><td><strong>${h(prettyDay(p.workDate))}</strong></td><td>${h(p.agency)}</td><td>${h(p.checkInOpen)}–${h(p.checkInClose)} น.<div class="ci-meta">ออก: ${h(p.checkOutOpen)}–${h(p.checkOutClose)}</div></td><td>${p.shift2Enabled?`${h(p.shift2CheckInOpen)}–${h(p.shift2CheckInClose)} น.<div class="ci-meta">ออก: ${h(p.shift2CheckOutOpen)}–${h(p.shift2CheckOutClose)}</div>`:'—'}</td><td><span class="ci-tag ${p.enabled?'ci-tag--open':'ci-tag--closed'}">${p.enabled?'เปิดใช้งาน':'ปิดใช้งาน'}</span></td><td><button class="ci-small" type="button" data-editday="${h(p.workDate)}" data-agency="${h(p.agency)}">แก้ไขการตั้งค่า</button></td></tr>`).join(''):'<tr><td class="ci-empty" colspan="6">ยังไม่มีข้อมูลการตั้งค่ารอบเวลาของหน่วยงานนี้</td></tr>';
  }
  async function adminLoad(){
    if(!$('ciAdminAgency'))return;busy(true);
    try{
      const r=await api('ciAdminJobs');if(!r||!r.success)throw Error(r&&r.message||'โหลดการตั้งค่ารายวันไม่สำเร็จ');
      state.agencies=r.agencies||[];state.days=r.daily||[];
      const select=$('ciAdminAgency'),prev=select.value;select.replaceChildren(new Option('— กรุณาเลือกหน่วยงาน —',''));
      state.agencies.forEach(a=>select.add(new Option(a,a)));
      if(state.agencies.includes(prev))select.value=prev;
      else if(state.agencies.length===1)select.value=state.agencies[0];
      if(!$('ciAdminWorkDate').value)$('ciAdminWorkDate').value=dayNow();
      fillConfig();renderDailyList();
    }catch(e){await fail(e)}finally{busy(false)}
    await adminAttendance();
  }
  async function useMyLocation(){
    try{const p=await locate(),limit=Number($('ciAccuracy').value)||30;
      if(p.accuracy>limit)throw Error('ค่าความคลาดเคลื่อน GPS '+Math.round(p.accuracy)+' เมตร สูงกว่าเกณฑ์ '+limit+' เมตร กรุณาออกไปบริเวณรับสัญญาณดีแล้วลองใหม่');
      $('ciLat').value=p.latitude.toFixed(7);$('ciLng').value=p.longitude.toFixed(7);
      await alertMessage('กำหนดจุด GPS จากตำแหน่งที่อ่านได้แล้ว (ค่าคลาดเคลื่อน ±'+Math.round(p.accuracy)+' เมตร) โปรดตรวจสอบความถูกต้องของจุดปฏิบัติงานก่อนบันทึก','success');}
    catch(e){await fail(e)}
  }
  async function saveDaily(){
    const agency=selectedAgency(),workDate=selectedDay();if(!agency||!workDate)return alertMessage('กรุณาเลือกหน่วยงานและวันที่','warning');
    if(!$('ciLat').value||!$('ciLng').value)return alertMessage('กรุณาระบุพิกัด GPS','warning');
    const data={agency,workDate,locationName:$('ciLocationName').value,latitude:Number($('ciLat').value),longitude:Number($('ciLng').value),radiusM:Number($('ciRadius').value),maxAccuracyM:Number($('ciAccuracy').value),
      checkInOpen:$('ciStart').value,checkInClose:$('ciEnd').value,checkOutOpen:$('ciOutStart').value,checkOutClose:$('ciOutEnd').value,
      shift2Enabled:$('ciShift2Enabled').checked,shift2CheckInOpen:$('ciStart2').value,shift2CheckInClose:$('ciEnd2').value,
      shift2CheckOutOpen:$('ciOutStart2').value,shift2CheckOutClose:$('ciOutEnd2').value,enabled:$('ciJobEnabled').checked};
    busy(true);try{const r=await api('ciAdminSaveDaily',data);if(!r||!r.success)throw Error(r&&r.message||'บันทึกไม่สำเร็จ');await alertMessage(r.message,'success');await adminLoad();}
    catch(e){await fail(e)}finally{busy(false)}
  }
  async function toggleDay(){
    const p=selectedConfig(),next=$('ciJobEnabled').checked;
    if(!p)return alertMessage('กรุณาบันทึกการกำหนดจุดพิกัดและช่วงเวลาก่อนเปลี่ยนสถานะการใช้งาน','info');
    busy(true);try{const r=await api('ciAdminSetDayEnabled',selectedAgency(),selectedDay(),next);if(!r||!r.success)throw Error(r&&r.message||'เปลี่ยนสถานะไม่สำเร็จ');await adminLoad();}
    catch(e){$('ciJobEnabled').checked=!next;await fail(e)}finally{busy(false)}
  }
  async function deleteDay(){
    const p=selectedConfig();if(!p)return;
    if(!await ask('ยืนยันการลบการตั้งค่าประจำวันที่ '+prettyDay(p.workDate)+' ของหน่วยงาน '+p.agency+' ใช่หรือไม่? หากมีรายการบันทึกเวลาแล้ว ระบบจะไม่อนุญาตให้ลบ'))return;
    busy(true);try{const r=await api('ciAdminDeleteDaily',p.agency,p.workDate);if(!r||!r.success)throw Error(r&&r.message||'ลบไม่สำเร็จ');await alertMessage(r.message,'success');await adminLoad();}
    catch(e){await fail(e)}finally{busy(false)}
  }
  function setAttendanceStats(n){
    const keys={ciStatTotal:'total',ciStatNotCheckedIn:'notCheckedIn',ciStatCheckedIn:'checkedIn',ciStatPendingReview:'pendingReview',ciStatApproved:'approved',ciStatRejected:'rejected'};
    Object.entries(keys).forEach(([id,key])=>{const el=$(id);if(el)el.textContent=String(Number(n&&n[key])||0);});
  }
  function renderAttendanceTable(){
    const tbody=$('ciAdminRecordsBody');if(!tbody)return;
    const needle=clean($('ciAttendanceSearch')?.value).trim().toLowerCase();
    const filter=clean($('ciAttendanceStatusFilter')?.value);
    const rows=state.attendance.filter(x=>(!filter||x.status===filter)&&(!needle||[x.studentName,x.studentId,x.title].some(v=>clean(v).toLowerCase().includes(needle))));
    $('ciAttendanceCount').textContent=`แสดง ${rows.length} จาก ${state.attendance.length} รายการ | ตรวจสอบข้อมูลประจำวัน ${prettyDay(selectedDay())}`;
    tbody.innerHTML=rows.length?rows.map(x=>`<tr>
      <td><strong>${h(prettyDay(x.workDate))}</strong><div class="ci-meta">ช่วงที่ ${h(x.shiftNo)} | ${h(slot(x.slot))}</div></td>
      <td><strong>${h(x.studentName)}</strong><div class="ci-meta">รหัส ${h(x.studentId)}</div></td>
      <td>${h(x.title)}</td>
      <td><div><span class="ci-meta">เข้า:</span> <strong>${h(x.checkInTime||'—')} น.</strong></div><div><span class="ci-meta">ออก:</span> <strong>${h(x.checkOutTime||'—')} น.</strong></div><div class="ci-meta">${x.checkOutAt?'รวม '+h(x.workedHours)+' ชั่วโมง':'รอบันทึกเวลาออก'}</div></td>
      <td>${statusTag(x.status)}</td>
      <td>${x.recordId?`<button type="button" class="ci-small" data-gps="yes" data-id="${h(x.recordId)}">ดูพิกัด</button>`:'—'}</td>
      <td>${x.status==='PendingReview'?`<button type="button" class="ci-small ci-small--approve ci-action" data-review="Approved" data-id="${h(x.recordId)}">รับรอง</button> <button type="button" class="ci-small ci-small--reject ci-action" data-review="Rejected" data-id="${h(x.recordId)}">ไม่รับรอง</button>`:h(x.reviewNote||'รอให้บันทึกเวลาเข้า–ออกครบถ้วน')}</td>
    </tr>`).join(''):'<tr><td class="ci-empty" colspan="7">ไม่พบข้อมูลตรงตามเงื่อนไขที่เลือก</td></tr>';
  }
  async function adminAttendance(){
    const tbody=$('ciAdminRecordsBody');if(!tbody)return;
    const agency=selectedAgency(),day=selectedDay();
    if(!agency||!day){state.attendance=[];setAttendanceStats({});tbody.innerHTML='<tr><td class="ci-empty" colspan="7">กรุณาเลือกหน่วยงานและวันที่ก่อนแสดงข้อมูล</td></tr>';$('ciAttendanceCount').textContent='กรุณาเลือกหน่วยงานและวันที่ปฏิบัติงาน';return;}
    tbody.innerHTML='<tr><td class="ci-empty" colspan="7">กำลังโหลดข้อมูลการปฏิบัติงานของนักศึกษา…</td></tr>';
    try{
      const r=await api('ciAdminAttendance',day,agency);if(!r||!r.success)throw Error(r&&r.message||'โหลดข้อมูลไม่สำเร็จ');
      // Ignore stale responses when the officer switches unit/date before a request completes.
      if(agency!==selectedAgency()||day!==selectedDay())return;
      state.attendance=r.items||[];setAttendanceStats(r.summary||{});
      renderAttendanceTable();
    }catch(e){state.attendance=[];setAttendanceStats({});tbody.innerHTML='<tr><td class="ci-empty" colspan="7">ไม่สามารถโหลดข้อมูลได้ กรุณากดโหลดข้อมูลล่าสุดอีกครั้ง</td></tr>';$('ciAttendanceCount').textContent='ไม่สามารถแสดงข้อมูลได้';await fail(e)}
  }
  async function gps(id){
    // Read the exact record. Backend validates the logged-in officer's agency.
    const day=selectedDay(),agency=selectedAgency();
    if(!id||!day||!agency)return alertMessage('กรุณาเลือกหน่วยงานและวันที่ก่อนดูพิกัด','warning');
    try{
      const x=await api('ciAdminRecordGPS',id,day,agency);
      if(!x||!x.success)throw Error(x&&x.message||'ไม่สามารถอ่านหลักฐาน GPS');
      const coord=(lat,lng,acc)=>{
        if(lat==null||lng==null||lat===''||lng==='')return 'ยังไม่มีพิกัด';
        const la=Number(lat),lo=Number(lng),ac=Number(acc);
        if(!Number.isFinite(la)||!Number.isFinite(lo)||Math.abs(la)>90||Math.abs(lo)>180)return 'พิกัดไม่ถูกต้อง';
        return la.toFixed(6)+', '+lo.toFixed(6)+(acc!=null&&acc!==''&&Number.isFinite(ac)&&ac>0?' (±'+Math.round(ac)+' ม.)':'');
      };
      return alertMessage('วันที่ '+prettyDay(x.workDate)+' | ช่วงที่ '+(x.shiftNo||1)+
        '\nGPS เข้างาน: '+coord(x.checkInLatitude,x.checkInLongitude,x.checkInAccuracyM)+
        ' | ห่างจุดงาน '+(x.checkInDistanceM??'—')+' ม.'+
        '\nGPS ออกงาน: '+coord(x.checkOutLatitude,x.checkOutLongitude,x.checkOutAccuracyM)+
        ' | ห่างจุดงาน '+(x.checkOutDistanceM??'—')+' ม.');
    }catch(e){return fail(e)}
  }

  async function review(id,decision){
    let note='';
    if(window.Swal){const r=await Swal.fire({title:decision==='Approved'?'รับรองผลการปฏิบัติงานของนักศึกษา':'ไม่รับรองผลการปฏิบัติงานของนักศึกษา',input:'textarea',inputLabel:'หมายเหตุประกอบการตรวจสอบ (ต้องระบุเมื่อไม่รับรอง)',showCancelButton:true,confirmButtonText:'บันทึกผลการตรวจสอบ',cancelButtonText:'ยกเลิก'});if(!r.isConfirmed)return;note=r.value||'';}
    else {const raw=prompt('หมายเหตุการตรวจสอบ');if(raw===null)return;note=raw;}
    if(decision==='Rejected'&&!clean(note).trim())return alertMessage('กรุณาระบุเหตุผลประกอบการไม่รับรองผลการปฏิบัติงาน','warning');
    busy(true);try{const r=await api('ciAdminReview',id,decision,note);if(!r||!r.success)throw Error(r&&r.message||'ตรวจสอบไม่สำเร็จ');await alertMessage(r.message,'success');await adminAttendance();}
    catch(e){await fail(e)}finally{busy(false)}
  }
  if(typeof setupNavClick==='function'){
    setupNavClick('navCheckinStudent','ciStudentSection',studentLoad);
    setupNavClick('navCheckinAdmin','ciAdminSection',adminLoad);
  }
  $('ciStudentJob')?.addEventListener('change',refreshStudentSelection);
  $('ciCheckGPS')?.addEventListener('click',async()=>{try{await verifyGPS();}catch(e){await fail(e)}});
  $('ciInBtn')?.addEventListener('click',()=>send('in'));$('ciOutBtn')?.addEventListener('click',()=>send('out'));
  $('ciAdminAgency')?.addEventListener('change',()=>{fillConfig();renderDailyList();adminAttendance();});
  $('ciAdminWorkDate')?.addEventListener('change',()=>{fillConfig();adminAttendance();});
  $('ciUseMyLocation')?.addEventListener('click',useMyLocation);$('ciSaveLocation')?.addEventListener('click',saveDaily);
  $('ciShift2Enabled')?.addEventListener('change',updateShift2Fields);
  $('ciJobEnabled')?.addEventListener('change',toggleDay);$('ciDeleteLocation')?.addEventListener('click',deleteDay);
  $('ciRefreshRecords')?.addEventListener('click',adminAttendance);
  $('ciAttendanceSearch')?.addEventListener('input',()=>{if(selectedAgency()&&selectedDay())renderAttendanceTable();});
  $('ciAttendanceStatusFilter')?.addEventListener('change',()=>{if(selectedAgency()&&selectedDay())renderAttendanceTable();});
  $('ciDailyScheduleBody')?.addEventListener('click',e=>{const btn=e.target.closest('button[data-editday]');if(!btn)return;
    $('ciAdminAgency').value=btn.dataset.agency;$('ciAdminWorkDate').value=btn.dataset.editday;fillConfig();renderDailyList();adminAttendance();
  });
  $('ciAdminRecordsBody')?.addEventListener('click',e=>{const btn=e.target.closest('button[data-id]');if(!btn||state.busy)return;
    if(btn.dataset.review)review(btn.dataset.id,btn.dataset.review);else if(btn.dataset.gps)gps(btn.dataset.id);
  });
})();
