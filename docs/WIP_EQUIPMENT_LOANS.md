# งานค้าง: ใบยืมครุภัณฑ์ และแบบ 3/แบบ 4

สถานะ: **ยังไม่เสร็จ ห้าม push ขึ้น origin** (origin จะ deploy เว็บจริง) commit นี้อยู่บน BUTOWN เท่านั้น

ที่มา: ระเบียบกระทรวงการคลังว่าด้วยการจัดซื้อจัดจ้างและการบริหารพัสดุภาครัฐ พ.ศ. 2560 ข้อ 208(2), 209, 211
และระเบียบมหาดไทยว่าด้วยการใช้และรักษารถยนต์ของ อปท. พ.ศ. 2548 แก้ไข (ฉบับที่ 2) พ.ศ. 2563 (แบบ 3/แบบ 4)

## ทำแล้ว (backend เท่านั้น compile ผ่าน)

- `V38__equipment_loans.sql`
  - `app_user.loan_approver`: ผู้ได้รับมอบอำนาจเป็นหนังสือให้อนุมัติการยืม
  - `resource_request.loan_due_on`: กำหนดวันส่งคืน
  - ตาราง `equipment_loan`: ทะเบียนคุมการยืม ลิงก์ไปคำร้องเป็น nullable เพื่อให้อยู่ต่อหลังลบคำร้อง
- `Workflow`
  - `REQUEST_RESOURCE`: ถ้ามีครุภัณฑ์ ต้องส่ง `loanDueOn` (YYYY-MM-DD ตั้งแต่วันนี้ถึง 1 ปี)
  - `checkApprovalAuthority(resourceId, approverId)`: ถ้ามีครุภัณฑ์ ผู้อนุมัติลำดับสุดท้ายต้องเป็น gov_role `MAYOR` หรือ `loan_approver=true` ตรวจทั้งตอน SEND_APPROVAL และตอน APPROVE สุดท้าย
  - `issueForStart`: เปิดใบยืมเมื่อเบิกครุภัณฑ์ที่อนุมัติแล้ว
  - `returnLeftovers`: ฟิลด์ `condition: "DAMAGED"` และ `conditionNote` ต่อรายการ (ข้อ 209) ปิดใบยืมเมื่อคืนครบ และแจ้งเตือนเมื่อของชำรุด
- `Stock.openLoans` / `closeLoans`: `returnAll` (ยกเลิกเริ่มงาน) ปิดใบยืมเป็น `CANCELLED`
- `EquipmentLoans` (ใหม่)
  - `GET /api/stock/loans`: ทะเบียนคุมการยืม
  - `POST /api/stock/loans/{id}/return {condition: GOOD|DAMAGED|LOST, note}`: ผู้ดูแลคลังรับคืนหลังรายงาน ถ้า LOST จะลง RETURN แล้วตามด้วย ADJUST ลบ
  - `@Scheduled` 08:00 Asia/Bangkok `remindOverdue()`: แจ้งครั้งเดียวเมื่อเลยกำหนด (ข้อ 211)
  - `PUT /api/stock/loan-approvers/{userId} {approver, reference}`: ADMIN ตั้งผู้รับมอบอำนาจ และบันทึก audit
- `ComplaintRetention.remove`: unlink `equipment_loan` ก่อนลบ

## ยังขาด

1. **Test ที่ยังพัง:** `StockAndSlaIntegrationTest.missingEquipmentAlertsTheLeaderAndKeepers` ได้ 404 ตอน `PUT /api/stock/loan-approvers/{APPROVER}`
   - ข้อมูลใน test ถูกต้องแล้ว: APPROVER กับ ADMIN อยู่เทศบาลเดียวกัน และ role ถูก
   - handler ที่ทำงานคือ `EquipmentLoans` และ Resolved Exception เป็น null
   - ให้หาว่า 404 มาจากไหน เช่น ใส่ log ใน `delegate()` หรือเทียบกับ `StockController.setKeeper`
2. **Test ที่ยังไม่ได้เขียน:**
   - กำหนดวันคืน: ไม่ส่งตอนขอครุภัณฑ์ต้องได้ 400 ส่งวันในอดีตต้องได้ 400
   - การรับคืนแบบ GOOD/DAMAGED/LOST (ตรวจยอดคลังและ movement)
   - `remindOverdue()` เทียบวันที่ ±1 วัน และต้องแจ้งเพียงครั้งเดียว
   - `UNDO_START` ต้องปิดใบยืมเป็น `CANCELLED`
   - ลบคำร้องแล้ว `equipment_loan` ยังอยู่ (เพิ่มใน `ComplaintRetentionIntegrationTest`)
3. **Frontend:**
   - `Detail.tsx` ฟอร์ม REQUEST_RESOURCE: เมื่อมีรายการครุภัณฑ์ ให้แสดง DatePicker "กำหนดวันส่งคืนครุภัณฑ์" (บังคับ) แล้วส่ง `loanDueOn`
   - `StockFields.tsx` StockReturns: รายการครุภัณฑ์เลือกสภาพได้ (ปกติ/ชำรุด) พร้อมช่องหมายเหตุ ส่ง `condition` และ `conditionNote`
   - `Inventory.tsx`
     - เพิ่มตาราง "ทะเบียนคุมการยืมครุภัณฑ์" (`GET /stock/loans`) แสดงเกินกำหนดเป็นสีแดง และมีปุ่มรับคืนให้ผู้ดูแลคลัง
     - ในหน้าต่างกำหนดผู้ดูแลคลัง (ADMIN) เพิ่มสวิตช์ "ผู้รับมอบอำนาจอนุมัติยืมครุภัณฑ์" สำหรับ APPROVER พร้อมช่องเลขที่หนังสือมอบอำนาจ
     - `GET /stock/keepers` ต้องส่ง `loan_approver` และ `gov_role` เพิ่ม (ยังไม่ได้แก้)
   - เพิ่มข้อความไทยทุกข้อความใน `features.en.ts`/`errors.en.ts` ทั้งข้อความ error ใหม่และข้อความแจ้งเตือน
4. **Docs:** `docs/API.md` (endpoint ใหม่และฟิลด์ `loanDueOn`/`condition`)
5. **แบบ 3 / แบบ 4 (ยังไม่เริ่ม)** แนวที่วางไว้:
   - `stock_item` เพิ่มประเภท `VEHICLE` หรือ flag รถ พร้อมทะเบียนรถ และให้นับเป็นของที่ต้องคืนเหมือนครุภัณฑ์
   - แบบ 3: คำขอใช้ทรัพยากรที่มีรถ ต้องกรอกสถานที่ไป วัตถุประสงค์ ช่วงเวลา คนขับ และจำนวนผู้โดยสาร ใช้สายอนุมัติเดิม (ข้อนี้เป็นการสันนิษฐาน ข้อความต้นทางไม่ได้ระบุผู้อนุมัติ)
   - แบบ 4: เลขไมล์ออกตอน START และเลขไมล์กลับตอน REPORT เก็บในตาราง `vehicle_trip`
   - ตั้งค่าระดับเทศบาลให้ยกเว้นแบบ 3 เมื่อใช้รถภายในเขตพื้นที่
6. **ก่อนปล่อยขึ้นเว็บจริง:** เมื่อ deploy แล้ว คำขอที่มีครุภัณฑ์จะอนุมัติลำดับสุดท้ายไม่ได้ จนกว่าจะตั้ง MAYOR หรือผู้รับมอบอำนาจ ต้องแจ้งเจ้าของก่อน deploy

## วิธีรัน test ในเครื่อง

- **PostGIS:** ตอนสตาร์ท Postgres ต้องมี `C:\Program Files\PostgreSQL\17\bin` อยู่ใน PATH ไม่อย่างนั้นโหลด PostGIS ไม่ได้
- **ชื่อตัวแปรรหัสผ่าน:** BrowserTestServer ต้องตั้ง `BOOTSTRAP_PASSWORD` และ `DEMO_PASSWORD` ส่วน Playwright ใช้ `TT_*`
