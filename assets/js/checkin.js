/* UBU Student Jobs — daily check-in production UI. Server enforces access, proof, approval, print gate. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const clean = v => String(v == null ? '' : v);
  const h = v => clean(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const state = {studentItems:[],days:[],agencies:[],studentPhoto:'',camera:null,attendance:[],busy:false};
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
  function studentSelection(){return state.studentItems.find(x=>x.registrationId===$('ciStudentJob').value)||null;}
  function stopCamera(){if(state.camera){state.camera.getTracks().forEach(t=>t.stop());state.camera=null;}if($('ciCameraBox'))$('ciCameraBox').hidden=true;}
  function resetPhoto(){stopCamera();state.studentPhoto='';if($('ciPhotoPreview')){$('ciPhotoPreview').hidden=true;$('ciPhotoPreview').removeAttribute('src');}if($('ciCaptureStatus'))$('ciCaptureStatus').textContent='ยังไม่ได้บันทึกภาพถ่ายหลักฐาน';}
  function refreshStudentSelection(){
    resetPhoto();
    const item=studentSelection(),detail=$('ciStudentDetail'),info=$('ciStudentSchedule');
    if(!detail||!info)return;
    info.classList.remove('ci-summary--ready','ci-summary--waiting');
    if(!item){
      detail.textContent='ยังไม่ได้เลือกรายการงาน';
      info.innerHTML='<i class="material-icons" aria-hidden="true">info_outline</i><span>โปรดเลือกรายการงานเพื่อตรวจสอบวันและช่วงเวลาที่สามารถบันทึกได้</span>';
      $('ciInBtn').hidden=true;$('ciOutBtn').hidden=true;$('ciCaptureBtn').hidden=true;
      return;
    }
    const rec=item.record,recordStatus=rec?rec.status:'NotCheckedIn';
    const opened=!!(item.configured&&item.enabled);
    info.classList.add(opened?'ci-summary--ready':'ci-summary--waiting');
    info.innerHTML=`<i class="material-icons" aria-hidden="true">${opened?'check_circle_outline':'schedule'}</i><span>${opened?'หน่วยงานเปิดให้บันทึกเวลาแล้ว':'หน่วยงานยังไม่เปิดให้บันทึกเวลา'} — วันที่ ${h(prettyDay(item.workDate))} | รอบงาน ${h(slot(item.slot))}</span>`;
    detail.innerHTML=`<div class="ci-job-title">${h(item.title)}</div>`+
      `<div class="ci-meta">หน่วยงานที่รับผิดชอบ: ${h(item.agency)}</div>`+
      `<div style="margin-top:11px">${statusTag(recordStatus)}</div>`+
      `<div class="ci-job-meta">`+
      `<div><span>วันที่ปฏิบัติงาน</span><strong>${h(prettyDay(item.workDate))}</strong></div>`+
      `<div><span>จุดปฏิบัติงาน</span><strong>${h(item.locationName||'ยังไม่ระบุสถานที่')}</strong></div>`+
      `<div><span>ช่วงเวลาบันทึกเข้า</span><strong>${h(item.checkInOpen||'—')}–${h(item.checkInClose||'—')} น.</strong></div>`+
      `<div><span>ช่วงเวลาบันทึกออก</span><strong>${h(item.checkOutOpen||'—')}–${h(item.checkOutClose||'—')} น.</strong></div>`+
      `</div>`;
    const allowIn=!rec&&item.checkInAvailable,allowOut=!!rec&&rec.status==='CheckedIn'&&item.checkOutAvailable;
    $('ciInBtn').hidden=!allowIn;$('ciOutBtn').hidden=!allowOut;$('ciCaptureBtn').hidden=!(allowIn||allowOut);
    if(opened&&!allowIn&&!allowOut&&recordStatus!=='Approved'&&recordStatus!=='PendingReview'){
      detail.insertAdjacentHTML('beforeend','<p class="ci-inline-hint">ขณะนี้อยู่นอกช่วงเวลาที่เปิดให้บันทึก หรือได้บันทึกข้อมูลแล้ว กรุณาตรวจสอบช่วงเวลาที่หน่วยงานกำหนด</p>');
    }
  }
  async function studentLoad(){
    if(!$('ciStudentJob'))return;busy(true);
    try{
      const r=await api('ciStudentJobs');if(!r||!r.success)throw Error(r&&r.message||'โหลดรายการงานไม่ได้');
      state.studentItems=r.items||[];const select=$('ciStudentJob'),previous=select.value;
      select.replaceChildren(new Option('— เลือกงานที่ได้รับอนุมัติ —',''));
      state.studentItems.forEach(x=>select.add(new Option(`${prettyDay(x.workDate)} | ${x.title} (${x.agency})`,x.registrationId)));
      if(state.studentItems.some(x=>x.registrationId===previous))select.value=previous;
      $('ciStudentEmpty').textContent=state.studentItems.length?'':'ขณะนี้ไม่มีรายการงานที่ได้รับอนุมัติให้ปฏิบัติงาน';
      refreshStudentSelection();
    }catch(e){await fail(e)}finally{busy(false)}
  }
  async function openCamera(){
    if(!studentSelection())return alertMessage('กรุณาเลือกงานก่อน','warning');resetPhoto();
    if(!navigator.mediaDevices?.getUserMedia)return alertMessage('ไม่สามารถเปิดกล้องได้ โปรดใช้ HTTPS และอนุญาตการใช้กล้อง','error');
    try{
      state.camera=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:'user',width:{ideal:720},height:{ideal:720}}});
      const v=$('ciCameraVideo');v.srcObject=state.camera;$('ciCameraBox').hidden=false;await v.play();
    }catch(e){stopCamera();await fail(e)}
  }
  function takePhoto(){
    const v=$('ciCameraVideo');if(!state.camera||!v.videoWidth)return alertMessage('กล้องยังไม่พร้อม','warning');
    const ratio=Math.min(720/v.videoWidth,720/v.videoHeight,1),w=Math.max(1,Math.round(v.videoWidth*ratio)),height=Math.max(1,Math.round(v.videoHeight*ratio));
    const c=document.createElement('canvas');c.width=w;c.height=height;c.getContext('2d').drawImage(v,0,0,w,height);
    let photo=c.toDataURL('image/jpeg',0.65);if(photo.length>650000)photo=c.toDataURL('image/jpeg',0.32);
    if(photo.length>650000){stopCamera();return alertMessage('รูปภาพใหญ่เกินไป กรุณาถ่ายใหม่','error');}
    state.studentPhoto=photo;stopCamera();$('ciPhotoPreview').src=photo;$('ciPhotoPreview').hidden=false;$('ciCaptureStatus').textContent='บันทึกภาพถ่ายแล้ว กรุณาตรวจสอบและกดยืนยันเวลาเข้า–ออกงาน';
  }
  function locate(){
    if(!navigator.geolocation)return Promise.reject(Error('อุปกรณ์ไม่รองรับ GPS'));
    return new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(p=>resolve({latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy}),
      e=>reject(Error('อ่านตำแหน่งไม่ได้: '+e.message)),{enableHighAccuracy:true,maximumAge:0,timeout:22000}));
  }
  async function send(phase){
    const item=studentSelection();if(!item)return alertMessage('กรุณาเลือกงาน','warning');
    if(phase==='in'&&!item.checkInAvailable||phase==='out'&&!item.checkOutAvailable)return alertMessage('ยังไม่อยู่ในช่วงเวลาที่หน่วยงานเปิดรับรายการ','warning');
    if(!$('ciConsent').checked)return alertMessage('กรุณาให้ความยินยอมในการบันทึกภาพถ่ายและข้อมูลตำแหน่ง','warning');
    if(!state.studentPhoto)return alertMessage('กรุณาบันทึกภาพถ่ายหลักฐานก่อนดำเนินการ','warning');
    if(state.busy||!await ask('ยืนยันการบันทึก'+(phase==='in'?'เวลาเข้าปฏิบัติงาน':'เวลาออกจากการปฏิบัติงาน')+' พร้อมภาพถ่ายและข้อมูลตำแหน่งใช่หรือไม่?'))return;
    busy(true);
    try{
      const result=await api('ciSubmitPhoto',{registrationId:item.registrationId,phase,position:await locate(),photo:state.studentPhoto,consent:true});
      if(!result||!result.success)throw Error(clean(result&&result.message||'ไม่สามารถบันทึกได้')+(result&&result.code?' ['+result.code+']':''));
      await alertMessage(result.message,'success');resetPhoto();await studentLoad();
    }catch(e){
      let found=false;
      try{
        const r=await api('ciStudentJobs'),current=(r.items||[]).find(x=>x.registrationId===item.registrationId);
        if(current&&current.record&&(phase==='in'?['CheckedIn','PendingReview','Approved'].includes(current.record.status):['PendingReview','Approved'].includes(current.record.status))){
          found=true;state.studentItems=r.items;resetPhoto();refreshStudentSelection();await alertMessage('ระบบตรวจพบว่ารายการนี้ได้รับการบันทึกเรียบร้อยแล้ว ไม่จำเป็นต้องดำเนินการซ้ำ','success');
        }
      }catch(_){}
      if(!found)await fail(e);
    }finally{busy(false)}
  }
  const selectedAgency=()=>clean($('ciAdminAgency')?.value||'');
  const selectedDay=()=>clean($('ciAdminWorkDate')?.value||'');
  const selectedConfig=()=>state.days.find(x=>x.agency===selectedAgency()&&x.workDate===selectedDay());
  function fillConfig(){
    const p=selectedConfig();
    $('ciLocationName').value=p?p.locationName:'';$('ciLat').value=p?p.latitude:'';$('ciLng').value=p?p.longitude:'';
    $('ciRadius').value=p?p.radiusM:100;$('ciAccuracy').value=p?p.maxAccuracyM:100;
    $('ciStart').value=p?p.checkInOpen:'07:00';$('ciEnd').value=p?p.checkInClose:'12:00';
    $('ciOutStart').value=p?p.checkOutOpen:'11:30';$('ciOutEnd').value=p?p.checkOutClose:'22:00';
    $('ciJobEnabled').checked=!!p&&p.enabled;
    $('ciDeleteLocation').hidden=!p;
    $('ciAdminChosen').textContent=selectedAgency()?`หน่วยงาน: ${selectedAgency()} | วันที่ ${prettyDay(selectedDay())}`:'กรุณาเลือกหน่วยงานและวันที่ปฏิบัติงาน';
    const statusBox=$('ciAdminDayStatus');
    statusBox.classList.remove('ci-summary--ready','ci-summary--waiting');
    if(p)statusBox.classList.add(p.enabled?'ci-summary--ready':'ci-summary--waiting');
    statusBox.innerHTML=!p
      ?'<i class="material-icons" aria-hidden="true">info_outline</i><span>ยังไม่ได้กำหนดจุดพิกัดและช่วงเวลาสำหรับวันที่เลือก</span>'
      :p.enabled
      ?`<i class="material-icons" aria-hidden="true">check_circle_outline</i><span>เปิดให้บันทึกเวลาแล้ว — วันที่ ${h(prettyDay(p.workDate))} | เวลาเข้า ${h(p.checkInOpen)}–${h(p.checkInClose)} น. | เวลาออก ${h(p.checkOutOpen)}–${h(p.checkOutClose)} น.</span>`
      :`<i class="material-icons" aria-hidden="true">pause_circle_outline</i><span>ปิดการบันทึกเวลา — วันที่ ${h(prettyDay(p.workDate))} (สามารถแก้ไขและเปิดใช้งานอีกครั้งได้)</span>`;
  }
  function renderDailyList(){
    const tbody=$('ciDailyScheduleBody');if(!tbody)return;
    const daily=state.days.filter(x=>!selectedAgency()||x.agency===selectedAgency()).sort((a,b)=>b.workDate.localeCompare(a.workDate));
    tbody.innerHTML=daily.length?daily.map(p=>`<tr><td><strong>${h(prettyDay(p.workDate))}</strong></td><td>${h(p.agency)}</td><td>${h(p.checkInOpen)}–${h(p.checkInClose)} น.</td><td>${h(p.checkOutOpen)}–${h(p.checkOutClose)} น.</td><td><span class="ci-tag ${p.enabled?'ci-tag--open':'ci-tag--closed'}">${p.enabled?'เปิดใช้งาน':'ปิดใช้งาน'}</span></td><td><button class="ci-small" type="button" data-editday="${h(p.workDate)}" data-agency="${h(p.agency)}">แก้ไขการตั้งค่า</button></td></tr>`).join(''):'<tr><td class="ci-empty" colspan="6">ยังไม่มีข้อมูลการตั้งค่ารอบเวลาของหน่วยงานนี้</td></tr>';
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
    try{const p=await locate();$('ciLat').value=p.latitude.toFixed(7);$('ciLng').value=p.longitude.toFixed(7);await alertMessage('กำหนดพิกัดจากตำแหน่งปัจจุบันเรียบร้อยแล้ว ความแม่นยำประมาณ '+Math.round(p.accuracy)+' เมตร โปรดตรวจสอบตำแหน่งก่อนบันทึก');}
    catch(e){await fail(e)}
  }
  async function saveDaily(){
    const agency=selectedAgency(),workDate=selectedDay();if(!agency||!workDate)return alertMessage('กรุณาเลือกหน่วยงานและวันที่','warning');
    if(!$('ciLat').value||!$('ciLng').value)return alertMessage('กรุณาระบุพิกัด GPS','warning');
    const data={agency,workDate,locationName:$('ciLocationName').value,latitude:Number($('ciLat').value),longitude:Number($('ciLng').value),radiusM:Number($('ciRadius').value),maxAccuracyM:Number($('ciAccuracy').value),
      checkInOpen:$('ciStart').value,checkInClose:$('ciEnd').value,checkOutOpen:$('ciOutStart').value,checkOutClose:$('ciOutEnd').value,enabled:$('ciJobEnabled').checked};
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
      <td><strong>${h(prettyDay(x.workDate))}</strong><div class="ci-meta">${h(slot(x.slot))}</div></td>
      <td><strong>${h(x.studentName)}</strong><div class="ci-meta">รหัส ${h(x.studentId)}</div></td>
      <td>${h(x.title)}</td>
      <td><div><span class="ci-meta">เข้า:</span> ${h(x.checkInAt||'—')}</div><div><span class="ci-meta">ออก:</span> ${h(x.checkOutAt||'—')}</div></td>
      <td>${statusTag(x.status)}</td>
      <td>${x.recordId?`<button type="button" class="ci-small" data-gps="yes" data-id="${h(x.recordId)}">ดูพิกัด</button>`:'—'}</td>
      <td>${x.recordId?`<button type="button" class="ci-small" data-photo="in" data-id="${h(x.recordId)}">ภาพเข้างาน</button> <button type="button" class="ci-small" data-photo="out" data-id="${h(x.recordId)}" ${x.checkOutAt?'':'disabled'}>ภาพออกงาน</button>`:'—'}</td>
      <td>${x.status==='PendingReview'?`<button type="button" class="ci-small ci-small--approve ci-action" data-review="Approved" data-id="${h(x.recordId)}">รับรอง</button> <button type="button" class="ci-small ci-small--reject ci-action" data-review="Rejected" data-id="${h(x.recordId)}">ไม่รับรอง</button>`:h(x.reviewNote||'รอให้บันทึกเวลาเข้า–ออกครบถ้วน')}</td>
    </tr>`).join(''):'<tr><td class="ci-empty" colspan="8">ไม่พบข้อมูลตรงตามเงื่อนไขที่เลือก</td></tr>';
  }
  async function adminAttendance(){
    const tbody=$('ciAdminRecordsBody');if(!tbody)return;
    const agency=selectedAgency(),day=selectedDay();
    if(!agency||!day){state.attendance=[];setAttendanceStats({});tbody.innerHTML='<tr><td class="ci-empty" colspan="8">กรุณาเลือกหน่วยงานและวันที่ก่อนแสดงข้อมูล</td></tr>';$('ciAttendanceCount').textContent='กรุณาเลือกหน่วยงานและวันที่ปฏิบัติงาน';return;}
    tbody.innerHTML='<tr><td class="ci-empty" colspan="8">กำลังโหลดข้อมูลการปฏิบัติงานของนักศึกษา…</td></tr>';
    try{
      const r=await api('ciAdminAttendance',day,agency);if(!r||!r.success)throw Error(r&&r.message||'โหลดข้อมูลไม่สำเร็จ');
      // Ignore stale responses when the officer switches unit/date before a request completes.
      if(agency!==selectedAgency()||day!==selectedDay())return;
      state.attendance=r.items||[];setAttendanceStats(r.summary||{});
      renderAttendanceTable();
    }catch(e){state.attendance=[];setAttendanceStats({});tbody.innerHTML='<tr><td class="ci-empty" colspan="8">ไม่สามารถโหลดข้อมูลได้ กรุณากดโหลดข้อมูลล่าสุดอีกครั้ง</td></tr>';$('ciAttendanceCount').textContent='ไม่สามารถแสดงข้อมูลได้';await fail(e)}
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
      return alertMessage('วันที่ '+prettyDay(x.workDate)+'\nGPS เข้างาน: '+coord(x.checkInLatitude,x.checkInLongitude,x.checkInAccuracyM)+'\nGPS ออกงาน: '+coord(x.checkOutLatitude,x.checkOutLongitude,x.checkOutAccuracyM));
    }catch(e){return fail(e)}
  }
  async function showPhoto(id,phase){
    try{const r=await api('ciAdminPhoto',id,phase);if(!r||!r.success)throw Error(r&&r.message||'ไม่สามารถอ่านภาพหลักฐาน');
      if(window.Swal)await Swal.fire({title:phase==='in'?'ภาพหลักฐานขณะเข้างาน':'ภาพหลักฐานขณะออกงาน',imageUrl:r.dataUrl,imageAlt:'หลักฐานการเข้าออกงาน',showConfirmButton:false,showCloseButton:true,width:'560px'});
      else await alertMessage('กรุณาใช้เบราว์เซอร์ที่รองรับหน้าดูภาพหลักฐาน','warning');
    }catch(e){await fail(e)}
  }
  async function review(id,decision){
    let note='';
    if(window.Swal){const r=await Swal.fire({title:decision==='Approved'?'รับรองผลการปฏิบัติงานของนักศึกษา':'ไม่รับรองผลการปฏิบัติงานของนักศึกษา',input:'textarea',inputLabel:'หมายเหตุประกอบการตรวจสอบ (ต้องระบุเมื่อไม่รับรอง)',showCancelButton:true,confirmButtonText:'บันทึกผลการตรวจสอบ',cancelButtonText:'ยกเลิก'});if(!r.isConfirmed)return;note=r.value||'';}
    else {const raw=prompt('หมายเหตุการตรวจสอบ');if(raw===null)return;note=raw;}
    if(decision==='Rejected'&&!clean(note).trim())return alertMessage('กรุณาระบุเหตุผลประกอบการไม่รับรองผลการปฏิบัติงาน','warning');
    busy(true);try{const r=await api('ciAdminReview',id,decision,note);if(!r||!r.success)throw Error(r&&r.message||'ตรวจสอบไม่สำเร็จ');await alertMessage(r.message,'success');await adminAttendance();}
    catch(e){await fail(e)}finally{busy(false)}
  }
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopCamera();});window.addEventListener('pagehide',stopCamera);
  document.addEventListener('click',e=>{const a=e.target.closest('.nav-link');if(a&&a.id!=='navCheckinStudent')stopCamera();});
  if(typeof setupNavClick==='function'){
    setupNavClick('navCheckinStudent','ciStudentSection',studentLoad);
    setupNavClick('navCheckinAdmin','ciAdminSection',adminLoad);
  }
  $('ciStudentJob')?.addEventListener('change',refreshStudentSelection);
  $('ciCaptureBtn')?.addEventListener('click',openCamera);$('ciSnapBtn')?.addEventListener('click',takePhoto);$('ciCancelCamera')?.addEventListener('click',stopCamera);
  $('ciInBtn')?.addEventListener('click',()=>send('in'));$('ciOutBtn')?.addEventListener('click',()=>send('out'));
  $('ciAdminAgency')?.addEventListener('change',()=>{fillConfig();renderDailyList();adminAttendance();});
  $('ciAdminWorkDate')?.addEventListener('change',()=>{fillConfig();adminAttendance();});
  $('ciUseMyLocation')?.addEventListener('click',useMyLocation);$('ciSaveLocation')?.addEventListener('click',saveDaily);
  $('ciJobEnabled')?.addEventListener('change',toggleDay);$('ciDeleteLocation')?.addEventListener('click',deleteDay);
  $('ciRefreshRecords')?.addEventListener('click',adminAttendance);
  $('ciAttendanceSearch')?.addEventListener('input',()=>{if(selectedAgency()&&selectedDay())renderAttendanceTable();});
  $('ciAttendanceStatusFilter')?.addEventListener('change',()=>{if(selectedAgency()&&selectedDay())renderAttendanceTable();});
  $('ciDailyScheduleBody')?.addEventListener('click',e=>{const btn=e.target.closest('button[data-editday]');if(!btn)return;
    $('ciAdminAgency').value=btn.dataset.agency;$('ciAdminWorkDate').value=btn.dataset.editday;fillConfig();renderDailyList();adminAttendance();
  });
  $('ciAdminRecordsBody')?.addEventListener('click',e=>{const btn=e.target.closest('button[data-id]');if(!btn||state.busy)return;
    if(btn.dataset.photo)showPhoto(btn.dataset.id,btn.dataset.photo);else if(btn.dataset.review)review(btn.dataset.id,btn.dataset.review);else if(btn.dataset.gps)gps(btn.dataset.id);
  });
})();
