import { useRef, useState } from "react";
import { Alert, Button, Space } from "antd";
import { SafetyCertificateOutlined } from "@ant-design/icons";
import { post, refreshCsrf } from "./api";
import { govLineLogin, useGovConfig } from "./govSso";
export default function GovLogin({
  link = false,
  compact = false,
  disabled = false,
  onBusyChange,
}: {
  link?: boolean;
  compact?: boolean;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const { config, error: loadError } = useGovConfig();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const starting = useRef(false);
  if (!config?.configured)
    return !link && !compact && (config || loadError) ? (
      <Alert
        type="warning"
        showIcon
        message={loadError || "ยังไม่ได้ตั้งค่า Gov Center SSO ครบถ้วน"}
      />
    ) : null;
  async function start() {
    if (disabled || starting.current) return;
    starting.current = true;
    setBusy(true);
    onBusyChange?.(true);
    setError("");
    try {
      await refreshCsrf();
      const { url, state } = govLineLogin(config!);
      await post("/auth/gov/start", { state, purpose: link ? "LINK" : "LOGIN" });
      window.location.assign(url);
    } catch (e) {
      setError((e as Error).message);
      starting.current = false;
      setBusy(false);
      onBusyChange?.(false);
    }
  }
  return (
    <Space direction="vertical" style={{ width: link ? "auto" : "100%", marginTop: 0 }}>
      <Button
        aria-label={link ? "เชื่อมบัญชี Gov Center" : "เข้าสู่ระบบด้วย LINE"}
        block={!link}
        disabled={disabled || busy}
        className={link ? undefined : "gov-line-login"}
        icon={
          link ? (
            <SafetyCertificateOutlined />
          ) : (
            <span className="anticon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="20" height="20" focusable="false">
                <path
                  fill="currentColor"
                  d="M22 10.5C22 5.8 17.5 2 12 2S2 5.8 2 10.5c0 4.2 3.6 7.7 8.4 8.4.3.1.8.2.9.5.1.2.1.5 0 .8l-.2 1c0 .3-.2 1.1.9.6 1.1-.4 5.8-3.4 7.9-5.8 1.5-1.6 2.1-3.4 2.1-5.5Z"
                />
                <text
                  x="12"
                  y="12.5"
                  textAnchor="middle"
                  fontFamily="Arial, sans-serif"
                  fontSize="6"
                  fontWeight="700"
                  fill="#06c755"
                >
                  LINE
                </text>
              </svg>
            </span>
          )
        }
        loading={busy}
        onClick={() => void start()}
      >
        {link ? "เชื่อมบัญชี Gov Center" : "เข้าสู่ระบบด้วย LINE"}
      </Button>
      {error && <Alert type="error" showIcon message={error} />}
    </Space>
  );
}
