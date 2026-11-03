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
- บัญชีทดสอบ: citizen, officer, leader, field, approver; ผู้ดูแล: admin
- ดูรหัสผ่านเฉพาะในเครื่องด้วย ./scripts/show-local-access.ps1 (ไม่ควรส่งไฟล์รหัสผ่านหรือบันทึกหน้าจอที่มีรหัสผ่านต่อ)
- บัญชีตัวอย่างเกิดจาก DEMO_PASSWORD เฉพาะการพัฒนา ห้ามกำหนดตัวแปรนี้ใน Production

## ความสะอาดของโค้ดและความปลอดภัย
ดู docs/CODE_QUALITY_SECURITY.md สำหรับคำสั่งจัดรูปแบบอัตโนมัติ ชุดทดสอบทั้งหมด และขอบเขตความปลอดภัยที่ตรวจแล้ว

## Build และทดสอบ
ต้องมี JDK 21, Maven 3.9+, Node 24 และ PostgreSQL/PostGIS
- Backend: cd backend แล้ว mvn verify (กำหนด DB_URL, DB_USER, DB_PASSWORD, BOOTSTRAP_PASSWORD ก่อน)
- Frontend: cd frontend แล้ว npm ci และ npm run build
- Integration test บนเครื่องนี้: ./scripts/test-backend.ps1
- Browser test: เปิด Backend และ Vite แล้ว cd frontend; npx playwright test
- DEV_UNSCANNED_FILES=true ใช้ได้เฉพาะทดสอบภายในเครื่อง การใช้งานจริงต้องกำหนด CLAMAV_HOST และไม่เปิดตัวแปรนี้

## เอกสาร
- docs/ARCHITECTURE.md: โครงสร้างข้อมูล ขอบเขตสิทธิ์ กติกางาน และสมมติฐาน
- docs/API.md และ docs/openapi.json: API และตัวอย่างการเรียก
- docs/USER_GUIDE.md: ขั้นตอนใช้งานตามบทบาท
- docs/GOV_REQUIREMENTS.md: ข้อกำหนด GOV ที่ปรับแล้ว การตั้งค่าบริการภายนอก และรายการตรวจรับที่ยังเหลือ
- docs/EMERGENCY_CONTACTS.md: สายด่วนและข้อมูลสถานที่สำคัญใกล้ฉัน
- docs/OPERATIONS.md: ติดตั้ง สำรอง กู้คืน และเชื่อม LINE
- docs/STATUS.md: ผลทดสอบและข้อจำกัดที่ยังต้องจัดการ

## เชื่อม Gov Center SSO
TownTrack รับข้อมูลผู้ใช้ที่ Backend ตรวจสอบด้วยรหัสใช้ครั้งเดียว แล้วสร้าง Session ของระบบย่อย โดยคงสิทธิ์ที่ผู้ดูแลกำหนดไว้ รายละเอียดการตั้งค่า ข้อจำกัด Session กลาง และรายการที่ต้องยืนยันกับผู้ให้บริการอยู่ใน docs/GOV_SSO.md

ปุ่ม Gov Center เริ่ม LINE Login ด้วยช่องทางของ Gov แล้วรับผลผ่าน Gov API กลับมายัง `GOV_CALLBACK_URL` ของ TownTrack โดยตรง ใช้ `E_SERVICE_CODE`, `E_SERVICE_API_KEY`, `GOV_CALLBACK_URL` เหมือนเดิม เพิ่ม nonce ของแต่ละคำขอใน query ของ callback และตรวจทั้ง browser/server ก่อนยืนยัน code ฝั่ง server จึงไม่ต้องแวะหน้า dashboard ของ Gov และไม่ใช้ ticket หรือ token ของ Session กลาง บัญชีที่ Gov ระบุว่าต้องลงทะเบียนข้อมูลเพิ่มเติมจะยังเข้า TownTrack ไม่ได้จนกว่าจะดำเนินการเสร็จ

## GPS และฟอร์มแจ้งปัญหา
ดู docs/GPS_WIZARD.md: ขอสิทธิ์ครั้งแรก แชร์พิกัด Prefill ฟอร์ม 3 ขั้น ใบรับเรื่อง และบริการค้นหาที่อยู่ที่ตั้งค่าได้
