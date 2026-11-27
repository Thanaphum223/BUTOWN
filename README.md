# TownTrack
ระบบรับเรื่องและบริหารงานลงพื้นที่สำหรับเทศบาล ใช้ React + TypeScript + Ant Design, Java 21 + Spring Boot และ PostgreSQL + PostGIS

## สถานะ
มี Backend/Frontend และฐานข้อมูลจริง ใช้งานภายในเครื่องเพื่อทดสอบรับมอบได้ ยังไม่ใช่การรับรองว่าพร้อมเปิดสาธารณะ: ต้องตั้ง HTTPS, ระบบตรวจไฟล์, สำรองข้อมูล, LINE ของหน่วยงาน และทดสอบบนเครื่องปลายทางก่อน

## เปิดระบบบนเครื่องนี้
- โครงการ: D:\TownTrack
- หน้าเว็บ: http://127.0.0.1:5173
- Backend: http://127.0.0.1:8080
- ฐานทดสอบแยก: 127.0.0.1:55432 / towntrack (ไม่ใช้ฐานเดิมของเครื่องที่พอร์ต 5432)
- รัน PowerShell: ./scripts/start-dev.ps1
- หยุด: ./scripts/stop-dev.ps1
- เข้าสู่ระบบด้วยอีเมล Gov Center หรือ LINE ผ่าน Gov Center เท่านั้น บัญชีและรหัสผ่าน TownTrack เดิมใช้ล็อกอินใหม่ไม่ได้
- บัญชีทดสอบ citizen, officer, leader, field, approver และ admin ใช้เฉพาะ fixture ของชุดทดสอบ ไม่ใช่ช่องทางล็อกอินของแอปจริง
- บัญชีตัวอย่างเกิดจาก DEMO_PASSWORD เฉพาะการพัฒนา ห้ามกำหนดตัวแปรนี้ใน Production

## ความสะอาดของโค้ดและความปลอดภัย
ดู docs/CODE_QUALITY_SECURITY.md สำหรับคำสั่งจัดรูปแบบอัตโนมัติ ชุดทดสอบทั้งหมด และขอบเขตความปลอดภัยที่ตรวจแล้ว

## Build และทดสอบ
ต้องมี JDK 21, Maven 3.9+, Node 24 และ PostgreSQL/PostGIS
- Backend: cd backend แล้ว mvn verify (กำหนด DB_URL, DB_USER, DB_PASSWORD, BOOTSTRAP_PASSWORD ก่อน)
- Frontend: cd frontend แล้ว npm ci และ npm run build
- Integration test บนเครื่องนี้: ./scripts/test-backend.ps1
- Browser test: ใช้ฐานข้อมูลทดสอบแยก เปิด Vite และรัน backend ด้วย `BrowserTestServer` จาก test classpath ตาม `.github/workflows/verify.yml` แล้ว `cd frontend` และ `npx playwright test` ตัว launcher และ `/api/test/*` อยู่ใน test sources เท่านั้นและไม่รวมใน JAR ที่ deploy
- DEV_UNSCANNED_FILES=true ใช้ได้เฉพาะทดสอบภายในเครื่อง การใช้งานจริงต้องกำหนด CLAMAV_HOST และไม่เปิดตัวแปรนี้

## เอกสาร
- docs/ARCHITECTURE.md: โครงสร้างข้อมูล ขอบเขตสิทธิ์ กติกางาน และสมมติฐาน
- docs/API.md และ docs/openapi.json: API และตัวอย่างการเรียก
- docs/USER_GUIDE.md: ขั้นตอนใช้งานตามบทบาท
- docs/GOV_REQUIREMENTS.md: ข้อกำหนด GOV ที่ปรับแล้ว การตั้งค่าบริการภายนอก และรายการตรวจรับที่ยังเหลือ
- docs/EMERGENCY_CONTACTS.md: สายด่วนและข้อมูลสถานที่สำคัญใกล้ฉัน
- docs/OPERATIONS.md: ติดตั้ง สำรอง กู้คืน และเชื่อม LINE
- docs/STATUS.md: ผลทดสอบและข้อจำกัดที่ยังต้องจัดการ
- docs/UI_REFERENCE.md: หน้าจอของแต่ละบทบาท รวมหน้าคลังวัสดุและการเริ่มปฏิบัติงาน
- docs/DATA_FLOW.md: ข้อมูลเข้า-ออกของแต่ละขั้นตอนงาน
- docs/ATTACHMENTS_AND_CATEGORIES.md: หมวดแจ้งปัญหาเริ่มต้นและกติกาไฟล์แนบ
- docs/WIP_EQUIPMENT_LOANS.md: ใบยืมครุภัณฑ์ (ระเบียบพัสดุฯ ข้อ 208–211) แบบ 3/แบบ 4 การใช้รถ และสิ่งที่ต้องตั้งค่าหลัง deploy
- docs/WIP_NEXT.md: งานที่ทำล่าสุดและงานที่ยังค้าง
- docs/CODE_QUALITY_SECURITY.md: การจัดรูปแบบโค้ด ชุดทดสอบ และขอบเขตความปลอดภัย
- docs/GOV_SSO.md, docs/GOV_SSO_CONTRACT.md, docs/GOVCENTER_SSO.md: การเชื่อม Gov Center SSO/LINE สัญญากับผู้ให้บริการ และการตั้งค่า
- docs/GPS_WIZARD.md: ขอสิทธิ์ตำแหน่งและฟอร์มแจ้งปัญหา 2 ขั้น
- docs/CLOUD_TEST_DEPLOYMENT.md: เครื่องทดสอบบน DigitalOcean
- docs/task-route-planning.md: บันทึกว่าเลิกใช้ฟีเจอร์วางเส้นทางงานแล้ว

## เชื่อม Gov Center SSO
หน้าเข้าสู่ระบบเป็นฟอร์มอีเมล Gov พร้อมปุ่ม LINE ส่วนหน้าสมัครรับชื่อ-นามสกุล อีเมล รหัสผ่าน และการยืนยันรหัสผ่าน โดยส่งสมัครผ่าน backend ไปยัง Gov API และตรวจรหัสใช้ครั้งเดียวก่อนเปิด session ของ TownTrack ไม่มีการเก็บรหัสผ่าน Gov

ปิด API เดิม `/api/auth/login`, `/api/auth/register` และ `/api/auth/line` ทั้งผู้ใช้ที่ยังไม่เข้าสู่ระบบและผู้ใช้ที่มี session แล้ว ข้อมูลบัญชีเดิม สิทธิ์ และรายการต่าง ๆ ยังคงอยู่ บัญชีบุคลากรเดิมต้องมีการเชื่อม Gov ไว้จึงจะเข้าสู่ระบบด้วยบัญชี Gov และคงบทบาทเดิมได้ ระบบไม่จับคู่หรือยกระดับสิทธิ์จากอีเมลโดยอัตโนมัติ

TownTrack รับข้อมูลผู้ใช้ที่ Backend ตรวจสอบด้วยรหัสใช้ครั้งเดียว แล้วสร้าง Session ของระบบย่อย โดยคงสิทธิ์ที่ผู้ดูแลกำหนดไว้ รายละเอียดการตั้งค่า ข้อจำกัด Session กลาง และรายการที่ต้องยืนยันกับผู้ให้บริการอยู่ใน docs/GOV_SSO.md

ปุ่ม Gov Center เริ่ม LINE Login ด้วยช่องทางของ Gov แล้วรับผลผ่าน Gov API กลับมายัง `GOV_CALLBACK_URL` ของ TownTrack โดยตรง ใช้ `E_SERVICE_CODE`, `E_SERVICE_API_KEY`, `GOV_CALLBACK_URL` เหมือนเดิม เพิ่ม nonce ของแต่ละคำขอใน query ของ callback และตรวจทั้ง browser/server ก่อนยืนยัน code ฝั่ง server จึงไม่ต้องแวะหน้า dashboard ของ Gov และไม่ใช้ ticket หรือ token ของ Session กลาง บัญชีที่ Gov ระบุว่าต้องลงทะเบียนข้อมูลเพิ่มเติมจะยังเข้า TownTrack ไม่ได้จนกว่าจะดำเนินการเสร็จ

## GPS และฟอร์มแจ้งปัญหา
ดู docs/GPS_WIZARD.md: ขอสิทธิ์ครั้งแรก แชร์พิกัด Prefill ฟอร์ม 2 ขั้น ใบรับเรื่อง และบริการค้นหาที่อยู่ที่ตั้งค่าได้
