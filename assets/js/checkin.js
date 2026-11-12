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
  function status(s){return ({NotCheckedIn:'ยังไม่เช็กอิน',CheckedIn:'เช็กอินแล้ว รอเช็กเอาต์',PendingReview:'รอเจ้าหน้าที่ตรวจสอบ',Approved:'เจ้าหน้าที่รับรองแล้ว',Rejected:'เจ้าหน้าที่ไม่รับรอง'})[s]||clean(s||'—');}
  function studentSelection(){return state.studentItems.find(x=>x.registrationId===$('ciStudentJob').value)||null;}
  function stopCamera(){if(state.camera){state.camera.getTracks().forEach(t=>t.stop());state.camera=null;}if($('ciCameraBox'))$('ciCameraBox').hidden=true;}
  function resetPhoto(){stopCamera();state.studentPhoto='';if($('ciPhotoPreview')){$('ciPhotoPreview').hidden=true;$('ciPhotoPreview').removeAttribute('src');}if($('ciCaptureStatus'))$('ciCaptureStatus').textContent='ยังไม่ได้ถ่ายภาพ';}
  function refreshStudentSelection(){
    resetPhoto();const item=studentSelection(),detail=$('ciStudentDetail'),info=$('ciStudentSchedule');if(!detail||!info)return;
    if(!item){detail.textContent='กรุณาเลือกงานจากรายการ';info.textContent='';$('ciInBtn').hidden=true;$('ciOutBtn').hidden=true;$('ciCaptureBtn').hidden=true;return;}
    const rec=item.record,recordStatus=rec?rec.status:'NotCheckedIn';
    const opened=item.configured&&item.enabled;
    info.textContent=(opened?'เปิดให้เช็กอินแล้ว':'ยังไม่เปิดให้เช็กอิน')+` วันที่ ${prettyDay(item.workDate)} | ช่วงเวลาที่สมัคร ${slot(item.slot)}`;
    detail.innerHTML=`<strong>${h(item.title)}</strong> | หน่วยงาน ${h(item.agency)} | สถานะ: <strong>${h(status(recordStatus))}</strong>`+
      `<div style="margin-top:8px">${h(item.locationName||'จุดปฏิบัติงาน')} | เวลาเช็กอิน ${h(item.checkInOpen||'–')}–${h(item.checkInClose||'–')} น. | เวลาเช็กเอาต์ ${h(item.checkOutOpen||'–')}–${h(item.checkOutClose||'–')} น.</div>`;
    const allowIn=!rec&&item.checkInAvailable,allowOut=!!rec&&rec.status==='CheckedIn'&&item.checkOutAvailable;
    $('ciInBtn').hidden=!allowIn;$('ciOutBtn').hidden=!allowOut;$('ciCaptureBtn').hidden=!(allowIn||allowOut);
    if(opened&&!allowIn&&!allowOut){
      detail.insertAdjacentHTML('beforeend','<p style="color:#9a5800;margin-top:8px">นอกช่วงเวลาที่ยืนยันได้ในขณะนี้ หรือรายการได้บันทึกแล้ว โปรดตรวจเวลาที่หน่วยงานกำหนด</p>');
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
      $('ciStudentEmpty').textContent=state.studentItems.length?'':'ยังไม่มีรายการงานที่หน่วยงานรับเข้าทำงาน';
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
    state.studentPhoto=photo;stopCamera();$('ciPhotoPreview').src=photo;$('ciPhotoPreview').hidden=false;$('ciCaptureStatus').textContent='ถ่ายภาพแล้ว พร้อมยืนยันการเช็กอิน/เช็กเอาต์';
  }
  function locate(){
    if(!navigator.geolocation)return Promise.reject(Error('อุปกรณ์ไม่รองรับ GPS'));
    return new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(p=>resolve({latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy}),
      e=>reject(Error('อ่านตำแหน่งไม่ได้: '+e.message)),{enableHighAccuracy:true,maximumAge:0,timeout:22000}));
  }
  async function send(phase){
    const item=studentSelection();if(!item)return alertMessage('กรุณาเลือกงาน','warning');
    if(phase==='in'&&!item.checkInAvailable||phase==='out'&&!item.checkOutAvailable)return alertMessage('ยังไม่อยู่ในช่วงเวลาที่หน่วยงานเปิดรับรายการ','warning');
    if(!$('ciConsent').checked)return alertMessage('โปรดยินยอมบันทึกภาพและ GPS','warning');
    if(!state.studentPhoto)return alertMessage('กรุณาถ่ายภาพหลักฐานก่อน','warning');
    if(state.busy||!await ask('ยืนยันบันทึก'+(phase==='in'?'เวลาเข้างาน':'เวลาออกงาน')+' พร้อม GPS และภาพถ่าย?'))return;
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
          found=true;state.studentItems=r.items;resetPhoto();refreshStudentSelection();await alertMessage('ตรวจพบว่าระบบบันทึกรายการนี้เรียบร้อยแล้ว ไม่ต้องกดซ้ำ','success');
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
    $('ciAdminChosen').textContent=selectedAgency()?`หน่วยงาน: ${selectedAgency()} | วันที่ ${prettyDay(selectedDay())}`:'โปรดเลือกหน่วยงาน';
    $('ciAdminDayStatus').textContent=!p?'ยังไม่ได้ตั้งจุดเช็กอินวันนี้':p.enabled
      ?`เปิดให้เช็กอินแล้ว วันที่ ${prettyDay(p.workDate)} เวลา ${p.checkInOpen}–${p.checkInClose} น. | เช็กเอาต์ ${p.checkOutOpen}–${p.checkOutClose} น.`
      :`ปิดรับเช็กอิน วันที่ ${prettyDay(p.workDate)}`;
  }
  function renderDailyList(){
    const tbody=$('ciDailyScheduleBody');if(!tbody)return;
    const daily=state.days.filter(x=>!selectedAgency()||x.agency===selectedAgency()).sort((a,b)=>b.workDate.localeCompare(a.workDate));
    tbody.innerHTML=daily.length?daily.map(p=>`<tr><td>${h(prettyDay(p.workDate))}</td><td>${h(p.agency)}</td><td>${h(p.checkInOpen)}–${h(p.checkInClose)} น.</td><td>${h(p.checkOutOpen)}–${h(p.checkOutClose)} น.</td><td>${p.enabled?'เปิด':'ปิด'}</td><td><button class="ci-small" type="button" data-editday="${h(p.workDate)}" data-agency="${h(p.agency)}">แก้ไข</button></td></tr>`).join(''):'<tr><td colspan="6">ยังไม่มีรอบเช็กอินของหน่วยงานนี้</td></tr>';
  }
  async function adminLoad(){
    if(!$('ciAdminAgency'))return;busy(true);
    try{
      const r=await api('ciAdminJobs');if(!r||!r.success)throw Error(r&&r.message||'โหลดการตั้งค่ารายวันไม่สำเร็จ');
      state.agencies=r.agencies||[];state.days=r.daily||[];
      const select=$('ciAdminAgency'),prev=select.value;select.replaceChildren(new Option('— เลือกหน่วยงาน —',''));
      state.agencies.forEach(a=>select.add(new Option(a,a)));
      if(state.agencies.includes(prev))select.value=prev;
      else if(state.agencies.length===1)select.value=state.agencies[0];
      if(!$('ciAdminWorkDate').value)$('ciAdminWorkDate').value=dayNow();
      fillConfig();renderDailyList();
    }catch(e){await fail(e)}finally{busy(false)}
    await adminAttendance();
  }
  async function useMyLocation(){
    try{const p=await locate();$('ciLat').value=p.latitude.toFixed(7);$('ciLng').value=p.longitude.toFixed(7);await alertMessage('ระบุจุด GPS ปัจจุบันแล้ว ความแม่นยำประมาณ '+Math.round(p.accuracy)+' เมตร');}
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
    if(!p)return alertMessage('เลือกสถานะไว้แล้ว กรุณากดบันทึกจุดและช่วงเวลาเพื่อเริ่มเปิดรับเช็กอิน','info');
    busy(true);try{const r=await api('ciAdminSetDayEnabled',selectedAgency(),selectedDay(),next);if(!r||!r.success)throw Error(r&&r.message||'เปลี่ยนสถานะไม่สำเร็จ');await adminLoad();}
    catch(e){$('ciJobEnabled').checked=!next;await fail(e)}finally{busy(false)}
  }
  async function deleteDay(){
    const p=selectedConfig();if(!p)return;
    if(!await ask('ลบจุดประจำวันที่ '+prettyDay(p.workDate)+' ของหน่วยงาน '+p.agency+'? หากมีรายการเช็กอินแล้วจะลบไม่ได้'))return;
    busy(true);try{const r=await api('ciAdminDeleteDaily',p.agency,p.workDate);if(!r||!r.success)throw Error(r&&r.message||'ลบไม่สำเร็จ');await alertMessage(r.message,'success');await adminLoad();}
    catch(e){await fail(e)}finally{busy(false)}
  }
  async function adminAttendance(){
    const tbody=$('ciAdminRecordsBody');if(!tbody)return;
    const agency=selectedAgency(),day=selectedDay();if(!agency||!day){tbody.innerHTML='<tr><td colspan="8">เลือกหน่วยงานและวันที่ก่อน</td></tr>';$('ciAttendanceCount').textContent='';return;}
    tbody.innerHTML='<tr><td colspan="8">กำลังโหลดรายชื่อผู้รับเข้าทำงาน...</td></tr>';
    try{
      const r=await api('ciAdminAttendance',day,agency);if(!r||!r.success)throw Error(r&&r.message||'โหลดข้อมูลไม่สำเร็จ');
      state.attendance=r.items||[];const n=r.summary||{};
      $('ciAttendanceCount').textContent=`ทั้งหมด ${n.total||0} | ยังไม่เช็กอิน ${n.notCheckedIn||0} | ทำงานอยู่ ${n.checkedIn||0} | รอตรวจ ${n.pendingReview||0} | รับรอง ${n.approved||0} | ไม่รับรอง ${n.rejected||0}`;
      tbody.innerHTML=state.attendance.length?state.attendance.map(x=>`<tr>
        <td>${h(prettyDay(x.workDate))}<div>${h(slot(x.slot))}</div></td>
        <td>${h(x.studentName)} <small>${h(x.studentId)}</small></td><td>${h(x.title)}</td>
        <td>${h(x.checkInAt||'–')}<br>${h(x.checkOutAt||'–')}</td><td>${h(status(x.status))}</td>
        <td>${x.recordId?`<button type="button" class="ci-small" data-gps="yes" data-id="${h(x.recordId)}">ดูพิกัด</button>`:'–'}</td>
        <td>${x.recordId?`<button type="button" class="ci-small" data-photo="in" data-id="${h(x.recordId)}">ภาพเข้า</button> <button type="button" class="ci-small" data-photo="out" data-id="${h(x.recordId)}" ${x.checkOutAt?'':'disabled'}>ภาพออก</button>`:'–'}</td>
        <td>${x.status==='PendingReview'?`<button type="button" class="ci-small ci-action" data-review="Approved" data-id="${h(x.recordId)}">ยืนยันหลังเสร็จงาน</button> <button type="button" class="ci-small ci-action" data-review="Rejected" data-id="${h(x.recordId)}">ไม่รับรอง</button>`:h(x.reviewNote||'ล็อกจนกว่าจะเช็กอิน–เช็กเอาต์ครบ')}</td>
      </tr>`).join(''):'<tr><td colspan="8">ไม่มีนักศึกษาที่ได้รับการยืนยันเข้าทำงานในวัน/หน่วยงานนี้</td></tr>';
    }catch(e){tbody.innerHTML='<tr><td colspan="8">โหลดข้อมูลไม่ได้ โปรดลองใหม่</td></tr>';await fail(e)}
  }
  function gps(id){
    // Lazy-load authorized coordinates from scoped server records, not from public links.
    return api('ciAdminRecords',selectedDay()).then(r=>{
      if(!r||!r.success)throw Error(r&&r.message||'ไม่สามารถอ่าน GPS');
      const x=(r.items||[]).find(item=>item.recordId===id&&item.agency===selectedAgency());
      if(!x)throw Error('ไม่พบข้อมูลพิกัดที่มีสิทธิ์เข้าถึง');
      const coord=(lat,lng,acc)=>lat==null||lng==null?'ไม่มีพิกัด':Number(lat).toFixed(6)+', '+Number(lng).toFixed(6)+' (±'+Math.round(Number(acc)||0)+' ม.)';
      return alertMessage('GPS เข้างาน: '+coord(x.checkInLatitude,x.checkInLongitude,x.checkInAccuracyM)+'\nGPS ออกงาน: '+coord(x.checkOutLatitude,x.checkOutLongitude,x.checkOutAccuracyM));
    }).catch(fail);
  }
  async function showPhoto(id,phase){
    try{const r=await api('ciAdminPhoto',id,phase);if(!r||!r.success)throw Error(r&&r.message||'ไม่สามารถอ่านภาพหลักฐาน');
      if(window.Swal)await Swal.fire({title:phase==='in'?'ภาพเวลาเข้างาน':'ภาพเวลาออกงาน',imageUrl:r.dataUrl,imageAlt:'หลักฐานการเข้าออกงาน',showConfirmButton:false,showCloseButton:true,width:'560px'});
      else await alertMessage('กรุณาใช้เบราว์เซอร์ที่รองรับหน้าดูภาพหลักฐาน','warning');
    }catch(e){await fail(e)}
  }
  async function review(id,decision){
    let note='';
    if(window.Swal){const r=await Swal.fire({title:decision==='Approved'?'ยืนยันการปฏิบัติงานหลังเสร็จงาน':'ไม่รับรองการปฏิบัติงาน',input:'textarea',inputLabel:'หมายเหตุ (ไม่รับรองต้องระบุ)',showCancelButton:true,confirmButtonText:'บันทึกการตัดสินใจ',cancelButtonText:'ยกเลิก'});if(!r.isConfirmed)return;note=r.value||'';}
    else {const raw=prompt('หมายเหตุการตรวจสอบ');if(raw===null)return;note=raw;}
    if(decision==='Rejected'&&!clean(note).trim())return alertMessage('กรุณาระบุเหตุผลไม่รับรอง','warning');
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
  $('ciDailyScheduleBody')?.addEventListener('click',e=>{const btn=e.target.closest('button[data-editday]');if(!btn)return;
    $('ciAdminAgency').value=btn.dataset.agency;$('ciAdminWorkDate').value=btn.dataset.editday;fillConfig();renderDailyList();adminAttendance();
  });
  $('ciAdminRecordsBody')?.addEventListener('click',e=>{const btn=e.target.closest('button[data-id]');if(!btn||state.busy)return;
    if(btn.dataset.photo)showPhoto(btn.dataset.id,btn.dataset.photo);else if(btn.dataset.review)review(btn.dataset.id,btn.dataset.review);else if(btn.dataset.gps)gps(btn.dataset.id);
  });
})();
