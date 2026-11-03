import { useState } from "react";
import { Alert, Button, Space } from "antd";
import { SafetyCertificateOutlined } from "@ant-design/icons";
import { post } from "./api";
import { govClient, useGovConfig } from "./govSso";
export default function GovLogin({
  link = false,
  disabled = false,
  onBusyChange,
}: {
  link?: boolean;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const { config, error: loadError } = useGovConfig();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  if (!config?.configured)
    return !link && (config?.mode === "central" || loadError) ? (
      <Alert
        type="warning"
        showIcon
        message={loadError || "ยังไม่ได้ตั้งค่า Gov Center SSO ครบถ้วน"}
      />
    ) : null;
  async function start() {
    if (disabled) return;
    setBusy(true);
    onBusyChange?.(true);
    setError("");
    try {
      if (new URL(config!.callbackUrl).origin !== window.location.origin)
        throw new Error("กรุณาเข้า TownTrack ด้วยโดเมนที่ลงทะเบียน SSO ไว้");
      const url = new URL(govClient(config!).getLoginUrl());
      const state = url.searchParams.get("state");
      if (!state || !/^[a-f0-9]{64}$/.test(state))
        throw new Error("สร้างคำขอเข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่");
      // Keep the registered callback exact. State travels separately and must be
      // echoed by Gov; a locally stored nonce cannot replace that provider echo.
      await post("/auth/gov/start", { state, purpose: link ? "LINK" : "LOGIN" });
      window.location.assign(url.toString());
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
      onBusyChange?.(false);
    }
  }
  return (
    <Space direction="vertical" style={{ width: link ? "auto" : "100%", marginTop: link ? 0 : 16 }}>
      <Button
        aria-label={link ? "เชื่อมบัญชี Gov Center" : "เข้าสู่ระบบด้วย Gov Center"}
        block={!link}
        disabled={disabled}
        icon={<SafetyCertificateOutlined />}
        loading={busy}
        onClick={() => void start()}
      >
        {link ? "เชื่อมบัญชี Gov Center" : "เข้าสู่ระบบด้วย Gov Center"}
      </Button>
      {error && <Alert type="error" showIcon message={error} />}
    </Space>
  );
}
