// --- Setup Navigation for New Menus ---
    setupNavClick('navReportDisbursed', 'reportDisbursedSection', () => loadDisbursedReport());
    setupNavClick('navStudentFinance', 'studentFinanceSection', () => loadStudentFinance());

// --- Helper: Download CSV (แก้ไขภาษาต่างดาว) ---
function exportTableToCSV(tableId, filename) {
    let csv = [];
    const rows = document.querySelectorAll(`#${tableId} tr`);
    
    for (let i = 0; i < rows.length; i++) {
        let row = [], cols = rows[i].querySelectorAll("td, th");
        
        for (let j = 0; j < cols.length; j++) {
            // ดึงข้อความและตัดช่องว่างหัวท้าย พร้อมใส่เครื่องหมายคำพูดครอบเพื่อป้องกัน error กรณีมี comma ในข้อความ
            let data = cols[j].innerText.replace(/(\r\n|\n|\r)/gm, "").trim();
            row.push('"' + data.replace(/"/g, '""') + '"'); 
        }
        csv.push(row.join(","));
    }

    // *** จุดสำคัญที่แก้: เพิ่ม \uFEFF เพื่อบอกว่าเป็น UTF-8 (แก้ภาษาไทยเพี้ยน) ***
    const csvFile = new Blob(["\uFEFF" + csv.join("\n")], { type: "text/csv;charset=utf-8;" });
    
    const downloadLink = document.createElement("a");
    downloadLink.download = filename;
    
    // สร้าง Link สำหรับดาวน์โหลด
    if (window.navigator.msSaveOrOpenBlob) {
        // สำหรับ IE
        window.navigator.msSaveOrOpenBlob(csvFile, filename);
    } else {
        // สำหรับ Browser ทั่วไป
        downloadLink.href = window.URL.createObjectURL(csvFile);
        downloadLink.style.display = "none";
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink); // ลบ Link ทิ้งเมื่อกดแล้ว
    }
}

function loadDisbursedReport() {
    showLoading();
    backToDisbursedMaster();    
    
    // 🛡️ ดึง Token จากระบบ
    const token = sessionStorage.getItem('sessionToken');

    google.script.run
        .withSuccessHandler(list => {
            hideLoading();                  
            
            // กรองเฉพาะสถานะที่เกี่ยวข้อง
            const activeList = list.filter(item => 
                item.status === 'รอตรวจสอบข้อมูล' || 
                item.status === 'อนุมัติรอกองคลังโอนเงิน'
            );

            allDisbursedCache = activeList; 
            
            const tbody = document.querySelector('#disbursedMasterTable tbody');
            const noDataMsg = document.getElementById('noDisbursedMasterData');
            
            // ปรับหัวตารางให้สอดคล้องกับข้อมูลใหม่
            const theadRow = document.querySelector('#disbursedMasterTable thead tr');
            if(theadRow) {
                theadRow.innerHTML = `
                    <th>หน่วยงาน</th>
                    <th>จำนวนงานกิจกรรม</th>
                    <th style="text-align: center;">จำนวนรายการจ่าย</th>
                    <th style="text-align: right;">ยอดเงินรวม (บาท)</th>
                    <th style="text-align: center;">จัดการ</th>
                `;
            }
            
            tbody.innerHTML = '';
            
            if (!Array.isArray(activeList) || activeList.length === 0) {
                if(noDataMsg) noDataMsg.style.display = 'block';
                return;
            }
            if(noDataMsg) noDataMsg.style.display = 'none';

            // 1. จัดกลุ่มข้อมูลตาม "หน่วยงาน" (JobAgency)
            const grouped = activeList.reduce((acc, item) => {
                const key = item.jobAgency || item.department || 'ไม่ระบุหน่วยงาน'; 
                
                if (!acc[key]) {
                    acc[key] = {
                        groupName: key,
                        totalAmount: 0,
                        count: 0,
                        items: [],
                        jobTitles: new Set() 
                    };
                }
                acc[key].totalAmount += (Number(item.amount) || 0);
                acc[key].count += 1;
                acc[key].items.push(item);
                acc[key].jobTitles.add(item.jobTitle);
                return acc;
            }, {});
            
            // 2. แสดงผลในตาราง (เรียงตามชื่อหน่วยงาน)
            const sortedKeys = Object.keys(grouped).sort();

            sortedKeys.forEach(key => {
                const group = grouped[key];
                const row = tbody.insertRow();
                
                row.insertCell().innerHTML = `
                    <div style="font-weight:bold; font-size:15px; color:#0d47a1;">
                        <i class="material-icons" style="font-size:18px; vertical-align:text-bottom; margin-right:5px;">business</i>
                        ${group.groupName}
                    </div>
                `;
                
                row.insertCell().innerHTML = `<span style="color:#555;">${group.jobTitles.size} กิจกรรม</span>`;
                
                const countCell = row.insertCell();
                countCell.className = "text-center";
                countCell.innerHTML = `<span class="badge-count" style="font-size:14px;">${group.count} รายการ</span>`;
                
                const amountCell = row.insertCell();
                amountCell.className = "text-right font-weight-bold";
                amountCell.innerHTML = `<span style="color:var(--secondary-color); font-size:16px;">${group.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>`;
                
                const actionCell = row.insertCell();
                actionCell.style.textAlign = 'center';
                const btn = document.createElement('button');
                btn.className = 'btn btn-info';
                btn.innerHTML = '<i class="material-icons" style="vertical-align:middle; font-size:18px;">visibility</i> ดูรายชื่อ';
                btn.style.padding = '6px 12px';
                
                btn.onclick = () => openDisbursedDetail(group.groupName, "ภาพรวมรายการเบิกจ่าย", group.items);
                
                actionCell.appendChild(btn);
            });
        })
        .withFailureHandler(err => {
            hideLoading();
            console.error(err);
            Swal.fire('ข้อผิดพลาด', 'ไม่สามารถดึงข้อมูลรายงานได้: ' + err.message, 'error');
        })
        .getDisbursedHistory(token, currentUser.id); // 🛡️ แนบ Token ตรงนี้
}

// ----------------------------------------------------
// --- Function 2: Open Detail View and Render Table (NEW) ---
// ----------------------------------------------------

function openDisbursedDetail(jobTitle, jobAgency, items) {
    document.getElementById('disbursedMasterView').style.display = 'none';
    document.getElementById('disbursedDetailView').style.display = 'block';

    document.getElementById('detailDisbursedTitle').textContent = jobTitle;
    document.getElementById('detailDisbursedAgency').textContent = jobAgency;
    
    currentDisbursedGroup = { key: jobTitle, data: items }; // เก็บข้อมูลกลุ่มปัจจุบัน
    document.getElementById('searchDisbursedInput').value = ''; // Clear search
    
    // แสดงผลตาราง Detail View ครั้งแรก
    renderDisbursedDetailTable(jobTitle, items, '');
}


function renderDisbursedDetailTable(jobTitle, items, searchQuery = '') {
    const tbody = document.querySelector('#disbursedDetailTable tbody');
    const noDataMsg = document.getElementById('noDisbursedDetailData');
    
    tbody.innerHTML = '';
    
    let filteredItems = items;
    if (searchQuery) {
        const query = searchQuery.toLowerCase().trim();
        filteredItems = items.filter(item => {
            const searchBase = `${item.studentName} ${item.studentId} ${item.jobTitle} ${item.workDate}`.toLowerCase();
            return searchBase.includes(query);
        });
    }

    if (filteredItems.length === 0) {
        noDataMsg.style.display = 'block';
        return;
    }
    noDataMsg.style.display = 'none';

    filteredItems.forEach(item => {
        const row = tbody.insertRow();
        
        // 1. ชื่อนักศึกษา (รหัส)
        row.insertCell().innerHTML = `<div style="font-weight:600; color:#333;">${item.studentName || '-'}</div><div style="font-size:12px; color:#888;">${item.studentId || '-'}</div>`;
        
        // 2. วันที่ปฏิบัติงาน
        const workDateCell = row.insertCell();
        workDateCell.textContent = item.workDate || '-'; // ใช้ค่าที่มาจาก Backend (หวังว่าเป็น dd/MM/yyyy)
        workDateCell.className = "text-center";
        
        // 3. ยอดเงิน
        const amountCell = row.insertCell();
        const amountVal = Number(item.amount) || 0;
        amountCell.innerHTML = `<span style="color:var(--secondary-color); font-size:14px;">${amountVal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>`;
        amountCell.className = "text-right font-weight-bold";
        
        // 4. สถานะ
        const statusCell = row.insertCell();
        const statusText = item.status || 'จ่ายแล้ว';
        statusCell.className = "text-center";
let statusDisplay = '';
if (statusText === 'อนุมัติรอกองคลังโอนเงิน') {
    statusDisplay = `<span style="color:var(--success-color); font-weight:bold;"><i class="material-icons" style="font-size:14px; vertical-align:text-bottom;">check_circle</i> อนุมัติแล้ว</span>`;
} else if (statusText === 'โอนเงินสำเร็จ') {
    statusDisplay = `<span style="color:#0d47a1; font-weight:bold;"><i class="material-icons" style="font-size:14px; vertical-align:text-bottom;">paid</i> โอนเงินสำเร็จ</span>`;
} else {
    // รอตรวจสอบข้อมูล
    statusDisplay = `<span style="color:var(--warning-color); font-weight:bold;"><i class="material-icons" style="font-size:14px; vertical-align:text-bottom;">schedule</i> ${statusText}</span>`;
}
row.insertCell().innerHTML = statusDisplay;


        // 5. ปุ่มเครื่องมือ (สำหรับ Admin/Staff ที่มีสิทธิ์เปลี่ยนสถานะ)
        const actionCell = row.insertCell();
        actionCell.style.textAlign = 'center';
        
        // ปุ่มสำหรับ Admin/Staff ที่สามารถเปลี่ยนสถานะเป็น 'โอนเงินสำเร็จ' ได้
        if (currentUser.role !== 'user') {
             const changeStatusBtn = document.createElement('button');
             changeStatusBtn.className = 'btn btn-info';
             changeStatusBtn.innerHTML = '<i class="material-icons" style="font-size:16px;">edit</i>';
             changeStatusBtn.style.padding = '5px 10px';
             changeStatusBtn.style.fontSize = '12px';
             
             // ต้องหา RegId จาก items แต่ถ้า items มาจาก getDisbursedHistory จะไม่มี RegId
             // หากต้องการเปลี่ยนสถานะต้องเพิ่ม RegId ใน getDisbursedHistory (Code.gs)
             // ในตัวอย่างนี้ เราจะสมมติว่า item มี RegId อยู่แล้ว
             const regId = item.regId || 'N/A'; // สมมติว่ามี RegId
             
             // ตัวอย่างการเรียกฟังก์ชันเปลี่ยนสถานะ (สมมติว่าคุณมี RegId ใน item)
             if (regId !== 'N/A') {
                changeStatusBtn.onclick = () => confirmChangeDisbursedStatus(regId, item.studentName, item.jobTitle, item.status);
             } else {
                 changeStatusBtn.disabled = true;
             }
             actionCell.appendChild(changeStatusBtn);
        }
    });
}
// ----------------------------------------------------
// --- Function 3: Change Status Confirmation (NEW) ---
// ----------------------------------------------------
function confirmChangeDisbursedStatus(regId, studentName, jobTitle, currentStatus) {
    Swal.fire({
        title: 'อัปเดตสถานะการโอนเงิน',
        html: `คุณกำลังเปลี่ยนสถานะของ<br><b>${studentName}</b> (งาน: ${jobTitle})<br>สถานะปัจจุบัน: <b>${currentStatus}</b>`,
        icon: 'info',
        input: 'select',
inputOptions: {
    'รอตรวจสอบข้อมูล': 'รอตรวจสอบข้อมูล',
    'อนุมัติรอกองคลังโอนเงิน': 'อนุมัติรอกองคลังโอนเงิน'
},
        inputValue: currentStatus,
        showCancelButton: true,
        confirmButtonText: 'ยืนยันการเปลี่ยนแปลง',
        cancelButtonText: 'ยกเลิก'
    }).then((result) => {
        if (result.isConfirmed && result.value) {
            const newStatus = result.value;
            showLoading();
            google.script.run
                .withSuccessHandler(res => {
                    hideLoading();
                    if(res.success) {
                        showAlert(`เปลี่ยนสถานะเป็น "${newStatus}" สำเร็จ`, 'success');
                        // 1. อัปเดต Cache
                        const index = allDisbursedCache.findIndex(item => item.regId === regId);
                        if (index !== -1) {
                            allDisbursedCache[index].status = newStatus;
                        }
                        // 2. Refresh Detail View
                        if (currentDisbursedGroup) {
                            // ใช้ key/data เดิมในการ refresh
                            openDisbursedDetail(currentDisbursedGroup.key, currentDisbursedGroup.jobAgency, allDisbursedCache.filter(i => i.jobTitle === currentDisbursedGroup.key));
                        }
                    } else {
                        showAlert(res.message, 'error');
                    }
                })
                .updatePayrollStatus(regId, newStatus); 
        }
    });
}

function switchStudentFinanceTab(tab) {
    const claims = tab === 'claims';
    const claimPanel = document.getElementById('financeClaimTabPanel');
    const payrollPanel = document.getElementById('financePayrollTabPanel');
    const claimButton = document.getElementById('financeClaimTabButton');
    const payrollButton = document.getElementById('financePayrollTabButton');
    if (claimPanel) claimPanel.style.display = claims ? 'block' : 'none';
    if (payrollPanel) payrollPanel.style.display = claims ? 'none' : 'block';
    if (claimButton) { claimButton.className = 'btn ' + (claims ? 'btn-primary' : 'btn-secondary'); claimButton.setAttribute('aria-selected', String(claims)); }
    if (payrollButton) { payrollButton.className = 'btn ' + (claims ? 'btn-secondary' : 'btn-primary'); payrollButton.setAttribute('aria-selected', String(!claims)); }
}

function loadStudentFinance() {
    showLoading();
    google.script.run.withSuccessHandler(res => {
        hideLoading();
        if (!res.success) { showAlert('เกิดข้อผิดพลาด: ' + res.message, 'error'); return; }

        // อัปเดตกล่องสถานะ 3 สีด้านบน
        document.getElementById('stPendingTotal').innerText = res.orangeTotal.toLocaleString();
        document.getElementById('stDisbursedTotal').innerText = res.greenTotal.toLocaleString();
        document.getElementById('stGrandTotal').innerText = res.blueTotal.toLocaleString();

        const container = document.getElementById('studentPayContainer');
        container.innerHTML = '';

        // แบบเบิกจากงานที่สมัคร: รายละเอียดจริงอ่านจาก API ที่ตรวจสอบเจ้าของแบบเบิก
        const claimItems = Array.isArray(res.claimHistory) ? res.claimHistory : [];
        const claimContainer = document.getElementById('studentClaimHistoryContainer');
        const noClaims = document.getElementById('noStudentClaimHistory');
        if (claimContainer) claimContainer.innerHTML = '';
        const escapeClaimText = value => String(value == null ? '' : value)
            .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
        const monthsThai = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
            'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
        const validClaims = claimItems.filter(item => Number(item.count) > 0);
        if (noClaims) noClaims.style.display = validClaims.length ? 'none' : 'block';
        validClaims.forEach(item => {
            if (!claimContainer) return;
            const month = String(item.month || '');
            const parts = month.split('-');
            const year = Number(parts[0]);
            const mi = Number(parts[1]) - 1;
            const monthText = mi >= 0 && mi < 12 && year > 1900
                ? monthsThai[mi] + ' ' + (year > 2400 ? year : year + 543) : month;
            const card = document.createElement('details');
            card.className = 'finance-month-card student-claim-detail-card';
            card.style.cssText = 'border:1px solid #dbe4ee;border-radius:12px;margin-bottom:12px;padding:16px;background:#fff';
            card.innerHTML = '<summary style="cursor:pointer;display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between">' +
                '<strong>' + escapeClaimText(monthText) + ' — ' + Number(item.count) + ' รายการ</strong>' +
                '<span style="color:#15803d;font-weight:600">✓ ยืนยันแบบเบิกแล้ว</span></summary>' +
                '<div class="claim-month-content" style="margin-top:12px;color:#64748b">กดเปิดเพื่อดูรายละเอียดงาน...</div>';
            claimContainer.appendChild(card);
            let loaded = false;
            card.addEventListener('toggle', () => {
                if (!card.open || loaded) return;
                loaded = true;
                const content = card.querySelector('.claim-month-content');
                content.textContent = 'กำลังโหลดวันที่และช่วงเวลาที่เคยยืนยัน...';
                const token = sessionStorage.getItem('sessionToken') || localStorage.getItem('sessionToken');
                google.script.run.withSuccessHandler(result => {
                    if (!result || !result.success) {
                        content.textContent = (result && result.message) || 'ไม่สามารถโหลดรายละเอียดแบบเบิกได้';
                        loaded = false;
                        return;
                    }
                    const items = Array.isArray(result.items) ? result.items : [];
                    if (!items.length) { content.textContent = 'ไม่พบรายการที่ยืนยัน'; return; }
                    const slotMap = {morning:['08.30','12.00',3.5],afternoon:['13.00','16.30',3.5],evening:['16.30','20.00',3.5],multi:['08.30','16.30',7],full:['08.30','16.30',7]};
                    const days = new Map();
                    let totalHours = 0, totalAmount = 0;
                    let tableRows = '';
                    items.forEach(r => {
                        const day = String(r.date || '').slice(0,10);
                        const slot = String(r.slot || '').toLowerCase().trim();
                        const times = slotMap[slot] || ['', '', 0];
                        const arr = days.get(day) || [];
                        arr.push({row:r, times}); days.set(day, arr);
                    });
                    days.forEach((dayItems, date) => {
                        const hours = Math.min(7, dayItems.reduce((sum,x)=>sum+x.times[2],0));
                        const amount = hours >= 7 ? 300 : hours >= 3.5 ? 150 : 0;
                        totalHours += hours; totalAmount += amount;
                        dayItems.forEach((entry,i)=>{
                            const r=entry.row,t=entry.times;
                            tableRows += '<tr><td style="padding:9px;border-bottom:1px solid #e5e7eb">'+escapeClaimText(i ? '' : date)+'</td>'+
                                '<td style="padding:9px;border-bottom:1px solid #e5e7eb">'+escapeClaimText(r.title || '-')+'</td>'+
                                '<td style="padding:9px;border-bottom:1px solid #e5e7eb">'+escapeClaimText(r.agency || '-')+'</td>'+
                                '<td style="padding:9px;border-bottom:1px solid #e5e7eb">'+escapeClaimText(t[0] && t[1] ? t[0]+'–'+t[1]+' น.' : slot)+'</td>'+
                                '<td style="padding:9px;border-bottom:1px solid #e5e7eb;text-align:right">'+(i ? '' : hours)+'</td>'+
                                '<td style="padding:9px;border-bottom:1px solid #e5e7eb;text-align:right">'+(i ? '' : amount.toLocaleString('th-TH'))+'</td></tr>';
                        });
                    });
                    content.innerHTML = '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">' +
                        '<thead><tr style="background:#f1f5f9"><th>วันที่</th><th>ชื่องาน</th><th>หน่วยงาน</th><th>ช่วงเวลาที่สมัคร</th><th>ชม.</th><th>ค่าตอบแทน (บาท)</th></tr></thead>' +
                        '<tbody>'+tableRows+'</tbody></table></div>' +
                        '<div style="text-align:right;margin:12px 0;color:#0f172a;font-weight:700">รวม '+totalHours+' ชั่วโมง · ยอดตามแบบเบิก '+totalAmount.toLocaleString('th-TH')+' บาท</div>' +
                        '<button type="button" class="btn btn-primary claim-history-reprint"><i class="material-icons" style="vertical-align:middle;font-size:18px">print</i> พิมพ์แบบเบิกที่ยืนยันแล้ว</button>';
                    const btn = content.querySelector('.claim-history-reprint');
                    btn.addEventListener('click', () => {
                        if (typeof printStudentJobMonth !== 'function') return showAlert('ไม่พบฟังก์ชันพิมพ์แบบเบิก กรุณาตรวจสอบ core.js', 'error');
                        const monthItems = items.map(r=>({...r,dateKey:String(r.date || '').slice(0,10)}));
                        if (typeof studentMonthlyJobCache !== 'undefined') studentMonthlyJobCache[month] = monthItems;
                        printStudentJobMonth(month, null, monthItems.map(r=>r.id));
                    });
                }).withFailureHandler(err => { content.textContent = 'โหลดข้อมูลไม่สำเร็จ: ' + (err.message || err); loaded=false; })
                  .getMyConfirmedClaimPrintItems(token, month);
            });
        });

        if (!res.history || res.history.length === 0) {
            document.getElementById('noStudentPayHistory').style.display = 'block';
            return;
        }
        document.getElementById('noStudentPayHistory').style.display = 'none';

        // ============================================================
        // [Logic รวมยอด]
        // ============================================================
        const mergedHistory = [];
        const mapKey = {};

        res.history.forEach(h => {
            // +++++ [จุดที่แก้ไข] บังคับใช้ formatDate เพื่อให้เป็นไทยเสมอ +++++
            // ไม่ว่าค่าที่ส่งมาจะเป็น Tue Dec... หรือ 2025-12-30 ก็จะถูกแปลงเป็น "30 ธ.ค. 2568"
            const dateShow = formatDate(h.date || h.workDate); 
            // +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
            
            // ใช้ วันที่ + สถานะ เป็นตัวจับคู่เพื่อรวมเงิน
            const uniqueKey = dateShow + "|" + h.status;

            if (mapKey[uniqueKey]) {
                // เจอซ้ำ: บวกเงินเพิ่ม
                let existingItem = mapKey[uniqueKey];
                let oldAmt = parseFloat(String(existingItem.amount).replace(/,/g, '')) || 0;
                let addAmt = parseFloat(String(h.amount).replace(/,/g, '')) || 0;
                
                existingItem.amount = oldAmt + addAmt;
            } else {
                // ใหม่: สร้างรายการ
                let newItem = { ...h }; 
                newItem.displayDate = dateShow; // บันทึกวันที่แบบไทยเก็บไว้แสดงผล
                
                mapKey[uniqueKey] = newItem;
                mergedHistory.push(newItem);
            }
        });

        // จัดกลุ่มรายเดือน
        const groups = {};
        
        mergedHistory.forEach(h => {
            // แปลงวันที่จาก displayDate (ที่เป็นไทยแล้ว) กลับเป็นเดือนเพื่อจัดกลุ่ม
            let dateObj;
            // เนื่องจาก formatDate คืนค่าเป็น "30 ธ.ค. 2569" เราต้อง parse กลับนิดหน่อยเพื่อนับเดือน
            // หรือใช้วิธีง่ายๆ คือ parse จาก h.date (ค่าดิบ) อีกรอบเพื่อความแม่นยำในการจัดกลุ่ม
            let rawDateStr = h.date || h.workDate;
            if (rawDateStr) {
                 // ใช้ parseDateString ช่วยแปลงค่าดิบ
                 dateObj = parseDateString(rawDateStr);
            }
            if (!dateObj) dateObj = new Date(); 

            let y = dateObj.getFullYear();
            if (y < 2400) y += 543; 

            const monthNames = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
            const monthKey = `${monthNames[dateObj.getMonth()]} ${y}`;

            if (!groups[monthKey]) groups[monthKey] = { total: 0, items: [] };
            groups[monthKey].items.push(h);

            // คำนวณยอดรวมรายเดือน
            if (h.status === 'โอนเงินสำเร็จ' || h.status === 'อนุมัติรอกองคลังโอนเงิน') {
                groups[monthKey].total += parseFloat(String(h.amount).replace(/,/g, '')) || 0;
            }
        });

        // แสดงผล
        Object.keys(groups).forEach(monthKey => {
            const group = groups[monthKey];
            const card = document.createElement('div');
            card.className = 'finance-month-card';

            let rowsHtml = '';
            group.items.forEach(item => {
                let statusHtml = '';
                const showTransferDate = item.transferDate ? `<br><small style="color:#0d47a1; font-weight:bold; font-size:12px;">เงินเข้าวันที่: ${formatDate(item.transferDate)}</small>` : '';

                if (item.status === 'โอนเงินสำเร็จ') {
                    statusHtml = `<span style="color:#2e7d32; font-weight:bold;"><i class="material-icons" style="font-size:14px; vertical-align:text-bottom;">check_circle</i> ได้รับเงินแล้ว</span>${showTransferDate}`;
                } else if (item.status === 'อนุมัติรอกองคลังโอนเงิน') {
                     if (item.transferDate) {
                         statusHtml = `<span style="color:#f57c00; font-weight:bold;"><i class="material-icons" style="font-size:14px; vertical-align:text-bottom;">event</i> กองคลังกำหนดตั้งโอน</span>${showTransferDate}`;
                     } else {
                         statusHtml = `<span style="color:#f57c00; font-weight:bold;"><i class="material-icons" style="font-size:14px; vertical-align:text-bottom;">schedule</i> อนุมัติแล้ว รอกองคลังโอน</span>`;
                     }
                } else {
                    statusHtml = `<span style="color:#757575;">${item.status}</span>`;
                }

                // ใช้วันที่แบบไทยที่เตรียมไว้แล้ว
                const dateToShow = formatDate(item.workDate || item.date); 

    rowsHtml += `<tr>
        <td>${dateToShow}</td>  <td><div style="font-weight:600; color:#333;">${item.jobTitle || item.title}</div></td>
        <td style="text-align:right; font-weight:700; color:#1a237e;">${parseFloat(item.amount).toLocaleString()}</td>
        <td style="text-align:center;">${statusHtml}</td>
    </tr>`;
            });

            card.innerHTML = `
                <div class="finance-month-header">
                    <div class="month-info-group">
                        <div class="finance-month-title">${monthKey}</div>
                        <div class="item-count-badge">${group.items.length} รายการ</div>
                    </div>
                    <div class="finance-month-total">
                        <b>฿${group.total.toLocaleString()}</b>
                        <i class="material-icons expand-icon">expand_more</i>
                    </div>
                </div>
                <div class="finance-details" style="display:none;">
                    <table>
                        <thead>
                            <tr>
                                <th style="width:20%">วันที่ทำงาน</th>
                                <th style="width:40%">ชื่องาน</th>
                                <th style="width:15%; text-align:right;">จำนวนเงิน</th>
                                <th style="width:25%; text-align:center;">สถานะ</th>
                            </tr>
                        </thead>
                        <tbody>${rowsHtml}</tbody>
                    </table>
                </div>`;

            const header = card.querySelector('.finance-month-header');
            const details = card.querySelector('.finance-details');
            const icon = card.querySelector('.expand-icon');

            header.addEventListener('click', () => {
                const isHidden = details.style.display === 'none';
                details.style.display = isHidden ? 'block' : 'none';
                icon.innerText = isHidden ? 'expand_less' : 'expand_more';
            });

            container.appendChild(card);
        });
    }).getStudentFinancialStats(sessionStorage.getItem('sessionToken'), currentUser.id); // 🛡️ แนบ Token
}

    // --- Event Listener สำหรับการค้นหาในหน้า Detail ---
document.getElementById('searchDisbursedInput').addEventListener('input', (e) => {
    const query = e.target.value;
    renderDisbursedDetailTable(currentDisbursedGroup.key, currentDisbursedGroup.data, query);
});

// --- ฟังก์ชันสำหรับกลับไปหน้า Master View ---
function backToDisbursedMaster() {
    document.getElementById('disbursedDetailView').style.display = 'none';
    document.getElementById('disbursedMasterView').style.display = 'block';
    currentDisbursedGroup = null; // Clear cache
    document.getElementById('searchDisbursedInput').value = ''; // Clear search box
}


// --- 3. บันทึกข้อมูล (แก้ไขชื่อตัวแปรให้ตรงหัวตาราง) ---
    document.getElementById('paymentInfoForm').addEventListener('submit', (e) => {
        e.preventDefault();
        
        const bankName = document.getElementById('userBankName').value;
        const promptPay = document.getElementById('userPromptPay').value.replace(/\s+/g, '');

        if (!/^(\d{10}|\d{13})$/.test(promptPay)) {
            showAlert('กรุณาระบุเลขพร้อมเพย์เป็นตัวเลข 10 หรือ 13 หลัก', 'error');
            return;
        }

        // ตรวจสอบว่าระบบรู้จัก User หรือไม่
        if (!currentUser || !currentUser.id) {
            showAlert('ไม่พบข้อมูลผู้ใช้งาน (Session หลุด) กรุณา Login ใหม่', 'error');
            return;
        }

        showLoading();
        
        // รวมข้อมูลส่งไป Server (แก้ชื่อ Key ให้ตรงกับหัวตาราง Sheet: BankName, PromptPay)
        const data = {
            userId: currentUser.id,
            BankName: bankName,   // ต้องตัวใหญ่ตามหัวตาราง
            PromptPay: promptPay  // ต้องตัวใหญ่ตามหัวตาราง
        };

        google.script.run.withSuccessHandler(res => {
            hideLoading();
            if(res.success) {
                // อัปเดตข้อมูลฝั่งหน้าเว็บ
                currentUser.BankName = bankName;
                currentUser.PromptPay = promptPay;
                sessionStorage.setItem('currentUser', JSON.stringify(currentUser));
                
                showAlert('บันทึกข้อมูลสำเร็จ', 'success');
                updatePaymentUIState();
            } else {
                showAlert(res.message, 'error');
            }
       }).withFailureHandler(err => {
            hideLoading();
            showAlert('ไม่สามารถบันทึกข้อมูลพร้อมเพย์: ' + (err.message || err), 'error');
       }).saveUserFinancialInfo(sessionStorage.getItem('sessionToken'), data); // 🛡️ แนบ Token
    });

// --- ฟังก์ชันช่วยจัดการสถานะ UI (ล็อก/ปลดล็อก) ---
    // ====================================================================
// [HTML] ควบคุมการแสดงผลหน้าข้อมูลพร้อมเพย์
// ====================================================================

    // --- 1. เมื่อกดเมนู: เช็คสถานะเพื่อล็อกหรือไม่ล็อก ---
    setupNavClick('navPaymentInfo', 'paymentInfoSection', () => {
        // เช็คว่ามี User อยู่ไหม
        if (currentUser) {
            // เติมค่าลงฟอร์ม (รองรับชื่อตัวแปรทั้งพิมพ์เล็กและพิมพ์ใหญ่)
            const bp = currentUser.PromptPay || currentUser.promptpay || currentUser.promptPay || '';
            const bn = currentUser.BankName || currentUser.bankname || currentUser.bankName || '';

            document.getElementById('userBankName').value = bn;
            document.getElementById('userPromptPay').value = bp;
            
            updatePaymentUIState(); 
        }
    });


    function updatePaymentUIState() {
        const bp = currentUser.PromptPay || currentUser.promptpay || currentUser.promptPay || '';
        const bn = currentUser.BankName || currentUser.bankname || currentUser.bankName || ''
        const hasData = /^\d{10}$|^\d{13}$/.test(String(bp).replace(/\s/g, '')) && String(bn).trim().length > 0;
        const bankInput = document.getElementById('userBankName');
        const promptInput = document.getElementById('userPromptPay');
        const btnSave = document.getElementById('btnSavePayment');
        const btnEdit = document.getElementById('btnEditPayment');
        const statusAlert = document.getElementById('paymentStatusAlert');

        if (hasData) {
            bankInput.value = bn;
            promptInput.value = bp;
            promptInput.type = 'password'; // ซ่อนตัวเลขเต็มเมื่อบันทึกแล้ว
            
            bankInput.disabled = true;
            promptInput.disabled = true;
            bankInput.style.backgroundColor = "#e9ecef"; 
            promptInput.style.backgroundColor = "#e9ecef";

            if(statusAlert) {
                statusAlert.style.display = 'block';
                statusAlert.innerHTML = '<i class="material-icons" style="vertical-align: sub;">check_circle</i> <b>ท่านได้บันทึกข้อมูลเรียบร้อยแล้ว</b>';
            }

            if(btnSave) btnSave.style.display = 'none'; 
            if(btnEdit) btnEdit.style.display = 'inline-block'; 

        } else {
            bankInput.disabled = false;
            promptInput.disabled = false;
            promptInput.type = 'text';
            bankInput.style.backgroundColor = "#fff";
            promptInput.style.backgroundColor = "#fff";

            if(statusAlert) statusAlert.style.display = 'none';
            if(btnEdit) btnEdit.style.display = 'none';
            if(btnSave) btnSave.style.display = 'inline-block';
        }
    }


    document.getElementById('btnEditPayment').addEventListener('click', () => {
        document.getElementById('userBankName').disabled = false;
        document.getElementById('userPromptPay').disabled = false;
        document.getElementById('userPromptPay').type = 'text';
        document.getElementById('userBankName').style.backgroundColor = "#fff";
        document.getElementById('userPromptPay').style.backgroundColor = "#fff";
        document.getElementById('btnEditPayment').style.display = 'none';
        document.getElementById('btnSavePayment').style.display = 'inline-block';
        document.getElementById('paymentStatusAlert').style.display = 'none'; 
    });

    setupNavClick('navAdminReport', 'adminReportSection', () => {
        const selector = document.getElementById('reportJobSelector');
        if(selector) selector.value = ""; 

        document.getElementById('reportPreviewArea').style.display = 'none';
        document.getElementById('noReportData').style.display = 'none';
        document.getElementById('reportTableBody').innerHTML = '';
        document.getElementById('repGrandTotal').textContent = '0.00';
        loadReportJobOptions();
    });

let reportDataCache = []; 
let currentReportJobInfo = {}; 
let reportMonthDeptKey = '';

// ============================================================
// เดือนรายงานใช้ WorkDate / monthKey ส่วนตัวกรองวันที่อนุมัติใช้ Payroll Timestamp
// ============================================================
function getReportMonthMeta(item) {
    if (!item) return null;



    const backendMonthKey = String(item.monthKey || '').trim();
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(backendMonthKey)) {
        return { key: backendMonthKey, label: formatReportMonthLabel(backendMonthKey) };
    }
    const raw = item.workDate;
    if (!raw || raw === '-') return null;

    let year, month;
    const s = String(raw).trim();

    // dd/MM/yyyy
    let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) {
        month = Number(m[2]);
        year = Number(m[3]);
        if (year > 2400) year -= 543;
    } else {
        // yyyy-MM-dd
        m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
        if (m) {
            year = Number(m[1]);
            month = Number(m[2]);
            if (year > 2400) year -= 543;
        } else {
            const d = new Date(raw);
            if (isNaN(d.getTime())) return null;
            year = d.getFullYear();
            month = d.getMonth() + 1;
        }
    }

    if (!year || !month || month < 1 || month > 12) return null;
    const key = `${year}-${String(month).padStart(2, '0')}`;
    return { key, label: formatReportMonthLabel(key) };
}

function formatReportMonthLabel(monthKey) {
    const months = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
    const parts = String(monthKey || '').split('-');
    if (parts.length !== 2) return '-';
    const year = Number(parts[0]);
    const month = Number(parts[1]);
    if (!year || month < 1 || month > 12) return '-';
    return `${months[month - 1]} ${year + 543}`;
}

function reportApprovalDateKey(item) {
    const raw = String(item && item.approvalDate || '').trim();
    if (!raw) return '';
    let m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
        let year = Number(m[1]);
        if (year > 2400) year -= 543;
        return `${year}-${m[2]}-${m[3]}`;
    }
    m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) {
        let year = Number(m[3]);
        if (year > 2400) year -= 543;
        return `${year}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    }
    return '';
}

function matchesReportApprovalDate(item) {
    const from = document.getElementById('reportApprovalDateFrom')?.value || '';
    const to = document.getElementById('reportApprovalDateTo')?.value || '';
    if (!from && !to) return true;
    const approved = reportApprovalDateKey(item);
    if (!approved) return false; // ไม่มีวันอนุมัติ ห้ามเดาจาก WorkDate
    return (!from || approved >= from) && (!to || approved <= to);
}


// เลือกช่วงวันที่อนุมัติด้วยตัวเอง (ค่า input type=date เป็น YYYY-MM-DD)
// ยังไม่ดึงรายการงานจนกดปุ่ม "ดึงข้อมูล" และเปลี่ยนตัวกรองจะล้างผลเดิม
function updateReportApprovalFetchButton_() {
    const btn = document.getElementById('reportApprovalCheckBtn');
    const dept = document.getElementById('reportDeptSelector')?.value || '';
    const from = document.getElementById('reportApprovalDateFrom')?.value || '';
    const to = document.getElementById('reportApprovalDateTo')?.value || '';
    if (btn) btn.disabled = !(dept && from && to && from <= to);
}
function onReportAgencyChanged_() {
    ensureReportMonthSelector();
    const from = document.getElementById('reportApprovalDateFrom');
    const to = document.getElementById('reportApprovalDateTo');
    if (from) from.value = '';
    if (to) to.value = '';
    invalidateReportApprovalCheck();
    const hint = document.getElementById('reportApprovalCheckHint');
    if (hint) hint.textContent = 'เลือกวันที่เริ่มต้นและวันที่สิ้นสุดที่ต้องการ แล้วกด “ดึงข้อมูล”';
}
function onReportApprovalRangeChanged_() {
    invalidateReportApprovalCheck();
    const from = document.getElementById('reportApprovalDateFrom')?.value || '';
    const to = document.getElementById('reportApprovalDateTo')?.value || '';
    const hint = document.getElementById('reportApprovalCheckHint');
    if (!hint) return;
    if (from && to && from > to) {
        hint.textContent = 'ช่วงวันที่ไม่ถูกต้อง: วันที่เริ่มต้นต้องไม่เกินวันที่สิ้นสุด';
    } else if (from && to) {
        hint.textContent = 'ระบุช่วงวันที่แล้ว กด “ดึงข้อมูล” เพื่อค้นหารายการ Payroll ที่อนุมัติภายในช่วงนี้';
    } else {
        hint.textContent = 'กรุณาระบุวันที่เริ่มต้นและวันที่สิ้นสุดให้ครบ';
    }
}

function isReportAgencyMatch(item, selectedDept) {
    const itemAgency = item.jobAgency || item.department;
    return selectedDept === '__ALL_AGENCIES__' || (selectedDept === WELFARE_GROUP_NAME ? WELFARE_SUB_UNITS_LIST.includes(itemAgency) : itemAgency === selectedDept);
}

function ensureReportMonthSelector() {
    const deptSelect = document.getElementById('reportDeptSelector');
    const deptWrap = deptSelect && (deptSelect.closest('.clean-input-group') || deptSelect.parentElement);
    const jobArea = document.getElementById('jobSelectionArea');
    let box = document.getElementById('reportMonthAutoBox');
    let select = document.getElementById('reportMonthSelector');

    // Legacy HTML may not include the panel. Create it next to the agency selector,
    // NEVER inside jobSelectionArea (hidden until the user clicks Fetch).
    if (!box && deptWrap && deptWrap.parentNode) {
        box = document.createElement('div');
        box.id = 'reportMonthAutoBox';
        box.style.cssText = 'margin-bottom:16px;padding:14px 16px;background:#fff8e1;border:1px solid #ffe082;border-radius:8px;';
        box.innerHTML = `
        <div style="font-weight:600;color:#5d4037;margin-bottom:8px">2. เลือกช่วงวันที่เจ้าหน้าที่อนุมัติเบิกจ่ายเข้า Payroll</div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:end">
          <label for="reportApprovalDateFrom" style="flex:1;min-width:190px;font-weight:600">วันที่เริ่มต้น
            <input id="reportApprovalDateFrom" type="date" lang="th-TH" class="form-control" style="display:block;width:100%;min-height:42px;box-sizing:border-box;margin-top:5px;background:#fff;color:#0f172a" oninput="onReportApprovalRangeChanged_()" onchange="onReportApprovalRangeChanged_()">
          </label>
          <label for="reportApprovalDateTo" style="flex:1;min-width:190px;font-weight:600">วันที่สิ้นสุด
            <input id="reportApprovalDateTo" type="date" lang="th-TH" class="form-control" style="display:block;width:100%;min-height:42px;box-sizing:border-box;margin-top:5px;background:#fff;color:#0f172a" oninput="onReportApprovalRangeChanged_()" onchange="onReportApprovalRangeChanged_()">
          </label>
          <button type="button" id="reportApprovalCheckBtn" class="btn btn-primary" onclick="refreshReportByApprovalDate()" disabled>ดึงข้อมูล</button>
        </div>
        <div id="reportApprovalCheckHint" style="font-size:12px;color:#795548;margin-top:8px">เลือกหน่วยงานและระบุช่วงวันที่ เช่น 1–5 ต.ค. 2569 แล้วกด “ดึงข้อมูล”</div>
        <div id="reportMonthControls" style="display:none;margin-top:14px;padding-top:12px;border-top:1px solid #e9d49a">
          <label for="reportMonthSelector" style="display:block;font-weight:600;margin-bottom:7px;color:#5d4037">เดือนปฏิบัติงานที่พบ</label>
          <select id="reportMonthSelector" class="form-control" style="width:100%;max-width:360px" onchange="renderJobCheckboxes()"><option value="">-- เลือกประจำเดือน --</option></select>
        </div>`;
        deptWrap.parentNode.insertBefore(box, deptWrap.nextSibling);
        // If a legacy month selector already existed in a hidden panel, reuse it
        // instead of leaving duplicate IDs behind.
        if (select && !box.contains(select)) {
            const replacement = box.querySelector('#reportMonthSelector');
            if (replacement) replacement.replaceWith(select);
        }
    }

    // Repair an old layout where the whole date panel is inside a hidden jobs area.
    if (box && deptWrap && deptWrap.parentNode &&
        (box.parentNode !== deptWrap.parentNode || box.previousElementSibling !== deptWrap)) {
        deptWrap.parentNode.insertBefore(box, deptWrap.nextSibling);
    }
    if (box) {
        box.hidden = false;
        box.removeAttribute('aria-hidden');
        box.style.setProperty('display', 'block', 'important');
        box.style.visibility = 'visible';
        box.style.opacity = '1';
        ['reportApprovalDateFrom', 'reportApprovalDateTo'].forEach(id => {
            const input = box.querySelector('#' + id);
            if (input) {
                input.hidden = false;
                input.style.setProperty('display', 'block', 'important');
                input.style.minHeight = '42px';
                input.style.backgroundColor = '#fff';
                input.style.color = '#0f172a';
            }
        });
        if (jobArea && jobArea.contains(box)) {
            // Fail closed: never expose jobs merely to reveal the date fields.
            jobArea.style.display = 'none';
        }
    }
    return document.getElementById('reportMonthSelector');
}

// Never show old results for another agency or date range.
let reportApprovalRefreshRequestId = 0;
let reportApprovalVerifiedKey = '';
function reportApprovalSelectionKey_() {
    const dept = document.getElementById('reportDeptSelector')?.value || '';
    const from = document.getElementById('reportApprovalDateFrom')?.value || '';
    const to = document.getElementById('reportApprovalDateTo')?.value || '';
    return [dept, from, to].join('|');
}
function showReportCheckedResults_(visible) {
    const container = document.getElementById('jobCheckboxContainer');
    const month = document.getElementById('reportMonthControls');
    if (month) month.style.display = visible ? 'block' : 'none';
    const area = document.getElementById('jobSelectionArea');
    if (area) area.style.display = visible ? 'block' : 'none';
    if (container) {
        container.style.display = visible ? 'block' : 'none';
        if (container.previousElementSibling) container.previousElementSibling.style.display = visible ? 'block' : 'none';
        if (container.nextElementSibling) container.nextElementSibling.style.display = visible ? 'block' : 'none';
    }
    if (!visible) {
        if (container) container.innerHTML = '';
        const preview = document.getElementById('reportPreviewArea');
        if (preview) preview.style.display = 'none';
        const noData = document.getElementById('noReportData');
        if (noData) noData.style.display = 'none';
    }
}
function invalidateReportApprovalCheck() {
    reportApprovalRefreshRequestId++;
    reportApprovalVerifiedKey = '';
    reportMonthDeptKey = '';
    const checkBtn = document.getElementById('reportApprovalCheckBtn');
    if (checkBtn) checkBtn.disabled = false;
    showReportCheckedResults_(false);
    const hint = document.getElementById('reportApprovalCheckHint');
    if (hint) hint.textContent = 'ข้อมูลเปลี่ยนแล้ว กรุณากด “ดึงข้อมูล” เพื่อโหลดรายการใหม่';
    updateReportApprovalFetchButton_();
}
function refreshReportByApprovalDate() {
    const from = document.getElementById('reportApprovalDateFrom')?.value || '';
    const to = document.getElementById('reportApprovalDateTo')?.value || '';
    const dept = document.getElementById('reportDeptSelector')?.value || '';
    invalidateReportApprovalCheck();
    if (!dept) return showAlert('กรุณาเลือกหน่วยงานก่อนตรวจสอบ', 'warning');
    if (!from || !to) return showAlert('กรุณาเลือกวันที่เริ่มต้นและวันที่สิ้นสุดให้ครบ', 'warning');
    if (from && to && from > to) return showAlert('วันที่เริ่มต้นต้องไม่เกินวันที่สิ้นสุด', 'warning');
    const token = sessionStorage.getItem('sessionToken');
    if (!token) return showAlert('กรุณาเข้าสู่ระบบใหม่', 'error');
    const requestId = ++reportApprovalRefreshRequestId;
    const checkedKey = reportApprovalSelectionKey_();
    const btn = document.getElementById('reportApprovalCheckBtn');
    if (btn) btn.disabled = true;
    showLoading();
    google.script.run
        .withSuccessHandler(list => {
            if (requestId !== reportApprovalRefreshRequestId || checkedKey !== reportApprovalSelectionKey_()) return;
            hideLoading();
            if (btn) btn.disabled = false;
            if (!Array.isArray(list)) return showAlert('ข้อมูล Payroll ที่ได้รับไม่ถูกต้อง', 'error');
            reportDataCache = list;
            reportApprovalVerifiedKey = checkedKey;
            reportMonthDeptKey = dept;
            populateReportMonthOptions(dept);
            const monthSelect = document.getElementById('reportMonthSelector');
            const hint = document.getElementById('reportApprovalCheckHint');
            if (hint) hint.textContent = monthSelect && monthSelect.options.length > 1 ? 'ดึงข้อมูลสำเร็จ เลือกเดือนและรายการงานที่ต้องการออกรายงาน' : 'ตรวจสอบแล้ว ไม่พบรายการที่อนุมัติในช่วงวันที่เลือก';
            showReportCheckedResults_(true);
            renderJobCheckboxes();
        })
        .withFailureHandler(err => {
            if (requestId !== reportApprovalRefreshRequestId) return;
            hideLoading();
            if (btn) btn.disabled = false;
            showAlert('ตรวจสอบข้อมูลไม่สำเร็จ: ' + ((err && err.message) || String(err)), 'error');
        })
        .getDisbursedHistory(token, currentUser.id);
}

function populateReportMonthOptions(selectedDept) {
    const select = ensureReportMonthSelector();
    if (!select) return '';

    const monthMap = new Map();
    reportDataCache.forEach(item => {
        if (item.status !== 'อนุมัติรอกองคลังโอนเงิน') return;
        if (!isReportAgencyMatch(item, selectedDept)) return;
        if (!matchesReportApprovalDate(item)) return;
        const meta = getReportMonthMeta(item);
        if (meta) monthMap.set(meta.key, meta.label);
    });

    const monthOptions = Array.from(monthMap.entries())
        .map(([key, label]) => ({ key, label }))
        .sort((a, b) => b.key.localeCompare(a.key));

    select.innerHTML = '<option value="">-- เลือกประจำเดือน --</option>';
    monthOptions.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.key;
        opt.textContent = m.label;
        select.appendChild(opt);
    });

    // เมื่อกรองวันที่อนุมัติ เลือกเดือนปฏิบัติงานที่ตรงเงื่อนไขให้ทันที
    const hasDateFilter = !!(document.getElementById('reportApprovalDateFrom')?.value || document.getElementById('reportApprovalDateTo')?.value);
    if (monthOptions.length === 1 || (hasDateFilter && monthOptions.length > 0)) {
        select.value = monthOptions[0].key;
    }

    return select.value;
}

function loadReportJobOptions() {
    ensureReportMonthSelector();
    showLoading();
    
    const deptSelect = document.getElementById('reportDeptSelector');
    // Support older AppShell markup as well: the agency event always updates available dates.
    deptSelect.onchange = onReportAgencyChanged_;
    deptSelect.innerHTML = '<option value="">-- กรุณาเลือกหน่วยงาน --</option>';
    document.getElementById('jobSelectionArea').style.display = 'none';
    document.getElementById('reportPreviewArea').style.display = 'none';
    document.getElementById('noReportData').style.display = 'none';
    reportMonthDeptKey = '';
    reportApprovalVerifiedKey = '';
    reportApprovalRefreshRequestId++;
    const from = document.getElementById('reportApprovalDateFrom');
    const to = document.getElementById('reportApprovalDateTo');
    if (from) from.value = '';
    if (to) to.value = '';
    updateReportApprovalFetchButton_();
    // The date filter is always visible; jobs remain hidden until Fetch is clicked.
    document.getElementById('jobSelectionArea').style.display = 'none';
    ensureReportMonthSelector();
    showReportCheckedResults_(false);

    const token = sessionStorage.getItem('sessionToken');

    google.script.run.withSuccessHandler(list => {
        hideLoading();
        
        if (!Array.isArray(list) || list.length === 0) {
            reportDataCache = [];
            const hint = document.getElementById('reportApprovalCheckHint');
            if (hint) hint.textContent = 'ไม่พบรายการ Payroll หรือ Backend ไม่สามารถส่งข้อมูลมาได้ กรุณาตรวจข้อมูลและ Deployment';
            return;
        }

        reportDataCache = list; 
        const activeList = list.filter(item => item.status === 'อนุมัติรอกองคลังโอนเงิน');
        const rawDepts = [...new Set(activeList.map(item => item.jobAgency || item.department))].sort();
        const finalOptions = new Set();
        let hasWelfare = false;

        rawDepts.forEach(dept => {
            if (WELFARE_SUB_UNITS_LIST.includes(dept)) {
                hasWelfare = true; 
            } else if(dept) {
                finalOptions.add(dept);
            }
        });


        const select = document.getElementById('reportDeptSelector');
        const allOpt = document.createElement('option');
        allOpt.value = '__ALL_AGENCIES__';
        allOpt.textContent = 'รวมทุกหน่วยงาน (รายการอนุมัติทั้งหมด)';
        select.appendChild(allOpt);
        if (hasWelfare) {
            const opt = document.createElement('option');
            opt.value = WELFARE_GROUP_NAME;
            opt.textContent = WELFARE_GROUP_NAME;
            opt.style.fontWeight = "bold";
            opt.style.color = "var(--secondary-color)";
            select.appendChild(opt);
        }

        // เพิ่มหน่วยงานอื่นๆ
        finalOptions.forEach(dept => {
            const opt = document.createElement('option');
            opt.value = dept;
            opt.textContent = dept;
            select.appendChild(opt);
        });

    }).withFailureHandler(err => {
        hideLoading();
        showAlert('เกิดข้อผิดพลาดในการโหลดข้อมูล: ' + err.message, 'error');
    }).getDisbursedHistory(token, currentUser.id); // 🛡️ แนบ Token ตรงนี้
}

// --- 2. แสดง Checkbox งานตามหน่วยงาน + เดือน (รองรับเบิกย้อนหลัง) ---
function renderJobCheckboxes() {
    const selectedDept = document.getElementById('reportDeptSelector').value;
    const container = document.getElementById('jobCheckboxContainer');
    const selectionArea = document.getElementById('jobSelectionArea');

    container.innerHTML = '';
    document.getElementById('reportPreviewArea').style.display = 'none';

    const monthSelect = ensureReportMonthSelector();
    if (!monthSelect) return;
    if (!selectedDept || !reportApprovalVerifiedKey || reportApprovalVerifiedKey !== reportApprovalSelectionKey_()) {
        invalidateReportApprovalCheck();
        return;
    }
    showReportCheckedResults_(true);

    const selectedMonthKey = monthSelect.value;
    if (!selectedMonthKey) {
        container.innerHTML = '<div style="text-align:center;color:#8d6e63;padding:16px;">กรุณาเลือก <b>ประจำเดือน</b> ที่ต้องการสร้างรายงาน</div>';
        return;
    }

    // กรองตาม สถานะ + หน่วยงาน + เดือนของ WorkDate
    const jobsInDept = reportDataCache.filter(item => {
        if (item.status !== 'อนุมัติรอกองคลังโอนเงิน') return false;
        if (!isReportAgencyMatch(item, selectedDept)) return false;
        if (!matchesReportApprovalDate(item)) return false;
        const meta = getReportMonthMeta(item);
        return meta && meta.key === selectedMonthKey;
    });

    const uniqueJobs = [...new Set(jobsInDept.map(item => {
        if (selectedDept === WELFARE_GROUP_NAME || selectedDept === '__ALL_AGENCIES__') {
            return `[${item.jobAgency}] ${item.jobTitle}`;
        }
        return item.jobTitle;
    }))].sort();

    if (uniqueJobs.length === 0) {
        container.innerHTML = '<div style="text-align:center; color:#999; padding:10px;">ไม่พบรายการที่ตรงกับหน่วยงาน เดือนปฏิบัติงาน และวันที่อนุมัติที่เลือก</div>';
    } else {
        container.innerHTML = `
            <div style="padding-bottom:10px; border-bottom:1px solid #eee; margin-bottom:10px;">
                <label style="display: flex; align-items: center; cursor: pointer; font-weight: bold; color:#0d47a1;">
                    <input type="checkbox" onchange="toggleAllJobs(this)" style="width: 18px; height: 18px; margin-right: 10px;">
                    เลือกทั้งหมด (${uniqueJobs.length} งาน)
                </label>
            </div>
        `;

        uniqueJobs.forEach(displayTitle => {
            let realValue = displayTitle;
            let showText = displayTitle;

            if ((selectedDept === WELFARE_GROUP_NAME || selectedDept === '__ALL_AGENCIES__') && displayTitle.startsWith('[')) {
                const parts = displayTitle.split('] ');
                if(parts.length > 1) realValue = parts[1];
            }

            const wrapper = document.createElement('div');
            wrapper.style.padding = '5px 0';
            wrapper.style.borderBottom = '1px solid #f0f0f0';
            wrapper.innerHTML = `
                <label style="display: flex; align-items: center; cursor: pointer; margin: 0; font-weight: normal;">
                    <input type="checkbox" class="job-checkbox" value="${realValue}" data-display="${showText}" style="width: 18px; height: 18px; margin-right: 10px;">
                    ${showText}
                </label>
            `;
            container.appendChild(wrapper);
        });
    }
}

function toggleAllJobs(source) {
    const checkboxes = document.querySelectorAll('.job-checkbox');
    checkboxes.forEach(cb => cb.checked = source.checked);
}

// --- Helper: เลือกทั้งหมด / ล้างเลือก ---
function toggleAllJobs() {
    const checkboxes = document.querySelectorAll('.job-checkbox');
    // เช็คว่ามีตัวไหนยังไม่ติ๊กไหม
    const hasUnchecked = Array.from(checkboxes).some(cb => !cb.checked);
    
    checkboxes.forEach(cb => cb.checked = hasUnchecked);
}

// --- 3. สร้างรายงาน: บังคับเลือกเดือนก่อนสร้าง ---
function generateFinancialReport() {
    if (!reportApprovalVerifiedKey || reportApprovalVerifiedKey !== reportApprovalSelectionKey_()) {
        return showAlert('กรุณาเลือกวันที่และกดตรวจสอบรายการก่อนสร้างรายงาน', 'warning');
    }
    const selectedDept = document.getElementById('reportDeptSelector').value;
    const monthSelect = document.getElementById('reportMonthSelector');
    const selectedMonthKey = monthSelect ? monthSelect.value : '';
    const dateFrom = document.getElementById('reportApprovalDateFrom')?.value || '';
    const dateTo = document.getElementById('reportApprovalDateTo')?.value || '';
    if (dateFrom && dateTo && dateFrom > dateTo) {
        showAlert('ช่วงวันที่อนุมัติไม่ถูกต้อง: วันที่เริ่มต้นต้องไม่เกินวันที่สิ้นสุด', 'warning');
        return;
    }

    if (!selectedDept) {
        showAlert('กรุณาเลือกหน่วยงาน', 'warning');
        return;
    }
    if (!selectedMonthKey) {
        showAlert('กรุณาเลือกประจำเดือนที่ต้องการสร้างรายงาน', 'warning');
        return;
    }

    const checkedBoxes = document.querySelectorAll('.job-checkbox:checked');
    const selectedJobs = Array.from(checkedBoxes).map(cb => cb.value);

    if (selectedJobs.length === 0) {
        showAlert('กรุณาเลือกงานอย่างน้อย 1 งาน', 'warning');
        return;
    }

    const uniqueNames = [...new Set(selectedJobs)];
    if (selectedDept === '__ALL_AGENCIES__') {
        renderReportWithTitle(selectedDept, selectedJobs, 'มหาวิทยาลัยอุบลราชธานี', selectedMonthKey);
        return;
    }

    if (uniqueNames.length === 1) {
        renderReportWithTitle(selectedDept, selectedJobs, uniqueNames[0], selectedMonthKey);
    } else {
        const options = {};
        uniqueNames.forEach(name => { options[name] = name; });

        Swal.fire({
            title: 'เลือกชื่องานสำหรับหัวรายงาน',
            text: 'คุณเลือกงานที่มีชื่อต่างกัน กรุณาระบุชื่อที่จะแสดงบนหัวรายงาน',
            input: 'select',
            inputOptions: options,
            inputValue: uniqueNames[0],
            showCancelButton: true,
            confirmButtonText: 'สร้างรายงาน',
            cancelButtonText: 'ยกเลิก',
            inputValidator: (value) => {
                if (!value) return 'กรุณาเลือกชื่องาน';
            }
        }).then((result) => {
            if (result.isConfirmed) {
                renderReportWithTitle(selectedDept, selectedJobs, result.value, selectedMonthKey);
            }
        });
    }
}
/* --- ฟังก์ชันคำนวณยอดเงินและอัปเดตหน้าจอ (หัวใจสำคัญของการตัดงบ) --- */
function updatePrintPreview() {
    // Keep the printed heading consistent with the selected reporting scope.
    const reportAgencySelect = document.getElementById('reportDeptSelector');
    const reportUnitName = document.getElementById('repUnitName');
    if (reportAgencySelect && reportUnitName && reportAgencySelect.value === '__ALL_AGENCIES__') {
        reportUnitName.textContent = 'มหาวิทยาลัยอุบลราชธานี';
    }

    // Helper: ฟังก์ชันจัดรูปแบบตัวเลข (ไม่มีทศนิยม)
    const fmt = (num) => Number(num).toLocaleString('en-US', { maximumFractionDigits: 0 });

    // 1. ดึงค่าจากช่อง Input (แผงควบคุมสีเหลือง)
    const runNo = document.getElementById('inputRunNo').value;
    const month = document.getElementById('inputMonth').value;
    
    // แปลงค่าเงินเป็นตัวเลข (ถ้าช่องว่างให้เป็น 0)
    const allocated = parseFloat(document.getElementById('inputAllocated').value) || 0;
    const prevBalance = parseFloat(document.getElementById('inputPrevBalance').value) || 0;
    
    // ดึงรหัสแหล่งเงิน
    const sourceCode = document.getElementById('inputSourceCode').value; 

    // 2. ดึงยอดเบิกจ่ายครั้งนี้จากตาราง (ลบลูกน้ำออกก่อนคำนวณ)
    const currentText = document.getElementById('repGrandTotal').innerText.replace(/,/g, '');
    const currentWithdrawal = parseFloat(currentText) || 0;

    // 3. คำนวณยอดคงเหลือสุทธิ
    const alreadyWithdrawn = Number(document.getElementById('inputAlreadyWithdrawn')?.value || 0);
    const newBalance = prevBalance - currentWithdrawal;
    const year = Number(document.getElementById('inputFiscalYear')?.value || 2570);

    // 4. แสดงผลลงในกระดาษพิมพ์ (ใช้ fmt เพื่อตัดทศนิยม)
    // ส่วนบนขวา
    if(document.getElementById('printRunNo')) document.getElementById('printRunNo').innerText = runNo;
    if(document.getElementById('printYear')) document.getElementById('printYear').innerText = year;
    if(document.getElementById('printAlreadyWithdrawn')) document.getElementById('printAlreadyWithdrawn').innerText = fmt(alreadyWithdrawn);
    
    // ส่วนหัวกระดาษ
    if(document.getElementById('printMonthLabel')) document.getElementById('printMonthLabel').innerText = month;
    
    // ส่วนสรุปยอดเงินด้านล่าง
    if(document.getElementById('printAllocated')) document.getElementById('printAllocated').innerText = fmt(allocated);
    if(document.getElementById('printPrevBalance')) document.getElementById('printPrevBalance').innerText = fmt(prevBalance);
    if(document.getElementById('printCurrentWithdrawal')) document.getElementById('printCurrentWithdrawal').innerText = fmt(currentWithdrawal);
    
    // ยอดคงเหลือสุทธิ (แสดงค่าติดลบได้ถ้ามี)
    if(document.getElementById('printNewBalance')) document.getElementById('printNewBalance').innerText = fmt(newBalance);

    // รหัสแหล่งเงิน
    if(document.getElementById('printSourceCodeDisplay')) document.getElementById('printSourceCodeDisplay').innerText = sourceCode;
}

// --- แก้ไขฟังก์ชัน renderReportWithTitle (ปรับสัดส่วนตามรูปภาพ และย่อชื่อคณะ) ---
function renderReportWithTitle(selectedDept, selectedJobs, finalJobTitle, selectedMonthKey) {
    const isWelfareMode = (selectedDept === WELFARE_GROUP_NAME || selectedDept === '__ALL_AGENCIES__');

    // 1. กรองข้อมูลตาม หน่วยงาน + ชื่องาน + สถานะ + เดือนที่เลือก
    selectedMonthKey = selectedMonthKey || (document.getElementById('reportMonthSelector') ? document.getElementById('reportMonthSelector').value : '');
    const filtered = reportDataCache.filter(item => {
        const meta = getReportMonthMeta(item);
        return isReportAgencyMatch(item, selectedDept) &&
               selectedJobs.includes(item.jobTitle) &&
               item.status === 'อนุมัติรอกองคลังโอนเงิน' &&
               matchesReportApprovalDate(item) &&
               meta && meta.key === selectedMonthKey;
    });

    if(filtered.length === 0) {
        document.getElementById('reportPreviewArea').style.display = 'none';
        document.getElementById('noReportData').style.display = 'block';
        return;
    }

    document.getElementById('noReportData').style.display = 'none';
    document.getElementById('reportPreviewArea').style.display = 'block';

    // 2. รวมข้อมูลยอดเงิน (Aggregation)
    const studentMap = new Map();
    filtered.forEach(item => {
        const sid = String(item.studentId).trim();
        const key = isWelfareMode ? `${sid}_${item.jobAgency}` : sid;

        if(!studentMap.has(key)) {
            studentMap.set(key, {
                studentId: item.studentId,
                fullName: item.studentName || '-', 
                faculty: item.userFaculty || item.faculty || '-', 
                promptPay: item.promptPay || '-',
                email: item.email || '-',
                phone: item.phone || '-',
                totalAmount: 0,
                agency: item.jobAgency 
            });
        }
        const current = studentMap.get(key);
        if ((!current.email || current.email === '-') && item.email) current.email = item.email;
        if ((!current.phone || current.phone === '-') && item.phone) current.phone = item.phone;
        current.totalAmount += Number(item.amount || 0);
    });

// กำหนดลำดับคณะตามภาพที่คุณต้องการ
    const facultyOrder = [
        "วิทยาศาสตร์",
        "เกษตรศาสตร์",
        "วิศวกรรมศาสตร์",
        "ศิลปศาสตร์",
        "เภสัชศาสตร์",
        "บริหารศาสตร์",
        "พยาบาลศาสตร์",
        "วิทยาลัยแพทยศาสตร์และการสาธารณสุข",
        "ศิลปประยุกต์และสถาปัตยกรรมศาสตร์",
        "นิติศาสตร์",
        "รัฐศาสตร์",
        "ศึกษาศาสตร์" // เผื่อไว้กรณีมีคณะอื่น
    ];

    const aggregatedData = Array.from(studentMap.values()).sort((a,b) => {
        // 1. (สำหรับงานสวัสดิการ) ให้จัดกลุ่มตามหน่วยงานย่อยก่อน
        if (isWelfareMode) {
            const agencyCompare = String(a.agency).localeCompare(String(b.agency));
            if (agencyCompare !== 0) return agencyCompare;
        }

        // 2. จัดกลุ่มตามคณะ (ตามลำดับใน facultyOrder)
        let facA = String(a.faculty || '').replace(/^คณะ/, '').trim();
        let facB = String(b.faculty || '').replace(/^คณะ/, '').trim();

        let idxA = facultyOrder.indexOf(facA);
        let idxB = facultyOrder.indexOf(facB);

        // ถ้าหาชื่อคณะไม่เจอใน Array ให้เด้งไปอยู่ล่างสุด
        if (idxA === -1) idxA = 999;
        if (idxB === -1) idxB = 999;

        if (idxA !== idxB) {
            return idxA - idxB;
        }

        // 3. ภายในคณะเดียวกัน ให้เรียงตามรหัสนักศึกษา (จากน้อยไปมาก 65, 66, 67...)
        return String(a.studentId).localeCompare(String(b.studentId));
    });
    
    // 3. ตั้งค่าส่วนหัวรายงาน
    document.getElementById('repUnitName').textContent = selectedDept === '__ALL_AGENCIES__' ? 'มหาวิทยาลัยอุบลราชธานี' : (isWelfareMode ? 'งานสวัสดิการนักศึกษา' : getOfficialAgencyName(selectedDept));
    
    const selectedMonthLabel = formatReportMonthLabel(selectedMonthKey);
    document.getElementById('inputMonth').value = selectedMonthLabel;
    if(document.getElementById('printMonthLabel')) document.getElementById('printMonthLabel').textContent = selectedMonthLabel;

    const fmt = (num) => Number(num).toLocaleString('en-US', { maximumFractionDigits: 0 });

    let colWidths = {};
    
    if (isWelfareMode) {
        // งานสวัสดิการ: ให้พื้นที่ "หน่วยงาน" เยอะที่สุด
        colWidths = {
            no: "5%",       // ลำดับ
            agency: "23%",  // หน่วยงาน (เพิ่มเป็น 25% เพื่อรองรับชื่อยาวๆ)
            id: "13%",      // รหัสนักศึกษา (ปรับให้พอดีกับเลข 11 หลัก)
            name: "22%",    // ชื่อ-สกุล
            faculty: "13%", // คณะ (ลดลงนิดหน่อยเพื่อแบ่งให้หน่วยงาน)
            pp: "12%",      // พร้อมเพย์
            amt: "12%"      // เงิน
        };
    } else {
        // งานปกติ (ไม่มีคอลัมน์หน่วยงาน)
        colWidths = {
            no: "5%",
            id: "15%",
            name: "30%",   
            faculty: "20%",
            pp: "15%",
            amt: "15%"
        };
    }

    // 4. สร้าง Header ตาราง
    const thead = document.querySelector('#printArea thead tr');
    let headerHTML = `
        <th style="width: ${colWidths.no}; text-align: center; white-space: nowrap;">ลำดับ</th>
        ${isWelfareMode ? `<th style="width: ${colWidths.agency}; text-align: center;">หน่วยงาน</th>` : ''}
        <th style="width: ${colWidths.id}; text-align: center; white-space: nowrap;">รหัสนักศึกษา</th>
        <th style="width: ${colWidths.name}; text-align: center;">ชื่อผู้รับเงิน</th>
        <th style="width: ${colWidths.faculty}; text-align: center;">คณะ</th>
        <th style="width: ${colWidths.pp}; text-align: center;">เลขบัญชี (พร้อมเพย์)</th>
        <th style="width: ${colWidths.amt}; text-align: center; white-space: nowrap;">จำนวนเงิน (บาท)</th>
    `;
    thead.innerHTML = headerHTML;

    const tbody = document.getElementById('reportTableBody');
    tbody.innerHTML = '';
    let grandTotal = 0;

    aggregatedData.forEach((st, index) => {
        const tr = document.createElement('tr');
        grandTotal += st.totalAmount;

        const subUnitCell = isWelfareMode ? `<td style="text-align: left; vertical-align: top; padding-left:5px;">${st.agency}</td>` : '';

        // 🌟 --- ระบบจัดการย่อชื่อคณะ (กันตารางทะลุ/ตกบรรทัด) --- 🌟
        let displayFaculty = st.faculty;
        if (displayFaculty === 'วิทยาลัยแพทยศาสตร์และการสาธารณสุข') {
            displayFaculty = 'วิทยาลัยแพทยศาสตร์ฯ';
        }
        // -----------------------------------------------------

        tr.innerHTML = `
            <td style="text-align: center; vertical-align: top;">${index + 1}</td>
            ${subUnitCell}
            <td style="text-align: center; vertical-align: top;">${st.studentId}</td>
            <td style="text-align: left; vertical-align: top;">${st.fullName}</td>
            <td style="text-align: left; vertical-align: top;">${displayFaculty}</td>
            <td style="text-align: center; vertical-align: top;">${st.promptPay}</td>
            <td style="text-align: right; vertical-align: top;">${fmt(st.totalAmount)}</td>
        `;
        tbody.appendChild(tr);
    });

    document.getElementById('repGrandTotal').textContent = fmt(grandTotal);
    if (typeof BAHTTEXT === 'function') {
        document.getElementById('printBahtText').innerText = BAHTTEXT(grandTotal);
    }
    
    const footerLabelCell = document.querySelector('#printArea tfoot tr td:first-child');
    if(footerLabelCell) {
        footerLabelCell.colSpan = isWelfareMode ? 5 : 4; 
    }

    currentReportJobInfo = {
        jobTitle: finalJobTitle,
        data: aggregatedData,
        isWelfareMode: isWelfareMode,
        department: selectedDept,
        monthKey: selectedMonthKey,
        monthLabel: selectedMonthLabel,
        itemIds: [...new Set(filtered.map(x => String(x.payrollRowKey || '').trim()))].filter(Boolean)
    };

    // No stale placeholders: status must come from authenticated Backend before printing or cutting budget.
    window.paymentReportBudgetStatusReady = false;
    ['inputRunNo','inputAllocated','inputPrevBalance','inputAlreadyWithdrawn'].forEach(id => {
        const node = document.getElementById(id);
        if (node) node.value = '';
    });
    const cutButton = document.querySelector('button[onclick="confirmCutBudget()"]');
    if (cutButton) cutButton.disabled = true;
    showLoading();
    google.script.run.withSuccessHandler(res => {
        hideLoading();
        if (!res || res.success !== true || !Number.isInteger(Number(res.runNo)) || Number(res.runNo) < 1 ||
            !Number.isFinite(Number(res.allocated)) || Number(res.allocated) <= 0 ||
            !Number.isFinite(Number(res.prevBalance)) || Number(res.prevBalance) < 0 ||
            !Number.isInteger(Number(res.year))) {
            showAlert('โหลดเลขครั้งที่และงบประมาณได้รับจัดสรรไม่สำเร็จ: ' +
                (res && res.message ? res.message : 'ข้อมูลจาก Backend ไม่ครบหรือไม่ถูกต้อง กรุณาตรวจสอบ Deployment'), 'error');
            return;
        }
        document.getElementById('inputRunNo').value = res.runNo;
        document.getElementById('inputPrevBalance').value = res.prevBalance;
        document.getElementById('inputAllocated').value = res.allocated;
        if (document.getElementById('inputFiscalYear')) document.getElementById('inputFiscalYear').value = res.year;
        if (document.getElementById('inputAlreadyWithdrawn')) document.getElementById('inputAlreadyWithdrawn').value = res.withdrawnBefore;
        window.paymentReportBudgetStatusReady = true;
        if (cutButton) cutButton.disabled = false;
        updatePrintPreview();
    }).withFailureHandler(err => {
        hideLoading();
        showAlert('ไม่สามารถโหลดงบประมาณประจำปีและเลขครั้งที่จาก Backend: ' + (err && err.message ? err.message : String(err)), 'error');
    }).getLatestBudgetStatus(sessionStorage.getItem('sessionToken'));
}

// --- ฟังก์ชันดาวน์โหลดรายงานเบิกจ่าย ฉบับ Excel (.xls) แก้หน้าขาว 100% ---
// Real Office Open XML (.xlsx) export; no CDN or external library required.
// All personal identifiers are explicitly serialized as Excel text cells.
function paymentReportXlsxEscape_(value) {
    const normalized = String(value == null || value === '' ? '-' : value)
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '');
    return normalized.replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function paymentReportXlsxCol_(columnIndex) {
    let n = columnIndex, result = '';
    while (n > 0) {
        n--;
        result = String.fromCharCode(65 + (n % 26)) + result;
        n = Math.floor(n / 26);
    }
    return result;
}

function paymentReportXlsxCell_(row, column, value, style, numeric) {
    const reference = paymentReportXlsxCol_(column) + row;
    const numberValue = Number(value);
    if (numeric && Number.isFinite(numberValue)) {
        return `<c r="${reference}" s="${style}" t="n"><v>${numberValue}</v></c>`;
    }
    // inlineStr prevents Excel from interpreting =, + and other user text as a formula.
    return `<c r="${reference}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${paymentReportXlsxEscape_(value)}</t></is></c>`;
}

function paymentReportXlsxZip_(entries) {
    const encoder = new TextEncoder();
    const crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let crc = n;
        for (let k = 0; k < 8; k++) crc = (crc & 1) ? (0xEDB88320 ^ (crc >>> 1)) : (crc >>> 1);
        crcTable[n] = crc >>> 0;
    }
    const chunks = [], centralEntries = [];
    const dosDate = 0x0021; // Valid ZIP date: 1980-01-01 (year=0, month=1, day=1)
    let offset = 0;
    Object.keys(entries).forEach(name => {
        const path = encoder.encode(name);
        const payload = encoder.encode(entries[name]);
        let crc = 0xFFFFFFFF;
        for (let j = 0; j < payload.length; j++) crc = crcTable[(crc ^ payload[j]) & 0xFF] ^ (crc >>> 8);
        crc = (crc ^ 0xFFFFFFFF) >>> 0;
        const local = new Uint8Array(30 + path.length);
        const l = new DataView(local.buffer);
        l.setUint32(0, 0x04034B50, true);
        l.setUint16(4, 20, true); // ZIP version needed
        l.setUint16(6, 0x0800, true); // UTF-8
        l.setUint16(8, 0, true); // STORED; no compression dependency
        l.setUint16(12, dosDate, true); // Local file header: ZIP DOS date (not zero)
        l.setUint32(14, crc, true);
        l.setUint32(18, payload.length, true);
        l.setUint32(22, payload.length, true);
        l.setUint16(26, path.length, true);
        local.set(path, 30);
        chunks.push(local, payload);
        const central = new Uint8Array(46 + path.length);
        const c = new DataView(central.buffer);
        c.setUint32(0, 0x02014B50, true);
        c.setUint16(4, 20, true);
        c.setUint16(6, 20, true);
        c.setUint16(8, 0x0800, true);
        c.setUint16(10, 0, true);
        c.setUint16(14, dosDate, true); // Central directory: same valid DOS date
        c.setUint32(16, crc, true);
        c.setUint32(20, payload.length, true);
        c.setUint32(24, payload.length, true);
        c.setUint16(28, path.length, true);
        c.setUint32(42, offset, true);
        central.set(path, 46);
        centralEntries.push(central);
        offset += local.length + payload.length;
    });
    const centralLength = centralEntries.reduce((total, item) => total + item.length, 0);
    const end = new Uint8Array(22);
    const e = new DataView(end.buffer);
    e.setUint32(0, 0x06054B50, true);
    e.setUint16(8, centralEntries.length, true);
    e.setUint16(10, centralEntries.length, true);
    e.setUint32(12, centralLength, true);
    e.setUint32(16, offset, true);
    return new Blob([...chunks, ...centralEntries, end], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
}

function paymentReportXlsxTextIdentifier_(value) {
    // Google Sheets can store a leading apostrophe to force text; do not export that marker.
    return String(value == null ? '' : value).replace(/^'+/, '').trim() || '-';
}

function paymentReportBuildXlsx_(report) {
    const students = report.data;
    if (!Array.isArray(students) || students.length === 0) {
        throw new Error('ไม่มีแถวนักศึกษาในรายงาน กรุณาสร้างรายงานใหม่');
    }
    if (students.some(st => !st || (!String(st.studentId ?? '').trim() && !String(st.fullName ?? '').trim()))) {
        throw new Error('พบแถวรายงานที่ไม่มีรหัสนักศึกษาและชื่อ กรุณาดึงข้อมูลและสร้างรายงานใหม่');
    }
    const welfare = !!report.isWelfareMode;
    const cols = welfare
        ? ['ลำดับ', 'หน่วยงาน', 'รหัสนักศึกษา', 'ชื่อ-สกุล', 'คณะ', 'อีเมล', 'เบอร์โทรศัพท์', 'เลขบัญชี (พร้อมเพย์)', 'จำนวนเงิน (บาท)']
        : ['ลำดับ', 'รหัสนักศึกษา', 'ชื่อ-สกุล', 'คณะ', 'อีเมล', 'เบอร์โทรศัพท์', 'เลขบัญชี (พร้อมเพย์)', 'จำนวนเงิน (บาท)'];
    const lastCol = paymentReportXlsxCol_(cols.length);
    const lastDataRow = students.length + 6;
    let total = 0;
    const rows = [];
    const titleRows = [
        'รายงานการเบิกจ่ายค่าตอบแทนนักศึกษา',
        'หน่วยงาน: ' + report.agencyName,
        'ประจำเดือน: ' + report.monthYear,
        'รวมยอดเงินเบิกจ่ายทั้งสิ้น: ' + students.reduce((sum, st) => sum + (Number(st.totalAmount) || 0), 0).toLocaleString('th-TH', {minimumFractionDigits:2}) + ' บาท'
    ];
    titleRows.forEach((label, idx) => rows.push(`<row r="${idx + 1}" ht="25" customHeight="1">${paymentReportXlsxCell_(idx + 1, 1, label, idx === 0 ? 1 : 5)}</row>`));
    rows.push('<row r="5"/>');
    rows.push(`<row r="6" ht="35" customHeight="1">${cols.map((name, i) => paymentReportXlsxCell_(6, i + 1, name, 2)).join('')}</row>`);
    students.forEach((student, index) => {
        const rowIndex = index + 7;
        const fields = [index + 1];
        if (welfare) fields.push(student.agency);
        fields.push(paymentReportXlsxTextIdentifier_(student.studentId), student.fullName, student.faculty,
            student.email, paymentReportXlsxTextIdentifier_(student.phone),
            paymentReportXlsxTextIdentifier_(student.promptPay), Number(student.totalAmount) || 0);
        total += Number(student.totalAmount) || 0;
        rows.push(`<row r="${rowIndex}" ht="21" customHeight="1">${fields.map((val, col) => {
            const moneyColumn = col === fields.length - 1;
            return paymentReportXlsxCell_(rowIndex, col + 1, val, moneyColumn ? 4 : 3, moneyColumn);
        }).join('')}</row>`);
    });
    const totalRow = lastDataRow + 1;
    rows.push(`<row r="${totalRow}" ht="25" customHeight="1">${paymentReportXlsxCell_(totalRow, 1, 'รวมทั้งสิ้น', 5)}${paymentReportXlsxCell_(totalRow, cols.length, total, 6, true)}</row>`);
    const widths = welfare ? [8, 34, 20, 32, 34, 39, 21, 26, 20] : [8, 20, 32, 34, 39, 21, 26, 20];
    const colWidths = widths.map((width, index) => `<col min="${index+1}" max="${index+1}" width="${width}" customWidth="1"/>`).join('');
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
        `<dimension ref="A1:${lastCol}${totalRow}"/>` +
        `<sheetViews><sheetView workbookViewId="0"><pane ySplit="6" topLeftCell="A7" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
        `<sheetFormatPr defaultRowHeight="20"/>` +
        `<cols>${colWidths}</cols><sheetData>${rows.join('')}</sheetData>` +
        `<mergeCells count="4">${[1,2,3,4].map(n => `<mergeCell ref="A${n}:${lastCol}${n}"/>`).join('')}</mergeCells>` +
        `<autoFilter ref="A6:${lastCol}${lastDataRow}"/>` +
        `<pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>` +
        `</worksheet>`;
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
        `<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>` +
        `<fonts count="3">` +
        `<font><sz val="12"/><name val="TH Sarabun New"/></font>` +
        `<font><b/><sz val="12"/><color rgb="FFFFFFFF"/><name val="TH Sarabun New"/></font>` +
        `<font><b/><sz val="16"/><color rgb="FF17365D"/><name val="TH Sarabun New"/></font>` +
        `</fonts>` +
        `<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>` +
        `<fill><patternFill patternType="solid"><fgColor rgb="FF17365D"/><bgColor indexed="64"/></patternFill></fill></fills>` +
        `<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>` +
        `<border><left style="thin"><color rgb="FFE2E8F0"/></left><right style="thin"><color rgb="FFE2E8F0"/></right>` +
        `<top style="thin"><color rgb="FFE2E8F0"/></top><bottom style="thin"><color rgb="FFE2E8F0"/></bottom><diagonal/></border></borders>` +
        `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
        `<cellXfs count="7">` +
        `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
        `<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
        `<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>` +
        `<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"><alignment vertical="center"/></xf>` +
        `<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"><alignment horizontal="right" vertical="center"/></xf>` +
        `<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
        `<xf numFmtId="164" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyNumberFormat="1" applyBorder="1"/>` +
        `</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
        `</styleSheet>`;
    return paymentReportXlsxZip_({
        '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8"?>' +
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
            '<Default Extension="xml" ContentType="application/xml"/>' +
            '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
            '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
            '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
            '</Types>',
        '_rels/.rels': '<?xml version="1.0" encoding="UTF-8"?>' +
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
            '</Relationships>',
        'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8"?>' +
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
            '<sheets><sheet name="รายงานเบิกจ่าย" sheetId="1" r:id="rId1"/></sheets></workbook>',
        'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8"?>' +
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
            '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
            '</Relationships>',
        'xl/worksheets/sheet1.xml': xml,
        'xl/styles.xml': styles
    });
}

function downloadFinancialReportXlsxV2() {
    try {
        if (!currentReportJobInfo || !Array.isArray(currentReportJobInfo.data) || !currentReportJobInfo.data.length) {
            Swal.fire('แจ้งเตือน', 'กรุณาสร้างรายงานก่อนดาวน์โหลด Excel', 'warning');
            return;
        }
        const reportBody = document.getElementById('reportTableBody');
        const countOnReport = reportBody ? reportBody.querySelectorAll('tr').length : 0;
        if (countOnReport !== currentReportJobInfo.data.length) {
            throw new Error('ข้อมูลในตารางรายงานไม่ตรงกับข้อมูลส่งออก กรุณาสร้างรายงานใหม่ก่อนดาวน์โหลด');
        }
        const agencyName = (document.getElementById('repUnitName')?.textContent || 'รายงานการเบิกจ่าย').trim();
        const monthYear = (document.getElementById('inputMonth')?.value || '-').trim();
        const workbook = paymentReportBuildXlsx_({
            data: currentReportJobInfo.data,
            isWelfareMode: currentReportJobInfo.isWelfareMode,
            agencyName, monthYear
        });
        if (!(workbook instanceof Blob) || workbook.size < 1500) {
            throw new Error('ไฟล์ Excel มีขนาดไม่ถูกต้อง ระบบยกเลิกการดาวน์โหลด');
        }
        const total = currentReportJobInfo.data.reduce((sum, row) => sum + (Number(row.totalAmount) || 0), 0);
        const filename = `${agencyName.replace(/[\\/:*?"<>|\u0000-\u001F]/g, '_').replace(/\s+/g,'_').slice(0,64)}_${currentReportJobInfo.data.length}ราย_${total}บาท.xlsx`;
        const href = URL.createObjectURL(workbook);
        const link = document.createElement('a');
        link.href = href;
        link.download = filename;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
            link.remove();
            URL.revokeObjectURL(href);
        }, 1500);
    } catch (err) {
        console.error('XLSX export error:', err);
        Swal.fire('ข้อผิดพลาด', 'ไม่สามารถสร้างไฟล์ Excel .xlsx ได้: ' + (err?.message || String(err)), 'error');
    }
}


function downloadFinancialReportCSV() { return downloadFinancialReportXlsxV2(); }

    setupNavClick('navRecordDisbursement', 'recordDisbursementSection', () => loadRecordDisbursementData());

let recordDisbursementCache = { pending: [], closed: [] };
let currentRecordTab = 'pending';

// 1. โหลดข้อมูลจาก Server
function loadRecordDisbursementData() {
    showLoading();
    google.script.run.withSuccessHandler(res => {
        hideLoading();
        if (res.success) {
            recordDisbursementCache = res.data;
            updateRecordBadges();
            
            // 1. สร้างตัวเลือกหน่วยงานก่อน
            populateRecordDeptFilter();
            
            // 2. สั่งเปิดแท็บ Pending (ซึ่งจะไปเรียกฟังก์ชันกรองต่อ)
            switchRecordTab('pending');
        } else {
            showAlert(res.message, 'error');
        }
    }).getJobsForClosing();
}

// 2. สร้างตัวเลือกใน Dropdown (ตั้งค่าเริ่มต้นเป็นค่าว่าง)
function populateRecordDeptFilter() {
    const data = recordDisbursementCache.pending || [];
    const agencies = [...new Set(data.map(item => item.jobAgency))].sort();
    
    const select = document.getElementById('recordDeptFilter');
    // ตั้งค่า value="" เพื่อให้เงื่อนไขตรวจสอบทำงาน
    select.innerHTML = '<option value="">-- กรุณาเลือกหน่วยงาน --</option>';
    
    agencies.forEach(ag => {
        const opt = document.createElement('option');
        opt.value = ag;
        opt.textContent = ag;
        select.appendChild(opt);
    });
}

// 3. สลับแท็บ
function switchRecordTab(tab) {
    currentRecordTab = tab;
    
    // เปลี่ยนสีปุ่มแท็บ
    const btns = document.querySelectorAll('#recordDisbursementSection .reg-tab-btn');
    btns.forEach(b => b.classList.remove('active'));
    if(tab === 'pending') btns[0].classList.add('active');
    else btns[1].classList.add('active');

    // ซ่อน/แสดง แถบตัวกรอง (เฉพาะแท็บ Pending ถึงจะโชว์)
    const actionArea = document.getElementById('recordActionArea');
    if (actionArea) {
        actionArea.style.display = (tab === 'pending') ? 'flex' : 'none';
    }
    
    // *** จุดสำคัญ: เรียกฟังก์ชันกรอง เพื่อเช็คว่าเลือกหน่วยงานหรือยัง ***
    filterRecordTable();
}

// 4. ฟังก์ชันกรองและแสดงตาราง (หัวใจหลัก: ซ่อนข้อมูลถ้าไม่เลือกหน่วยงาน)
function filterRecordTable() {
    const tbody = document.querySelector('#recordDisbursementTable tbody');
    tbody.innerHTML = ''; // ล้างข้อมูลเก่าทิ้งทันที
    
    // ถ้าไม่ใช่แท็บ Pending (เช่นแท็บ "ปิดบัญชีแล้ว") ให้แสดงข้อมูลเลย ไม่ต้องรอเลือก
    if (currentRecordTab !== 'pending') {
        renderTableRows(recordDisbursementCache[currentRecordTab] || []);
        return;
    }

    // --- ส่วนเช็คการเลือกหน่วยงาน (เฉพาะแท็บ Pending) ---
    const filterDept = document.getElementById('recordDeptFilter').value;
    
    if (filterDept === "") {
        // ถ้ายังไม่เลือก -> แสดงข้อความแจ้งเตือน และซ่อนปุ่มปิดบัญชี
        const colCount = document.querySelectorAll('#recordDisbursementTable th').length;
        tbody.innerHTML = `
            <tr>
                <td colspan="${colCount}" style="text-align:center; padding: 40px; color: #999; background-color: #f9f9f9;">
                    <div style="font-size: 40px; margin-bottom: 10px;">👆</div>
                    <div style="font-size: 16px;">กรุณาเลือก <b>"หน่วยงาน"</b> ด้านบนก่อน</div>
                    <div style="font-size: 14px; color: #ccc;">ข้อมูลจะแสดงหลังจากท่านเลือกหน่วยงานแล้ว</div>
                </td>
            </tr>`;
        
        updateBulkButtonState(); // ปิดปุ่ม "ปิดบัญชี"
        document.getElementById('noRecordData').style.display = 'none';
        return; // จบการทำงาน ไม่วาดตารางข้อมูล
    }

    // ถ้าเลือกแล้ว -> กรองข้อมูลตามหน่วยงาน
    const rawData = recordDisbursementCache[currentRecordTab] || [];
    const filteredData = rawData.filter(item => item.jobAgency === filterDept);

    if (filteredData.length === 0) {
        document.getElementById('noRecordData').style.display = 'block';
    } else {
        document.getElementById('noRecordData').style.display = 'none';
        renderTableRows(filteredData);
    }
}

// 5. ฟังก์ชันย่อยสำหรับวาดแถว (แก้ไขหน่วยนับเป็น "รายการ")
function renderTableRows(data) {
    const tbody = document.querySelector('#recordDisbursementTable tbody');
    
    // Reset Checkbox หัวตาราง
    const selectAll = document.getElementById('selectAllRecord');
    if(selectAll) selectAll.checked = false;

    data.forEach(job => {
        const row = tbody.insertRow();
        
        // Col 1: Checkbox
        const checkCell = row.insertCell();
        checkCell.style.textAlign = 'center';
        
        if (currentRecordTab === 'pending') {
            checkCell.innerHTML = `<input type="checkbox" class="record-checkbox" data-title="${job.jobTitle}" data-agency="${job.jobAgency}" onchange="updateBulkButtonState()">`;
        } else {
            checkCell.innerHTML = `<i class="material-icons" style="color:#ccc; font-size:16px;">lock</i>`;
        }

        // Col 2-6: ข้อมูล
        row.insertCell().innerHTML = `<strong>${job.jobTitle}</strong>`;
        row.insertCell().textContent = job.jobAgency;
        
        // --- [จุดที่แก้ไข] เปลี่ยนจาก "คน" เป็น "รายการ" ---
        row.insertCell().innerHTML = `<div style="text-align:center;"><span class="badge-count">${job.count} รายการ</span></div>`;
        // ------------------------------------------------
        
        row.insertCell().innerHTML = `<div style="text-align:right; font-weight:bold; color:var(--secondary-color);">฿${job.totalAmount.toLocaleString()}</div>`;
        
        const statusCell = row.insertCell();
        statusCell.style.textAlign = 'center';
        
        if (currentRecordTab === 'pending') {
            statusCell.innerHTML = `<span class="badge-status-paid" style="background:#fff3cd; color:#856404;">รอปิดบัญชี</span>`;
        } else {
            statusCell.innerHTML = `<button class="btn btn-info" onclick="downloadClosedJobCSV('${job.jobTitle}')" style="padding:4px 8px; font-size:12px;"><i class="material-icons" style="vertical-align:middle; font-size:14px;">download</i> ส่งคลัง</button>`;
        }
    });

    // อัปเดตสถานะปุ่มหลังจากวาดเสร็จ
    updateBulkButtonState();
}

// 6. จัดการ Checkbox "เลือกทั้งหมด"
function toggleSelectAllRecord() {
    const isChecked = document.getElementById('selectAllRecord').checked;
    const checkboxes = document.querySelectorAll('.record-checkbox');
    checkboxes.forEach(cb => cb.checked = isChecked);
    updateBulkButtonState();
}

// 7. อัปเดตสถานะปุ่ม "ปิดบัญชีที่เลือก"
function updateBulkButtonState() {
    const checkedCount = document.querySelectorAll('.record-checkbox:checked').length;
    const btn = document.getElementById('btnBulkClose');
    
    if (checkedCount > 0) {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
        btn.innerHTML = `<i class="material-icons" style="vertical-align: middle;">done_all</i> ปิดบัญชี (${checkedCount})`;
    } else {
        btn.disabled = true;
        btn.style.opacity = '0.6';
        btn.style.cursor = 'not-allowed';
        btn.innerHTML = `<i class="material-icons" style="vertical-align: middle;">done_all</i> ปิดบัญชีที่เลือก`;
    }
}

// 8. ฟังก์ชันยืนยันการปิดบัญชีหมู่
function confirmBulkClose() {
    const checkboxes = document.querySelectorAll('.record-checkbox:checked');
    if (checkboxes.length === 0) return;

    const selectedJobs = Array.from(checkboxes).map(cb => ({
        title: cb.getAttribute('data-title'),
        agency: cb.getAttribute('data-agency')
    }));

    Swal.fire({
        title: 'ยืนยันการปิดบัญชี',
        html: `คุณต้องการปิดบัญชีจำนวน <b>${selectedJobs.length} รายการ</b> ใช่หรือไม่?<br><small style="color:red;">*เมื่อปิดแล้ว รายการจะถูกย้ายไปยังสถานะ "โอนเงินสำเร็จ"</small>`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#28a745',
        confirmButtonText: 'ยืนยันปิดบัญชี',
        cancelButtonText: 'ยกเลิก'
    }).then((result) => {
        if (result.isConfirmed) {
            showLoading();
            google.script.run.withSuccessHandler(res => {
                hideLoading();
                if (res.success) {
                    Swal.fire('สำเร็จ', res.message, 'success');
                    loadRecordDisbursementData();
                } else {
                    Swal.fire('เกิดข้อผิดพลาด', res.message, 'error');
                }
            }).closeBatchJobs(selectedJobs);
        }
    });
}

    // --- เพิ่มฟังก์ชันใหม่ ต่อท้าย switchRecordTab ---

    function downloadClosedJobCSV(jobTitle) {
        showLoading();
        google.script.run.withSuccessHandler(res => {
            hideLoading();
            if(!res.success) {
                showAlert(res.message || 'ไม่พบข้อมูล', 'error');
                return;
            }

            // สร้าง CSV
            const list = res.data;
            if(list.length === 0) { showAlert('ไม่มีรายชื่อในงานนี้', 'warning'); return; }

            let csv = [];
            // Header
            csv.push(`"รายงานการเบิกจ่าย (ปิดบัญชี)","${jobTitle}"`);
            csv.push(`"ลำดับ","รหัสนักศึกษา","ชื่อ-สกุล","คณะ","เลขบัญชี(พร้อมเพย์)","จำนวนเงิน"`);

            // Rows (Aggregation รวมยอดเงินคนเดิมให้อัตโนมัติจาก Backend)
            list.forEach((st, index) => {
                csv.push(`"${index + 1}","'${st.studentId}","${st.studentName}","${st.userFaculty}","'${st.promptPay}","${st.amount}"`);
            });

            // Download Logic
            const csvFile = new Blob(["\uFEFF" + csv.join("\n")], { type: "text/csv;charset=utf-8;" });
            const downloadLink = document.createElement("a");
            downloadLink.download = `closed_report_${jobTitle}.csv`;
            downloadLink.href = window.URL.createObjectURL(csvFile);
            downloadLink.style.display = "none";
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);

        }).getReportForClosedJob(jobTitle); // เรียก Backend ตัวใหม่
    }

    function updateRecordBadges() {
        document.getElementById('countRecordPending').textContent = recordDisbursementCache.pending.length;
        document.getElementById('countRecordClosed').textContent = recordDisbursementCache.closed.length;
    }

    // --- 4. Confirm Close Job ---
    function confirmCloseJob(jobTitle) {
        Swal.fire({
            title: 'ยืนยันการปิดบัญชี',
            html: `คุณต้องการบันทึกการเบิกจ่ายงาน <b>"${jobTitle}"</b> ใช่หรือไม่<br><small style="color:red;">*เมื่อบันทึกแล้ว งานนี้จะไม่แสดงในหน้ารายงานอีก</small>`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#28a745',
            confirmButtonText: 'ยืนยันปิดบัญชี',
            cancelButtonText: 'ยกเลิก'
        }).then((result) => {
            if (result.isConfirmed) {
                showLoading();
                google.script.run.withSuccessHandler(res => {
                    hideLoading();
                    if(res.success) {
                        showAlert('ปิดบัญชีเรียบร้อย', 'success');
                        loadRecordDisbursementData(); // โหลดข้อมูลใหม่
                    } else {
                        showAlert(res.message, 'error');
                    }
                }).closeJobAccount(jobTitle);
            }
        });
    }
    // --- Setup Navigation สำหรับเมนูใหม่ ---
    setupNavClick('navHistoryLog', 'historyLogSection', () => {
        populateDepartments('historyDeptFilter');
        loadHistoryData();
    });

    setupNavClick('navMonthlyReport', 'monthlyReportSection', () => {
        populateDepartments('reportDeptFilter');
        // ตั้งค่าเดือนปัจจุบัน
        const d = new Date();
        document.getElementById('reportMonth').value = d.getMonth() + 1;
        document.getElementById('reportYear').value = d.getFullYear() + 543;
        loadMonthlyReportData();
    });

    // --- Function: Load Disbursement History ---
    function loadHistoryData() {
        showLoading();
        const dept = document.getElementById('historyDeptFilter').value;
        const search = document.getElementById('historySearchInput').value;

        // **หมายเหตุ: คุณต้องสร้างฟังก์ชัน getDisbursementHistoryLog ใน Code.gs**
        google.script.run.withSuccessHandler(data => {
            hideLoading();
            const tbody = document.querySelector('#historyLogTable tbody');
            tbody.innerHTML = '';

            // กรองข้อมูลเบื้องต้นที่ฝั่ง Client (หรือจะทำที่ Server ก็ได้)
            let filtered = data;
            if (dept) filtered = filtered.filter(item => item.department === dept);
            if (search) filtered = filtered.filter(item => item.project.toLowerCase().includes(search.toLowerCase()));

            if (filtered.length === 0) {
                document.getElementById('noHistoryData').style.display = 'block';
                return;
            }
            document.getElementById('noHistoryData').style.display = 'none';

            filtered.forEach(item => {
                const row = tbody.insertRow();
                row.insertCell().textContent = formatDate(item.date); // ใช้วันที่เบิกจ่ายจริง
                row.insertCell().innerHTML = `<strong>${item.project}</strong>`;
                row.insertCell().textContent = item.department;
                
                // ยอดเบิก
                const amountCell = row.insertCell();
                amountCell.style.textAlign = 'right';
                amountCell.style.color = '#d32f2f'; // สีแดงเพราะเป็นยอดจ่าย
                amountCell.textContent = Number(item.amount).toLocaleString();

                // งบคงเหลือ (Backend ต้องคำนวณมาให้ หรือคำนวณสดที่นี่ถ้ารู้ยอดตั้งต้น)
                const balCell = row.insertCell();
                balCell.style.textAlign = 'right';
                balCell.style.fontWeight = 'bold';
                balCell.style.color = 'green';
                balCell.textContent = Number(item.balanceAfter).toLocaleString(); 
            });

        }).getDisbursementHistoryLog(); 
    }

    // --- Function: Load Monthly Report ---
    let currentReportData = []; // เก็บไว้สำหรับ Export

    function loadMonthlyReportData() {
        showLoading();
        const month = document.getElementById('reportMonth').value;
        const year = document.getElementById('reportYear').value;
        const dept = document.getElementById('reportDeptFilter').value;

        // **หมายเหตุ: คุณต้องสร้างฟังก์ชัน getMonthlyReport ใน Code.gs**
        google.script.run.withSuccessHandler(res => {
            hideLoading();
            const tbody = document.querySelector('#monthlyReportTable tbody');
            tbody.innerHTML = '';
            
            if (!res.data || res.data.length === 0) {
                document.getElementById('noReportResult').style.display = 'block';
                // Reset stats
                document.getElementById('repTotalCount').innerText = '0';
                document.getElementById('repTotalAmount').innerText = '0';
                document.getElementById('repActiveDept').innerText = '0';
                currentReportData = [];
                return;
            }
            document.getElementById('noReportResult').style.display = 'none';

            currentReportData = res.data; // เก็บข้อมูลเข้า Cache

            // Update Stats Cards
            document.getElementById('repTotalCount').innerText = res.summary.count.toLocaleString();
            document.getElementById('repTotalAmount').innerText = res.summary.totalAmount.toLocaleString();
            document.getElementById('repActiveDept').innerText = res.summary.activeDeptCount.toLocaleString();

            // Render Table
            res.data.forEach(item => {
                const row = tbody.insertRow();
                row.insertCell().textContent = formatDate(item.date);
                row.insertCell().textContent = item.department;
                row.insertCell().textContent = item.project;
                
                const amountCell = row.insertCell();
                amountCell.textContent = Number(item.amount).toLocaleString();
                amountCell.style.fontWeight = 'bold';

                // Status
                row.insertCell().innerHTML = `<span class="badge-status-paid">เบิกจ่ายแล้ว</span>`;
            });

        }).getMonthlyReport(month, year, dept);
    }

    // --- Function: Export Report to CSV ---
    function exportMonthlyReportCSV() {
        if (currentReportData.length === 0) {
            showAlert('ไม่มีข้อมูลให้ดาวน์โหลด', 'warning');
            return;
        }

        const monthName = document.getElementById('reportMonth').options[document.getElementById('reportMonth').selectedIndex].text;
        const year = document.getElementById('reportYear').value;

        let csv = [];
        // Header
        csv.push(`"รายงานประจำเดือน ${monthName} ${year}"`);
        csv.push(`"วันที่","หน่วยงาน","โครงการ","จำนวนเงิน","สถานะ"`);

        // Rows
        currentReportData.forEach(item => {
             // Clean strings to prevent CSV errors
             const cleanDept = item.department.replace(/"/g, '""');
             const cleanProj = item.project.replace(/"/g, '""');
             csv.push(`"${formatDate(item.date)}","${cleanDept}","${cleanProj}","${item.amount}","เบิกจ่ายแล้ว"`);
        });

        // Download
        const csvFile = new Blob(["\uFEFF" + csv.join("\n")], { type: "text/csv;charset=utf-8;" });
        const downloadLink = document.createElement("a");
        downloadLink.download = `Monthly_Report_${monthName}_${year}.csv`;
        downloadLink.href = window.URL.createObjectURL(csvFile);
        downloadLink.style.display = "none";
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
    }
    const SESSION_TIMEOUT_MS = 10 * 60 * 1000; 
    let sessionTimer;
    function startSessionTimer() {
        if (currentUser) {
            clearTimeout(sessionTimer);
            sessionTimer = setTimeout(() => {
                Swal.fire({
                    icon: 'warning',
                    title: 'หมดเวลาการเชื่อมต่อ',
                    text: 'เนื่องจากไม่มีการใช้งานเกิน 10 นาที ระบบได้ออกจากระบบโดยอัตโนมัติ',
                    confirmButtonText: 'ตกลง',
                    confirmButtonColor: '#d33'
                }).then(() => {
                    logout(); // 
                });
            }, SESSION_TIMEOUT_MS);
        }
    }
    
    function resetSessionTimer() {
        if(currentUser) {
            startSessionTimer();
        }
    }

    window.onload = resetSessionTimer;
    document.onmousemove = resetSessionTimer;
    document.onkeypress = resetSessionTimer;
    document.ontouchstart = resetSessionTimer; 
    document.onclick = resetSessionTimer;
    document.onscroll = resetSessionTimer;
    
function confirmLockJob(jobId, currentLockStatus) {
    const isCurrentlyLocked = currentLockStatus.toString().toUpperCase() === 'TRUE';
    const newLockStatus = isCurrentlyLocked ? 'FALSE' : 'TRUE';
    const titleText = isCurrentlyLocked ? 'ยืนยันการปลดล็อก' : 'ยืนยันการปิดรับ';
    const confirmText = isCurrentlyLocked 
        ? 'ใช่, เปิดรับสมัครอีกครั้ง' 
        : 'ใช่, ปิดรับสมัครงานนี้';
    const color = isCurrentlyLocked ? '#28a745' : '#dc3545'; 

    Swal.fire({
        title: titleText,
        text: isCurrentlyLocked 
            ? "งานจะแสดงให้ผู้สมัครเห็นอีกครั้ง" 
            : "งานนี้จะไม่แสดงในหน้าสมัครงานของนักศึกษาอีก",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: color,
        cancelButtonColor: '#6c757d',
        confirmButtonText: confirmText,
        cancelButtonText: 'ยกเลิก'
    }).then((result) => {
        if (result.isConfirmed) {
            showLoading(); 
            
            // ส่งสถานะใหม่ไปยัง Apps Script
            google.script.run
                .withSuccessHandler(() => {
                    showAlert('อัปเดตสถานะเรียบร้อย', 'success'); 
                    loadJobsForAdmin(); // โหลดตารางใหม่
                })
                .withFailureHandler(err => {
                    hideLoading();
                    showAlert(`เกิดข้อผิดพลาด: ${err.message}`, 'error');
                })
                .updateActivity(jobId, {isLocked: newLockStatus}); 
        }
    });
}
