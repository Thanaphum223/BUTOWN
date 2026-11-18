import { useI18n } from "./i18n/useI18n";
import { useEffect, useRef, useState } from "react";
import { Alert, Button, Modal, Space, Spin, Typography } from "antd";
import { api, post } from "./api";
import { useGeo } from "./GeoContext";
type Notice = { version: string; text: string; acknowledged: boolean; consented?: boolean };
export default function PrivacyGate({
  user,
  children,
}: {
  user: Record<string, any>;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  const geo = useGeo();
  const automaticLocationUser = useRef<string | null>(null);
  function requestLocationOnce() {
    if (automaticLocationUser.current === user.id) return;
    automaticLocationUser.current = user.id;
    void geo.request();
  }
  // Location is asked only after the user has accepted the privacy notice.
  function applyDecision(consented: boolean) {
    geo.setConsent(consented);
    if (consented && user.role === "CITIZEN") requestLocationOnce();
  }
  const [notice, setNotice] = useState<Notice>();
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"accept" | "decline">();
  async function load() {
    setError("");
    try {
      const n = await api<Notice>("/privacy");
      setNotice(n);
      if (n?.acknowledged) applyDecision(n.consented !== false);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, [user.id, user.role]);
  useEffect(() => {
    geo.onReviewConsent(() => setReviewing(true));
    return () => geo.onReviewConsent(undefined);
  }, []);
  async function decide(consent: boolean) {
    if (!notice) return;
    setBusy(consent ? "accept" : "decline");
    try {
      await post("/users/pdpa-consent", { version: notice.version, consent });
      setNotice({ ...notice, acknowledged: true, consented: consent });
      setReviewing(false);
      applyDecision(consent);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(undefined);
    }
  }
  const decided = !!notice?.acknowledged;
  const modal = (
    <Modal
      open
      closable={decided}
      maskClosable={false}
      onCancel={() => setReviewing(false)}
      title={t("ประกาศคุ้มครองข้อมูลส่วนบุคคล")}
      footer={null}
    >
      {error ? (
        <Alert
          type="error"
          message={t(error)}
          action={<Button onClick={load}>{t("ลองใหม่")}</Button>}
        />
      ) : !notice ? (
        <Spin />
      ) : (
        <>
          <Typography.Paragraph>{notice.text}</Typography.Paragraph>
          <Typography.Paragraph type="secondary">
            {t(
              "หากไม่ยินยอม คุณยังใช้งานระบบได้ แต่ระบบจะไม่ขอและไม่ใช้ตำแหน่ง GPS ของคุณ ต้องปักหมุดหรือกรอกที่อยู่เอง และเปลี่ยนใจภายหลังได้",
            )}
          </Typography.Paragraph>
          <Space direction="vertical" style={{ width: "100%" }}>
            <Button
              block
              type="primary"
              loading={busy === "accept"}
              disabled={!!busy}
              onClick={() => decide(true)}
            >
              {t("ยินยอม")}
            </Button>
            <Button
              block
              loading={busy === "decline"}
              disabled={!!busy}
              onClick={() => decide(false)}
            >
              {t("ไม่ยินยอม")}
            </Button>
          </Space>
        </>
      )}
    </Modal>
  );
  if (!decided) return modal;
  return (
    <>
      {children}
      {reviewing && modal}
    </>
  );
}
