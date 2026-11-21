import { translate } from "./i18n/core";
export const MAX_FILE_BYTES = 100_000_000;
export const MAX_ATTACHMENT_BYTES = 300_000_000;
// MIME types let phone pickers offer the camera and photo library, not only the file browser.
export const ATTACHMENT_ACCEPT =
  "image/jpeg,image/png,application/pdf,video/mp4,video/quicktime,video/webm,.png,.jpg,.jpeg,.pdf,.mp4,.mov,.webm";
export const ATTACHMENT_HELP =
  "รูปภาพ PNG/JPEG, PDF และวิดีโอ MP4/MOV/WebM ไฟล์ละไม่เกิน 100 MB รวมทั้งหมดต่อคำร้องไม่เกิน 300 MB";
const mb = (bytes: number) => (bytes / 1_000_000).toFixed(1);
export function attachmentError(file: File, used: number): string | undefined {
  if (
    !/\.(png|jpe?g|pdf|mp4|mov|webm)$/i.test(file.name) &&
    !/^(image\/(jpeg|png)|application\/pdf|video\/(mp4|quicktime|webm))(;.*)?$/.test(file.type)
  )
    return "รองรับรูปภาพ PNG/JPEG, PDF และวิดีโอ MP4/MOV/WebM";
  if (!file.size) return "ไฟล์ต้องไม่ว่าง";
  // Translated here because the sizes are part of the message.
  if (file.size > MAX_FILE_BYTES)
    return translate(
      "ไฟล์นี้ขนาด {{size}} MB เกินเพดานไฟล์ละ 100 MB อยู่ {{over}} MB ลองใช้ปุ่มถ่ายวิดีโอในระบบแทน",
      { size: mb(file.size), over: mb(file.size - MAX_FILE_BYTES) },
    );
  if (used + file.size > MAX_ATTACHMENT_BYTES)
    return translate("ไฟล์แนบรวมจะเป็น {{size}} MB เกินเพดาน 300 MB ต่อคำร้องอยู่ {{over}} MB", {
      size: mb(used + file.size),
      over: mb(used + file.size - MAX_ATTACHMENT_BYTES),
    });
}
