# API

เอกสารเครื่องอ่านได้: openapi.json (OpenAPI 3.0.3) Base path /api

## Session และ CSRF
1. GET /api/auth/csrf รับ token และ headerName พร้อม Cookie เซสชัน
2. เริ่มคำขอด้วย POST /api/auth/gov/start พร้อม state และ purpose=PASSWORD_LOGIN (หรือ REGISTER สำหรับสมัคร)
3. POST /api/auth/gov/password-login ส่ง JSON state,email,password พร้อม CSRF header และ Cookie เดิม สำหรับสมัครใช้ /api/auth/gov/register และเพิ่ม name หลัง Gov ยืนยันตัวตนสำเร็จจึงเปิด session ของ TownTrack
4. ช่องทางเดิม /api/auth/login, /api/auth/register และ /api/auth/line ถูกปิด ไม่รองรับบัญชีและรหัสผ่าน TownTrack โดยตรง
3. หลัง Login เรียก csrf ใหม่ เพราะ Token หมุนเวียน
4. คำขอ POST/DELETE ทุกครั้งต้องแนบ CSRF header และ Cookie ใช้ same-origin ไม่มี Token ใน localStorage
5. POST /api/auth/logout ออกจากระบบ; POST /api/auth/password ส่ง currentPassword,newPassword และทำให้ Session ทั้งบัญชีหมดอายุ

## ยื่นและดำเนินคำร้อง
POST /complaints: multipart/form-data โดย part `complaint` เป็น application/json มี categoryId,title,description,address,latitude/longitude (ใส่คู่กันหรือ null ทั้งคู่),answers และ part `files` เป็นไฟล์หลักฐานอย่างน้อย 1 ไฟล์ รวมไม่เกิน 1 GB ถ้าไฟล์ไม่ผ่านจะไม่บันทึกคำร้อง
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
POST /complaints/{id}/files เป็น multipart/form-data ชื่อ field=file รองรับ PNG/JPEG/PDF/MP4/MOV/WebM รวมไฟล์เดิมต่อคำร้องไม่เกิน 1 GB (1024 MB) ตามขั้นตอนและผู้ใช้
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

## เหตุฉุกเฉิน
GET /emergency/nearby?latitude=...&longitude=...&type=hospital&radiusKm=5 เปิดอ่านได้โดยไม่ต้องเข้าสู่ระบบ รองรับ hospital, police, fire_station, clinic และรัศมี 5/10/20 กม. ตอบ places พร้อมชื่อ ที่อยู่ ระยะเส้นตรง เบอร์ตรง และแหล่งข้อมูล ไม่ส่งข้อมูลคำร้องหรือข้อมูลผู้ใช้

## บทบาทและการลบบัญชี
GET/POST /admin/gov-roles สำหรับผู้ดูแล: จับคู่รหัสบทบาท Gov กับ role/departmentId ของ TownTrack โดยตั้ง municipalityId ของ Gov และ serviceId (ถ้าระบุบริการด้วย ID) การเปลี่ยนค่านี้ใช้กับบัญชีใหม่เท่านั้น
DELETE /admin/users/{id}: ผู้ดูแลลบบัญชีในเทศบาลตนเองได้ ยกเว้นตนเอง ซ่อนบัญชีและยกเลิก Session โดยเก็บคำร้อง/ไฟล์/ประวัติงาน ครั้งถัดไปที่ Gov ยืนยันตัวตนเดิม จะได้บัญชี TownTrack ID ใหม่ ไม่รับข้อมูลส่วนตัวหรือสิทธิ์เดิมกลับมา การระงับบัญชีโดยไม่ลบยังคงบล็อกการเข้าสู่ระบบ
OFFICER/APPROVER ดูแลงานระดับเทศบาล ไม่มี departmentId; LEADER/FIELD ต้องมี departmentId ที่อยู่ในเทศบาลเดียวกัน
