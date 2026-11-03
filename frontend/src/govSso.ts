import { useEffect, useState } from "react";
import { GovSsoClient } from "gov-sso-login";
import { api } from "./api";
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
export function useGovConfig() {
  const [config, setConfig] = useState<GovConfig>(),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    api<GovConfig>("/public/gov-auth")
      .then((c) => {
        if (alive) setConfig(c);
      })
      .catch(() => {
        if (alive) setError("โหลดข้อมูล Gov Center ไม่สำเร็จ กรุณาลองใหม่");
      });
    return () => {
      alive = false;
    };
  }, []);
  return { config, error };
}
