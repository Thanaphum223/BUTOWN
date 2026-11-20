import { useEffect, useState } from "react";
import { GovSsoClient } from "gov-sso-login";
import { api, AuthUnavailableError } from "./api";
export type GovConfig = {
  mode: string;
  configured: boolean;
  iamAuthUrl: string;
  serviceCode: string;
  callbackUrl: string;
};
export function govClient(config: GovConfig) {
  return new GovSsoClient({
    iamAuthUrl: config.iamAuthUrl,
    serviceCode: config.serviceCode,
    callbackUrl: config.callbackUrl,
    apiBaseUrl: window.location.origin + "/api",
    ssoCallbackPath: "/auth/sso-callback",
  });
}
function govTransaction(config: GovConfig) {
  const callback = new URL(config.callbackUrl);
  if (callback.origin !== window.location.origin || callback.search || callback.hash)
    throw new Error("กรุณาเข้า TownTrack ด้วยโดเมนที่ลงทะเบียน SSO ไว้");
  const sdkUrl = new URL(govClient(config).getLoginUrl());
  const state = sdkUrl.searchParams.get("state");
  if (!state || !/^[a-f0-9]{64}$/.test(state))
    throw new Error("สร้างคำขอเข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่");
  // Gov's auth helpers do not consistently forward an outer state parameter.
  // Preserve the browser/server nonce on our configured return destination too.
  callback.searchParams.set("state", state);
  return { callback, state };
}
// Gov's callback page forwards the service code only to these domains, so LINE sign-in cannot
// finish anywhere else (password sign-in still works: our server talks to Gov directly).
function govForwardsTo(host: string) {
  const name = host.toLowerCase();
  return (
    ["localhost", "127.0.0.1", "::1"].includes(name) ||
    ["govcenter.co", "gov.co"].some((domain) => name === domain || name.endsWith("." + domain))
  );
}

export function govLineLogin(config: GovConfig) {
  if (!govForwardsTo(new URL(config.callbackUrl).hostname))
    throw new Error(
      "เข้าสู่ระบบด้วย LINE ใช้ได้เมื่อเว็บอยู่บนโดเมน govcenter.co หรือ gov.co กรุณาเข้าสู่ระบบด้วยอีเมลและรหัสผ่าน",
    );
  const { callback, state } = govTransaction(config);
  // Same route as Gov's own LINE button: LINE returns to Gov's callback page, which signs the
  // user in to Gov, creates a code for this service and then forwards it to our callback.
  // Returning to our callback directly arrives with no code.
  const govCallback = new URL("/auth/callback", config.iamAuthUrl);
  govCallback.searchParams.set("callback", callback.toString());
  const govState = new URLSearchParams({
    callback: govCallback.toString(),
    service: config.serviceCode,
  });
  const url = new URL("https://access.line.me/oauth2/v2.1/authorize");
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: "2008946775",
    redirect_uri: "https://api-auth.govcenter.co/auth/line/callback",
    state: govState.toString(),
    scope: "profile openid email",
  }).toString();
  return { url: url.toString(), state };
}
export function useGovConfig() {
  const [config, setConfig] = useState<GovConfig>(),
    [error, setError] = useState(""),
    [errorDetail, setErrorDetail] = useState("");
  useEffect(() => {
    let alive = true;
    api<GovConfig>("/public/gov-auth")
      .then((c) => {
        if (alive) setConfig(c);
      })
      .catch((error) => {
        if (alive) {
          setErrorDetail(error instanceof AuthUnavailableError ? error.detail : "");
          setError(
            error instanceof AuthUnavailableError
              ? error.message
              : "โหลดข้อมูล Gov Center ไม่สำเร็จ กรุณาลองใหม่",
          );
        }
      });
    return () => {
      alive = false;
    };
  }, []);
  return { config, error, errorDetail };
}
