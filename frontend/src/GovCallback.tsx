import { useEffect, useRef, useState } from "react";
import { Alert, Button, Card, Spin, Typography } from "antd";
import { post, refreshCsrf } from "./api";
import { govClient, useGovConfig } from "./govSso";
export default function GovCallback() {
  const { config, error: loadError } = useGovConfig();
  const started = useRef(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!config || started.current) return;
    started.current = true;
    const params = new URLSearchParams(window.location.search),
      code = params.get("code"),
      state = params.get("state");
    window.history.replaceState({}, "", window.location.pathname);
    void (async () => {
      try {
        if (!config.configured)
          throw new Error("ยังไม่ได้ตั้งค่า Gov Center SSO กรุณาเริ่มเข้าสู่ระบบใหม่");
        if (!code?.trim() || !state || !govClient(config).verifyState(state))
          throw new Error("การตรวจสอบความปลอดภัยไม่สำเร็จ กรุณาเริ่มเข้าสู่ระบบใหม่");
        const result = await post("/auth/sso-callback", { code: code.trim(), state });
        if (!result?.success) throw new Error("ยืนยันตัวตนไม่สำเร็จ กรุณาเริ่มเข้าสู่ระบบใหม่");
        await refreshCsrf();
        // Root callbacks have already cleared their query. A hash-only navigation
        // would keep this callback component mounted instead of loading the app.
        window.location.replace("/");
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [config]);
  return (
    <main className="content" style={{ maxWidth: 520, margin: "10vh auto" }}>
      <Card>
        <Typography.Title level={3}>ยืนยันตัวตนกับ Gov Center</Typography.Title>
        {error || loadError ? (
          <>
            <Alert type="error" showIcon message={error || loadError} />
            <Button
              block
              type="primary"
              style={{ marginTop: 16 }}
              onClick={() => window.location.replace("/")}
            >
              เริ่มเข้าสู่ระบบใหม่
            </Button>
          </>
        ) : (
          <Spin tip="กำลังยืนยันตัวตน">
            <div style={{ minHeight: 96 }} />
          </Spin>
        )}
      </Card>
    </main>
  );
}
