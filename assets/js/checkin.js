/* UBU Student Jobs — daily check-in production UI. Server enforces access, proof, approval, print gate. */
(function () {
  'use strict';
  const CHECKIN_REVISION = '20261114-gps-fast-api-v4';
  window.__UBU_CHECKIN_VERSION__ = CHECKIN_REVISION;
  const $ = id => document.getElementById(id);
  const clean = v => String(v == null ? '' : v);
  const h = v => clean(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const state = {studentItems:[],days:[],agencies:[],attendance:[],busy:false,gpsFix:null};
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
  function configIndoor(item){
    return !!item&&item.indoorModeEnabled===true&&Number(item.indoorMaxAccuracyM)>=60&&Number(item.indoorMaxAccuracyM)<=200;
  }
  function gpsKey(item){
    return [item.registrationId,item.shiftNo,item.workDate,item.latitude,item.longitude,item.radiusM,item.maxAccuracyM,
      item.indoorModeEnabled,item.indoorMaxAccuracyM,item.enabled].join('|');
  }
  async function verifyGPS(){
    const item=studentSelection();if(!item)return alertMessage('กรุณาเลือกรายการงานก่อน','warning');
    if(!Number.isFinite(Number(item.latitude))||!Number.isFinite(Number(item.longitude))||!Number.isFinite(Number(item.radiusM)))
      throw Error('หน่วยงานยังไม่ได้กำหนดจุด GPS ที่ถูกต้องสำหรับช่วงนี้');
    gpsStatus('กำลังอ่าน GPS ใหม่ทุกครั้ง (เวอร์ชัน '+CHECKIN_REVISION+')…');
    try{
      // Read the indoor policy returned by the server; do not invent a client-side permission.
      const indoorEnabled=configIndoor(item);
      const pos=await locate({maxAccuracyM:Number(item.maxAccuracyM),latitude:Number(item.latitude),longitude:Number(item.longitude),radiusM:Number(item.radiusM),
        indoorModeEnabled:indoorEnabled,indoorMaxAccuracyM:Number(item.indoorMaxAccuracyM),
        onProgress:r=>gpsStatus('กำลังอ่าน GPS… คลาดเคลื่อน ±'+Math.round(r.accuracy)+' เมตร | '+(r.distance==null?'':('ห่างจุดงาน '+Math.round(r.distance)+' เมตร | '))+(r.quality==='IndoorReview'?'มีสิทธิ์บันทึกแบบรอตรวจสอบในอาคาร':r.quality==='VerifiedGPS'?'ตรวจสอบได้ในรัศมี':'กำลังหาค่าที่ดีขึ้น'))});
      const dist=gpsDistance(pos.latitude,pos.longitude,Number(item.latitude),Number(item.longitude));
      const indoor=pos.gpsQuality==='IndoorReview';
      gpsStatus(indoor
        ?'GPS ภายในอาคาร: ห่างจุดงาน '+Math.round(dist)+' เมตร | คลาดเคลื่อน ±'+Math.round(pos.accuracy)+' เมตร — บันทึกได้ในสถานะรอเจ้าหน้าที่ตรวจสอบ ไม่ใช่การยืนยันว่าอยู่ในรัศมีแน่นอน'
        :'ยืนยัน GPS ผ่านเกณฑ์: ห่างจุดงาน '+Math.round(dist)+' เมตร | คลาดเคลื่อน ±'+Math.round(pos.accuracy)+' เมตร | รัศมี '+item.radiusM+' เมตร',!indoor);
      const checked={pos,ok:true,indoorReview:indoor};
      state.gpsFix={key:gpsKey(item),checkedAt:Date.now(),result:checked};
      return checked;
    }catch(e){gpsStatus('ไม่สามารถอ่านตำแหน่ง GPS ได้: '+(e.message||e));throw e;}
  }
  function refreshStudentSelection(){
    const item=studentSelection(),detail=$('ciStudentDetail'),info=$('ciStudentSchedule');
    if(!detail||!info)return;
    info.classList.remove('ci-summary--ready','ci-summary--waiting');
    gpsStatus('ยังไม่ได้ตรวจสอบ GPS กรุณาเปิดบริการตำแหน่งและกดตรวจสอบพิกัด');
    state.gpsFix=null;
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
      `<div><span>การรองรับสัญญาณ GPS ในอาคาร</span><strong>${configIndoor(item)?'เปิด (บันทึกแบบรอตรวจสอบได้ไม่เกิน ±'+h(item.indoorMaxAccuracyM)+' ม.)':'ยังไม่เปิด — ให้หน่วยงานเปิดจากหน้าตั้งค่าประจำวัน'}</strong></div>`+
      `<div><span>เวอร์ชันตรวจสอบ GPS</span><strong>${h(CHECKIN_REVISION)}</strong></div>`+
      (rec&&(rec.checkInGPSQuality==='IndoorReview'||rec.checkOutGPSQuality==='IndoorReview')?'<p class="ci-inline-hint">มีหลักฐาน GPS ภายในอาคารที่ต้องให้เจ้าหน้าที่ตรวจสอบสถานที่ปฏิบัติงานจริงก่อนรับรอง</p>':'')+
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
      if(r.checkinVersion!==CHECKIN_REVISION)throw Error('ระบบ GPS ฝั่งเซิร์ฟเวอร์ยังเป็นรุ่นเดิม โปรดให้ผู้ดูแล Deploy Google Apps Script เวอร์ชันใหม่ก่อนเช็กอิน (หน้าเว็บ '+CHECKIN_REVISION+' / เซิร์ฟเวอร์ '+(r.checkinVersion||'ไม่ระบุ')+')');
      state.studentItems=r.items||[];const select=$('ciStudentJob'),previous=select.value;
      select.replaceChildren(new Option('— เลือกงานที่ได้รับอนุมัติ —',''));
      state.studentItems.forEach(x=>select.add(new Option(`${prettyDay(x.workDate)} | ช่วงที่ ${x.shiftNo} | ${x.title} (${x.agency})`,x.registrationId+'|'+x.shiftNo)));
      if(state.studentItems.some(x=>(x.registrationId+'|'+x.shiftNo)===previous))select.value=previous;
      $('ciStudentEmpty').textContent=state.studentItems.length?'':'ขณะนี้ไม่มีรายการงานที่ได้รับอนุมัติให้ปฏิบัติงาน';
      refreshStudentSelection();
    }catch(e){await fail(e)}finally{busy(false)}
  }
  function evaluateGPS(pos,options){
    const accuracy=Number(pos.accuracy),maxAccuracy=Number(options.maxAccuracyM);
    const radius=Number(options.radiusM),lat=Number(options.latitude),lng=Number(options.longitude);
    const hasFence=Number.isFinite(lat)&&Math.abs(lat)<=90&&Number.isFinite(lng)&&Math.abs(lng)<=180&&Number.isFinite(radius)&&radius>0;
    const dist=hasFence?gpsDistance(pos.latitude,pos.longitude,lat,lng):null;
    const strict=(!Number.isFinite(maxAccuracy)||maxAccuracy<=0||accuracy<=maxAccuracy)&&(!hasFence||dist+accuracy<=radius);
    if(strict)return {quality:'VerifiedGPS',distance:dist};
    const indoorCap=Number(options.indoorMaxAccuracyM);
    if(!hasFence&&options.referenceCandidate===true&&options.indoorModeEnabled===true&&
      Number.isFinite(indoorCap)&&indoorCap>=60&&indoorCap<=200&&accuracy<=indoorCap)
      return {quality:'ReferenceCandidate',distance:null};
    if(hasFence&&options.indoorModeEnabled===true&&Number.isFinite(indoorCap)&&indoorCap>=60&&indoorCap<=200&&
      accuracy<=indoorCap&&dist<=radius+Math.min(accuracy,100))return {quality:'IndoorReview',distance:dist};
    return {quality:'Rejected',distance:dist};
  }
  function locate(options={}){
    if(!window.isSecureContext)return Promise.reject(Error('ต้องเปิดผ่าน HTTPS เพื่อใช้งาน GPS'));
    if(!navigator.geolocation)return Promise.reject(Error('อุปกรณ์หรือเบราว์เซอร์ไม่รองรับ GPS'));
    return new Promise((resolve,reject)=>{
      // A qualifying ordinary fix is returned immediately. Indoors, allow a short
      // refinement window after the FIRST qualifying reading, rather than waiting
      // for the whole GPS timeout. The server still independently validates it.
      const MAX_WAIT_MS=16000, INDOOR_SETTLE_MS=1800;
      let watchId=null,timer=null,indoorTimer=null,finished=false,best=null,indoorCandidate=null;
      function finish(error,position){
        if(finished)return;
        finished=true;
        if(timer!==null)clearTimeout(timer);
        if(indoorTimer!==null)clearTimeout(indoorTimer);
        if(watchId!==null)navigator.geolocation.clearWatch(watchId);
        if(error)reject(error);else resolve(position);
      }
      timer=setTimeout(()=>{
        if(indoorCandidate)return finish(null,indoorCandidate);
        if(!best)return finish(Error('ยังไม่ได้รับพิกัด GPS ใหม่ กรุณาอนุญาตตำแหน่งและลองอีกครั้ง'));
        const p=evaluateGPS(best,options),radius=Number(options.radiusM),limit=Number(options.maxAccuracyM);
        const extra=options.indoorModeEnabled===true
          ?' เปิดโหมด GPS ภายในอาคารแล้ว แต่ตำแหน่งยังไม่ผ่านเงื่อนไขหลักฐานรอตรวจสอบ'
          :' หน่วยงานยังไม่ได้เปิดโหมด GPS ภายในอาคารสำหรับวันทำงานนี้';
        return finish(Error('ยังไม่ผ่านการตรวจสอบ GPS: คลาดเคลื่อน ±'+Math.round(best.accuracy)+' ม. ห่างจุดงาน '+(p.distance==null?'—':Math.round(p.distance))+' ม. รัศมี '+radius+' ม. (เกณฑ์ปกติ ±'+limit+' ม.)'+extra));
      },MAX_WAIT_MS);
      try{
        watchId=navigator.geolocation.watchPosition(raw=>{
          if(finished)return;
          // Do not use a previously cached operating-system location as fresh GPS proof.
          const takenAt=Number(raw.timestamp);
          if(Number.isFinite(takenAt) && takenAt>0 && (takenAt>Date.now()+5000 || Date.now()-takenAt>15000))return;
          const c=raw.coords||{},pos={latitude:Number(c.latitude),longitude:Number(c.longitude),accuracy:Number(c.accuracy)};
          if(!Number.isFinite(pos.latitude)||Math.abs(pos.latitude)>90||!Number.isFinite(pos.longitude)||Math.abs(pos.longitude)>180||!Number.isFinite(pos.accuracy)||pos.accuracy<=0)return;
          const status=evaluateGPS(pos,options);
          if(!best||pos.accuracy<best.accuracy)best=pos;
          if(typeof options.onProgress==='function')options.onProgress({accuracy:pos.accuracy,distance:status.distance,quality:status.quality});
          if(status.quality==='VerifiedGPS')return finish(null,{...pos,gpsQuality:'VerifiedGPS'});
          if((status.quality==='IndoorReview'||status.quality==='ReferenceCandidate')&&(!indoorCandidate||pos.accuracy<indoorCandidate.accuracy)){
            indoorCandidate={...pos,gpsQuality:status.quality};
            if(indoorTimer===null)indoorTimer=setTimeout(()=>finish(null,indoorCandidate),INDOOR_SETTLE_MS);
          }
        },error=>{
          if(indoorCandidate)return finish(null,indoorCandidate);
          finish(Error('อ่าน GPS ไม่สำเร็จ: '+(error&&error.message||'เบราว์เซอร์ไม่อนุญาตตำแหน่ง')));
        },{enableHighAccuracy:true,maximumAge:0,timeout:15000});
      }catch(error){finish(error);}
    });
  }
  async function send(phase){
    const item=studentSelection();if(!item)return alertMessage('กรุณาเลือกรายการงานก่อน','warning');
    if((phase==='in'&&!item.checkInAvailable)||(phase==='out'&&!item.checkOutAvailable))
      return alertMessage('ยังไม่อยู่ในช่วงเวลาที่หน่วยงานอนุญาตให้บันทึก','warning');
    if(!$('ciConsent').checked)return alertMessage('กรุณายืนยันการอนุญาตใช้งานตำแหน่ง GPS','warning');
    if(state.busy||!await ask('ยืนยันการบันทึกเวลา'+(phase==='in'?'เข้า':'ออก')+'งาน ช่วงที่ '+item.shiftNo+' โดยใช้พิกัด GPS ที่ตรวจสอบ ณ เวลาบันทึก ใช่หรือไม่?'))return;
    busy(true);
    try{
      // The button's recent measurement can be reused briefly. Never use a GPS
      // reading from another job/shift or older than ten seconds; otherwise read anew.
      const previous=state.gpsFix;
      const fresh=previous&&previous.key===gpsKey(item)&&Date.now()-previous.checkedAt<=10000;
      const check=fresh?previous.result:await verifyGPS();
      if(fresh)gpsStatus('ใช้พิกัดที่ตรวจสอบล่าสุดไม่เกิน 10 วินาที เพื่อบันทึกเวลา');
      state.gpsFix=null;
      if(!check.ok)throw Error('พิกัด GPS ยังไม่ผ่านเกณฑ์ กรุณาตรวจสอบตำแหน่งใหม่');
      if(check.indoorReview && !await ask('สัญญาณ GPS ภายในอาคารยังคลาดเคลื่อนสูง ระบบจะเก็บเวลาและพิกัดเพื่อรอให้เจ้าหน้าที่ตรวจสอบการปฏิบัติงานจริงก่อนรับรองและเบิกจ่าย ต้องการดำเนินการต่อหรือไม่?'))return;
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
    $('ciIndoorEnabled').checked=!!p&&p.indoorModeEnabled;
    $('ciIndoorAccuracy').value=p?p.indoorMaxAccuracyM:150;
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
      if(r.checkinVersion!==CHECKIN_REVISION)throw Error('Google Apps Script ยังไม่ใช่เวอร์ชันล่าสุด โปรด Deploy โค้ด Check-in และรีเฟรชหน้าเว็บ (เวอร์ชันหน้าเว็บ '+CHECKIN_REVISION+' / เซิร์ฟเวอร์ '+(r.checkinVersion||'ไม่ระบุ')+')');
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
    const button=$('ciUseMyLocation'),statusEl=$('ciGpsSetupStatus'),original=button?.innerHTML;
    const limit=Number($('ciAccuracy').value)||30;
    if(button){button.disabled=true;button.textContent='กำลังอ่านพิกัด GPS…';}
    if(statusEl)statusEl.textContent='กำลังตรวจรับสัญญาณ GPS ใหม่โดยไม่ใช้พิกัดเก่า อาจต้องเปิดตำแหน่งแบบแม่นยำสูง';
    try{
      const p=await locate({maxAccuracyM:limit,referenceCandidate:true,indoorModeEnabled:$('ciIndoorEnabled').checked,indoorMaxAccuracyM:Number($('ciIndoorAccuracy').value),onProgress:r=>{
        const message='กำลังปรับความแม่นยำ GPS: คลาดเคลื่อน ±'+Math.round(r.accuracy)+' เมตร (เกณฑ์ไม่เกิน '+limit+' เมตร)';
        if(statusEl)statusEl.textContent=message;
        if(button)button.textContent='กำลังรับสัญญาณ GPS (±'+Math.round(r.accuracy)+' ม.)';
      }});
      if(p.gpsQuality==='ReferenceCandidate'){
        if(statusEl)statusEl.textContent='พิกัดอ้างอิงที่อ่านได้มีความคลาดเคลื่อน ±'+Math.round(p.accuracy)+' เมตร ยังไม่ถือว่าจุดตรงกับอาคาร';
        const approved=await ask('พิกัดอ้างอิงนี้คลาดเคลื่อน ±'+Math.round(p.accuracy)+' เมตร\nละติจูด '+p.latitude.toFixed(7)+' | ลองจิจูด '+p.longitude.toFixed(7)+'\nกรุณาตรวจจุดกลางอาคารบนแผนที่ก่อนยืนยัน หากยังไม่ได้ตรวจสอบ ให้กดยกเลิกและกรอกพิกัดที่ถูกต้องด้วยตนเอง');
        if(!approved)return;
      }
      $('ciLat').value=p.latitude.toFixed(7);$('ciLng').value=p.longitude.toFixed(7);
      if(statusEl)statusEl.textContent=(p.gpsQuality==='ReferenceCandidate'?'รับพิกัดอ้างอิงที่ต้องตรวจสอบต่อ':'พิกัดผ่านเกณฑ์')+' คลาดเคลื่อน ±'+Math.round(p.accuracy)+' เมตร โปรดตรวจสอบว่าจุดตรงกับอาคารจริงก่อนกดบันทึก';
      await alertMessage((p.gpsQuality==='ReferenceCandidate'?'บันทึกพิกัดอ้างอิงเบื้องต้น':'รับพิกัดอ้างอิงผ่านเกณฑ์')+' (±'+Math.round(p.accuracy)+' เมตร) โปรดยืนยันจุดกลางอาคารจากแผนที่ก่อนบันทึก','info');
    }catch(e){
      if(statusEl)statusEl.textContent='ยังไม่บันทึกพิกัดอ้างอิงใหม่ — '+(e&&e.message||String(e))+' การตั้งพิกัดกลางต้องแม่นยำ แม้เปิดโหมดภายในอาคารสำหรับนักศึกษา โปรดตรวจจุดจากแผนที่หรือวัดพิกัดนอกอาคารก่อนบันทึก';
      await fail(e);
    }finally{if(button){button.innerHTML=original;button.disabled=state.busy;}}
  }
  function validateDailyForm(data){
    if(!data.agency||!data.workDate)return 'กรุณาเลือกหน่วยงานและวันที่ปฏิบัติงาน';
    if(!Number.isFinite(data.latitude)||Math.abs(data.latitude)>90||!Number.isFinite(data.longitude)||Math.abs(data.longitude)>180)
      return 'กรุณาระบุละติจูดและลองจิจูดให้ถูกต้อง';
    if(!Number.isFinite(data.radiusM)||data.radiusM<20||data.radiusM>1000||!Number.isFinite(data.maxAccuracyM)||data.maxAccuracyM<5||data.maxAccuracyM>100)
      return 'รัศมี GPS ต้องอยู่ระหว่าง 20–1000 เมตร และความคลาดเคลื่อนปกติต้องอยู่ระหว่าง 5–100 เมตร';
    if(data.maxAccuracyM>=data.radiusM)return 'ค่าคลาดเคลื่อน GPS ปกติต้องน้อยกว่ารัศมีที่หน่วยงานกำหนด';
    if(data.indoorModeEnabled&&(!Number.isFinite(data.indoorMaxAccuracyM)||data.indoorMaxAccuracyM<60||data.indoorMaxAccuracyM>200||data.indoorMaxAccuracyM<=data.maxAccuracyM))
      return 'โหมดภายในอาคารต้องกำหนดค่าคลาดเคลื่อน 60–200 เมตร และมากกว่าค่าปกติ';
    const clocks=[data.checkInOpen,data.checkInClose,data.checkOutOpen,data.checkOutClose];
    const validTime=v=>/^([01]\d|2[0-3]):[0-5]\d$/.test(v);
    if(clocks.some(v=>!validTime(v))||clocks[0]>clocks[1]||clocks[2]>clocks[3]||clocks[1]>clocks[2])
      return 'ช่วงที่ 1: กรุณากำหนดเวลาเช็กอินและเช็กเอาต์ตามลำดับโดยไม่ทับซ้อนกัน';
    if(data.shift2Enabled){
      const c2=[data.shift2CheckInOpen,data.shift2CheckInClose,data.shift2CheckOutOpen,data.shift2CheckOutClose];
      if(c2.some(v=>!validTime(v))||c2[0]>c2[1]||c2[2]>c2[3]||c2[1]>c2[2]||clocks[3]>c2[0])
        return 'ช่วงที่ 2: กรุณาจัดเวลาไม่ให้ทับซ้อนกับช่วงที่ 1 และเรียงตามลำดับ';
    }
    return '';
  }
  async function saveDaily(){
    const agency=selectedAgency(),workDate=selectedDay();if(!agency||!workDate)return alertMessage('กรุณาเลือกหน่วยงานและวันที่','warning');
    if(!$('ciLat').value||!$('ciLng').value)return alertMessage('กรุณาระบุพิกัด GPS','warning');
    const data={agency,workDate,locationName:$('ciLocationName').value,latitude:Number($('ciLat').value),longitude:Number($('ciLng').value),radiusM:Number($('ciRadius').value),maxAccuracyM:Number($('ciAccuracy').value),
      checkInOpen:$('ciStart').value,checkInClose:$('ciEnd').value,checkOutOpen:$('ciOutStart').value,checkOutClose:$('ciOutEnd').value,
      indoorModeEnabled:$('ciIndoorEnabled').checked,indoorMaxAccuracyM:Number($('ciIndoorAccuracy').value),
      shift2Enabled:$('ciShift2Enabled').checked,shift2CheckInOpen:$('ciStart2').value,shift2CheckInClose:$('ciEnd2').value,
      shift2CheckOutOpen:$('ciOutStart2').value,shift2CheckOutClose:$('ciOutEnd2').value,enabled:$('ciJobEnabled').checked};
    const issue=validateDailyForm(data);if(issue)return alertMessage(issue,'warning');
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
      <td>${statusTag(x.status)}${x.checkInGPSQuality==='IndoorReview'||x.checkOutGPSQuality==='IndoorReview'?'<div class="ci-meta" style="color:#a05a00">GPS ในอาคาร • ต้องตรวจสอบสถานที่จริง</div>':''}</td>
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
        ' | ห่างจุดงาน '+(x.checkOutDistanceM??'—')+' ม.'+
        ((x.checkInGPSQuality==='IndoorReview'||x.checkOutGPSQuality==='IndoorReview')?'\nหลักฐาน GPS ภายในอาคารยังไม่ยืนยันการอยู่ในรัศมีแน่นอน กรุณาตรวจสอบการปฏิบัติงานจริงก่อนรับรอง':' '));
    }catch(e){return fail(e)}
  }

  async function review(id,decision){
    let note='';
    const r=state.attendance.find(x=>x.recordId===id),indoor=!!r&&(r.checkInGPSQuality==='IndoorReview'||r.checkOutGPSQuality==='IndoorReview');
    if(window.Swal){const r=await Swal.fire({title:decision==='Approved'?'รับรองผลการปฏิบัติงานของนักศึกษา':'ไม่รับรองผลการปฏิบัติงานของนักศึกษา',input:'textarea',inputLabel:indoor&&decision==='Approved'?'หลักฐานประกอบการยืนยันว่าปฏิบัติงานในอาคารจริง (ต้องระบุ)': 'หมายเหตุประกอบการตรวจสอบ (ต้องระบุเมื่อไม่รับรอง)',showCancelButton:true,confirmButtonText:'บันทึกผลการตรวจสอบ',cancelButtonText:'ยกเลิก'});if(!r.isConfirmed)return;note=r.value||'';}
    else {const raw=prompt('หมายเหตุการตรวจสอบ');if(raw===null)return;note=raw;}
    if(decision==='Rejected'&&!clean(note).trim())return alertMessage('กรุณาระบุเหตุผลประกอบการไม่รับรองผลการปฏิบัติงาน','warning');
    if(indoor&&decision==='Approved'&&clean(note).trim().length<12)return alertMessage('หลักฐาน GPS ภายในอาคารไม่สามารถยืนยันรัศมีได้แน่นอน กรุณาบันทึกวิธีตรวจสอบการปฏิบัติงานจริงอย่างน้อย 12 ตัวอักษร','warning');
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
