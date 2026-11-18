# TownTrack Data Flow (Input / Output)

เอกสารนี้สรุปว่าแต่ละขั้นตอนรับข้อมูลอะไรเข้า เก็บไว้ที่ใด และส่งข้อมูลอะไรออก อ้างอิงจากโค้ดจริงใน
`ComplaintController`, `Workflow`, `WorkflowPolicy`, `FileController`, `GovIdentityService`, `GovRoleMapping`
และ `AdminController`

## ภาพรวม

```
ประชาชน ──แจ้งเรื่อง──▶ complaint ──TRIAGE──▶ หัวหน้า ──ASSIGN──▶ work_order ──START/REPORT──▶ field_report
                                   │                               │
                                   │                     REQUEST_RESOURCE ▶ resource_request ▶ PROPOSE ▶ อนุมัติ
                                   ▼
                     audit_event (ทุกการเปลี่ยนสถานะ, append-only) + notification (แจ้งผู้เกี่ยวข้อง)
```

- ทุกการเปลี่ยนสถานะผ่าน `POST /api/complaints/{id}/actions` เพียงจุดเดียว
- body ต้องมี `action` และ `version` (ป้องกันการแก้ทับกัน) และส่ง header `Idempotency-Key` (ป้องกันกดซ้ำ)
- ผลลัพธ์คือ `complaint.status` ใหม่, `version + 1`, แถวใน `audit_event` และการแจ้งเตือนถึงผู้เกี่ยวข้อง

## 1. ยืนยันตัวตนและสิทธิ์

| ขั้นตอน | Input | เก็บที่ | Output |
| --- | --- | --- | --- |
| เข้าสู่ระบบ Gov Center (`/api/auth/gov`, `/api/auth/sso-callback`) | ข้อมูลผู้ใช้จาก Gov: ชื่อ, อีเมล, `memberships[].serviceAccess[].roleCode` | `app_user`, `iam_user_profile`, `app_user.gov_role` (ยศล่าสุด) | session cookie, ข้อมูลผู้ใช้ |
| บัญชีใหม่ครั้งแรก | `roleCode` (ยศ) | กำหนด `role`/`department_id` ตาม `gov_role_mapping` | บทบาทเริ่มต้น |
| ผู้ดูแลจับคู่ยศ → บทบาท (`POST /api/admin/gov-roles`) | รายการ `{govRole, role, departmentId}` สูงสุด 100 รายการ (เลือก ADMIN ได้) | `gov_role_settings`, `gov_role_mapping` | การตั้งค่าที่บันทึก |
| ผู้ดูแลกำหนดสิทธิ์รายบุคคล (`POST /api/admin/users/{id}/role`) | `role`, `departmentId` | `app_user.role`, `department_id` | บัญชีที่อัปเดต; session เดิมหมดอายุ |
| ตอบประกาศ PDPA (`POST /api/users/pdpa-consent`) | เวอร์ชันประกาศ, `consent` (`true` ยินยอม / `false` ไม่ยินยอม) | `privacy_acknowledgement.consented` | ยินยอมแล้วจึงขอ GPS; ไม่ยินยอมใช้งานได้แต่ปิด GPS และกลับมาเปลี่ยนได้ |

หมายเหตุ:
- การจับคู่ยศใช้เฉพาะตอนสร้างบัญชีครั้งแรก
- บัญชีที่มีอยู่แล้วคงบทบาทเดิม จนกว่าผู้ดูแลจะเปลี่ยนรายบุคคล

### ที่มาของ Admin คนแรก

ใครสร้างอะไร:

| ลำดับ | ผู้ทำ | สิ่งที่เกิดขึ้น |
| --- | --- | --- |
| 1 | ผู้ติดตั้งระบบ (ฝ่าย IT) | ตั้ง `BOOTSTRAP_PASSWORD` (อย่างน้อย 16 ตัวอักษร) ใน `.env` แล้วเปิด Backend ครั้งแรกกับฐานข้อมูลว่าง |
| 2 | ระบบ (`Bootstrap.java`) | สร้างเทศบาล 1 แห่ง, กองช่าง, หมวดปัญหาเริ่มต้น และบัญชี `admin` บทบาท `ADMIN` ทำเฉพาะเมื่อยังไม่มีเทศบาลในฐานข้อมูล รอบถัดไปไม่สร้างซ้ำ |
| 3 | Admin คนแรก | ตั้งรหัสเทศบาล Gov Center และจับคู่ยศ → บทบาทที่ **จัดการระบบ → บทบาท Gov Center** |
| 4 | Admin | กำหนดบทบาทรายบุคคล หรือแต่งตั้ง Admin คนอื่นที่ `POST /api/admin/users/{id}/role` |

**ข้อจำกัดปัจจุบัน:** ระบบปิดการเข้าสู่ระบบด้วยรหัสผ่านของ TownTrack แล้ว (`/api/auth/login` เป็น `denyAll` ใน `SecurityConfig`) บัญชี `admin` จากขั้นที่ 2 จึงเข้าสู่ระบบผ่านหน้าเว็บไม่ได้ ส่วนการได้บทบาท `ADMIN` ผ่านการจับคู่ยศ Gov ก็ต้องมีรหัสเทศบาล Gov Center ที่ Admin ตั้งไว้ก่อน (ถ้ายังไม่ตั้ง ระบบจะปฏิเสธทุกบทบาทที่ไม่ใช่ประชาชน) จึงยังไม่มีทางได้ Admin คนแรกผ่านหน้าเว็บอย่างเดียว

วิธีที่ใช้ได้ตอนนี้ (ทำครั้งเดียวต่อการติดตั้ง):
1. ผู้ที่จะเป็น Admin เข้าสู่ระบบด้วย Gov Center ครั้งแรก ระบบจะสร้างบัญชีบทบาทประชาชน
2. ผู้ติดตั้งระบบยกบัญชีนั้นเป็น Admin ในฐานข้อมูล แล้วบันทึกไว้ในบันทึกการเปลี่ยนแปลงของหน่วยงาน เพราะการแก้ผ่าน SQL ไม่เข้า `audit_event`

   ```sql
   UPDATE app_user SET role='ADMIN', department_id=NULL
   WHERE id=(SELECT local_user_id FROM iam_user_profile WHERE iam_user_id='<Gov IAM user ID>');
   ```
3. ผู้นั้นออกจากระบบแล้วเข้าใหม่ จากนั้นทำขั้นที่ 3–4 ในตาราง

ถ้าต้องการให้ทำผ่านหน้าเว็บได้ทั้งหมด ต้องเพิ่มช่องทางตั้ง Admin คนแรก เช่น ตั้งค่าใน `.env` ให้บัญชี Gov ที่ระบุเป็น Admin อัตโนมัติเมื่อเข้าสู่ระบบครั้งแรก ตอนนี้ยังไม่มีในโค้ด

สิทธิ์ตามยศหรือรายบุคคล: ข้อมูลจาก Gov มีแค่ชื่อและยศ (`roleCode`) ระบบจึงใช้ยศกำหนดบทบาทเริ่มต้นตอนเข้าสู่ระบบครั้งแรก และให้ Admin ปรับรายบุคคลภายหลัง การเปลี่ยนตารางจับคู่ยศไม่ย้อนไปเปลี่ยนบทบาทของบัญชีที่มีอยู่แล้ว

## 2. ประชาชนแจ้งเรื่อง

| ขั้นตอน | Input | เก็บที่ | Output |
| --- | --- | --- | --- |
| ค้นหาเรื่องใกล้เคียง (`GET /api/nearby`) | `latitude`, `longitude`, `categoryId` | — | เรื่องหมวดเดียวกันในรัศมีใกล้เคียง ให้กดสนับสนุน/ติดตามแทนการแจ้งซ้ำ |
| ส่งคำร้อง (`POST /api/complaints`, multipart) | หมวด, หัวข้อ, รายละเอียด, ที่อยู่, พิกัด, ไฟล์ (รูป/วิดีโอ/PDF), ข้อมูลติดต่อ (ไม่บังคับ) | `complaint` (status `NEW`), `attachment` | เลขเรื่อง, สถานะ |
| ติดตาม (`GET /api/citizen/tracking`, `/api/notifications`) | — | — | สถานะและความคืบหน้า |

## 3. เจ้าหน้าที่และหัวหน้า

| Action | ผู้ทำ | Input | สถานะ | ข้อมูลที่เกิดขึ้น |
| --- | --- | --- | --- | --- |
| `TRIAGE` | เจ้าหน้าที่ | `leaderId`, รายละเอียดการมอบหมาย | NEW → TRIAGED | `complaint.leader_id` |
| `REJECT` | เจ้าหน้าที่ | `reason` | NEW → REJECTED | audit |
| `ASSIGN` | หัวหน้า | `teamId` หรือ `assigneeId` (+ `memberIds` 2–50 คน) | TRIAGED → ASSIGNED | `work_order`, `work_member` |
| `RETURN_ASSIGNMENT` / `REASSIGN_LEADER` | หัวหน้า / เจ้าหน้าที่ | `reason` / `leaderId` | ย้อนการมอบหมาย | audit |
| `REQUEST_TRANSFER` → `TRANSFER_DEPARTMENT` / `RETURN_TRANSFER` | หัวหน้า → เจ้าหน้าที่ | กองปลายทาง, หัวหน้ากองใหม่ | TRANSFER_PENDING | `department_transfer` |

`GET /api/people?role=FIELD` คืนรายชื่อ `id`, `display_name`, `department_id`, `gov_role` เพื่อให้หัวหน้าค้นหาและกรองตามยศ

## 4. ผู้ลงพื้นที่

| Action | Input | สถานะ | ข้อมูลที่เกิดขึ้น |
| --- | --- | --- | --- |
| `ACCEPT` / `DECLINE` | `reason` (ปฏิเสธ) | ASSIGNED → ACCEPTED / TRIAGED | `work_order.status` |
| ถ่ายรูปหน้างาน (`POST /api/complaints/{id}/files`, stage `BEFORE`) | รูป JPEG/PNG | — | `attachment` (รอผูกกับงาน) |
| `START` | รูปหน้างาน ≥ 1 รูป (บังคับ), `latitude`/`longitude` (ถ้าอนุญาต GPS) | ACCEPTED/READY → IN_PROGRESS | `attachment.work_order_id`, `work_order.start_latitude/longitude/start_distance_m` |
| `UNDO_START` | `reason` | IN_PROGRESS → สถานะก่อนเริ่ม | ล้างพิกัด, รูปเดิมยังอยู่ |
| `REQUEST_RESOURCE` | `reason`, `items[] {name, quantity, unit}` 1–50 รายการ | ACCEPTED → RESOURCE_DRAFT | `resource_request.requested_items` |
| `WITHDRAW_RESOURCE_REQUEST` | `reason` | RESOURCE_DRAFT → ACCEPTED | `resource_request.status = WITHDRAWN` |
| `REPORT` | `content`, รูป AFTER (BEFORE ใช้รูปตอนเริ่มงานได้) | IN_PROGRESS/FIELD_REVISION → LEADER_REVIEW | `field_report`, `attachment.report_id` |

ระยะห่างตอนเริ่มงาน:
- คำนวณบนเซิร์ฟเวอร์ด้วย `ST_Distance` เทียบกับ `complaint.location`
- ไม่บล็อกการเริ่มงาน เพราะ GPS อาจคลาดเคลื่อนหรือถูกปฏิเสธ
- ถ้าห่างจากจุดแจ้งเกิน 300 ม. หน้าตรวจรายงานจะแสดงคำเตือน

## 5. ทรัพยากรและการอนุมัติ

| Action | ผู้ทำ | Input | สถานะ |
| --- | --- | --- | --- |
| `PROPOSE` | หัวหน้า | `proposal`, `lineItems[] {name, amount}`, `durationDays`, เอกสาร PDF/รูป (prefill จาก `requested_items`) | RESOURCE_DRAFT/REVISION → RESOURCE_CHECK |
| `WITHDRAW_PROPOSAL` | หัวหน้า | `reason` | RESOURCE_CHECK → RESOURCE_REVISION |
| `RETURN_RESOURCE` / `SEND_APPROVAL` | เจ้าหน้าที่ | `reason` / `approverIds` | → RESOURCE_REVISION / RESOURCE_APPROVAL |
| `WITHDRAW_APPROVAL` | เจ้าหน้าที่ | `reason` (ก่อนผู้อนุมัติตัดสิน) | RESOURCE_APPROVAL → RESOURCE_CHECK |
| `APPROVE` / `DENY` | ผู้อนุมัติ | `reason` (DENY เลือกหัวข้อแล้วแก้รายละเอียด) | → READY / TERMINATED |

## 6. ตรวจและปิดงาน

| Action | ผู้ทำ | Input | สถานะ |
| --- | --- | --- | --- |
| `RETURN_FIELD` / `FORWARD_REPORT` | หัวหน้า | `reason` | LEADER_REVIEW → FIELD_REVISION / OFFICER_REVIEW |
| `RETURN_LEADER` / `VERIFY` | เจ้าหน้าที่ | `reason` | OFFICER_REVIEW → LEADER_REVISION / RESOLVED |
| `CLOSE` | เจ้าหน้าที่ | `reason` | RESOLVED → CLOSED |

- ผู้ตรวจเห็นรูปก่อน-หลังแบบเทียบคู่ และป้ายระยะห่างตอนเริ่มงาน
- ข้อมูลเหล่านี้มาจาก `GET /api/complaints/{id}` ในฟิลด์ `files`, `reports` และ `workOrders`

## ข้อมูลที่ส่งออกให้ผู้ใช้

| Endpoint | ผู้ใช้ | ข้อมูล |
| --- | --- | --- |
| `GET /api/complaints` | เจ้าหน้าที่/หัวหน้า/ผู้ลงพื้นที่/ผู้อนุมัติ | คิวงานตามบทบาท + สถิติ |
| `GET /api/complaints/{id}` | ผู้เกี่ยวข้องกับเรื่อง | complaint, actions ที่ทำได้, history, files, resources, reports, reviews, workOrders, approvals, transfers |
| `GET /api/community/complaints` | ประชาชน | เรื่องใกล้เคียงแบบสาธารณะ (ตัดข้อมูลส่วนตัว) |
| `GET /api/emergency/nearby` | ประชาชน | เบอร์หน่วยงานในพื้นที่ตาม GPS ก่อนเบอร์ส่วนกลาง |
| `GET /api/admin/audit` | ผู้ดูแล | ประวัติการดำเนินการ (แก้ไข/ลบไม่ได้) |
