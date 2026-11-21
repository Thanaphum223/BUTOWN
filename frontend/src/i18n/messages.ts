import errors from "./locales/errors.en";
import shared from "./locales/shared.en";
import auth from "./locales/auth.en";
import citizen from "./locales/citizen.en";
import staff from "./locales/staff.en";
import admin from "./locales/admin.en";
import features from "./locales/features.en";
export const englishMessages: Record<string, string> = {
  "กรุณาแนบเอกสารคำขอ PDF หรือรูปภาพ PNG/JPEG": "Attach a PDF document or PNG/JPEG image.",
  "รองรับเอกสาร PDF หรือรูปภาพ PNG/JPEG": "Use a PDF document or a PNG/JPEG image",
  "ไฟล์เอกสารแต่ละไฟล์ต้องไม่เกิน 15 MB": "Each document must be no larger than 15 MB",
  ถ่ายรูปเอกสาร: "Take a document photo",
  "เลือกรูปหรือเอกสาร PDF": "Choose an image or PDF",
  ผู้ขอทรัพยากร: "Requested by",
  ความจำเป็นในการขอทรัพยากร: "Reason for requesting resources",
  ไม่พบบันทึกความจำเป็นของคำขอเดิม: "The original request reason is unavailable",
  ไม่ระบุชื่อผู้ขอ: "Requester name unavailable",
  "ใช้ไฟล์ PDF เท่านั้น": "Use a PDF file only",
  "กรุณาแนบเอกสารคำขอ PDF หรือรูปภาพ PNG/JPEG ขนาดไม่เกิน 15 MB ต่อไฟล์ในแบบฟอร์มนี้":
    "Attach a PDF document or PNG/JPEG image of up to 15 MB per file in this form.",
  "เอกสารคำขอ (PDF หรือ PNG/JPEG ไม่เกิน 15 MB ต่อไฟล์)":
    "Request documents (PDF or PNG/JPEG, up to 15 MB per file)",
  "3. วิดีโอหรือเอกสารประกอบเพิ่มเติม (ไม่บังคับ)": "3. Additional videos or documents (optional)",
  กำลังโหลดตำแหน่ง: "Loading location",
  โหลดตำแหน่งไม่สำเร็จ: "Unable to load location",
  "กำลังดำเนินการ · ส่งต่อให้หน่วยงาน {{department}} รับช่วงต่อ":
    "In progress \u00b7 Handing over to {{department}}",

  "เซสชันหมดอายุหรือออกจากระบบแล้ว กรุณาเข้าสู่ระบบอีกครั้ง":
    "Your session has expired or you have signed out. Please sign in again.",
  ...errors,
  ...shared,
  ...auth,
  ...citizen,
  ...staff,
  ...admin,
  ...features,
};
