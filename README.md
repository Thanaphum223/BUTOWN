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
- docs/OPERATIONS.md: ติดตั้ง สำรอง กู้คืน และเชื่อม LINE
- docs/STATUS.md: ผลทดสอบและข้อจำกัดที่ยังต้องจัดการ

## เชื่อม GovCenter ภายหลัง
ยังไม่เรียก GovCenter และไม่สมมติ endpoint ใช้ GovCenterPort เป็นขอบเขต Integration และ integration_reference สำหรับจับคู่รหัส ดูข้อกำหนดในเอกสาร Architecture ก่อนลงมือเชื่อม

## GPS และฟอร์มแจ้งปัญหา
ดู docs/GPS_WIZARD.md: ขอสิทธิ์ครั้งแรก แชร์พิกัด Prefill ฟอร์ม 3 ขั้น ใบรับเรื่อง และบริการค้นหาที่อยู่ที่ตั้งค่าได้
