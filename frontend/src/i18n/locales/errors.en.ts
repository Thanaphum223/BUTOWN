// Exact application-owned error messages exposed by the local backend.
// Unknown/authored text is left intact by translate(); Gov 503 source detail is
// rendered separately and never passed through this catalog.
const messages: Record<string, string> = {
  "เลือกวัสดุจากคลังได้รายการละ 1 ครั้ง": "Each stock item can be chosen only once.",
  "ครุภัณฑ์ต้องยื่นขอใช้ทรัพยากรและได้รับอนุมัติก่อนนำออกใช้ เบิกหน้างานได้เฉพาะวัสดุสิ้นเปลือง":
    "Equipment needs an approved resource request before it leaves the store. Only consumables can be taken on site.",
  "กรุณาระบุเหตุผลการลบไม่เกิน 500 ตัวอักษร":
    "Please give a reason for deletion of up to 500 characters.",
  "คำร้องนี้ยังมีอุปกรณ์ที่เบิกออกและยังไม่คืน กรุณาคืนก่อนลบ":
    "Equipment issued for this report has not been returned yet. Return it before deleting.",
  "กรุณาระบุ name ให้ถูกต้อง": "Please enter a valid name.",
  "กรุณาระบุ role ให้ถูกต้อง": "Please enter a valid role.",
  "กรุณาระบุ username ให้ถูกต้อง": "Please enter a valid username.",
  "กรุณาระบุ password ให้ถูกต้อง": "Please enter a valid password.",
  "กรุณาระบุ displayName ให้ถูกต้อง": "Please enter a valid display name.",
  "กรุณาระบุ currentPassword ให้ถูกต้อง": "Please enter a valid current password.",
  "กรุณาระบุ newPassword ให้ถูกต้อง": "Please enter a valid new password.",
  "กรุณาระบุ reason ให้ถูกต้อง": "Please enter a valid reason.",
  "กรุณาระบุ action ให้ถูกต้อง": "Please enter a valid action.",
  "กรุณาระบุ content ให้ถูกต้อง": "Please enter a valid report content.",
  "กรุณาระบุ proposal ให้ถูกต้อง": "Please enter a valid proposal.",
  "กรุณาระบุ idToken ให้ถูกต้อง": "Please enter a valid LINE identity token.",

  "ข้อมูลเปลี่ยนแล้ว กรุณาโหลดใหม่": "The data has changed. Please reload.",
  รหัสผ่านเดิมไม่ถูกต้อง: "The current password is incorrect.",
  ไม่พบข้อมูลหรือไม่มีสิทธิ์: "The record was not found or you do not have permission.",
  รหัสข้อมูลไม่ถูกต้อง: "The record ID is invalid.",
  "version ไม่ถูกต้อง": "The record version is invalid.",
  "รหัสส่งซ้ำถูกใช้กับข้อมูลคนละชุด กรุณาเริ่มรายการใหม่":
    "This submission key was used with different data. Please start a new submission.",
  "ประกาศเปลี่ยนแล้ว กรุณาอ่านฉบับล่าสุด":
    "The notice has changed. Please read the latest version.",
  ไม่พบไฟล์หลักฐาน: "The evidence file was not found.",
  กรุณายืนยันว่าตรวจและปกปิดข้อมูลส่วนบุคคลแล้ว:
    "Please confirm that you have reviewed and redacted personal information.",
  เผยแพร่ได้เฉพาะภาพหรือวิดีโอ: "Only images or videos can be published.",
  "งานนี้เคยมอบหมายผู้ลงพื้นที่แล้ว ไม่สามารถส่งคืนแบบจ่ายงานผิดได้":
    "This task has already been assigned to field staff and cannot be returned as an incorrect assignment.",
  ยังไม่ได้ตั้งค่าระบบตรวจไฟล์: "File scanning has not been configured.",
  "ระบบตรวจไฟล์ไม่พร้อม กรุณาลองแนบไฟล์อีกครั้งในอีกสักครู่":
    "The file scanner is not ready. Please attach the file again in a moment.",
  ไฟล์ไม่ผ่านการตรวจสอบ: "The file did not pass validation.",
  "หลักฐาน BEFORE/AFTER ต้องเป็นภาพถ่าย": "BEFORE/AFTER evidence must be photographs.",
  "รองรับ PNG, JPEG, PDF และวิดีโอ MP4, MOV, WebM ที่มีรูปแบบไฟล์ถูกต้อง":
    "Supported formats are valid PNG, JPEG, PDF, MP4, MOV and WebM files.",
  "ไม่พบไฟล์เอกสาร กรุณาติดต่อเจ้าหน้าที่":
    "The document file was not found. Please contact staff.",
  "ต้องมีภาพ BEFORE และ AFTER ของรายงานฉบับล่าสุดก่อนตรวจผ่านหรือปิดเรื่อง":
    "The latest report must include BEFORE and AFTER photos before it can be accepted or closed.",
  รายงานฉบับล่าสุดยังไม่ผ่านหัวหน้าผู้ลงพื้นที่:
    "The latest report has not yet been approved by the field supervisor.",
  รายงานฉบับล่าสุดยังไม่ผ่านการตรวจรับของเจ้าหน้าที่:
    "The latest report has not yet been accepted by the central officer.",
  กรุณาแนบหลักฐานก่อนส่งรายงาน: "Please attach evidence before submitting the report.",
  "กรุณาแนบภาพก่อนทำ BEFORE และหลังทำ AFTER ให้ครบ": "Please attach both BEFORE and AFTER photos.",
  กรุณาแนบหลักฐานประกอบข้อเสนอ: "Please attach supporting evidence for the proposal.",
  กรุณาเลือกผู้อนุมัติให้ครบตามลำดับและไม่ซ้ำคน:
    "Please select all approvers in order without selecting anyone more than once.",
  ไม่รองรับการดำเนินการนี้: "This action is not supported.",
  "Mapbox ไม่พร้อม กรุณาปักหมุดหรือกรอกที่อยู่เอง":
    "Mapbox is unavailable. Please place a pin or enter the address yourself.",
  "ยังไม่ได้ตั้งค่าบริการค้นหาสถานที่ กรุณาปักหมุดหรือกรอกที่อยู่เอง":
    "Place search has not been configured. Please place a pin or enter the address yourself.",
  กรุณารอสักครู่แล้วค้นหาอีกครั้ง: "Please wait a moment and search again.",
  "บริการแผนที่ไม่พร้อม กรุณาปักหมุดเอง":
    "The map service is unavailable. Please place a pin yourself.",
  จุดค้นหาหรือประเภทสถานที่ไม่ถูกต้อง: "The search location or place type is invalid.",
  "ค้นหาสถานที่ไม่ได้ในขณะนี้ กรุณาใช้เบอร์สายด่วนด้านบน หรือลองอีกครั้ง":
    "Place search is currently unavailable. Please use the hotline numbers above or try again.",
  "บริการค้นหาสถานที่ไม่พร้อม กรุณาใช้เบอร์สายด่วนด้านบน":
    "The place search service is unavailable. Please use the hotline numbers above.",
  "ข้อมูลเริ่มต้น SSO ไม่ถูกต้อง": "The SSO initialization data is invalid.",
  กรุณาเข้าสู่ระบบก่อนเชื่อมบัญชี: "Please sign in before linking your account.",
  "บัญชีที่กำลังเชื่อมเปลี่ยนไป กรุณาเริ่มใหม่":
    "The account being linked has changed. Please start again.",
  "การตรวจสอบ SSO ไม่สำเร็จ กรุณาเริ่มเข้าสู่ระบบใหม่":
    "SSO verification failed. Please start signing in again.",
  "กรุณาตรวจสอบเทศบาลใน TownTrack ต้องมีเพียงหนึ่งแห่งสำหรับเริ่มเข้าสู่ระบบ Gov Center":
    "Please check the TownTrack municipality configuration. Exactly one municipality is required to start Gov Center sign-in.",
  "บัญชีหรือ Session เปลี่ยนไป กรุณาเริ่มเข้าสู่ระบบใหม่":
    "The account or session has changed. Please start signing in again.",
  "ไม่พบรหัส SSO กรุณาเข้าสู่ระบบใหม่": "The SSO code was not found. Please sign in again.",
  "รหัส SSO ไม่ถูกต้อง หมดอายุ หรือใช้แล้ว กรุณาเข้าสู่ระบบใหม่":
    "The SSO code is invalid, expired or already used. Please sign in again.",
  "Gov Center ปฏิเสธการเชื่อมต่อ กรุณาให้ผู้ดูแลตรวจ API Key, Service Code และสิทธิ์บริการ":
    "Gov Center refused the connection. Ask an administrator to check the API key, service code and service permissions.",
  "Gov Center ไม่พร้อมใช้งาน กรุณาเริ่มเข้าสู่ระบบใหม่":
    "Gov Center is unavailable. Please start signing in again.",
  "การเชื่อมต่อ Gov Center ถูกขัดจังหวะ กรุณาเข้าสู่ระบบใหม่":
    "The Gov Center connection was interrupted. Please sign in again.",
  "ข้อมูลตอบกลับ Gov Center ไม่ถูกต้อง": "The Gov Center response is invalid.",
  "เชื่อมต่อ Gov Center ไม่สำเร็จ กรุณาเข้าสู่ระบบใหม่":
    "Unable to connect to Gov Center. Please sign in again.",
  "ข้อมูลผู้ใช้หรือข้อมูลบ้านจาก Gov Center ไม่ถูกต้อง":
    "The user or residence data from Gov Center is invalid.",
  "บัญชี Gov Center นี้เชื่อมกับบัญชีอื่นแล้ว":
    "This Gov Center account is already linked to another account.",
  "บัญชีนี้เชื่อมกับ Gov Center อื่นแล้ว":
    "This account is already linked to a different Gov Center account.",
  "บัญชี TownTrack ถูกระงับการใช้งาน": "This TownTrack account has been suspended.",
  "สมัครบัญชี Gov Center สำเร็จแล้ว แต่ยังเข้า TownTrack ไม่สำเร็จ กรุณาเข้าสู่ระบบด้วยอีเมล Gov Center อีกครั้ง":
    "Your Gov Center account was created, but TownTrack sign-in failed. Please sign in again with your Gov Center email.",
  "อีเมลนี้มีบัญชี Gov Center แล้ว กรุณาเข้าสู่ระบบด้วยอีเมล Gov Center":
    "This email already has a Gov Center account. Please sign in with your Gov Center email.",
  "อีเมลหรือรหัสผ่าน Gov Center ไม่ถูกต้อง": "The Gov Center email or password is incorrect.",
  "Gov Center ไม่รับคำขอสมัคร กรุณาลองเข้าสู่ระบบด้วยอีเมลก่อนสมัครใหม่":
    "Gov Center did not accept the registration request. Please try signing in with your email before registering again.",
  "Gov Center ไม่พร้อมเข้าสู่ระบบ กรุณาลองใหม่ภายหลัง":
    "Gov Center sign-in is unavailable. Please try again later.",
  "เชื่อมต่อ Gov Center ไม่สำเร็จ กรุณาลองเข้าสู่ระบบใหม่":
    "Unable to connect to Gov Center. Please try signing in again.",
  "ข้อมูลตอบกลับ Gov Center ไม่ถูกต้อง กรุณาลองเข้าสู่ระบบด้วยอีเมล Gov Center":
    "The Gov Center response is invalid. Please try signing in with your Gov Center email.",
  "ยังไม่ได้ตั้งค่า LINE": "LINE has not been configured.",
  "ไม่สามารถยืนยันบัญชี LINE ได้": "Unable to verify the LINE account.",
  "LINE Token ไม่ถูกต้อง": "The LINE token is invalid.",
  "Gov Center ไม่ได้ส่งรหัสบทบาทของบริการ TownTrack":
    "Gov Center did not provide a role code for the TownTrack service.",
  "พบบทบาท Gov Center หลายบทบาทที่ขัดกัน กรุณาให้ผู้ดูแลตรวจการจับคู่บทบาท":
    "Conflicting Gov Center roles were found. Ask an administrator to check the role mappings.",
  "ข้อมูลบทบาทจาก Gov Center ไม่มีรหัสเทศบาล กรุณาให้ผู้ดูแลตรวจข้อมูลสิทธิ์ใน Gov Center":
    "The Gov Center role data has no municipality ID. Ask an administrator to check the permissions in Gov Center.",
  "กรุณาให้ผู้ดูแลระบุรหัสเทศบาล Gov Center ในหน้าจับคู่บทบาทก่อนให้บุคลากรเข้าสู่ระบบ":
    "Ask an administrator to enter the Gov Center municipality ID in role mappings before staff sign in.",
  "ไฟล์แนบมีขนาดเกินกำหนด (ไฟล์ละไม่เกิน 100 MB และรวมต่อคำร้องฝั่งประชาชนไม่เกิน 300 MB)":
    "Attachments are too large (up to 100 MB per file and 300 MB in total per citizen report)",
};
export default messages;
