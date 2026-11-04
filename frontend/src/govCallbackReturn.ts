export type GovCallbackReturn = {
  code: string | null;
  state: string | null;
  service: string | null;
  error: string;
};

// Runs before importing the app, loading config or rendering React. Gov may
// accompany its service-scoped code with a parent IAM ticket: never retain it.
export function captureGovReturn(): GovCallbackReturn | null {
  const { pathname, search } = window.location;
  const query = new URLSearchParams(search);
  const callback =
    pathname === "/auth/callback" ||
    pathname === "/auth/callback/" ||
    (pathname === "/" &&
      query.has("code") &&
      query.get("lineLogin") !== "1" &&
      !query.has("liff.state"));
  if (!callback) return null;
  window.history.replaceState({}, "", pathname);
  let error = "";
  if (
    ["code", "state", "service", "error", "auth_status", "is_new_user"].some(
      (key) => query.getAll(key).length > 1,
    ) ||
    ["access_token", "refresh_token", "id_token"].some((key) => query.has(key))
  )
    error = "การตรวจสอบความปลอดภัยไม่สำเร็จ กรุณาเริ่มเข้าสู่ระบบใหม่";
  else if (query.has("error"))
    error = "Gov Center ไม่ได้อนุมัติการเข้าสู่ระบบ กรุณาเริ่มเข้าสู่ระบบใหม่";
  else if (
    query.has("auth_status") ||
    (query.has("is_new_user") && !["true", "false"].includes(query.get("is_new_user")!))
  )
    error = "กรุณาลงทะเบียนข้อมูลบัญชี Gov Center ให้ครบ แล้วเริ่มเข้าสู่ระบบใหม่";
  return {
    code: query.get("code"),
    state: query.get("state"),
    service: query.get("service"),
    error,
  };
}
