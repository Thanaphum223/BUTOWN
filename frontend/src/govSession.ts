import { api, post, refreshCsrf } from "./api";
import { govClient, type GovConfig } from "./govSso";

const pauseKey = "towntrack_gov_reuse_paused";
let automaticAttempt: Promise<boolean> | undefined;
let exchange: Promise<boolean> | undefined;
export function pauseGovReuse() {
  sessionStorage.setItem(pauseKey, "1");
}

// The library's optional session endpoint is not available on every Gov deployment.
// A browser profile or opaque token is never proof of identity: only verify-code is.
export function reuseGovSession(config: GovConfig): Promise<boolean> {
  if (exchange) return exchange;
  exchange = (async () => {
    if (!config.configured || new URL(config.callbackUrl).origin !== location.origin) return false;
    const abort = new AbortController(),
      timer = window.setTimeout(() => abort.abort(), 5000);
    let code: unknown;
    try {
      const url = new URL("/auth/session", config.iamAuthUrl);
      url.searchParams.set("service", config.serviceCode);
      const response = await fetch(url, {
        credentials: "include",
        redirect: "error",
        signal: abort.signal,
      });
      if (!response.ok || !response.headers.get("content-type")?.includes("application/json"))
        return false;
      code = (await response.json()).code;
    } catch {
      return false;
    } finally {
      window.clearTimeout(timer);
    }
    if (typeof code !== "string" || !code.trim() || code.length > 10000) return false;
    const state = new URL(govClient(config).getLoginUrl()).searchParams.get("state");
    try {
      await post("/auth/gov/start", { state, purpose: "REUSE" });
      const result = await post("/auth/sso-callback", { code: code.trim(), state });
      if (!result?.success) throw new Error("ยืนยันข้อมูลจาก Gov Center ไม่สำเร็จ");
      await refreshCsrf();
      sessionStorage.removeItem(pauseKey);
      return true;
    } finally {
      sessionStorage.removeItem("gov_sso_state");
    }
  })().finally(() => {
    exchange = undefined;
  });
  return exchange;
}
export function automaticGovSession(): Promise<boolean> {
  if (sessionStorage.getItem(pauseKey)) return Promise.resolve(false);
  // StrictMode mounts twice; one-use codes must only be exchanged once.
  return (automaticAttempt ??= api<GovConfig>("/public/gov-auth", {
    signal: AbortSignal.timeout(5000),
  })
    .then(reuseGovSession)
    .catch(() => false));
}
