import { useI18n } from "./i18n/useI18n";
import { useEffect, useRef, useState } from "react";
import { Alert, Button, Modal, Spin, Typography } from "antd";
import { api, post } from "./api";
import { useGeo } from "./GeoContext";
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
  const [notice, setNotice] = useState<{ version: string; text: string; acknowledged: boolean }>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    setError("");
    try {
      const n = await api<typeof notice>("/privacy");
      setNotice(n);
      if (n?.acknowledged) requestLocationOnce();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    if (user.role === "CITIZEN") void load();
  }, [user.id, user.role]);
  if (user.role !== "CITIZEN") return children;
  if (!notice?.acknowledged)
    return (
      <Modal open closable={false} title={t("ประกาศคุ้มครองข้อมูลส่วนบุคคล")} footer={null}>
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
              {t("การรับทราบประกาศนี้แยกจากการอนุญาต GPS คุณยังปักหมุดเองได้หากไม่อนุญาตตำแหน่ง")}
            </Typography.Paragraph>
            <Button
              block
              type="primary"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await post("/users/pdpa-consent", { version: notice.version });
                  setNotice({ ...notice, acknowledged: true });
                  requestLocationOnce();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t("รับทราบประกาศ")}
            </Button>
          </>
        )}
      </Modal>
    );
  return children;
}
