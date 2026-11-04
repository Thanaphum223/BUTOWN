import { useRef, useState } from "react";
import { Alert, Button, Space } from "antd";
import { SafetyCertificateOutlined } from "@ant-design/icons";
import { post } from "./api";
import { govLineLogin, govRegistration, useGovConfig } from "./govSso";
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
    [busy, setBusy] = useState<"login" | "register" | null>(null);
  const starting = useRef(false);
  if (!config?.configured)
    return !link && (config || loadError) ? (
      <Alert
        type="warning"
        showIcon
        message={loadError || "ยังไม่ได้ตั้งค่า Gov Center SSO ครบถ้วน"}
      />
    ) : null;
  async function start(action: "login" | "register") {
    if (disabled || starting.current) return;
    starting.current = true;
    setBusy(action);
    onBusyChange?.(true);
    setError("");
    try {
      const { url, state } =
        action === "register" ? govRegistration(config!) : govLineLogin(config!);
      await post("/auth/gov/start", { state, purpose: link ? "LINK" : "LOGIN" });
      window.location.assign(url);
    } catch (e) {
      setError((e as Error).message);
      starting.current = false;
      setBusy(null);
      onBusyChange?.(false);
    }
  }
  return (
    <Space direction="vertical" style={{ width: link ? "auto" : "100%", marginTop: link ? 0 : 16 }}>
      <Button
        aria-label={link ? "เชื่อมบัญชี Gov Center" : "เข้าสู่ระบบด้วย Gov Center"}
        block={!link}
        disabled={disabled || busy !== null}
        icon={<SafetyCertificateOutlined />}
        loading={busy === "login"}
        onClick={() => void start("login")}
      >
        {link ? "เชื่อมบัญชี Gov Center" : "เข้าสู่ระบบด้วย Gov Center"}
      </Button>
      {!link && (
        <Button
          block
          disabled={disabled || busy !== null}
          loading={busy === "register"}
          onClick={() => void start("register")}
        >
          สมัครบัญชีประชาชนผ่าน Gov Center
        </Button>
      )}
      {error && <Alert type="error" showIcon message={error} />}
    </Space>
  );
}
