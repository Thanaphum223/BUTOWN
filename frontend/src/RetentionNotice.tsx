import { useState } from "react";
import { App, Alert, Button, Input, Modal, Typography } from "antd";
import { DeleteOutlined } from "./icons";
import { post } from "./api";
import { useI18n } from "./i18n/useI18n";

type D = Record<string, any>;

export default function RetentionNotice({
  id,
  retention,
  admin,
  onDeleted,
}: {
  id: string;
  retention?: D;
  admin: boolean;
  onDeleted: () => void;
}) {
  const { t, language } = useI18n();
  const { message } = App.useApp();
  const [open, setOpen] = useState(false),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false);
  if (!retention) return null;
  const years = retention.years;
  const text = !years
    ? t("ระบบไม่ลบคำร้องนี้อัตโนมัติ")
    : retention.until
      ? t("ระบบเก็บคำร้องนี้ไว้ถึง {{date}} ({{years}} ปีหลังปิดคำร้อง) แล้วจะลบออกถาวร", {
          date: new Date(retention.until).toLocaleDateString(
            language === "en" ? "en-GB" : "th-TH",
            { timeZone: "Asia/Bangkok", dateStyle: "long" },
          ),
          years,
        })
      : t("เมื่อปิดคำร้องแล้ว ระบบจะเก็บข้อมูลไว้ {{years}} ปี แล้วจะลบออกถาวร", { years });
  async function purge() {
    setBusy(true);
    try {
      await post(`/admin/complaints/${id}/purge`, { reason: reason.trim() });
      message.success(t("ลบคำร้องถาวรแล้ว"));
      setOpen(false);
      onDeleted();
    } catch (e: any) {
      message.error(t(e.message));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Alert
        className="retention-notice"
        style={{ marginTop: 20 }}
        type="info"
        showIcon
        message={t("ระยะเวลาเก็บข้อมูล")}
        description={
          <>
            {text}
            {admin && (
              <div style={{ marginTop: 12 }}>
                <Button danger icon={<DeleteOutlined />} onClick={() => setOpen(true)}>
                  {t("ลบคำร้องถาวร")}
                </Button>
              </div>
            )}
          </>
        }
      />
      <Modal
        open={open}
        title={t("ลบคำร้องถาวร")}
        okText={t("ลบถาวร")}
        cancelText={t("ยกเลิก")}
        okButtonProps={{ danger: true, disabled: !reason.trim(), loading: busy }}
        onOk={purge}
        onCancel={() => setOpen(false)}
        destroyOnHidden
      >
        <Typography.Paragraph type="danger">
          {t(
            "คำร้อง ไฟล์แนบ ข้อความ และประวัติของคำร้องนี้จะถูกลบออกจากฐานข้อมูลทั้งหมดและกู้คืนไม่ได้ รายการพัสดุยังคงอยู่ในทะเบียน",
          )}
        </Typography.Paragraph>
        <Input.TextArea
          aria-label={t("เหตุผลการลบ")}
          placeholder={t("เหตุผลการลบ")}
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Modal>
    </>
  );
}
