# การติดตั้งและดูแล

## สภาพแวดล้อมในเครื่องนี้
Portable JDK, Maven และ PostgreSQL สำหรับพัฒนาอยู่ใน work/tools; ไม่ได้เพิ่ม Java ลง PATH ของเครื่องถาวร และไม่เปลี่ยน PostgreSQL ที่พอร์ต 5432
ฐาน TownTrack อยู่ work/pgdata พอร์ต 55432 ผูกเฉพาะ 127.0.0.1 ใช้รหัสผ่าน SCRAM ที่สร้างสุ่มไว้ใน work/local-env.json
รหัสบัญชีตัวอย่างดูด้วย scripts/show-local-access.ps1 เฉพาะผู้ดูแลเครื่อง
ตัวอย่างและไฟล์ทดสอบอยู่ในฐาน local เท่านั้น ไม่ควรย้ายไป Production

## ติดตั้งเครื่องใหม่ด้วย Docker
ไฟล์ compose และ Dockerfile จัดเตรียมแล้ว แต่เครื่องพัฒนานี้ไม่มี Docker จึงยังไม่ยืนยันการ Build/Run ด้วย Docker
1. ติดตั้ง Docker Engine/Compose บนเครื่องทดสอบรับมอบ
2. คัดลอก .env.example เป็น .env สร้าง DB_ADMIN_PASSWORD, DB_PASSWORD และ BOOTSTRAP_PASSWORD แบบสุ่มยาวอย่างน้อย 24 ตัวอักษร ห้ามใช้ค่าของ CI หรือบัญชี Demo
3. รัน docker compose up --build -d
4. ตั้ง Reverse Proxy HTTPS ที่โดเมนจริงให้ส่งเข้าหน้าเว็บ 127.0.0.1:8090 พร้อม Certificate ที่ถูกต้อง อย่าเปิด PostgreSQL หรือ Backend โดยตรงออกอินเทอร์เน็ต
5. COOKIE_SECURE=true โดยปริยาย จึงต้องเข้า HTTPS เพื่อใช้งาน Session จริง หากทดสอบ HTTP ภายในเครื่องให้ override false เฉพาะสภาพแวดล้อมทดสอบ
6. ClamAV ต้องดาวน์โหลดฐานลายเซ็นและเริ่มพร้อมก่อนอัปโหลด ถ้าไม่พร้อม API ต้องปฏิเสธไฟล์ (fail closed)
7. เข้า admin ด้วยรหัสที่ตั้งเอง เปลี่ยนรหัส ตั้งข้อมูลเทศบาลและสร้างบุคลากรจริง ไม่กำหนด DEMO_PASSWORD
8. ตรวจ Health Check, ทดสอบไฟล์ปลอดภัย/ไฟล์ตรวจจับมัลแวร์, สิทธิ์ทุกบทบาท, HTTPS/Cookie, สำรองและกู้คืน ก่อนเปิดประชาชนใช้งาน

Container Backend ทำงานด้วยผู้ใช้ที่ไม่ใช่ root ฐานข้อมูลแอปเป็น role towntrack ที่ไม่ใช่ superuser; bootstrap ฐานใช้ postgres แยกกัน Runtime ของรุ่นนี้ยังเป็นเจ้าของตารางของโมดูลเพราะรัน Flyway ตอนเริ่ม หากนโยบายหน่วยงานต้องแยกบัญชี Migration/Runtime ให้จัดขั้นตอน Migration ภายนอกและปรับสิทธิ์ก่อนรับมอบ

## Secret และสิทธิ์ไฟล์
- เก็บ .env ในระบบจัดการ Secret หรือไฟล์สิทธิ์เฉพาะผู้ดูแล ไม่สำรองรวมกับ Source สาธารณะ
- ตั้งสิทธิ์โฟลเดอร์ไฟล์และ Backup ให้เฉพาะ Service Account/ผู้ดูแลที่ได้รับอนุญาต
- ไม่เก็บ Access Token หรือรหัสผ่านใน Frontend, Git, URL หรือ application log
- ปิด DEV_UNSCANNED_FILES ใน Production เสมอ ตัวแปรนี้ใช้ทดสอบอัปโหลดในเครื่องโดยไม่มี ClamAV เท่านั้น

## LINE
1. สร้าง LINE Login channel และ LIFF ที่มี openid/profile scope ตั้ง HTTPS Endpoint URL เป็นหน้าเว็บ
2. ตั้ง LINE_LOGIN_CHANNEL_ID, LINE_LIFF_ID และ LINE_MUNICIPALITY_ID (UUID เทศบาลจากหน้า Admin/API)
3. LINE Login และ Messaging API ต้องอยู่ใต้ Provider เดียวกัน เพื่อให้ User ID ตรงกัน
4. ตั้ง LINE_CHANNEL_ACCESS_TOKEN เฉพาะ Backend เชื่อม Rich Menu ของ OA ไป LIFF URL
5. ผู้ใช้เพิ่มเพื่อน OA และให้สิทธิ์ที่จำเป็น ทดสอบการเปิด LIFF, Token หมดอายุ, Logout และการส่งสถานะจริง
6. Backend ส่ง ID token ไปตรวจที่ LINE ไม่เชื่อ profile ที่ Browser ส่งเอง และสร้างได้เฉพาะบัญชี CITIZEN
7. คิว notification_delivery เก็บในฐานข้อมูล มี Retry Key เดิมเพื่อป้องกันข้อความซ้ำ ลองสูงสุด 6 รอบแล้ว FAILED; ตรวจ GET /api/admin/deliveries และจัดการสาเหตุก่อนส่งใหม่
8. การส่งมีโควตา/ค่าใช้จ่ายตามบัญชีจริง หากไม่กำหนด Token จะไม่มีการส่งออก แต่การแจ้งเตือนภายในเว็บยังทำงาน

ยังไม่ได้ทดสอบกับบัญชี LINE จริง เพราะไม่ได้รับ Channel/LIFF/Token และยังไม่เชื่อม GovCenter

## Backup / Restore
สำรองทั้งฐานข้อมูลและไฟล์หลักฐานให้สอดคล้องกัน โดยหยุดการรับรายการใหม่ในช่วงสำรองสำหรับรุ่นนี้
- Local: scripts/backup-local.ps1 สร้าง pg_dump แบบ Custom พร้อมสำเนา private-files และ SHA-256
- Production: ใช้ pg_dump -Fc ผ่านบัญชีที่มีสิทธิ์อ่านครบ และสำรอง Volume files ในช่วงหยุดเขียนเดียวกัน
- จัดเก็บ Backup เข้ารหัสไว้นอกเครื่อง จำกัดสิทธิ์ และกำหนดรอบเก็บตามนโยบายเทศบาล
- ห้ามกู้คืนทับฐานที่ใช้งานอยู่โดยตรง ให้สร้าง DB ใหม่ ติดตั้ง PostGIS แล้ว pg_restore --exit-on-error
- กู้ไฟล์เข้า FILE_ROOT ตรวจชื่อ storage_key, size และ SHA-256 เทียบ attachment แล้วทดสอบเข้าสู่ระบบ ดาวน์โหลดหลักฐาน และเปิดคำร้องเก่า
- ระบบทดสอบกู้คืนจริงลง towntrack_restorecheck ที่พอร์ต 55432 แล้ว ผล ณ รอบทดสอบ: 3 คำร้อง / ปิดแล้ว 1 / PostGIS ทำงาน
- กำหนด RPO/RTO และซ้อมกู้คืนบนเครื่องปลายทางก่อนเปิดใช้งานจริง

## Monitoring และข้อจำกัดการติดตั้ง
- /actuator/health เปิดเผยเพียงสถานะ ไม่ส่งรายละเอียด DB
- application log ต้องส่งเข้าระบบเก็บ Log ที่จำกัดสิทธิ์ และห้ามเปิด debug ที่พิมพ์ Credential/HTTP Token
- Session และ Login Rate Limit อยู่ในหน่วยความจำ รองรับ deployment เดี่ยว; Restart ต้อง Login ใหม่ หากทำหลาย Replica ต้องเพิ่ม Shared Session/Rate Limit ก่อน
- SLA Reminder ตรวจทุก 60 วินาที ส่งให้ผู้รับผิดชอบเมื่อเกินกำหนด โดยไม่ส่งซ้ำสำหรับคำร้อง/ผู้ใช้เดิม
- หน้ารายการค้นหาและแบ่งหน้าจาก Server สถิตินับข้อมูลทั้งหมดในขอบเขตสิทธิ์; ประวัติผู้ดูแลและคิว LINE จำกัด 200 รายการล่าสุด
- OSM tile ที่ใช้พัฒนา: ต้องประเมินนโยบายและบริการแผนที่ที่เหมาะกับปริมาณใช้งานจริง หรือเปลี่ยน URL/Attribution ให้ตรงผู้ให้บริการ
- CI มีไฟล์เตรียมไว้ แต่ยังไม่ได้รันบนบริการ GitHub
- work/tools/pgsql/data เป็นสำเนาส่วนเกินที่ไม่ใช่ฐาน TownTrack และไม่ใช่ส่วนส่งขึ้นเซิร์ฟเวอร์ ถูกยกเว้นจาก Git/Docker; การล้างสำเนานี้ถูกระบบตรวจอนุมัติอัตโนมัติปฏิเสธ
