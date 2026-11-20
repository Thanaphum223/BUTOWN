export type GovCallbackReturn = {
  code: string | null;
  state: string | null;
  service: string | null;
  error: string;
  errorCode?: string;
  // Parameter names only (never values), shown with a failure to tell which part was missing.
  keys: string[];
};

// Gov can append "?code=..." to a callback that already carries "?state=...", and may return
// parameters in the fragment instead of the query. Fold both into one set of parameters.
function returnedParameters(search: string, hash: string) {
  const query = new URLSearchParams(search);
  const states = query.getAll("state");
  const joined = states.length === 1 ? /^([a-f0-9]{64})\?(.*)$/s.exec(states[0]) : null;
  if (joined) {
    query.set("state", joined[1]);
    new URLSearchParams(joined[2]).forEach((value, key) => query.append(key, value));
  }
  if (!query.has("code"))
    new URLSearchParams(hash.replace(/^#/, "")).forEach((value, key) => query.append(key, value));
  return query;
}

// Runs before importing the app, loading config or rendering React. Gov may
// accompany its service-scoped code with a parent IAM ticket: never retain it.
export function captureGovReturn(): GovCallbackReturn | null {
  const { pathname, search, hash } = window.location;
  const query = returnedParameters(search, hash);
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
  let errorCode: string | undefined;
  const securityError = "การตรวจสอบความปลอดภัยไม่สำเร็จ กรุณาเริ่มเข้าสู่ระบบใหม่";
  // Gov sometimes echoes state onto a callback that already carries it; identical copies are
  // unambiguous, differing ones are not.
  if (
    ["code", "state", "service", "error", "auth_status", "is_new_user"].some(
      (key) => new Set(query.getAll(key)).size > 1,
    )
  ) {
    error = securityError;
    errorCode = "S2";
  } else if (["access_token", "refresh_token", "id_token"].some((key) => query.has(key))) {
    error = securityError;
    errorCode = "S3";
  } else if (query.has("error"))
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
    errorCode,
    keys: [...new Set(query.keys())],
  };
}
