import { useI18n } from "./i18n/useI18n";
import { useState } from "react";
import { Alert, Card, ConfigProvider, Divider, Typography } from "antd";
import GovAccountForm, { type GovAccountMode } from "./GovAccountForm";
import GovLogin from "./GovLogin";
import ThemeSwitcher from "./ThemeSwitcher";

export default function GovAuthPage({
  onLogin,
  authError = "",
  authErrorDetail = "",
}: {
  onLogin: () => void;
  authError?: string;
  authErrorDetail?: string;
}) {
  const { t } = useI18n();
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
          <div className="auth-toolbar">
            <ThemeSwitcher />
          </div>
          {authError && (
            <Alert
              type="error"
              showIcon
              message={t(authError)}
              description={authErrorDetail || undefined}
            />
          )}
          <header className="auth-heading">
            <Typography.Title level={1}>
              {register ? t("สมัครสมาชิก") : t("เข้าสู่ระบบ")}
            </Typography.Title>
            <Typography.Paragraph>{t("บัญชี Gov Center · TownTrack")}</Typography.Paragraph>
          </header>
          {!register && (
            <>
              <GovLogin compact disabled={busy} onBusyChange={setBusy} />
              <Divider plain className="auth-divider">
                {t("หรือ")}
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
