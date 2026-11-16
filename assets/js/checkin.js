/* UBU Student Jobs — daily check-in production UI. Server enforces access, proof, approval, print gate. */
(function () {
  'use strict';
  const CHECKIN_REVISION = '20261116-application-timesheet-v18';
  const TIMESHEET_UI_REVISION = '20261116-timesheet-review-v23';
  window.__UBU_TIMESHEET_VERSION__ = TIMESHEET_UI_REVISION;
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
    ['ciStart2','ciEnd2','ciOutStart2','ciOutEnd2','ciShift2OwnLocation'].forEach(id=>{if($(id))$(id).disabled=!enabled;});
    const own=enabled&&!!$('ciShift2OwnLocation')?.checked;
    if($('ciShift2LocationFields'))$('ciShift2LocationFields').hidden=!own;
    ['ciLocationName2','ciLat2','ciLng2','ciRadius2','ciAccuracy2','ciIndoorEnabled2','ciIndoorAccuracy2','ciUseMyLocation2']
      .forEach(id=>{if($(id))$(id).disabled=!own;});
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
    $('ciShift2OwnLocation').checked=!!p&&p.shift2UseOwnLocation;
    $('ciLocationName2').value=p?p.shift2LocationName:'';
    $('ciLat2').value=p&&p.shift2Latitude!=null?p.shift2Latitude:'';
    $('ciLng2').value=p&&p.shift2Longitude!=null?p.shift2Longitude:'';
    $('ciRadius2').value=p&&p.shift2RadiusM!=null?p.shift2RadiusM:100;
    $('ciAccuracy2').value=p&&p.shift2MaxAccuracyM!=null?p.shift2MaxAccuracyM:30;
    $('ciIndoorEnabled2').checked=!!p&&p.shift2IndoorModeEnabled;
    $('ciIndoorAccuracy2').value=p?p.shift2IndoorMaxAccuracyM:150;
    $('ciJobEnabled').checked=!!p&&p.enabled;updateShift2Fields();
    $('ciDeleteLocation').hidden=!p;
    $('ciAdminChosen').textContent=selectedAgency()?`หน่วยงาน: ${selectedAgency()} | วันที่ ${prettyDay(selectedDay())}`:'กรุณาเลือกหน่วยงานและวันที่ปฏิบัติงาน';
    const statusBox=$('ciAdminDayStatus');
    statusBox.classList.remove('ci-summary--ready','ci-summary--waiting');
    if(p)statusBox.classList.add(p.enabled?'ci-summary--ready':'ci-summary--waiting');
    statusBox.innerHTML=!p
      ?'<i class="material-icons" aria-hidden="true">info_outline</i><span>ยังไม่ได้กำหนดจุดพิกัดและช่วงเวลาสำหรับวันที่เลือก</span>'
      :p.enabled
      ?`<i class="material-icons" aria-hidden="true">check_circle_outline</i><span>เปิดใช้งาน — วันที่ ${h(prettyDay(p.workDate))} | ช่วงที่ 1: ${h(p.locationName||'จุดปฏิบัติงาน')} ${h(p.checkInOpen)}–${h(p.checkOutClose)} น. ${p.shift2Enabled?`| ช่วงที่ 2: ${h(p.shift2UseOwnLocation?p.shift2LocationName:p.locationName)} ${h(p.shift2CheckInOpen)}–${h(p.shift2CheckOutClose)} น.`:''}</span>`
      :`<i class="material-icons" aria-hidden="true">pause_circle_outline</i><span>ปิดการบันทึกเวลา — วันที่ ${h(prettyDay(p.workDate))} (สามารถแก้ไขและเปิดใช้งานอีกครั้งได้)</span>`;
  }
  function renderDailyList(){
    const tbody=$('ciDailyScheduleBody');if(!tbody)return;
    const daily=state.days.filter(x=>!selectedAgency()||x.agency===selectedAgency()).sort((a,b)=>b.workDate.localeCompare(a.workDate));
    tbody.innerHTML=daily.length?daily.map(p=>`<tr><td><strong>${h(prettyDay(p.workDate))}</strong></td><td>${h(p.agency)}</td><td>${h(p.checkInOpen)}–${h(p.checkInClose)} น.<div class="ci-meta">ออก: ${h(p.checkOutOpen)}–${h(p.checkOutClose)}</div><div class="ci-meta">${h(p.locationName||'ไม่ระบุสถานที่')}</div></td><td>${p.shift2Enabled?`${h(p.shift2CheckInOpen)}–${h(p.shift2CheckInClose)} น.<div class="ci-meta">ออก: ${h(p.shift2CheckOutOpen)}–${h(p.shift2CheckOutClose)}</div><div class="ci-meta">${h(p.shift2UseOwnLocation?p.shift2LocationName:(p.locationName||'ใช้พิกัดช่วงที่ 1'))}</div>`:'—'}</td><td><span class="ci-tag ${p.enabled?'ci-tag--open':'ci-tag--closed'}">${p.enabled?'เปิดใช้งาน':'ปิดใช้งาน'}</span></td><td><button class="ci-small" type="button" data-editday="${h(p.workDate)}" data-agency="${h(p.agency)}">แก้ไขการตั้งค่า</button></td></tr>`).join(''):'<tr><td class="ci-empty" colspan="6">ยังไม่มีข้อมูลการตั้งค่ารอบเวลาของหน่วยงานนี้</td></tr>';
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
  async function useMyLocation(shiftNo=1){
    const shift2=Number(shiftNo)===2;
    if(shift2&&(!$('ciShift2Enabled')?.checked||!$('ciShift2OwnLocation')?.checked))return;
    const button=$(shift2?'ciUseMyLocation2':'ciUseMyLocation'),statusEl=$(shift2?'ciGpsSetupStatus2':'ciGpsSetupStatus'),original=button?.innerHTML;
    const limit=Number($(shift2?'ciAccuracy2':'ciAccuracy').value)||30;
    if(button){button.disabled=true;button.textContent='กำลังอ่านพิกัด GPS…';}
    if(statusEl)statusEl.textContent='กำลังตรวจรับสัญญาณ GPS ใหม่โดยไม่ใช้พิกัดเก่า อาจต้องเปิดตำแหน่งแบบแม่นยำสูง';
    try{
      const p=await locate({maxAccuracyM:limit,referenceCandidate:true,indoorModeEnabled:$(shift2?'ciIndoorEnabled2':'ciIndoorEnabled').checked,indoorMaxAccuracyM:Number($(shift2?'ciIndoorAccuracy2':'ciIndoorAccuracy').value),onProgress:r=>{
        const message='กำลังปรับความแม่นยำ GPS: คลาดเคลื่อน ±'+Math.round(r.accuracy)+' เมตร (เกณฑ์ไม่เกิน '+limit+' เมตร)';
        if(statusEl)statusEl.textContent=message;
        if(button)button.textContent='กำลังรับสัญญาณ GPS (±'+Math.round(r.accuracy)+' ม.)';
      }});
      if(p.gpsQuality==='ReferenceCandidate'){
        if(statusEl)statusEl.textContent='พิกัดอ้างอิงที่อ่านได้มีความคลาดเคลื่อน ±'+Math.round(p.accuracy)+' เมตร ยังไม่ถือว่าจุดตรงกับอาคาร';
        const approved=await ask('พิกัดอ้างอิงนี้คลาดเคลื่อน ±'+Math.round(p.accuracy)+' เมตร\nละติจูด '+p.latitude.toFixed(7)+' | ลองจิจูด '+p.longitude.toFixed(7)+'\nกรุณาตรวจจุดกลางอาคารบนแผนที่ก่อนยืนยัน หากยังไม่ได้ตรวจสอบ ให้กดยกเลิกและกรอกพิกัดที่ถูกต้องด้วยตนเอง');
        if(!approved)return;
      }
      $(shift2?'ciLat2':'ciLat').value=p.latitude.toFixed(7);$(shift2?'ciLng2':'ciLng').value=p.longitude.toFixed(7);
      if(statusEl)statusEl.textContent=(p.gpsQuality==='ReferenceCandidate'?'รับพิกัดอ้างอิงที่ต้องตรวจสอบต่อ':'พิกัดผ่านเกณฑ์')+' คลาดเคลื่อน ±'+Math.round(p.accuracy)+' เมตร โปรดตรวจสอบว่าจุดตรงกับอาคารจริงก่อนกดบันทึก';
      await alertMessage((p.gpsQuality==='ReferenceCandidate'?'บันทึกพิกัดอ้างอิงเบื้องต้น':'รับพิกัดอ้างอิงผ่านเกณฑ์')+' (±'+Math.round(p.accuracy)+' เมตร) โปรดยืนยันจุดกลางอาคารจากแผนที่ก่อนบันทึก','info');
    }catch(e){
      if(statusEl)statusEl.textContent='ยังไม่บันทึกพิกัดอ้างอิงใหม่ — '+(e&&e.message||String(e))+' การตั้งพิกัดกลางต้องแม่นยำ แม้เปิดโหมดภายในอาคารสำหรับนักศึกษา โปรดตรวจจุดจากแผนที่หรือวัดพิกัดนอกอาคารก่อนบันทึก';
      await fail(e);
    }finally{if(button){button.innerHTML=original;button.disabled=state.busy;}}
  }
  function validateDailyForm(data){
    if(!data.agency||!data.workDate)return 'กรุณาเลือกหน่วยงานและวันที่ปฏิบัติงาน';
    const checkLocation=(lat,lng,radius,acc,indoor,cap,label)=>{
      if(!Number.isFinite(lat)||Math.abs(lat)>90||!Number.isFinite(lng)||Math.abs(lng)>180)
        return label+': กรุณาระบุพิกัด GPS ให้ถูกต้อง';
      if(!Number.isFinite(radius)||radius<20||radius>1000||!Number.isFinite(acc)||acc<5||acc>100||acc>=radius)
        return label+': รัศมีต้องอยู่ระหว่าง 20–1000 เมตร และค่าคลาดเคลื่อนน้อยกว่ารัศมี';
      if(indoor&&(!Number.isFinite(cap)||cap<60||cap>200||cap<=acc))
        return label+': ความคลาดเคลื่อนภายในอาคารต้องอยู่ระหว่าง 60–200 เมตรและมากกว่าค่าปกติ';
      return '';
    };
    const validTime=v=>/^([01]\d|2[0-3]):[0-5]\d$/.test(v);
    const checkTime=(times,label)=>times.some(v=>!validTime(v))||times[0]>times[1]||times[2]>times[3]||times[1]>times[2]
      ? label+': กำหนดเวลาเข้า–ออกเรียงตามลำดับและไม่ทับซ้อนกัน' : '';
    if(data.saveScope!=='2'){
      const e=checkLocation(data.latitude,data.longitude,data.radiusM,data.maxAccuracyM,data.indoorModeEnabled,data.indoorMaxAccuracyM,'ช่วงที่ 1') ||
        checkTime([data.checkInOpen,data.checkInClose,data.checkOutOpen,data.checkOutClose],'ช่วงที่ 1');
      if(e)return e;
    }
    if(data.saveScope!=='1'&&data.shift2Enabled){
      const times=[data.shift2CheckInOpen,data.shift2CheckInClose,data.shift2CheckOutOpen,data.shift2CheckOutClose];
      const e=checkTime(times,'ช่วงที่ 2');if(e)return e;
      if(data.shift2UseOwnLocation){
        const le=checkLocation(data.shift2Latitude,data.shift2Longitude,data.shift2RadiusM,data.shift2MaxAccuracyM,
          data.shift2IndoorModeEnabled,data.shift2IndoorMaxAccuracyM,'ช่วงที่ 2');if(le)return le;
      }
      if(data.saveScope==='all'&&data.checkOutClose>data.shift2CheckInOpen)
        return 'ช่วงที่ 2 ต้องเริ่มหลังจากช่วงที่ 1 สิ้นสุด';
    }
    return '';
  }
  async function saveDaily(saveScope='all'){
    const agency=selectedAgency(),workDate=selectedDay();if(!agency||!workDate)return alertMessage('กรุณาเลือกหน่วยงานและวันที่','warning');
    if(saveScope==='2'&&!selectedConfig())return alertMessage('กรุณาบันทึกช่วงที่ 1 ก่อน แล้วจึงบันทึกเฉพาะช่วงที่ 2','warning');
    const data={agency,workDate,saveScope,locationName:$('ciLocationName').value,latitude:$('ciLat').value===''?NaN:Number($('ciLat').value),
      longitude:$('ciLng').value===''?NaN:Number($('ciLng').value),radiusM:Number($('ciRadius').value),maxAccuracyM:Number($('ciAccuracy').value),
      checkInOpen:$('ciStart').value,checkInClose:$('ciEnd').value,checkOutOpen:$('ciOutStart').value,checkOutClose:$('ciOutEnd').value,
      indoorModeEnabled:$('ciIndoorEnabled').checked,indoorMaxAccuracyM:Number($('ciIndoorAccuracy').value),
      shift2Enabled:$('ciShift2Enabled').checked,shift2CheckInOpen:$('ciStart2').value,shift2CheckInClose:$('ciEnd2').value,
      shift2CheckOutOpen:$('ciOutStart2').value,shift2CheckOutClose:$('ciOutEnd2').value,
      shift2UseOwnLocation:$('ciShift2OwnLocation').checked,
      shift2LocationName:$('ciLocationName2').value,shift2Latitude:$('ciLat2').value===''?NaN:Number($('ciLat2').value),
      shift2Longitude:$('ciLng2').value===''?NaN:Number($('ciLng2').value),
      shift2RadiusM:Number($('ciRadius2').value),shift2MaxAccuracyM:Number($('ciAccuracy2').value),
      shift2IndoorModeEnabled:$('ciIndoorEnabled2').checked,shift2IndoorMaxAccuracyM:Number($('ciIndoorAccuracy2').value),
      enabled:$('ciJobEnabled').checked};
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
      <td><strong>${h(x.studentName)}</strong><div class="ci-meta">รหัส ${h(x.studentId)}</div><button class="ci-small" type="button" data-printclaim="${h(x.registrationId)}" title="ตรวจสอบวันและช่วงเวลาที่มาทำงานก่อนส่งเบิก">ตรวจสอบ / พิมพ์ Timesheet</button></td>
      <td>${h(x.title)}</td>
      <td><div><span class="ci-meta">เข้า:</span> <strong>${h(x.checkInTime||'—')} น.</strong></div><div><span class="ci-meta">ออก:</span> <strong>${h(x.checkOutTime||'—')} น.</strong></div><div class="ci-meta">${x.checkOutAt?'รวม '+h(x.workedHours)+' ชั่วโมง':'รอบันทึกเวลาออก'}</div>
        ${(x.checkInMethod==='StaffManual'||x.checkOutMethod==='StaffManual')?'<div class="ci-meta" style="color:#96601f">เจ้าหน้าที่ลงเวลาแทน (ไม่มีหลักฐาน GPS ในรอบที่ลงแทน)</div>':''}</td>
      <td>${statusTag(x.status)}${x.checkInGPSQuality==='IndoorReview'||x.checkOutGPSQuality==='IndoorReview'?'<div class="ci-meta" style="color:#a05a00">GPS ในอาคาร • ต้องตรวจสอบสถานที่จริง</div>':''}</td>
      <td>${x.recordId?`<button type="button" class="ci-small" data-gps="yes" data-id="${h(x.recordId)}">ดูหลักฐาน</button>`:'—'}</td>
      <td>${x.status==='PendingReview'?`<button type="button" class="ci-small ci-small--approve ci-action" data-review="Approved" data-id="${h(x.recordId)}">รับรอง</button> <button type="button" class="ci-small ci-small--reject ci-action" data-review="Rejected" data-id="${h(x.recordId)}">ไม่รับรอง</button>`:h(x.reviewNote||'รอให้บันทึกเวลาเข้า–ออกครบถ้วน')}
        <div style="margin-top:5px">${x.status==='NotCheckedIn'?`<button class="ci-small ci-action" data-manual="in" data-reg="${h(x.registrationId)}" data-shift="${h(x.shiftNo)}" type="button">เจ้าหน้าที่ลงเข้างาน</button>`:''}
        ${x.status==='CheckedIn'?`<button class="ci-small ci-action" data-manual="out" data-reg="${h(x.registrationId)}" data-shift="${h(x.shiftNo)}" type="button">เจ้าหน้าที่ลงออกงาน</button>`:''}
        </div></td>
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
        ((x.checkInMethod==='StaffManual'||x.checkOutMethod==='StaffManual')?'\nเจ้าหน้าที่ลงเวลาแทน (ไม่ใช่ GPS ยืนยัน): '+(x.checkInManualReason||x.checkOutManualReason||'ไม่ระบุเหตุผล')+'\nเจ้าหน้าที่เข้า: '+(x.checkInBy||'—')+' / เจ้าหน้าที่ออก: '+(x.checkOutBy||'—'):'')+
        ((x.checkInGPSQuality==='IndoorReview'||x.checkOutGPSQuality==='IndoorReview')?'\nหลักฐาน GPS ภายในอาคารต้องตรวจสอบการปฏิบัติงานจริงก่อนรับรอง':''));
    }catch(e){return fail(e)}
  }

  async function review(id,decision){
    let note='';
    const r=state.attendance.find(x=>x.recordId===id),indoor=!!r&&(
      r.checkInGPSQuality==='IndoorReview'||r.checkOutGPSQuality==='IndoorReview'||
      r.checkInMethod==='StaffManual'||r.checkOutMethod==='StaffManual');
    if(window.Swal){const r=await Swal.fire({title:decision==='Approved'?'รับรองผลการปฏิบัติงานของนักศึกษา':'ไม่รับรองผลการปฏิบัติงานของนักศึกษา',input:'textarea',inputLabel:indoor&&decision==='Approved'?'หลักฐานประกอบการยืนยันว่าปฏิบัติงานในอาคารจริง (ต้องระบุ)': 'หมายเหตุประกอบการตรวจสอบ (ต้องระบุเมื่อไม่รับรอง)',showCancelButton:true,confirmButtonText:'บันทึกผลการตรวจสอบ',cancelButtonText:'ยกเลิก'});if(!r.isConfirmed)return;note=r.value||'';}
    else {const raw=prompt('หมายเหตุการตรวจสอบ');if(raw===null)return;note=raw;}
    if(decision==='Rejected'&&!clean(note).trim())return alertMessage('กรุณาระบุเหตุผลประกอบการไม่รับรองผลการปฏิบัติงาน','warning');
    if(indoor&&decision==='Approved'&&clean(note).trim().length<12)return alertMessage('กรณี GPS ภายในอาคารหรือเจ้าหน้าที่ลงเวลาแทน กรุณาระบุวิธีตรวจสอบการปฏิบัติงานจริงอย่างน้อย 12 ตัวอักษร','warning');
    busy(true);try{const r=await api('ciAdminReview',id,decision,note);if(!r||!r.success)throw Error(r&&r.message||'ตรวจสอบไม่สำเร็จ');await alertMessage(r.message,'success');await adminAttendance();}
    catch(e){await fail(e)}finally{busy(false)}
  }
  async function manualAttendance(regId,shiftNo,phase){
    const row=state.attendance.find(x=>x.registrationId===regId&&Number(x.shiftNo)===Number(shiftNo));
    if(!row)return alertMessage('ไม่พบรายการนักศึกษาที่เลือก กรุณาโหลดข้อมูลล่าสุด','warning');
    if(phase==='in'&&row.status!=='NotCheckedIn'||phase==='out'&&row.status!=='CheckedIn')
      return alertMessage('สถานะการลงเวลาเปลี่ยนไปแล้ว กรุณาโหลดข้อมูลใหม่','warning');
    const title=(phase==='in'?'ลงเวลาเข้างาน':'ลงเวลาออกงาน')+'แทนนักศึกษา';
    const info='นักศึกษา '+row.studentName+' ช่วงที่ '+shiftNo+' วันที่ '+prettyDay(row.workDate);
    let reason='';
    if(window.Swal){
      const confirm=await Swal.fire({title,text:info+'\nกรณีอุปกรณ์มีปัญหาเท่านั้น ระบบใช้เวลาปัจจุบันจากเซิร์ฟเวอร์และบันทึกชื่อเจ้าหน้าที่ ไม่มีหลักฐาน GPS',
        input:'textarea',inputLabel:'สาเหตุอุปกรณ์ขัดข้อง / วิธีตรวจสอบการปฏิบัติงาน (จำเป็น)',
        inputPlaceholder:'เช่น โทรศัพท์ไม่สามารถเปิดตำแหน่งได้ และเจ้าหน้าที่ตรวจสอบตัวนักศึกษาที่จุดงานแล้ว',
        showCancelButton:true,confirmButtonText:'ยืนยันการลงเวลา',cancelButtonText:'ยกเลิก'});
      if(!confirm.isConfirmed)return;reason=clean(confirm.value).trim();
    }else{const raw=prompt(title+'\n'+info+'\nกรุณาระบุเหตุผลและวิธีตรวจสอบ');if(raw===null)return;reason=raw.trim();}
    if(reason.length<10)return alertMessage('กรุณาระบุเหตุผลอย่างน้อย 10 ตัวอักษร','warning');
    busy(true);
    try{
      const r=await api('ciAdminManualAttendance',{registrationId:regId,shiftNo:Number(shiftNo),agency:selectedAgency(),
        workDate:selectedDay(),phase,reason});
      if(!r||!r.success)throw Error(r&&r.message||'บันทึกเวลาแทนไม่สำเร็จ');
      await alertMessage(r.message,'success');await adminAttendance();
    }catch(e){await fail(e)}finally{busy(false)}
  }
  const thaiMonths=['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  // Only application times are used for the reimbursement Timesheet.
  // GPS/CheckinRecords are deliberately NOT used in this printout.
  function applicationSlot(raw){
    const value=clean(raw).trim().toLowerCase();
    const presets={morning:['08:30','12:00'],afternoon:['13:00','16:30'],evening:['16:30','20:00'],full:['08:30','16:30'],multi:['08:30','16:30'],'ทั้งวัน':['08:30','16:30'],'เต็มวัน':['08:30','16:30'],
      'เช้า':['08:30','12:00'],'บ่าย':['13:00','16:30'],'เย็น':['16:30','20:00'],'เต็มวัน':['08:30','16:30']};
    if(presets[value])return presets[value];
    const m=value.match(/^(\d{1,2})[:.](\d{2})\s*[-–—]\s*(\d{1,2})[:.](\d{2})(?:\s*น\.?)*$/);
    if(!m)return null;
    const a=Number(m[1])*60+Number(m[2]),b=Number(m[3])*60+Number(m[4]);
    if(Number(m[1])>23||Number(m[3])>23||Number(m[2])>59||Number(m[4])>59||b<=a)return null;
    return [String(m[1]).padStart(2,'0')+':'+m[2],String(m[3]).padStart(2,'0')+':'+m[4]];
  }
  function hhmmMinutes(v){const parts=v.split(':').map(Number);return parts[0]*60+parts[1];}
  // Union of scheduled intervals; subtract the 12:00–13:00 break once.
  function applicationDayHours(rows){
    const ranges=rows.map(x=>x.period&&[hhmmMinutes(x.period[0]),hhmmMinutes(x.period[1])]).filter(Boolean).sort((a,b)=>a[0]-b[0]);
    let last=null,minutes=0,lunch=0;
    const addMerged=()=>{if(!last)return;minutes+=last[1]-last[0];lunch+=Math.max(0,Math.min(last[1],780)-Math.max(last[0],720));};
    ranges.forEach(([a,b])=>{if(!last){last=[a,b];return;}if(a<=last[1])last[1]=Math.max(last[1],b);else{addMerged();last=[a,b];}});
    addMerged();
    return Math.max(0,(minutes-lunch)/60);
  }
  function claimThaiBaht(n){
    if(typeof BAHTTEXT==='function')return clean(BAHTTEXT(n)).replace(/^\(+|\)+$/g,'').trim();
    return 'โปรดตรวจสอบยอดรวม';
  }
  function buildApplicationTimesheet(data,template){
    const doc=document.implementation.createHTMLDocument('แบบลงเวลาทำงานระหว่างเรียน');
    const report=doc.createElement('div');report.innerHTML=template.innerHTML;
    const set=(id,value)=>{const el=report.querySelector('#'+id);if(el)el.textContent=clean(value==null||value===''?'-':value);};
    const [year,month]=data.month.split('-').map(Number);
    set('printAgency',data.agency);set('printMonth',thaiMonths[month-1]+' '+(year+543));
    set('printName',data.studentName);set('printSignName',data.studentName);
    set('printId',data.studentId);set('printFaculty',data.faculty);
    const grouped=new Map();
    for(const item of data.items||[]){const period=applicationSlot(item.timeSlot);
      if(!period)throw Error('ใบสมัครวันที่ '+prettyDay(item.workDate)+' ระบุช่วงเวลาที่ไม่รองรับ: '+(item.timeSlot||'ว่าง')+' กรุณาตรวจสอบข้อมูลใบสมัครก่อนพิมพ์');
      if(!grouped.has(item.workDate))grouped.set(item.workDate,[]);
      grouped.get(item.workDate).push({...item,period});
    }
    let serial=0,total=0;
    const tbody=report.querySelector('#printTableBody');
    if(!tbody)throw Error('ไม่พบตาราง Timesheet ต้นฉบับในระบบ');
    [...grouped.entries()].sort((a,b)=>a[0].localeCompare(b[0])).forEach(([day,rows])=>{
      rows.sort((a,b)=>a.period[0].localeCompare(b.period[0]));
      const hours=applicationDayHours(rows),dayHours=Math.round(hours*100)/100;
      // Rates from the existing Timesheet template: 3.5 hours=150; 7 hours=300.
      // Do not invent an amount for an unsupported shorter/longer interval.
      const amount=dayHours>=7?300:dayHours>=3.5?150:0;total+=amount;
      rows.forEach((x,index)=>{
        const tr=doc.createElement('tr');
        const cell=(value,rowspan)=>{const td=doc.createElement('td');td.textContent=clean(value);td.style.textAlign='center';
          if(rowspan>1)td.rowSpan=rowspan;tr.appendChild(td);return td;};
        cell(++serial);
        if(index===0)cell(prettyDay(day),rows.length);
        cell(x.period[0]);cell(x.period[1]);
        if(index===0){cell(String(dayHours),rows.length);cell(amount.toLocaleString('th-TH'),rows.length);}
        cell(x.title||'งานตามใบสมัคร').style.textAlign='left';cell('');tbody.appendChild(tr);
      });
    });
    set('printTotalAmount',total.toLocaleString('th-TH'));
    set('printTotalAmountText',claimThaiBaht(total));
    // The original Timesheet is the markup source, not a second independent template.
    return report.innerHTML;
  }
  function expandApplicationItems(data){
    const result=[];
    for(const item of data.items||[]){
      const period=applicationSlot(item.timeSlot);
      if(!period)throw Error('ใบสมัครวันที่ '+prettyDay(item.workDate)+' ระบุช่วงเวลาที่ไม่รองรับ: '+(item.timeSlot||'ว่าง'));
      const raw=clean(item.timeSlot).trim().toLowerCase();
      const full=['full','multi','เต็มวัน','ทั้งวัน'].includes(raw)||(period[0]==='08:30'&&period[1]==='16:30');
      const slices=full?[
        {shift:'morning',period:['08:30','12:00']},
        {shift:'afternoon',period:['13:00','16:30']}
      ]:[{shift:raw==='evening'||raw==='เย็น'||period[0]==='16:30'?'evening':
        raw==='afternoon'||raw==='บ่าย'||period[0]==='13:00'?'afternoon':'morning',period}];
      slices.forEach(x=>result.push({...item,timeSlot:x.shift,period:x.period,key:item.registrationId+'~'+x.shift}));
    }
    return result;
  }
  function openReviewedPrint(data,preparedWindow){
    const template=$('printTimeSheetArea');
    if(!template)throw Error('ไม่พบแบบฟอร์ม Timesheet ต้นฉบับ');
    const content=buildApplicationTimesheet(data,template);
    const win=preparedWindow&&!preparedWindow.closed?preparedWindow:window.open('','_blank');
    if(!win)throw Error('โปรดอนุญาตป๊อปอัปเพื่อพิมพ์ Timesheet');
    const html='<!doctype html><html lang="th"><head><meta charset="utf-8"><title>Timesheet - '+h(data.studentId)+'</title>'+
      '<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700&display=swap" rel="stylesheet">'+
      `<style>@page{size:A4 portrait;margin:10mm}*{box-sizing:border-box}html,body{font-family:'TH Sarabun PSK','TH-Sarabun-PSK','Sarabun',sans-serif;font-size:14px;color:#111;line-height:1.45;margin:0;background:#fff}`+
      `.report-header h3{text-align:center;font-size:19px;margin:0 0 15px}`+
      `.report-table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:12px;line-height:1.35}`+
      `.report-table th,.report-table td{border:1px solid #222;padding:5px 3px;vertical-align:middle;overflow-wrap:anywhere}`+
      `.report-table th{text-align:center;background:#f0f3f7}`+
      `@media print{html,body{margin:0;padding:0;background:#fff}.report-table th{background:#eee!important;print-color-adjust:exact;-webkit-print-color-adjust:exact}}`+
      `</style></head><body>${content}</body></html>`;
    win.document.open();win.document.write(html);win.document.close();
    const print=()=>{try{win.focus();win.print();}catch(e){console.error('[Timesheet Print]',e);}};
    if(win.document.readyState==='complete')setTimeout(print,350);
    else win.addEventListener('load',()=>setTimeout(print,350),{once:true});
  }
  function timesheetPendingTab(regId){
    // Open while the button click still carries user activation. Avoid a blank
    // popup when reading Sheets takes time; the tab becomes the print document.
    const win=window.open('','_blank');
    if(!win)return null;
    const row=state.attendance.find(x=>x.registrationId===regId);
    win.document.open();
    win.document.write('<!doctype html><html lang="th"><head><meta charset="utf-8"><title>กำลังเตรียม Timesheet</title><style>body{font-family:Sarabun,Tahoma,sans-serif;max-width:640px;margin:12vh auto;padding:24px;color:#243247}h2{font-size:22px}.dot{width:25px;height:25px;border:3px solid #dce7f2;border-top-color:#2563eb;border-radius:50%;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}</style></head><body><div class="dot" aria-hidden="true"></div><h2>กำลังตรวจสอบสถานะ Timesheet</h2><p>นักศึกษา '+h(row?.studentName||row?.studentId||'ที่เลือก')+'</p><p>ระบบกำลังโหลดวันปฏิบัติงาน หลักฐานเช็กอิน–เช็กเอาต์ และสถานะการนำส่ง Payroll</p><p>หากรายการยังไม่ผ่านการยืนยัน จะกลับไปยังหน้าต่างตรวจสอบบนระบบโดยอัตโนมัติ</p></body></html>');
    win.document.close();
    return win;
  }
  function timesheetAttendanceCell(detail,key){
    const time=detail&&detail[key];
    return time?'<strong style="color:#166534">'+h(time)+' น.</strong>':
      '<span style="color:#9a3412">ยังไม่'+(key==='checkInTime'?'เช็กอิน':'เช็กเอาต์')+'</span>';
  }
  async function printApplicationTimesheet(regId){
    const agency=selectedAgency(),day=selectedDay();
    if(!agency||!day||!regId)return alertMessage('กรุณาเลือกหน่วยงาน วันที่ และรายชื่อนักศึกษา','warning');
    if(!window.Swal)return alertMessage('กรุณาเปิดใช้งาน SweetAlert2 เพื่อแสดงตารางตรวจสอบ Timesheet','error');
    const preparedWindow=timesheetPendingTab(regId);
    busy(true);
    Swal.fire({title:'กำลังตรวจสอบ / เตรียมพิมพ์ Timesheet',
      html:'กำลังดึงข้อมูลใบสมัคร หลักฐานเวลาเข้า–ออก และสถานะ Payroll กรุณารอสักครู่',
      allowOutsideClick:false,allowEscapeKey:false,showConfirmButton:false,
      didOpen:()=>Swal.showLoading()});
    try{
      const data=await api('ciAdminTimesheetReviewContext',regId,agency,day);
      if(!data||!data.success)throw Error(data?.message||'โหลดรายการงานไม่สำเร็จ');
      if(data.agency!==agency||data.month!==day.slice(0,7))throw Error('เดือนหรือหน่วยงานไม่ตรงกับรายการที่เลือก');
      const entries=expandApplicationItems(data);
      if(!entries.length)throw Error('ไม่พบช่วงเวลาที่สามารถตรวจสอบได้');
      const details=new Map((data.periodDetails||[]).map(x=>[x.key,x]));
      // Never skip review if even one registration period lacks a matching
      // active Payroll row in this month, unit, date, and student.
      const complete=!!data.reviewState?.complete&&entries.every(x=>details.get(x.key)?.inPayroll);
      Swal.close();
      if(complete){
        try{openReviewedPrint(data,preparedWindow);}catch(error){
          if(preparedWindow&&!preparedWindow.closed)preparedWindow.close();
          throw error;
        }
        return;
      }
      if(preparedWindow&&!preparedWindow.closed)preparedWindow.close();
      const rows=entries.map(x=>{
        const detail=details.get(x.key)||{},done=!!detail.inPayroll;
        const attended=detail.checkInTime||detail.checkOutTime;
        const method=(detail.checkInMethod==='StaffManual'||detail.checkOutMethod==='StaffManual')?'เจ้าหน้าที่ลงเวลาแทน':attended?'GPS / บันทึกเวลา':'';
        return '<tr style="border-bottom:1px solid #e2e8f0">'+
          '<td style="text-align:center;padding:7px"><input class="ts-v23-check" type="checkbox" value="'+h(x.key)+'" '+(done?'checked disabled':'')+' aria-label="ยืนยันวันที่ '+h(prettyDay(x.workDate))+' '+h(x.period.join('–'))+'"></td>'+
          '<td style="padding:7px">'+h(prettyDay(x.workDate))+'</td>'+
          '<td style="padding:7px">'+h(x.period[0])+'–'+h(x.period[1])+' น.</td>'+
          '<td style="padding:7px">'+timesheetAttendanceCell(detail,'checkInTime')+'</td>'+
          '<td style="padding:7px">'+timesheetAttendanceCell(detail,'checkOutTime')+'</td>'+
          '<td style="padding:7px">'+(done?'<span style="color:#166534"><b>ส่ง Payroll แล้ว</b><br>'+h(detail.payrollStatus)+'</span>':
            attended?'<span>มีหลักฐานลงเวลา</span>':'<span style="color:#9a3412">ไม่มีหลักฐานลงเวลา</span>')+
          (method?'<div style="font-size:12px;color:#64748b">'+h(method)+'</div>':'')+'</td></tr>';
      }).join('');
      const confirmed=Number(data.reviewState?.reviewed)||0;
      const result=await Swal.fire({
        title:'ตรวจสอบวันและช่วงเวลาปฏิบัติงานจริง',width:970,
        html:'<div style="font-family:Sarabun,Tahoma,sans-serif;text-align:left">'+
          '<p><b>'+h(data.studentName)+'</b> • '+h(data.studentId)+'<br>'+h(agency)+' • ประจำเดือน '+h(data.month)+'</p>'+
          '<p style="padding:10px;background:#eff6ff;border-radius:6px">ส่งเข้า Payroll แล้ว <b>'+confirmed+'</b> จาก <b>'+entries.length+'</b> ช่วง • เลือกเฉพาะช่วงที่มาปฏิบัติงานจริงและยังไม่เคยส่งเบิก</p>'+
          '<p style="font-size:13px;color:#475569">แสดงเวลาเช็กอิน–เช็กเอาต์เพื่อช่วยตรวจสอบ หากไม่มี GPS โปรดตรวจสอบการปฏิบัติงานจริงก่อนเลือกยืนยัน รายการที่ส่ง Payroll แล้วจะไม่ให้เลือกซ้ำ</p>'+
          '<label style="display:block;margin:8px 0"><input id="ts-v23-all" type="checkbox"> เลือกช่วงที่ยังไม่ส่ง Payroll ทั้งหมด</label>'+
          '<div style="max-height:50vh;overflow:auto"><table style="border-collapse:collapse;width:100%;font-size:13px"><thead><tr style="background:#eaf1f7"><th>ยืนยันมา</th><th>วันที่</th><th>ช่วงตามใบสมัคร</th><th>เช็กอิน</th><th>เช็กเอาต์</th><th>สถานะ</th></tr></thead><tbody>'+rows+'</tbody></table></div></div>',
        showCancelButton:true,confirmButtonText:'ตรวจสอบและยืนยัน',cancelButtonText:'ยกเลิก',focusConfirm:false,
        didOpen:()=>{const root=Swal.getHtmlContainer(),all=root?.querySelector('#ts-v23-all');
          all?.addEventListener('change',()=>root.querySelectorAll('.ts-v23-check:not(:disabled)').forEach(el=>{el.checked=all.checked;}));},
        preConfirm:()=>[...Swal.getHtmlContainer().querySelectorAll('.ts-v23-check:checked')].map(el=>el.value)
      });
      if(!result.isConfirmed)return;
      const selected=result.value||[];
      const dropped=entries.filter(x=>!details.get(x.key)?.inPayroll&&!selected.includes(x.key)).length;
      const newCount=selected.length-confirmed;
      const confirmation=await Swal.fire({title:'ยืนยันข้อมูลเพื่อส่งเบิกจ่าย',icon:'warning',
        html:'มีรายการที่ส่ง Payroll แล้ว <b>'+confirmed+'</b> ช่วง<br>ยืนยันเพิ่ม <b>'+newCount+'</b> ช่วง<br>ไม่เลือก <b>'+dropped+'</b> ช่วง'+
          (dropped?'<p style="color:#a34115">รายการที่ไม่เลือกจะถูกนำออกจากใบสมัครตามเงื่อนไขการสำรองและป้องกันข้อมูลผูกอยู่</p>':'')+
          '<p>เฉพาะรายการใหม่จะเข้าสู่ Payroll สถานะ “รอตรวจสอบข้อมูล” ไม่ใช่การอนุมัติจ่ายเงิน</p>',
        showCancelButton:true,confirmButtonText:'ยืนยันและส่งรออนุมัติ',cancelButtonText:'กลับไปแก้ไข'});
      if(!confirmation.isConfirmed)return;
      // Show a non-blank loading state during the mutating request as well.
      Swal.fire({title:'กำลังบันทึกผลการตรวจสอบ Timesheet',
        html:'กำลังตรวจสอบรายการซ้ำ บันทึกผล และนำส่ง Payroll กรุณาอย่ากดซ้ำ',
        allowOutsideClick:false,allowEscapeKey:false,showConfirmButton:false,
        didOpen:()=>Swal.showLoading()});
      const saved=await api('ciAdminConfirmApplicationTimesheet',
        {registrationId:regId,workDate:day,agency,month:data.month,selected});
      if(!saved||!saved.success)throw Error(saved?.message||'ยืนยัน Timesheet ไม่สำเร็จ');
      Swal.close();
      await adminAttendance();
      await Swal.fire({icon:'success',title:saved.selected?'ส่งข้อมูลเพื่อรออนุมัติแล้ว':'ยืนยันการไม่มาปฏิบัติงานแล้ว',
        text:'นำส่ง Payroll ใหม่ '+saved.submitted+' รายการ • ลบใบสมัครที่ไม่มาทำงาน '+saved.removed+' รายการ • ปรับช่วงเวลา '+saved.changed+' รายการ',
        showCancelButton:!!saved.selected,confirmButtonText:saved.selected?'พิมพ์ Timesheet':'ปิด',cancelButtonText:'ปิด'}).then(r=>{
          if(r.isConfirmed&&saved.selected){try{openReviewedPrint(saved);}catch(e){alertMessage('ยืนยันข้อมูลสำเร็จแล้ว แต่เปิดหน้าพิมพ์ไม่ได้: '+e.message,'warning');}}
        });
    }catch(e){
      if(preparedWindow&&!preparedWindow.closed)preparedWindow.close();
      Swal.close();await fail(e);
    }finally{busy(false)}
  }

  function printAttendance(regId=''){
    const agency=selectedAgency(),day=selectedDay();
    if(!agency||!day)return alertMessage('กรุณาเลือกหน่วยงานและวันที่ก่อนพิมพ์ใบลงเวลา','warning');
    // Printing does NOT require GPS, approval, checkout, or an approved payroll claim.
    // A staff session and server-scoped attendance list are still required for privacy.
    const rows=state.attendance.filter(r=>!regId||r.registrationId===regId);
    const students=[...new Set(rows.map(r=>r.studentId))].length;
    const tbody=rows.map((r,i)=>`<tr><td>${i+1}</td><td>${h(r.studentId)}</td><td>${h(r.studentName)}</td><td>${h(r.title)}</td>
      <td>${h(r.shiftNo)}</td><td>${h(r.checkInTime||'—')}</td><td>${h(r.checkOutTime||'—')}</td>
      <td>${h(r.workedHours||'—')}</td><td>${h(status(r.status))}</td>
      <td>${(r.checkInMethod==='StaffManual'||r.checkOutMethod==='StaffManual')?'เจ้าหน้าที่ลงแทน'+(r.checkInBy?' (เข้า: '+h(r.checkInBy)+')':'')+(r.checkOutBy?' (ออก: '+h(r.checkOutBy)+')':''):'GPS / ยังไม่ลงเวลา'}</td></tr>`).join('');
    // Self-contained print document; does not rely on app styles or the hidden SPA page.
    const html='<!doctype html><html lang="th"><head><meta charset="utf-8"><title>ใบลงเวลาปฏิบัติงาน</title>'+
      `<style>@page{size:A4 landscape;margin:12mm}body{font-family:Tahoma,Arial,sans-serif;font-size:11px;color:#17212f}
      h2{text-align:center;font-size:18px;margin:0 0 6px}p{margin:5px 0}table{border-collapse:collapse;width:100%;font-size:10px;margin-top:12px}
      th,td{padding:6px 5px;border:1px solid #64748b;vertical-align:top}th{background:#f1f5f9}.sign{display:flex;justify-content:space-around;margin-top:30px}.sign div{text-align:center}
      .foot{font-size:10px;margin-top:12px;color:#475569}</style></head><body>`+
      `<h2>แบบบันทึกเวลาเข้า–ออกปฏิบัติงานระหว่างเรียน</h2><p><b>หน่วยงาน:</b> ${h(agency)} &nbsp; <b>วันที่:</b> ${h(prettyDay(day))}</p>`+
      `<p><b>จำนวนรายการ:</b> ${rows.length} ช่วง &nbsp; <b>จำนวนรหัสนักศึกษา:</b> ${students} คน</p>`+
      '<table><thead><tr><th>ลำดับ</th><th>รหัสนักศึกษา</th><th>ชื่อ–สกุล</th><th>งาน</th><th>ช่วง</th><th>เข้า (น.)</th><th>ออก (น.)</th><th>ชั่วโมง</th><th>สถานะ</th><th>วิธีลงเวลา</th></tr></thead><tbody>'+
      (tbody||'<tr><td colspan="10">ยังไม่มีข้อมูลลงเวลา ณ วันที่เลือก</td></tr>')+'</tbody></table>'+
      `<div class="foot">พิมพ์จากระบบ UBU Student Jobs • ข้อมูลตามที่ปรากฏในระบบ ณ เวลาพิมพ์ • การพิมพ์ไม่ได้หมายถึงรับรองหรืออนุมัติการเบิกจ่าย</div>`+
      '<div class="sign"><div>ลงชื่อ..................................................<br>ผู้จัดทำ/เจ้าหน้าที่</div><div>ลงชื่อ..................................................<br>ผู้ควบคุมการปฏิบัติงาน</div></div></body></html>';
    const win=window.open('','_blank');
    if(!win)return alertMessage('เบราว์เซอร์ปิดกั้นหน้าต่างพิมพ์ กรุณาอนุญาตป๊อปอัปสำหรับระบบแล้วลองอีกครั้ง','warning');
    win.document.open();win.document.write(html);win.document.close();
    win.focus();setTimeout(()=>{try{win.print();}catch(e){console.error('[Checkin print]',e)}},250);
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
  $('ciUseMyLocation')?.addEventListener('click',()=>useMyLocation(1));
  $('ciUseMyLocation2')?.addEventListener('click',()=>useMyLocation(2));
  $('ciSaveLocation')?.addEventListener('click',()=>saveDaily('all'));
  $('ciSaveShift1')?.addEventListener('click',()=>saveDaily('1'));
  $('ciSaveShift2')?.addEventListener('click',()=>saveDaily('2'));
  $('ciPrintAttendance')?.addEventListener('click',()=>printAttendance());
  $('ciShift2OwnLocation')?.addEventListener('change',updateShift2Fields);
  $('ciShift2Enabled')?.addEventListener('change',updateShift2Fields);
  $('ciJobEnabled')?.addEventListener('change',toggleDay);$('ciDeleteLocation')?.addEventListener('click',deleteDay);
  $('ciRefreshRecords')?.addEventListener('click',adminAttendance);
  $('ciAttendanceSearch')?.addEventListener('input',()=>{if(selectedAgency()&&selectedDay())renderAttendanceTable();});
  $('ciAttendanceStatusFilter')?.addEventListener('change',()=>{if(selectedAgency()&&selectedDay())renderAttendanceTable();});
  $('ciDailyScheduleBody')?.addEventListener('click',e=>{const btn=e.target.closest('button[data-editday]');if(!btn)return;
    $('ciAdminAgency').value=btn.dataset.agency;$('ciAdminWorkDate').value=btn.dataset.editday;fillConfig();renderDailyList();adminAttendance();
  });
  $('ciAdminRecordsBody')?.addEventListener('click',e=>{const btn=e.target.closest('button[data-id],button[data-manual],button[data-printclaim]');if(!btn||state.busy)return;
    if(btn.dataset.review)review(btn.dataset.id,btn.dataset.review);
    else if(btn.dataset.gps)gps(btn.dataset.id);
    else if(btn.dataset.manual)manualAttendance(btn.dataset.reg,btn.dataset.shift,btn.dataset.manual);
    else if(btn.dataset.printclaim)printApplicationTimesheet(btn.dataset.printclaim);
  });
})();
