/* UBU Check-in pilot — isolated UI. No TimeLogs / Payroll writes. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const clean = value => String(value == null ? '' : value);
  const escapeHtml = value => clean(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const state = {studentItems:[],adminJobs:[],studentPhoto:'',camera:null,reviewItems:[],busy:false};
  const token = () => sessionStorage.getItem('sessionToken') || '';
  const role = () => {try{return clean(JSON.parse(sessionStorage.getItem('currentUser')||'{}').role).toLowerCase();}catch(_){return ''}};
  function api(action,...args){
    if(window.GAS_API && typeof window.GAS_API.call==='function') return window.GAS_API.call(action,[token(),...args]);
    return new Promise((resolve,reject)=>{google.script.run.withSuccessHandler(resolve).withFailureHandler(reject)[action](token(),...args);});
  }
  function msg(message,type='info'){if(window.Swal)return Swal.fire({title:type==='error'?'เกิดข้อผิดพลาด':type==='success'?'สำเร็จ':'แจ้งเตือน',text:clean(message),icon:type,confirmButtonText:'ตกลง'});alert(message);return Promise.resolve();}
  function busy(flag){state.busy=flag;document.querySelectorAll('.ci-action').forEach(btn=>btn.disabled=flag);}
  function fail(err){console.error('[Check-in]',err);return msg(err&&err.message?err.message:String(err),'error');}
  function formatDay(iso){if(!/^\d{4}-\d{2}-\d{2}$/.test(clean(iso)))return clean(iso);let [y,m,d]=iso.split('-').map(Number);return `${d}/${m}/${y+543}`;}
  function studentSelection(){return state.studentItems.find(x=>x.registrationId===$('ciStudentJob').value)||null;}
  function stopCamera(){if(state.camera){state.camera.getTracks().forEach(t=>t.stop());state.camera=null;}const box=$('ciCameraBox');if(box)box.hidden=true;}
  function resetPhoto(){stopCamera();state.studentPhoto='';if($('ciPhotoPreview')){$('ciPhotoPreview').removeAttribute('src');$('ciPhotoPreview').hidden=true;} if($('ciCaptureStatus'))$('ciCaptureStatus').textContent='ยังไม่ได้ถ่ายภาพ';}
  function refreshStudentSelection(){
    resetPhoto();const item=studentSelection(),area=$('ciStudentDetail');if(!area)return;
    if(!item){area.textContent='กรุณาเลือกงาน';return;}
    const record=item.record,status=record?(record.status==='CheckedIn'?'เช็กอินแล้ว รอเช็กเอาต์':record.status==='PendingReview'?'รอเจ้าหน้าที่ตรวจสอบ':record.status==='Approved'?'ตรวจสอบแล้ว':record.status==='Rejected'?'ไม่ผ่านการตรวจสอบ':record.status):'ยังไม่เช็กอิน';
    area.textContent=`วันที่ ${formatDay(item.workDate)} | ${item.agency} | ${item.slot||'-'} | ${item.configured?'รัศมี '+item.radiusM+' เมตร':'ยังไม่ได้ตั้งค่าจุด'} | สถานะ: ${status}`;
    const today=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Bangkok'});
    const ready=item.workDate===today&&item.configured&&$('ciStudentEnabled').value==='true';
    $('ciInBtn').style.display=ready&&!record?'':'none';
    $('ciOutBtn').style.display=ready&&record&&record.status==='CheckedIn'?'':'none';
    $('ciCaptureBtn').style.display=ready&&(!record||record.status==='CheckedIn')?'':'none';
    $('ciPhotoPreview').hidden=true;
  }
  async function studentLoad(){
    if(!$('ciStudentJob'))return;busy(true);
    try{
      const res=await api('ciStudentJobs');
      if(!res||!res.success)throw Error(res&&res.message||'ไม่สามารถโหลดสิทธิ์ได้');
      state.studentItems=Array.isArray(res.items)?res.items:[];
      $('ciStudentEnabled').value=String(Boolean(res.enabled));
      const select=$('ciStudentJob');const previous=select.value;
      select.replaceChildren(new Option('— เลือกงานที่ได้รับอนุมัติ —',''));
      state.studentItems.forEach(x=>select.add(new Option(`${formatDay(x.workDate)} | ${x.title} (${x.agency})`,x.registrationId)));
      if(state.studentItems.some(x=>x.registrationId===previous))select.value=previous;
      $('ciPilotNotice').textContent=res.enabled?'เปิดทดลองใช้แล้ว — ตำแหน่งและรูปจะใช้เป็นหลักฐานการปฏิบัติงาน':'โมดูล Check-in ยังปิดการใช้งาน รอ Admin เปิดทดลอง';
      $('ciStudentEmpty').textContent=state.studentItems.length?'':'ยังไม่มีใบสมัครที่ยืนยันแล้วในวันปัจจุบันหรือวันข้างหน้า';
      refreshStudentSelection();
    }catch(e){await fail(e)}finally{busy(false)}
  }
  async function openCamera(){
    if(!studentSelection())return msg('กรุณาเลือกงานก่อน','warning');
    resetPhoto();
    if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia)return msg('เบราว์เซอร์นี้ไม่รองรับกล้อง โปรดใช้ HTTPS และมือถือที่อนุญาตใช้กล้อง','error');
    try{
      state.camera=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:'user',width:{ideal:720},height:{ideal:720}}});
      const vid=$('ciCameraVideo');vid.srcObject=state.camera;
      $('ciCameraBox').hidden=false;await vid.play();
    }catch(e){stopCamera();await fail(e)}
  }
  function takePhoto(){
    const v=$('ciCameraVideo');if(!state.camera||!v.videoWidth||!v.videoHeight)return msg('กล้องยังไม่พร้อม','warning');
    const size=720,ratio=Math.min(size/v.videoWidth,size/v.videoHeight,1),w=Math.max(1,Math.round(v.videoWidth*ratio)),h=Math.max(1,Math.round(v.videoHeight*ratio));
    const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
    canvas.getContext('2d').drawImage(v,0,0,w,h);
    let photo=canvas.toDataURL('image/jpeg',0.66);
    if(photo.length>650000)photo=canvas.toDataURL('image/jpeg',0.35);
    if(photo.length>650000){stopCamera();return msg('ภาพใหญ่เกินไป กรุณาถ่ายใหม่','error');}
    state.studentPhoto=photo;stopCamera();$('ciPhotoPreview').src=photo;$('ciPhotoPreview').hidden=false;
    $('ciCaptureStatus').textContent='ถ่ายภาพเรียบร้อย พร้อมส่งเมื่อกดเช็กอิน/เช็กเอาต์';
  }
  function locate(){
    if(!navigator.geolocation)return Promise.reject(Error('ไม่รองรับระบบตำแหน่ง GPS'));
    return new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(
      p=>resolve({latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy}),
      e=>reject(Error('ไม่สามารถอ่าน GPS: '+e.message)),{enableHighAccuracy:true,maximumAge:0,timeout:20000}));
  }
  async function send(phase){
    const selected=studentSelection();
    if(!selected)return msg('กรุณาเลือกงาน','warning');
    if(!$('ciConsent').checked)return msg('กรุณายืนยันความยินยอมส่งภาพและข้อมูล GPS สำหรับตรวจสอบเวลางาน','warning');
    if(!state.studentPhoto)return msg('กรุณาถ่ายภาพหลักฐานจากกล้องก่อน','warning');
    if(state.busy)return;
    const confirmed=window.Swal?await Swal.fire({title:phase==='in'?'ยืนยันเช็กอิน':'ยืนยันเช็กเอาต์',text:'ระบบจะบันทึกเวลา Server พร้อม GPS และภาพส่วนตัว',icon:'question',showCancelButton:true,confirmButtonText:'ยืนยัน',cancelButtonText:'ยกเลิก'}):{isConfirmed:confirm('บันทึก GPS และภาพหลักฐาน?')};
    if(!confirmed.isConfirmed)return;
    busy(true);
    try{
      const pos=await locate();
      const result=await api('ciSubmitPhoto',{registrationId:selected.registrationId,phase:phase,position:pos,photo:state.studentPhoto,consent:true});
      if(!result||!result.success)throw Error(result&&result.message||'บันทึกไม่สำเร็จ');
      await msg(result.message+' | ระยะ '+result.distanceM+' เมตร','success');
      resetPhoto();await studentLoad();
    }catch(e){await fail(e)}finally{busy(false)}
  }
  function adminSelection(){return state.adminJobs.find(x=>x.activityId===$('ciAdminJob').value)||null;}
  function fillConfig(){
    const v=adminSelection();if(!v)return;
    $('ciLat').value=v.latitude==null?'':v.latitude;$('ciLng').value=v.longitude==null?'':v.longitude;
    $('ciRadius').value=v.radiusM;$('ciAccuracy').value=v.maxAccuracyM;
    $('ciStart').value=v.startTime;$('ciEnd').value=v.endTime;$('ciJobEnabled').checked=v.enabled;
    $('ciAdminChosen').textContent=`${v.title} | ${v.agency}`;
  }
  async function adminLoad(){
    if(!$('ciAdminJob'))return;busy(true);
    let loaded=false;
    try{
      const res=await api('ciAdminJobs');
      if(!res||!res.success)throw Error(res&&res.message||'โหลดงานไม่สำเร็จ (ตรวจการติดตั้ง Check-in และ Deployment)');
      state.adminJobs=Array.isArray(res.items)?res.items:[];
      const previous=$('ciAdminJob').value,select=$('ciAdminJob');select.replaceChildren(new Option('— เลือกงาน —',''));
      state.adminJobs.forEach(x=>select.add(new Option(`${x.title} | ${x.agency} | ${formatDay(x.date)}`,x.activityId)));
      if(state.adminJobs.some(x=>x.activityId===previous))select.value=previous;
      $('ciPilotBadge').textContent=res.enabled?'เปิดทดลองใช้':'ปิดการใช้งาน';
      $('ciPilotToggle').textContent=res.enabled?'ปิดระบบทดลอง':'เปิดระบบทดลอง';
      $('ciPilotToggle').dataset.next=String(!res.enabled);
      $('ciPilotToggle').hidden=role()!=='admin';
      fillConfig();
      loaded=true;
    }catch(e){
      const text=e&&e.message?e.message:String(e);
      const help=/เกิดข้อผิดพลาดในการประมวลผลคำขอ/.test(text)
        ? ' Backend ยังส่งข้อผิดพลาดทั่วไป: ตรวจว่ารัน ciSetupCheckinPilot() แล้ว และ Apps Script Deployment ชี้ไปยังเวอร์ชันที่ติดตั้ง UBU_Checkin.gs / Api.gs ใหม่'
        : '';
      const chosen=$('ciAdminChosen');if(chosen)chosen.textContent='ยังโหลดงาน Check-in ไม่สำเร็จ: '+text+help;
      await fail(Error(text+help));
    }finally{busy(false)}
    // Do not run a second API request after an unsuccessful job-list request.
    if(loaded)await adminRecords();
  }
  async function useMyLocation(){
    try{const p=await locate();$('ciLat').value=p.latitude.toFixed(7);$('ciLng').value=p.longitude.toFixed(7);await msg('รับพิกัดเรียบร้อย ความแม่นยำ '+Math.round(p.accuracy)+' เมตร โปรดตรวจสอบก่อนบันทึก');}
    catch(e){await fail(e)}
  }
  async function saveLocation(){
    const job=adminSelection();if(!job)return msg('กรุณาเลือกงานก่อน','warning');
    const data={activityId:job.activityId,latitude:Number($('ciLat').value),longitude:Number($('ciLng').value),
      radiusM:Number($('ciRadius').value),maxAccuracyM:Number($('ciAccuracy').value),startTime:$('ciStart').value,endTime:$('ciEnd').value,enabled:$('ciJobEnabled').checked};
    if(!$('ciLat').value||!$('ciLng').value)return msg('กรุณาระบุพิกัด GPS ของหน่วยงาน','warning');
    busy(true);try{const r=await api('ciAdminSaveLocation',data);if(!r.success)throw Error(r.message);await msg(r.message,'success');await adminLoad();}catch(e){await fail(e)}finally{busy(false)}
  }
  async function togglePilot(){
    if(role()!=='admin')return;
    const on=$('ciPilotToggle').dataset.next==='true';
    const confirmBox=window.Swal?await Swal.fire({title:on?'เปิดใช้งาน Check-in Pilot?':'ปิดใช้งาน Check-in Pilot?',text:'เปิดเฉพาะโมดูล Check-in ไม่สร้าง TimeLogs และไม่ตัดงบ',showCancelButton:true,icon:'warning',confirmButtonText:'ยืนยัน'}):{isConfirmed:confirm('ยืนยันเปลี่ยนสถานะโมดูล?')};
    if(!confirmBox.isConfirmed)return;
    busy(true);try{await api('ciAdminSetEnabled',on);await adminLoad();}catch(e){await fail(e)}finally{busy(false)}
  }
  async function adminRecords(){
    const table=$('ciAdminRecordsBody');if(!table)return;
    table.textContent='กำลังโหลด...';
    try{
      const r=await api('ciAdminRecords',$('ciRecordDate').value);
      if(!r.success)throw Error(r.message||'โหลดประวัติไม่สำเร็จ');
      state.reviewItems=r.items||[];
      if(!state.reviewItems.length){table.innerHTML='<tr><td colspan="8" style="text-align:center">ไม่พบรายการ</td></tr>';return;}
      table.innerHTML=state.reviewItems.map(x=>`<tr>
        <td>${escapeHtml(formatDay(x.workDate))}</td>
        <td>${escapeHtml(x.studentName)} <small>(${escapeHtml(x.studentId)})</small></td>
        <td>${escapeHtml(x.agency)}</td>
        <td>${escapeHtml(x.checkInAt||'-')}<br/>${escapeHtml(x.checkOutAt||'-')}</td>
        <td>${escapeHtml(x.status)}</td>
        <td>${escapeHtml(x.checkInDistanceM===''?'-':x.checkInDistanceM+' ม.')} / ${escapeHtml(x.checkOutDistanceM===''?'-':x.checkOutDistanceM+' ม.')}<br/><button class="ci-small" data-gps="yes" data-id="${escapeHtml(x.recordId)}">ดูพิกัด</button></td>
        <td><button class="ci-small" data-photo="in" data-id="${escapeHtml(x.recordId)}">ภาพเข้า</button> <button class="ci-small" data-photo="out" data-id="${escapeHtml(x.recordId)}" ${!x.checkOutAt?'disabled':''}>ภาพออก</button></td>
        <td>${x.status==='PendingReview'?`<button class="ci-small" data-review="Approved" data-id="${escapeHtml(x.recordId)}">รับรอง</button> <button class="ci-small" data-review="Rejected" data-id="${escapeHtml(x.recordId)}">ไม่รับรอง</button>`:escapeHtml(x.reviewNote||'-')}</td>
      </tr>`).join('');
    }catch(e){table.textContent='';await fail(e)}
  }
  function showGps(id){
    const row=state.reviewItems.find(x=>x.recordId===id);if(!row)return;
    const coord=(lat,lng,acc)=>lat==null||lng==null?'ยังไม่มี':`${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)} (±${Math.round(Number(acc)||0)} ม.)`;
    const message=`พิกัดเข้า: ${coord(row.checkInLatitude,row.checkInLongitude,row.checkInAccuracyM)}\nพิกัดออก: ${coord(row.checkOutLatitude,row.checkOutLongitude,row.checkOutAccuracyM)}\nข้อมูลนี้เป็นข้อมูลส่วนบุคคล ห้ามเผยแพร่`;
    return msg(message);
  }
  async function showPhoto(id,phase){
    try{
      const res=await api('ciAdminPhoto',id,phase);if(!res.success)throw Error('ไม่สามารถอ่านภาพ');
      if(window.Swal)await Swal.fire({title:phase==='in'?'ภาพเข้า':'ภาพออก',imageUrl:res.dataUrl,imageAlt:'ภาพหลักฐาน',showCloseButton:true,showConfirmButton:false,width:'560px'});
      else{const img=window.open('','_blank');if(img){img.document.write('<img alt="evidence" src="'+res.dataUrl+'"/>');img.document.close();}}
    }catch(e){await fail(e)}
  }
  async function review(id,decision){
    let note='';
    if(window.Swal){const r=await Swal.fire({title:decision==='Approved'?'รับรองการปฏิบัติงาน?':'ระบุเหตุผลไม่รับรอง',input:'textarea',inputPlaceholder:'หมายเหตุ (ไม่รับรองต้องระบุ)',showCancelButton:true,confirmButtonText:'ยืนยัน',cancelButtonText:'ยกเลิก'});if(!r.isConfirmed)return;note=r.value||'';}
    else{note=prompt('หมายเหตุการตรวจสอบ')||'';}
    if(decision==='Rejected'&&!note.trim())return msg('กรุณาระบุเหตุผล','warning');
    busy(true);try{const r=await api('ciAdminReview',id,decision,note);if(!r.success)throw Error(r.message);await msg(r.message,'success');await adminRecords();}catch(e){await fail(e)}finally{busy(false)}
  }
  // Never leave the camera active when the student leaves the page/tab.
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopCamera();});
  window.addEventListener('pagehide',stopCamera);
  document.addEventListener('click',e=>{
    const link=e.target.closest('.nav-link');
    if(link && link.id!=='navCheckinStudent')stopCamera();
  });
  if(typeof setupNavClick==='function'){
    setupNavClick('navCheckinStudent','ciStudentSection',studentLoad);
    setupNavClick('navCheckinAdmin','ciAdminSection',adminLoad);
  }
  if($('ciStudentJob'))$('ciStudentJob').addEventListener('change',refreshStudentSelection);
  if($('ciCaptureBtn'))$('ciCaptureBtn').addEventListener('click',openCamera);
  if($('ciSnapBtn'))$('ciSnapBtn').addEventListener('click',takePhoto);
  if($('ciCancelCamera'))$('ciCancelCamera').addEventListener('click',stopCamera);
  if($('ciInBtn'))$('ciInBtn').addEventListener('click',()=>send('in'));
  if($('ciOutBtn'))$('ciOutBtn').addEventListener('click',()=>send('out'));
  if($('ciAdminJob'))$('ciAdminJob').addEventListener('change',fillConfig);
  if($('ciUseMyLocation'))$('ciUseMyLocation').addEventListener('click',useMyLocation);
  if($('ciSaveLocation'))$('ciSaveLocation').addEventListener('click',saveLocation);
  if($('ciPilotToggle'))$('ciPilotToggle').addEventListener('click',togglePilot);
  if($('ciRefreshRecords'))$('ciRefreshRecords').addEventListener('click',adminRecords);
  if($('ciAdminRecordsBody'))$('ciAdminRecordsBody').addEventListener('click',e=>{
    const el=e.target.closest('button[data-id]');if(!el)return;
    if(el.dataset.gps)showGps(el.dataset.id);
    else if(el.dataset.photo)showPhoto(el.dataset.id,el.dataset.photo);
    else if(el.dataset.review)review(el.dataset.id,el.dataset.review);
  });
})();
