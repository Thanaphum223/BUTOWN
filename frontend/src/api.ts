import { getLanguage, translate } from "./i18n/core";
export const authUnavailableMessage =
  "ระบบยืนยันตัวตนส่วนกลางไม่พร้อมให้บริการ (503) กรุณาลองเข้าสู่ระบบอีกครั้ง";
export class AuthUnavailableError extends Error {
  constructor(readonly detail = "") {
    super(authUnavailableMessage);
  }
}
async function responseErrorDetail(response: Response): Promise<string> {
  try {
    const body = await response.json();
    return typeof body?.message === "string" ? body.message : "";
  } catch {
    return "";
  }
}
function isAuthEndpoint(url: string) {
  return new Set([
    "/auth/me",
    "/auth/csrf",
    "/auth/gov/start",
    "/auth/gov/register",
    "/auth/gov/password-login",
    "/auth/sso-callback",
    "/public/gov-auth",
  ]).has(url.split("?")[0]);
}
export const sessionExpiredEvent = "towntrack:session-expired";
export const sessionExpiredMessage = "เซสชันหมดอายุหรือออกจากระบบแล้ว กรุณาเข้าสู่ระบบอีกครั้ง";
function expireSession() {
  csrf = "";
  window.dispatchEvent(new Event(sessionExpiredEvent));
}
let csrf = "";
let header = "X-CSRF-TOKEN";
export async function refreshCsrf() {
  const r = await fetch("/api/auth/csrf", { credentials: "same-origin" });
  if (!r.ok) {
    if (r.status === 401) expireSession();
    if (r.status === 503) throw new AuthUnavailableError(await responseErrorDetail(r));
    throw new Error("การตรวจสอบความปลอดภัยไม่สำเร็จ กรุณาเริ่มเข้าสู่ระบบใหม่");
  }
  const d = await r.json();
  csrf = d.token;
  header = d.headerName;
}
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T = any>(url: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method || "GET").toUpperCase();
  if (!["GET", "HEAD"].includes(method) && !csrf) await refreshCsrf();
  const headers = new Headers(options.headers);
  if (!["GET", "HEAD"].includes(method)) headers.set(header, csrf);
  if (
    options.body &&
    !(options.body instanceof FormData) &&
    !(options.body instanceof URLSearchParams)
  )
    headers.set("Content-Type", "application/json");
  const r = await fetch("/api" + url, {
    ...options,
    headers,
    credentials: "same-origin",
  });
  if (!r.ok) {
    if (r.status === 401) expireSession();
    const message =
      r.status === 401
        ? "กรุณาเข้าสู่ระบบ"
        : r.status === 403
          ? "ไม่มีสิทธิ์ดำเนินการ หรือเซสชันหมดอายุ"
          : r.status === 429
            ? "ทำรายการถี่เกินไป กรุณารอสักครู่แล้วลองอีกครั้ง"
            : r.status === 413
              ? "ไฟล์มีขนาดเกินที่ระบบรองรับ กรุณาตรวจขนาดไฟล์แนบ"
              : r.status === 503
                ? "ระบบยังไม่พร้อมให้บริการชั่วคราว กรุณาลองอีกครั้ง"
                : "ดำเนินการไม่สำเร็จ";
    const detail = await responseErrorDetail(r);
    if (r.status === 503 && isAuthEndpoint(url)) throw new AuthUnavailableError(detail);
    throw new ApiError(r.status, detail || message);
  }
  if (r.status === 204 || r.headers.get("content-length") === "0") return undefined as T;
  const text = await r.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
export async function uploadFile<T = any>(
  url: string,
  body: FormData,
  progress: (percent: number) => void,
): Promise<T> {
  if (!csrf) await refreshCsrf();
  return await new Promise<T>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", "/api" + url);
    request.withCredentials = true;
    request.setRequestHeader(header, csrf);
    request.timeout = 20 * 60 * 1000;
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) progress(Math.round((event.loaded / event.total) * 100));
    };
    request.onload = () => {
      let result: any;
      try {
        result = JSON.parse(request.responseText);
      } catch {
        result = {};
      }
      if (request.status >= 200 && request.status < 300) resolve(result);
      else {
        if (request.status === 401) expireSession();
        reject(
          new Error(
            result.message ||
              (request.status === 401
                ? sessionExpiredMessage
                : request.status === 429
                  ? "ทำรายการถี่เกินไป กรุณารอสักครู่แล้วแนบไฟล์อีกครั้ง"
                  : request.status === 413
                    ? "ไฟล์มีขนาดเกินที่ระบบรองรับ"
                    : "ส่งไฟล์ไม่สำเร็จ กรุณาลองอีกครั้ง"),
          ),
        );
      }
    };
    request.onerror = () =>
      reject(new Error("เชื่อมต่อไม่ได้ กรุณาตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง"));
    request.ontimeout = () => reject(new Error("ส่งไฟล์นานเกินกำหนด กรุณาลองอีกครั้ง"));
    request.onabort = () => reject(new Error("ยกเลิกการส่งไฟล์แล้ว"));
    request.send(body);
  });
}

export const post = (url: string, data: unknown) =>
  api(url, { method: "POST", body: JSON.stringify(data) });
export const statusNames: Record<string, string> = {
  DEPARTMENT_RETURNED: "รอเจ้าหน้าที่จ่ายงานใหม่",
  TRANSFER_PENDING: "รอส่งต่อให้หน่วยงานอื่น",
  NEW: "รอรับเรื่อง",
  TRIAGED: "รอจัดทีม",
  ASSIGNED: "รอทีมรับงาน",
  ACCEPTED: "ทีมรับงานแล้ว",
  RESOURCE_DRAFT: "รอจัดทำข้อเสนอ",
  RESOURCE_CHECK: "รอตรวจเอกสาร",
  RESOURCE_REVISION: "แก้ไขข้อเสนอ",
  RESOURCE_APPROVAL: "รออนุมัติทรัพยากร",
  READY: "อนุมัติแล้ว รอเริ่มงาน",
  IN_PROGRESS: "กำลังดำเนินการ",
  LEADER_REVIEW: "รอหัวหน้าตรวจรายงาน",
  FIELD_REVISION: "แก้ไขรายงาน",
  OFFICER_REVIEW: "รอเจ้าหน้าที่ตรวจรายงาน",
  LEADER_REVISION: "ส่งกลับหัวหน้าแก้ไข",
  RESOLVED: "ตรวจผ่าน รอปิดเรื่อง",
  CLOSED: "ปิดเรื่องแล้ว",
  TERMINATED: "ยุติเรื่องตามผลพิจารณา",
  REJECTED: "ไม่รับคำร้อง",
};
export const actionNames: Record<string, string> = {
  RETURN_ASSIGNMENT: "ส่งคืนงานที่จ่ายผิด",
  REASSIGN_LEADER: "เลือกหัวหน้าหน่วยงานใหม่",
  REQUEST_TRANSFER: "ส่งต่อหน่วยงานอื่น",
  TRANSFER_DEPARTMENT: "จ่ายงานให้หน่วยงานถัดไป",
  RETURN_TRANSFER: "ส่งกลับแก้ไขคำขอส่งต่อ",
  CREATE: "ยื่นคำร้อง",
  TRIAGE: "รับเรื่องและส่งหน่วยงาน",
  REJECT: "ไม่รับคำร้อง",
  ASSIGN: "มอบหมายทีม",
  ACCEPT: "รับงาน",
  DECLINE: "ปฏิเสธงาน",
  REQUEST_RESOURCE: "ขอใช้ทรัพยากร",
  PROPOSE: "ส่งข้อเสนอทรัพยากร",
  RETURN_RESOURCE: "ส่งกลับแก้ไขเอกสาร",
  SEND_APPROVAL: "ส่งพิจารณาอนุมัติ",
  APPROVE: "อนุมัติทรัพยากร",
  DENY: "ไม่อนุมัติและยุติคำร้อง",
  START: "เริ่มปฏิบัติงาน",
  REPORT: "ส่งรายงานผล",
  RETURN_FIELD: "ส่งกลับทีมแก้ไข",
  FORWARD_REPORT: "ส่งรายงานให้เจ้าหน้าที่",
  RETURN_LEADER: "ส่งกลับหัวหน้าแก้ไข",
  VERIFY: "ตรวจรายงานผ่าน",
  CLOSE: "ปิดเรื่อง",
};
export const roleNames: Record<string, string> = {
  CITIZEN: "ประชาชน",
  OFFICER: "เจ้าหน้าที่ส่วนกลาง (สำนักปลัด/ศูนย์รับเรื่องราวร้องทุกข์)",
  LEADER: "หัวหน้าทีมลงพื้นที่",
  FIELD: "ผู้ลงพื้นที่",
  APPROVER: "ผู้อนุมัติ",
  ADMIN: "ผู้ดูแลระบบ",
};
export const date = (v: string) =>
  v
    ? new Date(v).toLocaleString(getLanguage() === "en" ? "en-GB" : "th-TH", {
        timeZone: "Asia/Bangkok",
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";

export const requiredReasonActions = new Set([
  "REJECT",
  "DECLINE",
  "RETURN_ASSIGNMENT",
  "REASSIGN_LEADER",
  "REQUEST_RESOURCE",
  "RETURN_RESOURCE",
  "RETURN_FIELD",
  "RETURN_LEADER",
  "REQUEST_TRANSFER",
  "TRANSFER_DEPARTMENT",
  "RETURN_TRANSFER",
  "APPROVE",
  "DENY",
  "CLOSE",
]);
export function progressLabel(item: Record<string, any>) {
  return item.transfer_department_name
    ? translate("กำลังดำเนินการ · ส่งต่อให้หน่วยงาน {{department}} รับช่วงต่อ", {
        department: item.transfer_department_name,
      })
    : translate(statusNames[item.status] || item.status);
}
