# UBU Student Job System — Modular Split

ชุดนี้แยกจาก `index.html` เดิมโดยรักษาลำดับ CSS, DOM และ JavaScript เดิม เพื่อให้จัดการบน GitHub ง่ายขึ้น แต่ยัง deploy เป็น **Google Apps Script Web App** เหมือนเดิม

## โครงสร้าง

- `index.html` — Template หลัก มีเฉพาะโครงและคำสั่ง include
- `Styles.html` — CSS เดิมทั้งหมด
- `Body.html` — HTML/DOM เดิมทั้งหมด
- `Scripts_01_Core.html` — ค่ากลาง ระบบนำทาง หน้าแรก และฟังก์ชันหลัก
- `Scripts_02_Users.html` — จัดการผู้ใช้งาน การสมัคร และ Dashboard
- `Scripts_03_Budget.html` — งบประมาณและการเบิกจ่ายระดับหน่วยงาน
- `Scripts_04_Disbursement.html` — รายงานการเบิกจ่าย การเงิน และประวัติรายการ
- `Scripts_05_Timekeeping.html` — งานพิเศษ สถานะนักศึกษา ลงเวลา และรายงานเวลา
- `Scripts_06_AnalyticsDocs.html` — กราฟผู้บริหาร สวมสิทธิ์ เอกสาร แบบประเมิน และดาวน์โหลด
- `Scripts_07_AuditPrint.html` — Audit การคืนรายการ และงานพิมพ์รายงาน
- `Scripts_08_AuthPdf.html` — Login/OTP แจ้งเตือน ยูทิลิตี และ PDF
- `Scripts_09_History.html` — นำเข้าข้อมูลย้อนหลังและสรุปงบประมาณ
- `Code.gs` — Backend เดิมทั้งหมด โดยเปลี่ยนเฉพาะ `createTemplateFromFile('1')` เป็น `createTemplateFromFile('index')`

## วิธีนำเข้า Google Apps Script

1. สร้าง HTML files ใน Apps Script ให้ชื่อ **ตรงกับชื่อไฟล์** (Apps Script จะแสดงชื่อโดยไม่ต้องสนใจ `.html`)
2. วาง `index.html`, `Styles.html`, `Body.html` และ `Scripts_01_...` ถึง `Scripts_09_...` ลงในโปรเจกต์
3. ใช้ `Code.gs` ชุดนี้ หรือแก้ `doGet()` ของโปรเจกต์เดิมให้เรียก `index`
4. ตรวจว่ามีฟังก์ชัน `include(filename)` อยู่ (ใน `Code.gs` นี้มีอยู่แล้ว)
5. Deploy > New deployment > Web app ตามวิธีเดิม

## ใช้กับ GitHub

แนะนำเก็บ source ชุดนี้ใน GitHub แล้ว sync/deploy ไป Google Apps Script ด้วย `clasp` หรือคัดลอกไฟล์เข้า Apps Script ตามปกติ

**ไม่แนะนำให้เปิดเป็น GitHub Pages โดยตรง** เพราะ JavaScript หน้าเว็บเรียก `google.script.run` เพื่อใช้ฟังก์ชันฝั่ง Apps Script หลายจุด หากจะย้ายเป็น GitHub Pages จริงต้องสร้าง API/backend bridge ใหม่

## การตรวจสอบที่ทำแล้ว

- CSS และ HTML ถูกคัดออกจากตำแหน่งเดิมโดยไม่แก้เนื้อหา
- JavaScript ถูกแบ่งตามขอบเขต top-level และตรวจ syntax ทีละไฟล์ด้วย Node.js
- เมื่อนำ JavaScript 9 โมดูลมาต่อกันตามลำดับ เนื้อหาตรงกับ JavaScript เดิม
- จำนวนการเรียก `google.script.run` ยังคงเท่าไฟล์เดิม
