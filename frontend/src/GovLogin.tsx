import { useState } from "react";
import { Alert, Button, Space } from "antd";
import { SafetyCertificateOutlined } from "@ant-design/icons";
import { post } from "./api";
import { govLineLogin, useGovConfig } from "./govSso";
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
      const { url, state } = govLineLogin(config!);
      await post("/auth/gov/start", { state, purpose: link ? "LINK" : "LOGIN" });
      window.location.assign(url);
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
