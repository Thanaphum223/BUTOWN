export const MAX_ATTACHMENT_BYTES = 1_000_000_000;
// MIME types let phone pickers offer the camera and photo library, not only the file browser.
export const ATTACHMENT_ACCEPT =
  "image/jpeg,image/png,application/pdf,video/mp4,video/quicktime,video/webm,.png,.jpg,.jpeg,.pdf,.mp4,.mov,.webm";
export const ATTACHMENT_HELP =
  "รูปภาพ PNG/JPEG, PDF และวิดีโอ MP4/MOV/WebM รวมทั้งหมดต่อคำร้องไม่เกิน 1 GB (1,000 MB)";
export function attachmentError(file: File, used: number): string | undefined {
  if (
    !/\.(png|jpe?g|pdf|mp4|mov|webm)$/i.test(file.name) &&
    !/^(image\/(jpeg|png)|application\/pdf|video\/(mp4|quicktime|webm))$/.test(file.type)
  )
    return "รองรับรูปภาพ PNG/JPEG, PDF และวิดีโอ MP4/MOV/WebM";
  if (!file.size) return "ไฟล์ต้องไม่ว่าง";
  if (used + file.size > MAX_ATTACHMENT_BYTES)
    return "ไฟล์แนบรวมทั้งหมดต่อคำร้องต้องไม่เกิน 1 GB (1,000 MB)";
}
