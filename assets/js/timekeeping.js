// --- 1. ตั้งค่าเมนู ---
setupNavClick('navSpecialPayroll', 'specialPayrollSection', () => {
    resetSpecialForm();
    // เรียกฟังก์ชันเติมรายชื่อหน่วยงานลง Dropdown (ใช้ฟังก์ชันเดิมที่มีอยู่แล้ว)
    populateDepartments('spTargetDept'); 
});

// --- 2. ฟังก์ชันค้นหานักศึกษา ---
function searchStudentForSpecialPay() {
    const id = document.getElementById('specialSearchId').value.trim();
    if (!id) {
        showAlert('กรุณาระบุรหัสนักศึกษา', 'error');
        return;
    }

    showLoading();
    // เรียก Backend ให้ค้นหา (ต้องสร้างฟังก์ชัน findStudentByCode ใน Google Apps Script)
    google.script.run.withSuccessHandler(res => {
        hideLoading();
        if (res.success) {
const st = res.data;
    // Update UI Elements (ID ใหม่)
    document.getElementById('spShowName').textContent = `${st.prefix}${st.firstName} ${st.lastName}`;
    document.getElementById('spShowId').textContent = st.studentId; // เพิ่มตัวนี้
    document.getElementById('spShowFaculty').textContent = st.faculty;
    
    // Update Hidden Values
    document.getElementById('spStudentIdVal').value = st.studentId;
    document.getElementById('spStudentNameVal').value = `${st.prefix}${st.firstName} ${st.lastName}`;
    document.getElementById('spStudentFacultyVal').value = st.faculty;

    // Show Form
    document.getElementById('specialPayFormArea').style.display = 'block';
    if(document.querySelectorAll('.work-row').length === 0) {
        addWorkRow();
            }
        } else {
            showAlert('ไม่พบข้อมูลนักศึกษารหัสนี้', 'error');
            document.getElementById('specialPayFormArea').style.display = 'none';
        }
    }).findStudentByCode(id);
}

function addWorkRow() {
    const tbody = document.getElementById('spWorkTableBody');
    const rowId = 'row_' + new Date().getTime() + Math.random();
    
    const tr = document.createElement('tr');
    tr.className = 'work-row';
    tr.id = rowId;
    
    // --- แก้ไขตรง HTML ด้านล่างนี้ (เพิ่ม option evening) ---
    tr.innerHTML = `
        <td>
            <input type="date" class="sp-input-date sp-date" required>
        </td>
        <td>
            <select class="sp-select-session sp-session" onchange="calcSpecialTotal()" required>
                <option value="morning">เช้า (08:30-12:00)</option>
                <option value="afternoon">บ่าย (13:00-16:30)</option>
                <option value="evening">เย็น (16:30-20:00)</option> <option value="full">เต็มวัน (7 ชั่วโมง)</option>
            </select>
        </td>
        <td style="text-align: right;">
            <span class="sp-price-tag"><span class="sp-amount">150</span> บ.</span>
        </td>
        <td style="text-align: center;">
            <i class="material-icons" onclick="removeWorkRow('${rowId}')" style="color: #dc3545; cursor: pointer; font-size: 20px; transition: 0.2s;" onmouseover="this.style.transform='scale(1.2)'" onmouseout="this.style.transform='scale(1)'">delete_outline</i>
        </td>
    `;
    
    tbody.appendChild(tr);
    calcSpecialTotal();
}

function removeWorkRow(rowId) {
    const row = document.getElementById(rowId);
    if(row) row.remove();
    calcSpecialTotal();
}

function calcSpecialTotal() {
    let total = 0;
    const rows = document.querySelectorAll('.work-row');
    
    rows.forEach(row => {
        const session = row.querySelector('.sp-session').value;
        const amountSpan = row.querySelector('.sp-amount');
        let amount = 0;
        
        // กำหนดราคา: ถ้าเป็นเต็มวัน 300, ถ้าเป็นอย่างอื่น (เช้า/บ่าย/เย็น) 150
        if(session === 'full') {
            amount = 300;
        } else {
            amount = 150; // เช้า, บ่าย, เย็น เข้าเงื่อนไขนี้หมด
        }
        
        amountSpan.textContent = amount;
        total += amount;
    });
    
    document.getElementById('spGrandTotal').textContent = total.toLocaleString();
}

function resetSpecialForm() {
    document.getElementById('specialSearchId').value = '';
    document.getElementById('specialPayFormArea').style.display = 'none';
    document.getElementById('specialPayrollForm').reset();
    document.getElementById('spWorkTableBody').innerHTML = '';
    document.getElementById('spGrandTotal').textContent = '0';
}

document.getElementById('specialPayrollForm').addEventListener('submit', (e) => {
    e.preventDefault();
    
    // 1. ตรวจสอบว่าเลือกหน่วยงานหรือยัง (สำหรับ Admin)
    const targetDept = document.getElementById('spTargetDept').value;
    if(!targetDept) {
        showAlert('กรุณาเลือกหน่วยงานเจ้าของงบประมาณ', 'error');
        return;
    }

    const rows = document.querySelectorAll('.work-row');
    if(rows.length === 0) {
        showAlert('กรุณาเพิ่มวันปฏิบัติงานอย่างน้อย 1 วัน', 'error');
        return;
    }

    // รวบรวมข้อมูล Work List
    let workList = [];
    rows.forEach(row => {
        const date = row.querySelector('.sp-date').value;
        const session = row.querySelector('.sp-session').value;
        const amount = parseInt(row.querySelector('.sp-amount').textContent);
        
        if(date) {
            workList.push({ date, session, amount });
        }
    });

    const data = {
        userId: currentUser.id, // ผู้ทำรายการคือ Admin
        studentId: document.getElementById('spStudentIdVal').value,
        studentName: document.getElementById('spStudentNameVal').value,
        studentFaculty: document.getElementById('spStudentFacultyVal').value,
        jobTitle: document.getElementById('spJobTitle').value,
        
        // *** จุดที่แก้ไข: ใช้ค่าจาก Dropdown ที่ Admin เลือก ***
        department: targetDept, 
        
        items: workList
    };

    Swal.fire({
        title: 'ยืนยันการเบิกจ่ายด้วยวิธีพิเศษ',
        html: `
            <div style="text-align:left; font-size:14px;">
                <b>ให้หน่วยงาน:</b> <span style="color:#0d47a1;">${targetDept}</span><br>
                <b>นักศึกษา:</b> ${data.studentName}<br>
                <b>จำนวน:</b> ${workList.length} รายการ<br>
                <b>ยอดรวม:</b> <span style="color:#2e7d32; font-weight:bold; font-size:16px;">${document.getElementById('spGrandTotal').textContent}</span> บาท
            </div>
        `,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'ยืนยัน',
        cancelButtonText: 'ยกเลิก'
    }).then((result) => {
        if (result.isConfirmed) {
            showLoading();
            google.script.run.withSuccessHandler(res => {
                hideLoading();
                if(res.success) {
                    Swal.fire('ทำรายการสำเร็จ', 'ระบบบันทึกการเบิกจ่ายเรียบร้อย', 'success');
                    resetSpecialForm();
                    // รีเซ็ต Dropdown ด้วย
                    document.getElementById('spTargetDept').value = "";
                } else {
                    showAlert(res.message, 'error');
                }
            }).saveBatchPayroll(data);
        }
    });
});

// --- Setup Navigation สำหรับเมนูใหม่ ---
setupNavClick('navVerifyStudent', 'verifyStudentSection', () => {
    // เคลียร์ค่าเมื่อเข้าเมนูใหม่
    document.getElementById('verifyInputId').value = '';
    document.getElementById('verifyResultArea').style.display = 'none';
    document.getElementById('vfNotFound').style.display = 'none';
});

// --- ฟังก์ชันค้นหาข้อมูล (Updated for Modern UI) ---
function doVerifySearch() {
    const id = document.getElementById('verifyInputId').value.trim();
    if(!id) {
        showAlert('กรุณาระบุรหัสนักศึกษา', 'warning');
        return;
    }

    showLoading();
    
    // 🛡️ ดึง Token จากระบบ
    const token = sessionStorage.getItem('sessionToken');
    
    // เรียกฟังก์ชัน Google Apps Script
    google.script.run.withSuccessHandler(res => {
        hideLoading();
        
        const resultArea = document.getElementById('verifyResultArea');
        const notFoundMsg = document.getElementById('vfNotFound');

        if (res.success && res.data) {
            const d = res.data;
            currentVerifyDataCache = d; // เก็บข้อมูลไว้ใช้พิมพ์
            
            // Show Result
            if(notFoundMsg) notFoundMsg.style.display = 'none';
            resultArea.style.display = 'block';

            // 1. Header Info
            document.getElementById('vfName').textContent = d.fullName;
            document.getElementById('vfStudentId').textContent = d.studentId;
            document.getElementById('vfFaculty').textContent = d.faculty;

            // 2. Education Info
            document.getElementById('vfMajor').textContent = d.major || '-';
            document.getElementById('vfGpax').textContent = d.gpax || '-';
            document.getElementById('vfLoan').textContent = d.loan || 'ไม่ระบุ';
            document.getElementById('vfScholar').textContent = d.scholarship || '-';

            // 3. Contact Info
            document.getElementById('vfMobileLink').textContent = d.mobile || '-';
            document.getElementById('vfMobileLink').href = d.mobile ? `tel:${d.mobile}` : '#';
            document.getElementById('vfLine').textContent = d.line || '-';
            document.getElementById('vfFb').textContent = d.facebook || '-';
            document.getElementById('vfEmail').textContent = d.email || '-';

            // 4. Application Info
            document.getElementById('vfAgency').textContent = d.agency || 'ยังไม่ระบุ';
            document.getElementById('vfJobType').textContent = d.jobType || '-';
            document.getElementById('vfSkills').textContent = d.skills || '-';
            document.getElementById('vfReason').textContent = d.reason || '-';

        } else {
            // Not Found
            currentVerifyDataCache = null;
            resultArea.style.display = 'none';
            if(notFoundMsg) notFoundMsg.style.display = 'block';
            showAlert('ไม่พบข้อมูลนักศึกษารหัสนี้', 'error');
        }
    }).getStudentDetailsBySheet(token, id); // 🛡️ แนบ Token เป็นตัวแปรแรก
}

// --- 1. การจัดการสิทธิ์ (Staff Side) ---
setupNavClick('navManageRegular', 'manageRegularSection', () => loadRegularEmployees());

function addRegularEmployee() {
    const studentIdInput = document.getElementById('regEmpStudentId');
    const studentId = studentIdInput.value.trim();

    if(!studentId || studentId.length < 10) { 
        showAlert('กรุณาระบุรหัสนักศึกษาที่ถูกต้อง', 'error'); 
        return; 
    }
    
    showLoading();

    // ขั้นตอนที่ 1: ค้นหาข้อมูลนักศึกษาก่อน (ใช้ฟังก์ชัน findStudentByCode ที่มีอยู่แล้ว)
    google.script.run.withSuccessHandler(res => {
        hideLoading();
        
        if (res.success) {
            const st = res.data;
            // แสดง Popup ยืนยันพร้อมข้อมูล
            Swal.fire({
                title: 'ยืนยันการเพิ่มสิทธิ์',
                html: `
                    <div style="text-align: left; font-size: 16px;">
                        <div style="margin-bottom: 5px;"><b>รหัสนักศึกษา:</b> ${st.studentId}</div>
                        <div style="margin-bottom: 5px;"><b>ชื่อ-สกุล:</b> ${st.prefix}${st.firstName} ${st.lastName}</div>
                        <div style="margin-bottom: 15px;"><b>คณะ:</b> ${st.faculty}</div>
                        <hr>
                        <p style="color: #0d47a1; font-size: 14px;">
                            จะทำการเพิ่มสิทธิ์ให้นักศึกษาท่านนี้ ลงเวลาทำงานในหน่วยงาน<br>
                            <b>"${currentUser.faculty}"</b> ใช่หรือไม่
                        </p>
                    </div>
                `,
                icon: 'info',
                showCancelButton: true,
                confirmButtonColor: '#28a745',
                cancelButtonColor: '#d33',
                confirmButtonText: 'ยืนยัน / เพิ่มสิทธิ์',
                cancelButtonText: 'ยกเลิก'
            }).then((result) => {
                // ขั้นตอนที่ 2: หากกดยืนยัน ค่อยสั่งบันทึก
                if (result.isConfirmed) {
                    performAddRegular(st.studentId);
                }
            });

        } else {
            // กรณีไม่พบข้อมูลในฐานข้อมูล Users
            Swal.fire({
                title: 'ไม่พบข้อมูล',
                text: 'ไม่พบรหัสนักศึกษานี้ในระบบฐานข้อมูล',
                icon: 'error',
                confirmButtonText: 'ตกลง'
            });
        }
    }).withFailureHandler(err => {
        hideLoading();
        showAlert('เกิดข้อผิดพลาด: ' + err.message, 'error');
    }).findStudentByCode(studentId); 
}

// ฟังก์ชันย่อยสำหรับสั่งบันทึกจริง (แยกออกมาเพื่อให้โค้ดอ่านง่าย)
function performAddRegular(validStudentId) {
    showLoading();
    google.script.run.withSuccessHandler(res => {
        hideLoading();
        if(res.success) { 
            Swal.fire('เพิ่มสิทธิ์เรียบร้อย', 'นักศึกษาท่านนี้สามารถลงเวลาทำงานได้แล้ว', 'success');
            document.getElementById('regEmpStudentId').value = ''; // ล้างช่องค้นหา
            loadRegularEmployees(); // รีโหลดตารางรายชื่อ
        } else { 
            Swal.fire('บันทึกไม่สำเร็จ', res.message, 'error');
        }
    }).withFailureHandler(err => {
        hideLoading();
        showAlert('เกิดข้อผิดพลาด: ' + err.message, 'error');
    }).addRegularEmployeePermission(validStudentId, currentUser.faculty);
}

// --- ฟังก์ชันโหลดรายชื่อพนักงานประจำ (แก้ไขใหม่) ---
function loadRegularEmployees() {
    console.log("Loading regular employees...");

    // 1. ตรวจสอบว่า Login หรือยัง
    if (!currentUser) {
        console.error("User not logged in.");
        return;
    }

    // ใช้ faculty เป็นตัวกรอง (หรือ agency ถ้ามี key นี้)
    const myAgency = currentUser.faculty; 
    console.log("My Agency:", myAgency);

    if (!myAgency) {
        // กรณี Admin หรือ User ที่ไม่มีสังกัดชัดเจน
        if(currentUser.role !== 'admin') {
             showAlert('ไม่พบข้อมูลหน่วยงานของคุณ', 'error');
             return;
        }
    }

    showLoading();

    // เรียก Backend
    google.script.run.withSuccessHandler(list => {
        hideLoading();

        const tbody = document.querySelector('#regularEmpTable tbody');
        tbody.innerHTML = ''; // ล้างข้อมูลเก่า

        if (!list || list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#999; padding:20px;">ยังไม่มีรายชื่อในหน่วยงานนี้</td></tr>';
            return;
        }

        list.forEach(emp => {
            // สร้างปุ่มถอนสิทธิ์
            const revokeBtn = `<button class="btn btn-danger" style="padding:5px 10px; font-size:12px;" onclick="confirmRevoke('${emp.studentId}')">
                                <i class="material-icons" style="font-size:14px; vertical-align:middle;">delete</i> ถอนสิทธิ์
                               </button>`;
            
            // จัดรูปแบบวันที่ (ตัดเวลาออกถ้ามี)
            let dateShow = emp.dateAdded;
            if(dateShow.includes('T')) dateShow = dateShow.split('T')[0];

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${emp.studentId}</td>
                <td>${emp.name}</td>
                <td>${dateShow}</td> 
                <td><span class="vf-badge vf-badge-green" style="background:#e8f5e9; color:#2e7d32;">จ้างงานต่อเนื่อง</span></td>
                <td style="text-align:center;">${revokeBtn}</td>
            `;
            tbody.appendChild(tr);
        });
    }).withFailureHandler(err => {
        hideLoading();
        console.error("Error:", err);
        showAlert("เกิดข้อผิดพลาด: " + err.message, 'error');
    }).getAgencyRegularEmployees(myAgency); // เรียกฟังก์ชันที่เราเพิ่งเพิ่มใน Code.gs
}

// --- ฟังก์ชันยืนยันการถอนสิทธิ์ ---
function confirmRevoke(studentId) {
    Swal.fire({
        title: 'ยืนยันการถอนสิทธิ์',
        text: `ต้องการลบสิทธิ์นักศึกษารหัส ${studentId} ออกจากหน่วยงานใช่หรือไม่`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'ใช่ ถอนสิทธิ์',
        cancelButtonText: 'ยกเลิก'
    }).then((result) => {
        if (result.isConfirmed) {
            showLoading();
            google.script.run.withSuccessHandler(res => {
                hideLoading();
                if(res.success) {
                    showAlert('ถอนสิทธิ์เรียบร้อย', 'success');
                    loadRegularEmployees(); // โหลดตารางใหม่
                } else {
                    showAlert(res.message, 'error');
                }
            }).revokeRegularPermission(studentId);
        }
    });
}

setupNavClick('navRegularJob', 'regularTimeSection', () => {
    initManualTimeForm(); // สร้าง Dropdown เวลา
    loadTimeLogData();    // โหลดตารางประวัติ
});

let allowCustomTimeEntry = false; 

function initManualTimeForm() {
    // ตั้งค่าวันที่เป็นวันนี้
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    document.getElementById('manualLogDate').value = `${yyyy}-${mm}-${dd}`;

    let specVal = String(currentUser && currentUser.isSpecialTimeUser ? currentUser.isSpecialTimeUser : '').toUpperCase().trim();
    
    allowCustomTimeEntry = (specVal === 'TRUE' || specVal === 'YES' || specVal === '1' || specVal === '/' || currentUser.isSpecialTimeUser === true);

    renderTimeInputUI(); 
}

function renderTimeInputUI() {
    const container = document.getElementById('timeInputContainer');
    container.innerHTML = '';

    if (allowCustomTimeEntry) {
        // --- แบบที่ 2: เห็นปกติตามเดิม (เลือกเวลาเริ่ม-เลิกเอง) ---
        let timeOptions = '';
        for (let h = 5; h <= 22; h++) { // ขยายเวลาให้ครอบคลุม
            let hour = String(h).padStart(2, '0');
            timeOptions += `<option value="${hour}:00">${hour}:00</option>`;
            timeOptions += `<option value="${hour}:30">${hour}:30</option>`;
        }

        container.innerHTML = `
            <div style="background: #fff3e0; padding: 10px; border-radius: 6px; margin-bottom: 10px; color: #e65100; font-size: 13px;">
                <i class="material-icons" style="font-size:14px; vertical-align:bottom;">info</i> ท่านได้รับสิทธิ์กำหนดเวลาเอง (Approved)
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                <div class="clean-input-group">
                    <label>เวลาเริ่มงาน</label>
                    <select id="manualStartTime" class="clean-input">${timeOptions}</select>
                </div>
                <div class="clean-input-group">
                    <label>เวลาเลิกงาน</label>
                    <select id="manualEndTime" class="clean-input">${timeOptions}</select>
                </div>
            </div>
        `;
        // Set Default
        document.getElementById('manualStartTime').value = "08:30";
        document.getElementById('manualEndTime').value = "16:30";

    } else {
        // --- แบบที่ 1: กำหนดช่วงเวลา (Standard) ---
        container.innerHTML = `
            <div class="clean-input-group full-width">
                <label>เลือกช่วงเวลาปฏิบัติงาน</label>
                <select id="fixedTimeSlot" class="clean-input" style="padding: 12px; font-size: 15px;">
                    <option value="" disabled selected>-- กรุณาเลือกช่วงเวลา --</option>
                    <option value="08:30-12:00|3.5">08.30 น. - 12.00 น. (3.5 ชั่วโมง)</option>
                    <option value="13:00-16:30|3.5">13.00 น. - 16.30 น. (3.5 ชั่วโมง)</option>
                    <option value="16:30-20:00|3.5">16.30 น. - 20.00 น. (3.5 ชั่วโมง)</option>
                    <option value="08:30-16:30|7">08.30 น. - 16.30 น. (7 ชั่วโมง) พักเที่ยง 1 ชม.</option>
                    <option value="13:00-20:00|7">13.00 น. - 20.00 น. (7 ชั่วโมง)</option>
                </select>
            </div>
        `;
    }
}

function saveManualLog() {
    // --- 1. ตรวจสอบเดือนข้ามกัน ---
    const inputDateVal = document.getElementById('manualLogDate').value; // ค่าจากช่องวันที่ (YYYY-MM-DD)
    
    if (inputDateVal && window.currentDraftMonth) {
        // แปลงวันที่ที่เลือกเป็น YYYY-MM
        const d = new Date(inputDateVal);
        const inputMonthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        
        // ถ้ามีข้อมูลเก่าอยู่แล้ว และเดือนไม่ตรงกัน -> ห้ามบันทึก!
        if (inputMonthKey !== window.currentDraftMonth) {
            // แปลงเดือนเป็นไทยสวยๆ เพื่อแจ้งเตือน
            const [y, m] = window.currentDraftMonth.split('-');
            const thMonth = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
            const monthName = thMonth[parseInt(m) - 1];
            const yearTh = parseInt(y) + 543;
            
            Swal.fire({
                icon: 'error',
                title: 'ไม่สามารถบันทึกข้ามเดือนได้',
                html: `ในระบบมีรายการของเดือน <b>${monthName} ${yearTh}</b> ค้างอยู่<br><br>กรุณากดปุ่ม <b>"ส่งเบิกเงิน"</b> (รายการเดือนเก่า) ให้เรียบร้อยก่อน<br>จึงจะสามารถเริ่มบันทึกเดือนใหม่ได้`,
                confirmButtonText: 'รับทราบ',
                confirmButtonColor: '#d33'
            });
            return; // จบการทำงานทันที ไม่บันทึก
        }
    }
    
    const editId = document.getElementById('editLogId').value;
    const date = document.getElementById('manualLogDate').value;
    const detail = document.getElementById('manualLogDetail').value.trim();

    if (!date || !detail) {
        showAlert('กรุณากรอกวันที่และรายละเอียดงาน', 'warning');
        return;
    }
    const analysis = analyzeJobDetail(detail);
    
    if (!analysis.isValid) {
        // หากไม่ผ่านเกณฑ์ ให้เด้งแจ้งเตือนพร้อมสอนวิธีการเขียนที่ถูกต้อง
        Swal.fire({
            icon: 'warning',
            title: 'รายละเอียดงานไม่ชัดเจน',
            html: `
                <div style="text-align:left; font-size:14px; line-height:1.6;">
                    <span style="color:#d32f2f; font-weight:bold;">ปัญหาที่พบ</span> ${analysis.message}<br><br>
                </div>
            `,
            confirmButtonText: 'กลับไปแก้ไข',
            confirmButtonColor: '#f57c00'
        });
        
        // ไฮไลต์ให้ช่องกรอกข้อมูลเด่นขึ้น และโฟกัสเคอร์เซอร์ไปที่ช่องนั้น
        document.getElementById('manualLogDetail').style.borderColor = '#f57c00';
        document.getElementById('manualLogDetail').focus();
        return; // หยุดการบันทึกทันที
    } else {
        // ถ้าผ่าน ให้คืนสีขอบกลับเป็นปกติ
        document.getElementById('manualLogDetail').style.borderColor = '#ccc';
    }
    // =====================================================================

    let start = '';
    let end = '';
    let hours = 0;

    // --- 3. คำนวณเวลาตามรูปแบบสิทธิ์ ---
    if (allowCustomTimeEntry) {
        // แบบที่ 2: กำหนดเอง (Approved User)
        start = document.getElementById('manualStartTime').value;
        end = document.getElementById('manualEndTime').value;

        if (start >= end) {
            showAlert('เวลาเลิกงานต้องหลังเวลาเริ่มงาน', 'error');
            return;
        }

        // คำนวณชั่วโมงจริง
        const s = new Date(`2000-01-01T${start}:00`);
        const e = new Date(`2000-01-01T${end}:00`);
        const diffMs = e - s;
        let diffHrs = diffMs / (1000 * 60 * 60);

        // หักพักเที่ยงอัตโนมัติ 1 ชม. (ถ้าคร่อมช่วง 12.00-13.00)
        // เพื่อให้ยอดเวลาแสดงผลถูกต้อง (เช่น 08.30-16.30 จะเหลือ 7 ชม.)
        if (start <= "12:00" && end >= "13:00") { 
            diffHrs -= 1; 
        }

        hours = diffHrs;

    } else {
        // แบบที่ 1: เลือก Slot (User ทั่วไป)
        const slotSelect = document.getElementById('fixedTimeSlot');
        if (!slotSelect.value) {
            showAlert('กรุณาเลือกช่วงเวลา', 'warning');
            return;
        }
        
        const parts = slotSelect.value.split('|'); // ex: "08:30-16:30|7"
        const timeRange = parts[0].split('-');
        start = timeRange[0];
        end = timeRange[1];
        hours = parseFloat(parts[1]);
    }

    // --- เงื่อนไขป้องกันเกิน 7 ชั่วโมง ---
    // ตรวจสอบเฉพาะ User ทั่วไป (!allowCustomTimeEntry)
    if (!allowCustomTimeEntry && hours > 7) {
        Swal.fire({
            icon: 'error',
            title: 'บันทึกไม่ได้',
            text: `ระบบไม่อนุญาตให้บันทึกเวลาทำงานเกิน 7 ชั่วโมงต่อครั้ง (คุณระบุ ${hours} ชม.)`,
            confirmButtonColor: '#d33'
        });
        return;
    }

    const data = {
        logId: editId,
        studentId: currentUser.studentId, // ฝั่งเซิร์ฟจะใช้ Token ทับอีกรอบเพื่อความชัวร์
        agency: currentUser.regularAgency,
        date: date,
        startTime: start,
        endTime: end,
        details: detail,
        hours: hours 
    };

    showLoading();
    // 🛡️ ดึง Token 
    const token = sessionStorage.getItem('sessionToken');
    
    if (editId) {
        google.script.run.withSuccessHandler(res => {
            hideLoading();
            if (res.success) {
                showAlert('แก้ไขข้อมูลเรียบร้อย', 'success');
                resetManualLogForm();
                loadTimeLogData();
            } else {
                showAlert(res.message, 'error');
            }
        }).updateManualTimeLog(token, data); // 🛡️ แนบ Token
    } else {
        google.script.run.withSuccessHandler(res => {
            hideLoading();
            if (res.success) {
                showAlert('บันทึกเวลาเรียบร้อย', 'success');
                resetManualLogForm();
                loadTimeLogData();
            } else {
                showAlert(res.message, 'error');
            }
        }).saveManualTimeLog(token, data); // 🛡️ แนบ Token
    }
}

// เพิ่มฟังก์ชันสำหรับล้างฟอร์มและปุ่ม
function resetManualLogForm() {
    document.getElementById('editLogId').value = '';
    document.getElementById('manualLogDetail').value = '';
    // คืนค่าปุ่มบันทึกให้เป็นสีเขียวเหมือนเดิม (กรณีเปลี่ยนสีตอนกดแก้ไข)
    const btn = document.querySelector('#attendanceBox button');
    btn.className = 'btn btn-success';
    btn.innerHTML = '<i class="material-icons" style="vertical-align:middle;">save</i> บันทึกเวลา';
}

// ตัวแปร Global สำหรับเก็บเดือนปัจจุบันที่กำลังทำงาน (ห้ามลบ)
window.currentDraftMonth = null;

// ฟังก์ชันโหลดข้อมูลตารางลงเวลา
function loadTimeLogData() {
    showLoading();
    document.getElementById('currentMonthLabel').textContent = "...";
    
    // รีเซ็ตค่าเดือนที่จำไว้
    window.currentDraftMonth = null;
    
    // 🛡️ ดึง Token จากระบบ
    const token = sessionStorage.getItem('sessionToken');
    
    google.script.run.withSuccessHandler(res => {
        hideLoading();
        
        let labelMonth = "";
        
        if (res.logs && res.logs.length > 0) {
            // 1. ดึงวันที่จากรายการแรก
            let firstLogDate = res.logs[0].date; 
            let dateObj = parseDateString(firstLogDate); 
            
            if (dateObj) {
                // แสดงผลหัวกระดาษ (ตุลาคม 2568)
                labelMonth = dateObj.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
                
                // --- [ส่วนที่เพิ่มใหม่] จำค่าเดือน/ปี ไว้ตรวจสอบ (Format: YYYY-MM) ---
                let yAD = dateObj.getFullYear();
                let m = dateObj.getMonth() + 1;
                window.currentDraftMonth = `${yAD}-${String(m).padStart(2, '0')}`; 
            }
        } 
        
        if (labelMonth === "") {
            const now = new Date();
            labelMonth = now.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
        }

        // อัปเดตหัวกระดาษ
        if(document.getElementById('currentMonthLabel')) document.getElementById('currentMonthLabel').textContent = labelMonth;
        if(document.getElementById('printMonth')) document.getElementById('printMonth').textContent = labelMonth;

        renderTimeTable(res.logs); 
    }).getStudentMonthlyLogs(token, currentUser.studentId); // 🛡️ แนบ Token เป็นตัวแปรแรก
}

// --- ฟังก์ชันช่วยแปลง Text เป็น Date Object ---
// (วางไว้ต่อท้ายฟังก์ชันข้างบน หรือท้ายไฟล์ script ก็ได้ครับ)
function parseDateString(dateStr) {
    if (!dateStr) return null;
    let d = null;
    
    // กรณี YYYY-MM-DD (2025-10-02)
    if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const p = dateStr.split('-');
        d = new Date(p[0], p[1] - 1, p[2]);
    } 
    // กรณี DD/MM/YYYY (02/10/2568) <-- เคสของท่านน่าจะเป็นอันนี้
    else if (dateStr.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
        const p = dateStr.split('/');
        let dNum = parseInt(p[0]);
        let mNum = parseInt(p[1]) - 1; // เดือน JS เริ่มที่ 0
        let yNum = parseInt(p[2]);

        // ถ้าปีมากกว่า 2400 แสดงว่าเป็น พ.ศ. (เช่น 2568) 
        // ต้องลบ 543 เพื่อให้ระบบคอมพิวเตอร์เข้าใจว่าเป็นปี 2025 ก่อน
        // (เวลาสั่ง toLocaleString มันจะบวกกลับเป็น 2568 ให้เอง)
        if (yNum > 2400) yNum -= 543; 
        
        d = new Date(yNum, mNum, dNum);
    }
    // กรณีเป็น Date Object อยู่แล้ว
    else {
        d = new Date(dateStr);
    }
    
    return (d && !isNaN(d.getTime())) ? d : null;
}

// ฟังก์ชันช่วยแปลง Text เป็น Date (วางไว้ต่อท้ายฟังก์ชันข้างบน หรือท้ายไฟล์ script)
function parseDateString(dateStr) {
    if (!dateStr) return null;
    let d = null;
    
    // กรณี YYYY-MM-DD (2025-10-02)
    if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const p = dateStr.split('-');
        d = new Date(p[0], p[1] - 1, p[2]);
    } 
    // กรณี DD/MM/YYYY (02/10/2568)
    else if (dateStr.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
        const p = dateStr.split('/');
        let y = parseInt(p[2]);
        // ถ้าปีมากกว่า 2400 แสดงว่าเป็น พ.ศ. ให้ลบ 543 เพื่อให้ระบบอ่านเป็น ค.ศ.
        if (y > 2400) y -= 543; 
        d = new Date(y, parseInt(p[1]) - 1, parseInt(p[0]));
    }
    // กรณีเป็น Date Object อยู่แล้ว
    else {
        d = new Date(dateStr);
    }
    
    return (d && !isNaN(d.getTime())) ? d : null;
}

// ฟังก์ชันช่วยแปลง Text เป็น Date Object (วางไว้ใกล้ๆ กัน หรือท้ายไฟล์ script)
function parseDateString(dateStr) {
    if (!dateStr) return null;
    let d = null;
    // กรณี YYYY-MM-DD
    if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const p = dateStr.split('-');
        d = new Date(p[0], p[1] - 1, p[2]);
    } 
    // กรณี DD/MM/YYYY
    else if (dateStr.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
        const p = dateStr.split('/');
        let y = parseInt(p[2]);
        // ถ้าปีมากกว่า 2400 แสดงว่าเป็น พ.ศ. ให้ลบ 543 เพื่อให้ JS เข้าใจ
        if (y > 2400) y -= 543; 
        d = new Date(y, p[1] - 1, p[0]);
    }
    // กรณีเป็น Date Object อยู่แล้ว หรือ Text อื่นๆ
    else {
        d = new Date(dateStr);
    }
    
    return (d && !isNaN(d.getTime())) ? d : null;
}

function checkRegularJobAccess() {
    if (!currentUser || currentUser.role !== 'user') {
        const navItem = document.getElementById('navRegularJob');
        if (navItem) navItem.style.display = 'none';
        return; 
    }

    google.script.run.withSuccessHandler(res => {
        const navItem = document.getElementById('navRegularJob');
        if (navItem) {
            if (res.hasAccess) {
                navItem.style.display = 'block'; 
                navItem.classList.add('show');
                currentUser.regularAgency = res.agency;
                
                // 🌟 อัปเดตสิทธิ์พิเศษแบบเรียลไทม์
                currentUser.isSpecialTimeUser = res.isSpecial; 
                
            } else {
                navItem.style.display = 'none';
                navItem.classList.remove('show');
            }
        }
    }).checkStudentRegularAccess(currentUser.studentId);
}

// นาฬิกาเดิน
function initClock() {
    const updateTime = () => {
        const now = new Date();
        document.getElementById('clockDisplay').textContent = now.toLocaleTimeString('th-TH');
        document.getElementById('currentDateDisplay').textContent = now.toLocaleDateString('th-TH', {weekday:'long', day:'numeric', month:'long', year:'numeric'});
    };
    setInterval(updateTime, 1000);
    updateTime();
}

// ฟังก์ชันวาดตารางลงเวลา (ฉบับแก้ไข: หัวกระดาษตรงกับข้อมูลจริง)
function renderTimeTable(logs) {
    try {
        const tbody = document.querySelector('#timeLogTable tbody');
        const printBody = document.getElementById('printTableBody');
        const printFoot = document.querySelector('#printTimeSheetArea tfoot'); 
        
        // --- [ส่วนที่ 1] คำนวณเดือนจากข้อมูลจริง (แก้ปัญหาหัวกระดาษผิด) ---
        let labelMonth = "";
        if (logs && logs.length > 0) {
             // ดึงวันที่จากรายการแรกมาใช้ (เช่น "2/10/2568")
             let firstLogDate = logs[0].date;
             let dateObj = parseDateString(firstLogDate); // ใช้ Helper แปลง
             if (dateObj) {
                 labelMonth = dateObj.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
             }
        }
        // ถ้าไม่มีข้อมูล ให้ใช้วันปัจจุบัน
        if (labelMonth === "") {
             const now = new Date();
             labelMonth = now.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
        }

        // อัปเดตหัวกระดาษทั้งหน้าจอและใบพิมพ์
        if(document.getElementById('currentMonthLabel')) document.getElementById('currentMonthLabel').textContent = labelMonth;
        if(document.getElementById('printMonth')) document.getElementById('printMonth').textContent = labelMonth;
        // -------------------------------------------------------------

        // --- [ส่วนที่ 2] แสดงข้อมูลส่วนตัว ---
        if(typeof currentUser !== 'undefined' && currentUser) {
             if(document.getElementById('printName')) document.getElementById('printName').textContent = `${currentUser.prefix || ''}${currentUser.firstName} ${currentUser.lastName}`;
             if(document.getElementById('printId')) document.getElementById('printId').textContent = currentUser.studentId;
             if(document.getElementById('printFaculty')) document.getElementById('printFaculty').textContent = currentUser.faculty;
             
             // ลายเซ็น
             if(document.getElementById('printSignName')) {
                 document.getElementById('printSignName').textContent = `${currentUser.prefix || ''}${currentUser.firstName} ${currentUser.lastName}`;
             }

             // หน่วยงาน
             if(document.getElementById('printAgency')) {
                // ใช้ฟังก์ชันแปลงชื่อถ้ามี หรือใช้ชื่อตรงๆ
                document.getElementById('printAgency').textContent = (typeof getOfficialAgencyName === 'function') 
                    ? getOfficialAgencyName(currentUser.regularAgency) 
                    : (currentUser.regularAgency || '-');
            }
        }

        // เคลียร์ค่าเดิมในตาราง
        if(tbody) tbody.innerHTML = '';
        if(printBody) printBody.innerHTML = '';
        
        let grandTotalHours = 0;
        let grandTotalAmt = 0;

        // กรณีไม่มีข้อมูล
        if (!logs || logs.length === 0) {
             const noDataHtml = '<tr><td colspan="7" style="text-align:center; color:#999; padding:20px;">ไม่พบประวัติการทำงาน</td></tr>';
             if(tbody) tbody.innerHTML = noDataHtml;
             if(printBody) printBody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:20px; border:1px solid #000;">- ไม่มีข้อมูล -</td></tr>';
             
             if(document.getElementById('sumHours')) document.getElementById('sumHours').textContent = "0";
             if(document.getElementById('sumAmount')) document.getElementById('sumAmount').textContent = "0";
             if(printFoot) printFoot.innerHTML = `
                <tr style="height: 30px;">
                    <td colspan="5" style="text-align:center !important; font-weight:bold; border:1px solid #000; vertical-align: middle;">รวมเป็นเงินทั้งสิ้น</td>
                    <td style="text-align:center; font-weight:bold; border:1px solid #000; vertical-align: middle;">0</td>
                    <td colspan="2" style="text-align:center; border:1px solid #000; vertical-align: middle;">(ศูนย์บาทถ้วน)</td>
                </tr>`; 
             return;
        }

        // จัดกลุ่มข้อมูลตามวันที่
        const groupedLogs = {};
        logs.forEach(log => {
            if (!groupedLogs[log.date]) groupedLogs[log.date] = [];
            groupedLogs[log.date].push(log);
        });

        let printIndex = 1;

        // วนลูปแสดงข้อมูล
        for (const [dateStr, dayLogs] of Object.entries(groupedLogs)) {
            
            // แปลงวันที่ให้สวยงาม (เช่น 2/10/2568)
            let displayDate = dateStr;
            let dateObjForRow = parseDateString(dateStr);
            if (dateObjForRow) {
                let d = dateObjForRow.getDate();
                let m = dateObjForRow.getMonth() + 1;
                let y = dateObjForRow.getFullYear();
                if (y < 2400) y += 543; // แปลงเป็น พ.ศ.
                displayDate = `${d}/${m}/${y}`;
            }

            let dailyHours = 0;
            dayLogs.forEach(log => dailyHours += parseFloat(log.hours || 0));

            let dailyAmount = 0;
            // Logic คำนวณเงิน: 7 ชม=300, 3.5 ชม=150, อื่นๆ=ตามจริง
            if (dailyHours >= 7) dailyAmount = 300;
            else if (dailyHours >= 3.5) dailyAmount = 150;
            else dailyAmount = dayLogs.reduce((sum, log) => sum + (parseInt(log.amount)||0), 0);

            grandTotalHours += dailyHours;
            grandTotalAmt += dailyAmount;

            const rowSpan = dayLogs.length; 

            dayLogs.forEach((log, index) => {
                let inTime = log.checkIn || '-';
                let outTime = log.checkOut || '-';
                
                if (inTime.includes('T')) inTime = inTime.slice(11, 16);
                if (outTime.includes('T')) outTime = outTime.slice(11, 16);

                // A. สร้างแถวหน้าเว็บ
                if(tbody) {
                    let tr = document.createElement('tr');
                    
                    if (index === 0) {
                        tr.innerHTML += `<td rowspan="${rowSpan}" style="vertical-align: middle;">${displayDate}</td>`;
                    }
                    
                    tr.innerHTML += `
                        <td>${inTime}</td>
                        <td>${outTime}</td>
                        <td>${log.details || '-'}</td>
                    `;

                    if (index === 0) {
                        tr.innerHTML += `
                            <td rowspan="${rowSpan}" style="vertical-align: middle; font-weight:bold;">${dailyHours}</td>
                            <td rowspan="${rowSpan}" style="vertical-align: middle; font-weight:bold;">${dailyAmount.toLocaleString()}</td>
                        `;
                    }
                    
                    // ปุ่มจัดการ
                    const logStr = JSON.stringify(log).replace(/"/g, '&quot;');
                    tr.innerHTML += `
                        <td style="text-align:center;">
                            <button class="btn btn-info" onclick="onEditTimeLog(${logStr})" style="padding:2px 6px; margin-right:2px;" title="แก้ไข">
                                <i class="material-icons" style="font-size:14px;">edit</i>
                            </button>
                            <button class="btn btn-danger" onclick="onDeleteTimeLog('${log.id}')" style="padding:2px 6px;" title="ลบ">
                                <i class="material-icons" style="font-size:14px;">delete</i>
                            </button>
                        </td>
                    `;
                    tbody.appendChild(tr);
                }

                // B. สร้างแถวสำหรับพิมพ์ (Print)
                if(printBody) {
                      let ptr = document.createElement('tr');
                      ptr.innerHTML += `<td style="text-align:center; border:1px solid #000;">${printIndex++}</td>`;
                      
                      if (index === 0) ptr.innerHTML += `<td rowspan="${rowSpan}" style="text-align:center; vertical-align: middle; border:1px solid #000;">${displayDate}</td>`;
                      
                      ptr.innerHTML += `<td style="text-align:center; border:1px solid #000;">${inTime}</td><td style="text-align:center; border:1px solid #000;">${outTime}</td>`;
                      
                      if (index === 0) {
                        ptr.innerHTML += `<td rowspan="${rowSpan}" style="text-align:center; vertical-align: middle; border:1px solid #000;">${dailyHours}</td>`;
                        ptr.innerHTML += `<td rowspan="${rowSpan}" style="text-align:center; vertical-align: middle; border:1px solid #000;">${dailyAmount.toLocaleString()}</td>`;
                      }
                      
                      ptr.innerHTML += `<td style="text-align:left; padding-left:5px; border:1px solid #000;">${log.details || '-'}</td><td style="text-align:center; border:1px solid #000;"></td>`;
                      printBody.appendChild(ptr);
                }
            });
        }

        // อัปเดตยอดรวมท้ายตาราง
        if(document.getElementById('sumHours')) document.getElementById('sumHours').textContent = grandTotalHours.toFixed(1);
        if(document.getElementById('sumAmount')) document.getElementById('sumAmount').textContent = grandTotalAmt.toLocaleString();

        // อัปเดตส่วนท้ายใบพิมพ์ (Footer)
        if (printFoot) {
            const bahtText = (typeof BAHTTEXT === 'function') ? BAHTTEXT(grandTotalAmt) : "";
            printFoot.innerHTML = `
                <tr style="height: 30px;">
                    <td colspan="5" style="text-align:center !important; font-weight:bold; border:1px solid #000; vertical-align: middle;">
                        รวมเป็นเงินทั้งสิ้น
                    </td>
                    <td style="text-align:center; font-weight:bold; border:1px solid #000; vertical-align: middle;">
                        ${grandTotalAmt.toLocaleString()}
                    </td>
                    <td colspan="2" style="text-align:center; border:1px solid #000; vertical-align: middle;">
                        ${bahtText}
                    </td>
                </tr>
            `;
        }
        
    } catch (e) {
        console.error("Error renderTimeTable:", e);
    }
}

// --- ฟังก์ชันช่วยแปลงวันที่ (สำคัญมาก ต้องมีไว้ใน script) ---
function parseDateString(dateStr) {
    if (!dateStr) return null;
    let d = null;
    
    // กรณี YYYY-MM-DD
    if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const p = dateStr.split('-');
        d = new Date(p[0], p[1] - 1, p[2]);
    } 
    // กรณี DD/MM/YYYY
    else if (dateStr.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
        const p = dateStr.split('/');
        let y = parseInt(p[2]);
        if (y > 2400) y -= 543; // แปลง พ.ศ. เป็น ค.ศ.
        d = new Date(y, p[1] - 1, p[0]);
    }
    // กรณีอื่นๆ
    else {
        d = new Date(dateStr);
    }
    
    return (d && !isNaN(d.getTime())) ? d : null;
}

function onEditTimeLog(log) {
    document.getElementById('editLogId').value = log.id;
    
    // แปลงวันที่
    let parts = log.date.split('/');
    if(parts.length === 3) {
        let y = parseInt(parts[2]);
        if(y > 2500) y -= 543; 
        let m = parts[1].padStart(2, '0');
        let d = parts[0].padStart(2, '0');
        document.getElementById('manualLogDate').value = `${y}-${m}-${d}`;
    }

    document.getElementById('manualLogDetail').value = log.details;

    // ตรวจสอบว่าจะเอาค่าไปใส่ Input ไหนดี
    if (allowCustomTimeEntry) {
        document.getElementById('manualStartTime').value = log.checkIn;
        document.getElementById('manualEndTime').value = log.checkOut;
    } else {
        // พยายาม Map เวลาเข้ากับ Slot ที่มี
        const slotValue = findSlotValue(log.checkIn, log.checkOut);
        if (slotValue) {
            document.getElementById('fixedTimeSlot').value = slotValue;
        } else {
            // ถ้าเวลาไม่ตรงกับ Slot มาตรฐาน (อาจจะเป็นข้อมูลเก่า หรือแก้ไขมา)
            // อาจจะต้องแจ้งเตือน หรือ Force ให้เลือกใหม่
            document.getElementById('fixedTimeSlot').value = ""; 
        }
    }

    // เปลี่ยนปุ่มเป็นแก้ไข
    const btn = document.querySelector('#attendanceBox button');
    btn.className = 'btn btn-warning';
    btn.innerHTML = '<i class="material-icons" style="vertical-align:middle;">edit</i> บันทึกการแก้ไข';
    btn.style.color = '#fff';

    document.getElementById('attendanceBox').scrollIntoView({ behavior: 'smooth' });
}

// Helper function เพื่อหา value ของ option
function findSlotValue(start, end) {
    const target = `${start}-${end}`;
    const options = document.querySelectorAll('#fixedTimeSlot option');
    for (let opt of options) {
        if (opt.value.startsWith(target)) {
            return opt.value;
        }
    }
    return null;
}

// Helper function เพื่อหา value ของ option
function findSlotValue(start, end) {
    const target = `${start}-${end}`;
    const options = document.querySelectorAll('#fixedTimeSlot option');
    for (let opt of options) {
        if (opt.value.startsWith(target)) {
            return opt.value;
        }
    }
    return null;
}

function onDeleteTimeLog(logId) {
    Swal.fire({
        title: 'ยืนยันการลบ',
        text: "คุณต้องการลบรายการนี้ใช่หรือไม่",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'ลบรายการ',
        cancelButtonText: 'ยกเลิก'
    }).then((result) => {
        if (result.isConfirmed) {
            showLoading();
            
            // 🛡️ ดึง Token จากระบบ
            const token = sessionStorage.getItem('sessionToken');
            
            google.script.run.withSuccessHandler(res => {
                hideLoading();
                if (res.success) {
                    showAlert('ลบรายการเรียบร้อย');
                    loadTimeLogData();
                } else {
                    showAlert(res.message, 'error');
                }
            }).deleteTimeLog(token, logId); // 🛡️ แนบ Token เป็นตัวแปรแรก
        }
    });
}

function printTimeSheet() {
    document.body.classList.add('print-mode-timesheet');
    window.print();
    document.body.classList.remove('print-mode-timesheet');
}

function printReportArea() {
    var printContent = document.getElementById('printArea');
    var placeholder = document.createElement("div");
    printContent.parentNode.insertBefore(placeholder, printContent);
    document.body.appendChild(printContent);

    // [FIX] เปลี่ยนชื่อ Class เป็น print-mode-finance
    document.body.classList.add('print-mode-finance'); 
    
    window.print();
    
    // [FIX] เอา Class ออก
    document.body.classList.remove('print-mode-finance');
    
    placeholder.parentNode.insertBefore(printContent, placeholder);
    placeholder.remove();
}

function submitMonthlyTimesheet() {
    // คำนวณยอดเงินรวมก่อนส่ง
    const totalAmt = document.getElementById('sumAmount').innerText;
    
    if(totalAmt === "0" || totalAmt === "0.00") {
        showAlert('ไม่พบยอดเงินที่สามารถเบิกจ่ายได้ในเดือนนี้', 'warning');
        return;
    }

    Swal.fire({
        title: 'ยืนยันการส่งขอเบิกจ่ายค่าตอบแทน',
        html: `
            <div style="text-align: left; font-family: 'Sarabun', sans-serif; font-size: 16px; color: #333;">
                <p style="margin-bottom: 15px;">
                    ยอดเงินที่ขอเบิกจ่ายสุทธิ: <b style="color:var(--secondary-color); font-size:20px;">${totalAmt}</b> บาท
                </p>
                
                <div style="background-color: #fff3cd; border: 1px solid #ffeeba; padding: 15px; border-radius: 6px;">
                    <strong style="color: #856404; display: block; font-size: 16px; margin-bottom: 8px; border-bottom: 1px dashed #856404; padding-bottom: 5px;">
                        <i class="material-icons" style="vertical-align:bottom; font-size:18px;">warning</i> ข้อควรระวังและถือปฏิบัติ
                    </strong>
                    <ul style="margin: 0; padding-left: 20px; color: #856404; font-size: 15px; line-height: 1.6;">
                        <li>กรุณา <b>พิมพ์แบบบันทึกเวลาปฏิบัติงาน</b> และนำเสนอหัวหน้าหน่วยงานลงนามรับรองความถูกต้องให้ครบถ้วน <u>ก่อน</u> ทำรายการส่งข้อมูลในระบบ</li>
                        <li style="color: #dc3545; font-weight: bold; margin-top: 8px;">
                            เมื่อยืนยันการส่งข้อมูลแล้ว ระบบจะสามารถพิมพ์เอกสารย้อนหลังได้
                        </li>
                    </ul>
                </div>
            </div>
        `,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#28a745', // สีเขียว
        cancelButtonColor: '#6c757d', // สีเทา
        confirmButtonText: 'พิมพ์เอกสารแล้ว / ยืนยันการส่ง',
        cancelButtonText: 'ยกเลิก (กลับไปพิมพ์เอกสาร)',
        reverseButtons: true, 
        allowOutsideClick: false 
    }).then((res) => {
        if(res.isConfirmed) {
            showLoading();
            // 🛡️ ดึง Token จากระบบ
            const token = sessionStorage.getItem('sessionToken');

            // เรียกฟังก์ชันหลังบ้านเพื่อเปลี่ยนสถานะเป็น Submitted
            google.script.run.withSuccessHandler(response => {
                hideLoading();
                if(response.success) {
                    Swal.fire({
                        icon: 'success',
                        title: 'บันทึกรายการสำเร็จ',
                        text: 'ระบบได้ส่งข้อมูลไปยังหน่วยงานเพื่อรอการตรวจสอบเรียบร้อยแล้ว',
                        showConfirmButton: true, 
                        confirmButtonText: 'ตกลง', 
                        confirmButtonColor: '#28a745',
                        allowOutsideClick: false
                    }).then(() => {
                        // เมื่อกดตกลง ให้รีโหลดตาราง
                        loadTimeLogData();
                    });
                } else {
                    showAlert(response.message, 'error');
                }
            }).submitTimeSheetForApproval(token, currentUser.studentId, currentUser.id); // 🛡️ แนบ Token เป็นตัวแปรแรก
        }
    });
}

/* --- ฟังก์ชันแปลงตัวเลขเป็นภาษาไทย (BAHTTEXT) --- */
function BAHTTEXT(num) {
    num = parseFloat(num);
    if (isNaN(num)) return "";
    if (num === 0) return "(ศูนย์บาทถ้วน)";

    var suffix = "บาทถ้วน";
    if (String(num).indexOf('.') > -1) {
       var parts = String(num).split('.');
       if(parseInt(parts[1]) > 0) {
           suffix = "บาท" +  ReadNumber(parts[1]) + "สตางค์";
       }
    }

    function ReadNumber(number) {
        var t = ["", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
        var u = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน", "ล้าน"];
        var s = String(Math.floor(number));
        var text = "";
        
        for (var i = 0; i < s.length; i++) {
            var digit = s.charAt(i);
            var pos = s.length - i - 1;
            
            if (digit != '0') {
                if (digit == '1' && pos == 0 && s.length > 1) text += "เอ็ด";
                else if (digit == '2' && pos == 1) text += "ยี่";
                else if (digit == '1' && pos == 1) text += "";
                else text += t[parseInt(digit)];
                text += u[pos % 6];
            } else if (pos == 6 && s.length > 7) { 
                 text += "ล้าน";
            }
        }
        return text;
    }

    return "(" + ReadNumber(num) + suffix + ")";
}
/* --- Function: Toggle Password Visibility (เพิ่มใหม่) --- */
function togglePassword(inputId, iconElement) {
    const input = document.getElementById(inputId);
    
    if (input.type === "password") {
        input.type = "text";
        iconElement.innerText = "visibility"; // เปลี่ยนไอคอนเป็นตาเปิด
        iconElement.style.color = "var(--secondary-color)";
    } else {
        input.type = "password";
        iconElement.innerText = "visibility_off"; // เปลี่ยนไอคอนเป็นตาปิด
        iconElement.style.color = "#adb5bd";
    }
}
function printBudgetOfficialReport() {
    // 1. ตรวจสอบข้อมูล
    if (!budgetDataCache || budgetDataCache.length === 0) {
        showAlert('กรุณารอโหลดข้อมูลสักครู่ หรือไม่มีข้อมูล', 'warning');
        return;
    }

    // ถามเรื่องหมายเหตุ (Note)
    Swal.fire({
        title: 'เตรียมพิมพ์รายงาน',
        text: 'คุณต้องการระบุหมายเหตุ (Note) เพิ่มเติมในรายงานหรือไม่',
        input: 'textarea',
        inputPlaceholder: 'ระบุข้อความที่นี่... (เช่น ข้อมูล ณ วันที่..., หมายเหตุเพิ่มเติม)',
        showCancelButton: true,
        confirmButtonText: 'พิมพ์ (พร้อมหมายเหตุ)',
        cancelButtonText: 'พิมพ์แบบปกติ',
        confirmButtonColor: '#1976D2',
        cancelButtonColor: '#757575'
    }).then((result) => {
        if (result.dismiss === Swal.DismissReason.backdrop || result.dismiss === Swal.DismissReason.esc) {
            return; 
        }

        const noteText = result.value || ''; 
        
        // --- ตั้งค่าวันที่และหัวกระดาษ ---
        const months = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
        const d = new Date();
        document.getElementById('budgetRepDate').textContent = `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear() + 543}`;
        
        // แสดงยอดผู้มีสิทธิ์ทั้งหมด
        if(document.getElementById('printTotalHeadCount') && window.globalEligibleCount) {
             document.getElementById('printTotalHeadCount').textContent = window.globalEligibleCount.toLocaleString();
        }

        // จัดการส่วนหมายเหตุ
        const noteContainer = document.getElementById('printNoteContainer');
        const noteContent = document.getElementById('printNoteText');
        if (noteContainer && noteContent) {
            if (noteText && result.isConfirmed) {
                noteContent.textContent = noteText;
                noteContainer.style.display = 'block';
            } else {
                noteContent.textContent = '';
                noteContainer.style.display = 'none';
            }
        }

        // 3. เตรียมตาราง (Internal / External)
        const tbodyInt = document.getElementById('budgetRepInternalBody');
        const tbodyExt = document.getElementById('budgetRepExternalBody');
        tbodyInt.innerHTML = '';
        tbodyExt.innerHTML = '';

        const welfareSubUnits = [
            "ทุนการศึกษา", "กองทุนเงินให้กู้ยืมเพื่อการศึกษา",
            "แนะแนวและให้คําปรึกษาสุขภาพจิต", "จัดหางานและจ้างงานระหว่างเรียน"
        ];

        let reportData = [];
        let welfareAgg = { department: "งานสวัสดิการนักศึกษา", allocated: 0, used: 0, studentCount: 0, source: 'internal' };
        let hasWelfareData = false;

        // รวมกลุ่มงานสวัสดิการ
        budgetDataCache.forEach(item => {
            const count = Number(item.studentCount || 0);
            if (item.source === 'internal' && welfareSubUnits.includes(item.department)) {
                welfareAgg.allocated += Number(item.allocated || 0);
                welfareAgg.used += Number(item.used || 0);
                welfareAgg.studentCount += count; 
                hasWelfareData = true;
            } else {
                reportData.push(item);
            }
        });

        if (hasWelfareData) reportData.push(welfareAgg);

        // เรียงลำดับหน่วยงาน
        const customOrder = ["งานบริหารทั่วไป", "งานศิษย์เก่าสัมพันธ์", "งานพัฒนานักศึกษา", "งานกีฬาและนันทนาการ", "งานสวัสดิการนักศึกษา", "งานวินัยและสวัสดิภาพนักศึกษา", "งบสำรอง"];
        reportData.sort((a, b) => {
            let idxA = customOrder.indexOf(a.department);
            let idxB = customOrder.indexOf(b.department);
            if (idxA === -1) idxA = 999;
            if (idxB === -1) idxB = 999;
            return idxA - idxB;
        });

        // ตัวแปรสำหรับเก็บผลรวมยอดเงิน 
        let sumIntAlloc = 0, sumIntUsed = 0; 
        let sumExtAlloc = 0, sumExtUsed = 0;
        
        // --- [เพิ่ม] ตัวแปรสำหรับเก็บผลรวมจำนวนคน (ตามหน้าตาราง) ---
        let sumIntCount = 0; 
        let sumExtCount = 0;
        // ---------------------------------------------------
        
        let iInt = 1, iExt = 1;
        const fmt = (num) => Number(num).toLocaleString('en-US', { maximumFractionDigits: 0 });

        // วนลูปสร้างแถวในตาราง
        reportData.forEach(item => {
            const allocated = Number(item.allocated) || 0;
            const used = Number(item.used) || 0;
            const count = Number(item.studentCount || 0);
            const balance = allocated - used;
            const source = item.source || 'internal';

            const rowHTML = `
                <tr>
                    <td style="text-align: center; border: 1px solid #000;">${source === 'internal' ? iInt++ : iExt++}</td>
                    <td style="border: 1px solid #000;">${item.budgetName && source === 'external' ? item.budgetName : item.department}</td>
                    <td style="text-align: right; border: 1px solid #000;">${fmt(allocated)}</td>
                    <td style="text-align: center; border: 1px solid #000;">${fmt(count)}</td>
                    <td style="text-align: right; border: 1px solid #000;">${fmt(used)}</td>
                    <td style="text-align: right; border: 1px solid #000;">${fmt(balance)}</td>
                </tr>
            `;

            if (source === 'internal') {
                tbodyInt.innerHTML += rowHTML;
                sumIntAlloc += allocated;
                sumIntUsed += used;
                sumIntCount += count; // [แก้ไข] บวกจำนวนคนสะสมตรงนี้เลย
            } else {
                tbodyExt.innerHTML += rowHTML;
                sumExtAlloc += allocated;
                sumExtUsed += used;
                sumExtCount += count; // [แก้ไข] บวกจำนวนคนสะสมตรงนี้เลย
            }
        });

        // 4. Update Footer Totals (ท้ายตาราง)
        document.getElementById('budgetRepIntAlloc').textContent = fmt(sumIntAlloc);
        document.getElementById('budgetRepIntUsed').textContent = fmt(sumIntUsed);
        document.getElementById('budgetRepIntBal').textContent = fmt(sumIntAlloc - sumIntUsed);
        
        // [แก้ไข] ใช้ยอด Sum ที่บวกจากลูป (เพื่อให้ตรงกับหน้าตารางเป๊ะๆ)
        document.getElementById('budgetRepIntCount').textContent = fmt(sumIntCount);

        // Update External Section
        const extSection = document.getElementById('budgetRepExternalSection');
        if (iExt > 1) {
            extSection.style.display = 'block';
            document.getElementById('budgetRepExtAlloc').textContent = fmt(sumExtAlloc);
            document.getElementById('budgetRepExtUsed').textContent = fmt(sumExtUsed);
            document.getElementById('budgetRepExtBal').textContent = fmt(sumExtAlloc - sumExtUsed);
            
            // [แก้ไข] ใช้ยอด Sum ที่บวกจากลูป
            document.getElementById('budgetRepExtCount').textContent = fmt(sumExtCount);
        } else {
            extSection.style.display = 'none';
        }

        // 5. สั่งพิมพ์
        const printContent = document.getElementById('printBudgetReportArea');
        const placeholder = document.createElement("div");
        printContent.parentNode.insertBefore(placeholder, printContent);
        document.body.appendChild(printContent);
        
        document.body.classList.add('print-mode-budget');
        printContent.style.display = 'block';

        setTimeout(() => {
            window.print();
            printContent.style.display = 'none';
            document.body.classList.remove('print-mode-budget');
            placeholder.parentNode.insertBefore(printContent, placeholder);
            placeholder.remove();
        }, 500);
    });
}

function loadJobsForTransferRecord() {
    showLoading();
    google.script.run.withSuccessHandler(jobs => {
        hideLoading();
        const tbody = document.querySelector('#transferJobTable tbody');
        tbody.innerHTML = '';
        
        if (!jobs || jobs.length === 0) {
            document.getElementById('noTransferJob').style.display = 'block';
        } else {
            document.getElementById('noTransferJob').style.display = 'none';
            jobs.forEach(group => {
                const row = tbody.insertRow();
                row.insertCell().innerHTML = `
                    <div style="font-weight:bold; color:#0d47a1;">${group.monthLabel}</div>
                    <small style="color:#666;">${group.count} รายการ</small>
                `;
                row.insertCell().textContent = group.agency;
                row.insertCell().innerHTML = `<div style="text-align:right; font-weight:bold;">${Number(group.totalAmount).toLocaleString()}</div>`;
                row.insertCell().innerHTML = `<div style="text-align:center;"><span class="badge-status-paid" style="background:#fff3cd; color:#856404;">รอโอนเงิน</span></div>`;
                
                // *** จุดสำคัญ: ส่งค่า group.month และ group.year ไปที่ฟังก์ชัน ***
                // ใช้ replace เพื่อป้องกัน error กรณีชื่อหน่วยงานมีเครื่องหมาย '
                const safeAgency = group.agency.replace(/'/g, "\\'"); 
                const btn = `<button class="btn btn-primary" onclick="openTransferDateModalGroup('${safeAgency}', '${group.monthLabel}', ${group.month}, ${group.year})" style="font-size:13px; padding:6px 12px;">
                                <i class="material-icons" style="font-size:14px; vertical-align:middle;">edit_calendar</i> ระบุวันโอน
                             </button>`;
                row.insertCell().innerHTML = `<div style="text-align:center;">${btn}</div>`;
            });
        }
    }).getJobsWaitingForTransfer(); 
}

function openTransferDateModalGroup(agency, monthLabel, monthIndex, yearAd) {
    // แสดงผล
    document.getElementById('modalTransferJobTitle').innerHTML = `
        <div style="font-size:16px; font-weight:bold;">${agency}</div>
        <div style="font-size:14px; color:#333;">ประจำเดือน: ${monthLabel}</div>
    `;
    
    // [สำคัญ] เก็บค่าลง Input ตัวใหม่ที่เราสร้างไว้
    document.getElementById('tf_agency').value = agency;
    document.getElementById('tf_month').value = monthIndex;
    document.getElementById('tf_year').value = yearAd;

    // ตั้งวันที่ปัจจุบัน
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('transferDateVal').value = today;
    
    document.getElementById('transferDateModal').style.display = 'flex';
}

function submitTransferDate() {
    // [สำคัญ] ดึงค่าจาก Input ตัวใหม่
    const agency = document.getElementById('tf_agency').value;
    const month = document.getElementById('tf_month').value;
    const year = document.getElementById('tf_year').value;
    const dateStr = document.getElementById('transferDateVal').value;
    
    if(!dateStr) { showAlert('กรุณาเลือกวันที่', 'warning'); return; }
    
    showLoading();
    
    google.script.run.withSuccessHandler(res => {
        hideLoading();
        if(res.success) {
            document.getElementById('transferDateModal').style.display = 'none';
            showAlert(res.message, 'success');
            loadJobsForTransferRecord(); // รีโหลดตาราง
        } else {
            showAlert(res.message, 'error');
        }
    }).updateTransferDateByGroup(agency, month, year, dateStr);
}

// [FIX] เพิ่ม agency เข้ามารับค่า
// 1. แก้ไขฟังก์ชันเปิด Modal (รับค่าและยัดใส่ Input)
function openTransferDateModal(jobTitle, agency) {
    // แสดงผลบนหน้าจอ
    document.getElementById('modalTransferJobTitle').innerHTML = `${jobTitle}<br><small style="color:#666; font-weight:normal;">หน่วยงาน: ${agency}</small>`;
    
    // [จุดสำคัญ] ยัดค่าลงใน Hidden Input
    document.getElementById('transferJobTitleVal').value = jobTitle;
    document.getElementById('transferJobAgencyVal').value = agency; // บรรทัดนี้สำคัญมาก

    // ตั้งค่าวันปัจจุบัน
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('transferDateVal').value = today;
    
    document.getElementById('transferDateModal').style.display = 'flex';
}
// --- Setup Menu ---
setupNavClick('navCheckStudentPay', 'checkStudentPaySection', () => {
    // รีเซ็ตหน้าจอเมื่อกดเข้ามา
    document.getElementById('checkPayStudentId').value = '';
    document.getElementById('checkPayResultArea').style.display = 'none';
    document.getElementById('cpNotFound').style.display = 'none';
});

// BLOCK 2: ตัวแปรและการค้นหา
let studentPayHistoryCache = [];
let groupedPayHistory = {};


function doSearchStudentPay() {
    const id = document.getElementById('checkPayStudentId').value.trim();
    if (!id) { showAlert('กรุณากรอกรหัสนักศึกษา', 'warning'); return; }
    
    showLoading();
    
    // 🛡️ ดึง Token จากระบบ
    const token = sessionStorage.getItem('sessionToken');
    
    google.script.run.withSuccessHandler(res => {
        hideLoading();
        const notFoundMsg = document.getElementById('cpNotFound');
        const mainContent = document.getElementById('checkPayMainContent');
        const searchBox = document.getElementById('checkPaySearchBox');
        
        if (res.success) {
            const d = res.data;
            document.getElementById('cpName').textContent = d.name || '-';
            document.getElementById('cpId').textContent = d.studentId || id;
            document.getElementById('cpFaculty').textContent = d.faculty || '-';
            document.getElementById('cpTotalAmount').textContent = Number(d.totalAmount).toLocaleString();
            
            if (d.history && d.history.length > 0) {
                notFoundMsg.style.display = 'none';
                mainContent.style.display = 'block';
                searchBox.style.display = 'none';
                studentPayHistoryCache = d.history;
                groupDataByMonthAndAgency(d.history);
                backToCheckPaySummary();
            } else {
                mainContent.style.display = 'none';
                notFoundMsg.style.display = 'block';
                notFoundMsg.innerHTML = `<i class="material-icons" style="font-size: 40px; display: block; margin-bottom:10px;">info</i> นักศึกษา <b>${d.name}</b><br>ยังไม่มีประวัติการเบิกจ่ายในระบบ`;
            }
        } else {
            // 🛠️ กรณี Error จาก Server (ไม่มีในระบบ หรือโดนเตะเรื่อง Token)
            mainContent.style.display = 'none';
            notFoundMsg.style.display = 'block';
            notFoundMsg.innerHTML = `<i class="material-icons" style="font-size: 40px; display: block; margin-bottom:10px;">highlight_off</i> ${res.message}`;
        }
    }).withFailureHandler(err => {
        hideLoading();
        showAlert(err.message, 'error');
    }).getStudentPaymentHistoryAdmin(token, id); // 🛡️ แนบ Token
}
// --- แก้ไขใน <script> index.html ---

// 2. ฟังก์ชันจัดกลุ่มข้อมูล (Group Data) - ใช้ getVal แล้ว
function groupDataByMonthAndAgency(history) {
    groupedPayHistory = {}; 

    history.forEach(item => {
        // ใช้ getVal ดึงวันที่
        const dateRaw = getVal(item, ['WorkDate', 'workDate', 'date']);
        let dateObj = parseDateString(dateRaw);
        if (!dateObj) dateObj = new Date(); 

        const monthNames = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
        
        let y = dateObj.getFullYear();
        if (y < 2400) y += 543; // แปลง ค.ศ. -> พ.ศ.

        const monthKey = `${monthNames[dateObj.getMonth()]} ${y}`;
        const sortKey = (y * 100) + (dateObj.getMonth() + 1);

        // ใช้ getVal ดึงหน่วยงาน
        const agency = getVal(item, ['Department', 'department', 'jobAgency', 'Agency']) || 'ไม่ระบุหน่วยงาน';
        
        const key = `${monthKey}|${agency}`; 

        if (!groupedPayHistory[key]) {
            groupedPayHistory[key] = {
                month: monthKey,
                agency: agency,
                sortKey: sortKey,
                count: 0,
                total: 0,
                items: []
            };
        }

        groupedPayHistory[key].count++;
        
        // ใช้ getVal ดึงเงิน
        let amountVal = parseFloat(String(getVal(item, ['Amount', 'amount'])).replace(/,/g, '')) || 0;
        if (amountVal === 0) amountVal = 150;

        groupedPayHistory[key].total += amountVal;
        groupedPayHistory[key].items.push(item);
    });

    renderSummaryGrid();
}

// --- แก้ไขฟังก์ชันแสดงผล (เพิ่มการเรียงลำดับ) ---

function renderSummaryGrid() {
    const container = document.getElementById('checkPaySummaryGrid');
    container.innerHTML = '';

    // แปลง Object เป็น Array แล้วเรียงลำดับตาม SortKey (เดือนล่าสุดขึ้นก่อน)
    const sortedGroups = Object.keys(groupedPayHistory)
        .map(key => ({ key, ...groupedPayHistory[key] }))
        .sort((a, b) => b.sortKey - a.sortKey); // เรียงมากไปน้อย (ล่าสุดขึ้นก่อน)

    if (sortedGroups.length === 0) {
        container.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:#999;">ไม่พบประวัติการเบิกจ่าย</div>';
        return;
    }

    sortedGroups.forEach(group => {
        const card = document.createElement('div');
        card.style.cssText = "background: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 15px; cursor: pointer; transition: all 0.2s; position: relative; overflow: hidden;";
        card.innerHTML = `
            <div style="position: absolute; top: 0; left: 0; width: 5px; height: 100%; background: #fb8c00;"></div>
            <div style="margin-left: 10px;">
                <div style="font-size: 14px; color: #888; font-weight: 500;">ประจำเดือน</div>
                <div style="font-size: 18px; font-weight: bold; color: #333;">${group.month}</div>
                <div style="border-top: 1px dashed #eee; margin: 10px 0; padding-top: 10px;">
                    <div style="font-size: 14px; color: #555;">
                        <i class="material-icons" style="font-size: 14px; vertical-align: middle;">business</i> ${group.agency}
                    </div>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 5px;">
                    <div style="font-size: 12px; background: #fff3e0; color: #e65100; padding: 2px 8px; border-radius: 10px;">${group.count} รายการ</div>
                    <div style="font-size: 16px; font-weight: bold; color: #2e7d32;">฿${group.total.toLocaleString()}</div>
                </div>
            </div>
        `;
        
        card.onmouseover = () => { card.style.transform = 'translateY(-3px)'; card.style.boxShadow = '0 5px 15px rgba(0,0,0,0.1)'; };
        card.onmouseout = () => { card.style.transform = 'translateY(0)'; card.style.boxShadow = 'none'; };
        card.onclick = () => showDetailView(group.key); // ใช้ key เดิมในการอ้างอิง

        container.appendChild(card);
    });
}

function renderSummaryGrid() {
    const container = document.getElementById('checkPaySummaryGrid');
    container.innerHTML = '';

    Object.keys(groupedPayHistory).forEach(key => {
        const group = groupedPayHistory[key];
        
        const card = document.createElement('div');
        card.style.cssText = "background: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 15px; cursor: pointer; transition: all 0.2s; position: relative; overflow: hidden;";
        card.innerHTML = `
            <div style="position: absolute; top: 0; left: 0; width: 5px; height: 100%; background: #fb8c00;"></div>
            <div style="margin-left: 10px;">
                <div style="font-size: 14px; color: #888; font-weight: 500;">ประจำเดือน</div>
                <div style="font-size: 18px; font-weight: bold; color: #333;">${group.month}</div>
                <div style="border-top: 1px dashed #eee; margin: 10px 0; padding-top: 10px;">
                    <div style="font-size: 14px; color: #555;">
                        <i class="material-icons" style="font-size: 14px; vertical-align: middle;">business</i> ${group.agency}
                    </div>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 5px;">
                    <div style="font-size: 12px; background: #fff3e0; color: #e65100; padding: 2px 8px; border-radius: 10px;">${group.count} รายการ</div>
                    <div style="font-size: 16px; font-weight: bold; color: #2e7d32;">฿${group.total.toLocaleString()}</div>
                </div>
            </div>
        `;
        
        card.onmouseover = () => { card.style.transform = 'translateY(-3px)'; card.style.boxShadow = '0 5px 15px rgba(0,0,0,0.1)'; };
        card.onmouseout = () => { card.style.transform = 'translateY(0)'; card.style.boxShadow = 'none'; };
        card.onclick = () => showDetailView(key);

        container.appendChild(card);
    });
}
// 4. ฟังก์ชันแสดงรายละเอียดในตาราง (Detail Table)
function showDetailView(groupKey) {
    const group = groupedPayHistory[groupKey];
    if (!group) return;

    document.getElementById('checkPaySummaryView').style.display = 'none';
    document.getElementById('checkPayDetailView').style.display = 'block';

    document.getElementById('detailHeaderTitle').textContent = `${group.month} - ${group.agency}`;
    document.getElementById('detailHeaderSubtitle').textContent = `รวมทั้งหมด ${group.count} รายการ | ยอดสุทธิ ${group.total.toLocaleString()} บาท`;

    // --- สร้างหัวตารางใหม่ (เพิ่มคอลัมน์ช่วงเวลา) ---
    const tableContainer = document.querySelector('#checkPayDetailView .table-container table thead');
    if(tableContainer) {
        tableContainer.innerHTML = `
            <tr style="background: #fff8e1;">
                <th style="width: 20%;">วันที่ทำงาน</th>
                <th style="width: 15%; text-align: center;">ช่วงเวลา</th> 
                <th>ชื่องาน / รายการ</th>
                <th style="width: 20%; text-align: right;">จำนวนเงิน</th>
                <th style="width: 20%; text-align: center;">สถานะ</th>
            </tr>
        `;
    }

    const tbody = document.getElementById('checkPayTableBody');
    tbody.innerHTML = '';

    // เรียงตามวันที่ (ล่าสุดขึ้นก่อน)
    group.items.sort((a, b) => {
        const da = parseDateString(getVal(a, ['WorkDate', 'date']));
        const db = parseDateString(getVal(b, ['WorkDate', 'date']));
        return db - da; 
    });

    group.items.forEach(item => {
        const tr = document.createElement('tr');
        
        // ดึงค่าต่างๆ อย่างปลอดภัย
        const workDate = getVal(item, ['WorkDate', 'workDate', 'date']);
        
        // ** ดึงช่วงเวลา (Session) **
        let session = getVal(item, ['Session', 'session', 'timeSlot']) || '-';
        
        // แปลงคำให้อ่านง่าย (ถ้าข้อมูลในฐานข้อมูลเป็นภาษาอังกฤษ)
        const sLower = String(session).toLowerCase();
        if(sLower === 'morning') session = 'เช้า';
        else if(sLower === 'afternoon') session = 'บ่าย';
        else if(sLower === 'evening') session = 'เย็น';
        else if(sLower === 'full' || sLower === 'เต็มวัน') session = 'เต็มวัน';

        const jobTitle = getVal(item, ['JobTitle', 'jobTitle', 'title', 'details']) || '-';
        const statusRaw = getVal(item, ['Status', 'status']);
        
        // คำนวณเงินรายบรรทัด (0=150)
        let amount = parseFloat(String(getVal(item, ['Amount', 'amount'])).replace(/,/g, '')) || 0;
        if (amount === 0) amount = 150;

        // แปลงสถานะเป็นภาษาไทยและใส่สี
        let statusText = statusRaw;
        let badgeStyle = "background:#eee; color:#555;";

        if (statusText === 'Approved' || statusText.includes('อนุมัติ')) {
            statusText = 'อนุมัติแล้ว';
            badgeStyle = "background:#e8f5e9; color:#2e7d32;"; 
        } else if (statusText === 'Pending' || statusText.includes('รอ')) {
            statusText = 'รอตรวจสอบ';
            badgeStyle = "background:#fff3e0; color:#ef6c00;";
        } else if (statusText === 'Submitted') {
            statusText = 'รอหน่วยงานตรวจสอบ';
            badgeStyle = "background:#e3f2fd; color:#1976D2;";
        } else if (statusText.includes('โอนเงินสำเร็จ') || statusText.includes('Paid')) {
            statusText = 'โอนเงินสำเร็จ';
            badgeStyle = "background:#e8f5e9; color:#0d47a1; border:1px solid #0d47a1;";
        }

        let statusBadge = `<span class="vf-badge" style="${badgeStyle}">${statusText}</span>`;

        tr.innerHTML = `
            <td>${workDate}</td>
            <td style="text-align: center; color: #555;">${session}</td> <td>${jobTitle}</td>
            <td style="text-align: right; font-weight: bold;">${amount.toLocaleString()}</td>
            <td style="text-align: center;">${statusBadge}</td>
        `;
        tbody.appendChild(tr);
    });
}

function backToCheckPaySummary() {
    document.getElementById('checkPayDetailView').style.display = 'none';
    document.getElementById('checkPaySummaryView').style.display = 'block';
}

function resetCheckPaySearch() {
    document.getElementById('checkPayStudentId').value = '';
    document.getElementById('checkPaySearchBox').style.display = 'block';
    document.getElementById('checkPayMainContent').style.display = 'none';
    document.getElementById('cpNotFound').style.display = 'none';
}
