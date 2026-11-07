import { useI18n } from "./i18n/useI18n";
import { useEffect, useRef, useState } from "react";
import { Alert, Button, Card, Spin, Typography } from "antd";
import { AuthUnavailableError, post, refreshCsrf } from "./api";
import { govClient, useGovConfig } from "./govSso";
import type { GovCallbackReturn } from "./govCallbackReturn";
export default function GovCallback({ returned }: { returned: GovCallbackReturn }) {
  const { t } = useI18n();
  const { config, error: loadError, errorDetail: loadErrorDetail } = useGovConfig();
  const started = useRef(false);
  const [errorDetail, setErrorDetail] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!config || started.current) return;
    started.current = true;
    const { code, state, service } = returned;
    void (async () => {
      try {
        if (!config.configured)
          throw new Error("ยังไม่ได้ตั้งค่า Gov Center SSO กรุณาเริ่มเข้าสู่ระบบใหม่");
        if (returned.error) throw new Error(returned.error);
        if (
          !code?.trim() ||
          !state ||
          !/^[a-f0-9]{64}$/.test(state) ||
          (service !== null && service !== config.serviceCode) ||
          !govClient(config).verifyState(state)
        )
          throw new Error("การตรวจสอบความปลอดภัยไม่สำเร็จ กรุณาเริ่มเข้าสู่ระบบใหม่");
        const result = await post("/auth/sso-callback", { code: code.trim(), state });
        if (!result?.success) throw new Error("ยืนยันตัวตนไม่สำเร็จ กรุณาเริ่มเข้าสู่ระบบใหม่");
        await refreshCsrf();
        // Root callbacks have already cleared their query. A hash-only navigation
        // would keep this callback component mounted instead of loading the app.
        window.location.replace("/");
      } catch (e) {
        setErrorDetail(e instanceof AuthUnavailableError ? e.detail : "");
        setError((e as Error).message);
      }
    })();
  }, [config, returned]);
  return (
    <main className="content" style={{ maxWidth: 520, margin: "10vh auto" }}>
      <Card>
        <Typography.Title level={3}>{t("ยืนยันตัวตนกับ Gov Center")}</Typography.Title>
        {error || loadError ? (
          <>
            <Alert
              type="error"
              showIcon
              message={t(error || loadError)}
              description={(error ? errorDetail : loadErrorDetail) || undefined}
            />
            <Button
              block
              type="primary"
              style={{ marginTop: 16 }}
              onClick={() => window.location.replace("/")}
            >
              {t("เริ่มเข้าสู่ระบบใหม่")}
            </Button>
          </>
        ) : (
          <Spin tip={t("กำลังยืนยันตัวตน")}>
            <div style={{ minHeight: 96 }} />
          </Spin>
        )}
      </Card>
    </main>
  );
}
