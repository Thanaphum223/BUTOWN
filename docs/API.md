# API

เอกสารเครื่องอ่านได้: openapi.json (OpenAPI 3.0.3) Base path /api

## Session และ CSRF
1. GET /api/auth/csrf รับ token และ headerName พร้อม Cookie เซสชัน
2. POST /api/auth/login ส่ง application/x-www-form-urlencoded: username,password พร้อม CSRF header และ Cookie เดิม
3. หลัง Login เรียก csrf ใหม่ เพราะ Token หมุนเวียน
4. คำขอ POST/DELETE ทุกครั้งต้องแนบ CSRF header และ Cookie ใช้ same-origin ไม่มี Token ใน localStorage
5. POST /api/auth/logout ออกจากระบบ; POST /api/auth/password ส่ง currentPassword,newPassword และทำให้ Session ทั้งบัญชีหมดอายุ

## ยื่นและดำเนินคำร้อง
POST /complaints: categoryId,title,description,address,latitude/longitude (ใส่คู่กันหรือ null ทั้งคู่),answers
GET /complaints?page=0&size=10&q=คำค้น&status=NEW: แบ่งหน้าจาก Server ค้นหาในข้อมูลทั้งหมดตามสิทธิ์ ตอบ items,total,page,size,stats (สถิติรวมทั้งขอบเขต)
GET /complaints/{id}: ข้อมูลตามบทบาท, history, files; บุคลากรได้ workOrders, resources, reports, reviews, approvals, approvalStages และ actions เพิ่ม

POST /complaints/{id}/actions ตัวอย่าง:

    {"action":"TRIAGE","version":0,"reason":"ตรวจสอบและรับเรื่อง","leaderId":"UUID"}

    {"action":"ASSIGN","version":1,"reason":"มอบหมายทีม","teamId":"UUID"}

    {"action":"SEND_APPROVAL","version":6,"reason":"เอกสารครบ","approverIds":["UUID ขั้นที่ 1","UUID ขั้นที่ 2"]}

    {"action":"REPORT","version":9,"reason":"ส่งตรวจ","content":"ข้อเท็จจริงและผลดำเนินงาน"}

- ใช้ version ล่าสุดจาก detail ทุกครั้ง ห้ามเดาเลข
- Action ได้จาก actions ใน detail โดย Backend ตรวจซ้ำ ไม่เชื่อสิทธิ์จาก Frontend
- ASSIGN ใช้ teamId หรือ assigneeId; หากระบุทีมจะใช้ตัวแทนของทีม
- PROPOSE ต้องมี proposal, amount (ทศนิยมไม่เกิน 2), durationDays และหลักฐาน
- REPORT ต้องมี content และหลักฐานใหม่ที่ยังไม่ผูกกับรายงานก่อนหน้า
- SEND_APPROVAL ต้องมี approverIds ตามจำนวนลำดับของ Workflow คนต้องไม่ซ้ำ
- DENY ยุติทั้งคำร้องทันที ไม่มีเส้นทางให้เริ่มงานต่อ

## ไฟล์
POST /complaints/{id}/files เป็น multipart/form-data ชื่อ field=file รองรับ PNG/JPEG/PDF ไม่เกิน 10 MiB ตามขั้นตอนและผู้ใช้
GET /files/{id} ตรวจสิทธิ์ระดับคำร้องและส่งเป็น attachment ไม่เปิดไฟล์เป็น public URL

## เคสใกล้เคียง
GET /nearby?categoryId=UUID&latitude=13.75&longitude=100.5
ค้นหาเฉพาะเทศบาลเดียวกัน ประเภทเดียวกัน และยังไม่จบ ภายใน 100 เมตร
POST /complaints/{id}/follow ส่ง categoryId,latitude,longitude เพื่อตรวจขอบเขตก่อนติดตาม
GET /following แสดงข้อมูลสรุปเท่านั้น ไม่ให้สิทธิ์ดูรายละเอียดส่วนตัว

## รูปแบบข้อมูล
เวลาเป็น ISO date-time จาก Server แสดงผลเวลา Asia/Bangkok บนหน้าเว็บ
บางช่อง JSON จากฐานข้อมูลส่งเป็นข้อความ JSON: catalog.categories.fields, complaint.answers/form_schema, resources.revisions, teams.members ตาม implementation ปัจจุบัน
UUID เป็นรหัสอ้างอิง ไม่ใช้แทนการตรวจสิทธิ์

## ข้อผิดพลาด
400 ข้อมูลผิด, 401 ยังไม่เข้าสู่ระบบ, 403 ไม่มีสิทธิ์/CSRF ผิด, 404 ไม่พบในขอบเขตที่อนุญาต, 409 ข้อมูลเปลี่ยนหรือชนกัน, 429 เกินอัตราคำขอ, 503 LINE/Antivirus ยังไม่พร้อม
รายละเอียด exception/SQL ไม่ส่งกลับให้ Client

## GPS และข้อมูลติดต่อ
POST /complaints รองรับ contactName (ไม่เกิน 200) และ contactPhone (ไม่เกิน 30) แบบไม่บังคับ ข้อมูลนี้ไม่แสดงใน nearby API
GET /geocoding/search?q=... และ /geocoding/reverse?latitude=...&longitude=... ต้อง Login และตั้ง GEOCODING_BASE_URL ก่อน มิฉะนั้นตอบ 503 โดยใช้หมุด/ที่อยู่ที่กรอกเองต่อได้
