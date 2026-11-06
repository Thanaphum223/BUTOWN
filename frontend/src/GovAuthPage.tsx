import { useState } from "react";
import { Card, ConfigProvider, Divider, Typography } from "antd";
import GovAccountForm, { type GovAccountMode } from "./GovAccountForm";
import GovLogin from "./GovLogin";

export default function GovAuthPage({ onLogin }: { onLogin: () => void }) {
  const [mode, setMode] = useState<GovAccountMode>("login");
  const [busy, setBusy] = useState(false);
  const register = mode === "register";
  return (
    <ConfigProvider
      theme={{
        token: {
          controlHeight: 36,
          controlHeightLG: 36,
          fontSize: 14,
        },
      }}
    >
      <main className="auth-page">
        <Card className="auth-card">
          <header className="auth-heading">
            <Typography.Title level={1}>
              {register ? "สมัครสมาชิก" : "เข้าสู่ระบบ"}
            </Typography.Title>
            <Typography.Paragraph>บัญชี Gov Center · TownTrack</Typography.Paragraph>
          </header>
          {!register && (
            <>
              <GovLogin compact disabled={busy} onBusyChange={setBusy} />
              <Divider plain className="auth-divider">
                หรือ
              </Divider>
            </>
          )}
          <GovAccountForm
            key={mode}
            mode={mode}
            onModeChange={setMode}
            disabled={busy}
            onBusyChange={setBusy}
            onLogin={onLogin}
          />
        </Card>
      </main>
    </ConfigProvider>
  );
}
