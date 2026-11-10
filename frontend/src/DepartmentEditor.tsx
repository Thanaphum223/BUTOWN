import { useRef, useState } from "react";
import { Alert, App, Button, Form, Input, Modal, Space, Typography } from "antd";
import { api, post } from "./api";
import { useI18n } from "./i18n/useI18n";
import { useLocalizedFormErrors } from "./i18n/useLocalizedFormErrors";

export default function DepartmentEditor({
  department,
  mode,
  onClose,
  onRefresh,
}: {
  department: { id: string; name: string };
  mode: "rename" | "delete";
  onClose: () => void;
  onRefresh: () => Promise<void>;
}) {
  const { t } = useI18n();
  const { message } = App.useApp();
  const [form] = Form.useForm<{ name: string }>();
  useLocalizedFormErrors(form);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  async function save(values?: { name: string }) {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const path = `/admin/departments/${department.id}`;
      if (mode === "delete") await api(path, { method: "DELETE" });
      else await post(path, { name: values!.name.trim() });
      await onRefresh();
      message.success(t(mode === "delete" ? "ลบหน่วยงานแล้ว" : "บันทึกแล้ว"));
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  const actions = (
    <Space style={{ display: "flex", justifyContent: "flex-end" }}>
      <Button disabled={busy} onClick={onClose}>
        {t("ยกเลิก")}
      </Button>
      <Button
        type="primary"
        aria-label={t(mode === "delete" ? "ยืนยันลบหน่วยงาน" : "บันทึก")}
        danger={mode === "delete"}
        htmlType={mode === "rename" ? "submit" : "button"}
        loading={busy}
        disabled={busy}
        onClick={mode === "delete" ? () => void save() : undefined}
      >
        {t(mode === "delete" ? "ยืนยันลบหน่วยงาน" : "บันทึก")}
      </Button>
    </Space>
  );
  return (
    <Modal
      open
      title={t(mode === "delete" ? "ลบหน่วยงาน" : "แก้ชื่อหน่วยงาน")}
      footer={null}
      onCancel={() => {
        if (!submitting.current) onClose();
      }}
      closable={!busy}
      maskClosable={!busy}
      keyboard={!busy}
    >
      {error && <Alert type="error" showIcon message={t(error)} style={{ marginBottom: 16 }} />}
      {mode === "rename" ? (
        <Form
          form={form}
          layout="vertical"
          initialValues={{ name: department.name }}
          onFinish={save}
        >
          <Form.Item
            name="name"
            label={t("ชื่อหน่วยงาน")}
            rules={[
              { required: true, whitespace: true, message: t("กรุณาระบุชื่อหน่วยงาน") },
              { max: 200, message: t("ชื่อหน่วยงานต้องไม่เกิน 200 ตัวอักษร") },
            ]}
          >
            <Input aria-label={t("ชื่อหน่วยงาน")} maxLength={200} disabled={busy} autoFocus />
          </Form.Item>
          {actions}
        </Form>
      ) : (
        <>
          <Typography.Paragraph>
            {t("ยืนยันลบหน่วยงาน {{name}} หรือไม่", { name: department.name })}
          </Typography.Paragraph>
          <Typography.Paragraph>{t("ประวัติงานเดิมจะยังคงอยู่")}</Typography.Paragraph>
          {actions}
        </>
      )}
    </Modal>
  );
}
