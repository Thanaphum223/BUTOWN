import { useI18n } from "./i18n/useI18n";
import { useEffect, useRef, useState } from "react";
import { Alert, App, Button, Modal, Space, Typography, type GetRef } from "antd";
import { api } from "./api";

type Account = { id: string; username: string; display_name: string };
export default function AccountDeletion({
  account,
  currentUserId,
  onClose,
  onDeleted,
}: {
  account?: Account;
  currentUserId: string;
  onClose: () => void;
  onDeleted: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const cancelButton = useRef<GetRef<typeof Button>>(null);
  const { t } = useI18n();
  const { message } = App.useApp();
  useEffect(() => setError(""), [account?.id]);
  async function remove() {
    if (!account || submitting.current || account.id === currentUserId) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      await api(`/admin/users/${account.id}`, { method: "DELETE" });
      await onDeleted();
      onClose();
      message.success(t("ลบบัญชีออกจาก TownTrack แล้ว"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <Modal
      open={!!account}
      title={t("ลบบัญชีผู้ใช้")}
      footer={null}
      onCancel={() => {
        if (!submitting.current) onClose();
      }}
      closable={!busy}
      maskClosable={false}
      keyboard={!busy}
      afterOpenChange={(open) => {
        if (open) cancelButton.current?.focus();
      }}
      destroyOnHidden
    >
      <Typography.Paragraph>{t("ต้องการลบบัญชีนี้ออกจาก TownTrack หรือไม่?")}</Typography.Paragraph>
      <Typography.Paragraph>
        <strong>{account?.display_name}</strong>
        <br />
        <Typography.Text type="secondary" style={{ overflowWrap: "anywhere" }}>
          {t("ชื่อผู้ใช้:")}
          {account?.username}
        </Typography.Text>
      </Typography.Paragraph>
      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
        message={t("บัญชีเดิมจะเข้าใช้งาน TownTrack ไม่ได้")}
        description={t(
          "บัญชี Gov Center ยังคงอยู่ หากกลับมาใช้งานจะได้บัญชีใหม่ ไม่ผูกกับประวัติส่วนตัวเดิม คำร้อง ไฟล์แนบ และประวัติงานจะเก็บไว้ในระบบ",
        )}
      />
      <Typography.Paragraph type="secondary">
        {t("งานที่ยังไม่เสร็จจะไม่ถูกย้ายให้ผู้อื่นโดยอัตโนมัติ")}
      </Typography.Paragraph>
      {error && <Alert type="error" showIcon message={t(error)} style={{ marginBottom: 16 }} />}
      <Space style={{ display: "flex", justifyContent: "flex-end" }}>
        <Button ref={cancelButton} disabled={busy} onClick={onClose}>
          {t("ยกเลิก")}
        </Button>
        <Button
          aria-label={t("ยืนยันลบบัญชี")}
          type="primary"
          danger
          loading={busy}
          disabled={busy || account?.id === currentUserId}
          onClick={() => void remove()}
        >
          {t("ยืนยันลบบัญชี")}
        </Button>
      </Space>
    </Modal>
  );
}
