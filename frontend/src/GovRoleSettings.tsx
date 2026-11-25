import { useI18n } from "./i18n/useI18n";
import { useLocalizedFormErrors } from "./i18n/useLocalizedFormErrors";
import { useEffect, useRef, useState } from "react";
import { Alert, App, Button, Card, Form, Input, Select, Space, Typography } from "antd";
import { DeleteOutlined, PlusOutlined } from "./icons";
import { api, post, roleNames } from "./api";
import { govRoleNames, govRolesByRole } from "./govRoles";

type Mapping = { govRole: string; role: string; departmentId: string | null };
type Settings = {
  municipalityId: string;
  serviceId: string;
  mappings: Mapping[];
  municipalityLocked?: boolean;
};
export default function GovRoleSettings({
  departments,
}: {
  departments: { id: string; name: string }[];
}) {
  const [form] = Form.useForm<Settings>();
  const [saved, setSaved] = useState<Settings>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const { t } = useI18n();
  const { message } = App.useApp();
  useLocalizedFormErrors(form);
  const rules = Form.useWatch("mappings", form) || [];
  const used = new Set(rules.map((rule) => rule?.govRole?.trim().toUpperCase()));
  const missing = Object.entries(govRolesByRole).flatMap(([role, codes]) =>
    codes
      .filter((code) => !used.has(code))
      .map((code) => ({ govRole: code, role, departmentId: null })),
  );
  useEffect(() => {
    const request = new AbortController();
    void api("/admin/gov-roles", { signal: request.signal })
      .then((data: Settings) => {
        setSaved(data);
        form.setFieldsValue(data);
      })
      .catch((e: Error) => {
        if (!request.signal.aborted) setError(e.message);
      });
    return () => request.abort();
  }, [form]);
  async function save(values: Settings) {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const clean: Settings = {
        municipalityId: values.municipalityId?.trim() || "",
        serviceId: values.serviceId?.trim() || "",
        mappings: values.mappings.map((m) => ({
          govRole: m.govRole.trim().toUpperCase(),
          role: m.role,
          departmentId: ["LEADER", "FIELD"].includes(m.role) ? m.departmentId || null : null,
        })),
      };
      await post("/admin/gov-roles", clean);
      setSaved({ ...clean, municipalityLocked: saved?.municipalityLocked });
      form.setFieldsValue(clean);
      message.success(t("บันทึกการจับคู่บทบาทแล้ว"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 20 }}
        message={t("ใช้กับบัญชีใหม่เท่านั้น รวมถึงบัญชีที่กลับมาใช้งานหลังถูกลบ")}
        description={t(
          "ใช้บทบาทของบริการ TownTrack ที่ Gov ยืนยันแล้ว บัญชีที่มีอยู่จะคงบทบาทและกองที่ผู้ดูแลตั้งไว้ในระบบนี้",
        )}
      />
      <Alert
        type="info"
        style={{ marginBottom: 20 }}
        message={t("ตัวอย่างรหัสตำแหน่งราชการของเทศบาล")}
        description={
          <>
            {Object.entries(govRolesByRole).map(([role, codes]) => (
              <div key={role}>
                <strong>{t(roleNames[role])}</strong>:{" "}
                {codes.map((code) => `${code} = ${t(govRoleNames[code])}`).join(", ")}
              </div>
            ))}
            {t("ตำแหน่งระดับกองที่ไม่ได้เลือกกอง จะเข้าสู่ระบบได้แต่ต้องรอผู้มีสิทธิ์กำหนดกองให้")}
          </>
        }
      />
      {error && <Alert type="error" showIcon message={t(error)} style={{ marginBottom: 16 }} />}
      {!saved ? (
        <Card loading={!error} />
      ) : (
        <Form form={form} layout="vertical" onFinish={save} disabled={busy}>
          <Form.Item
            name="municipalityId"
            label={t("รหัสเทศบาลใน Gov Center")}
            extra={t(
              saved.municipalityLocked
                ? "ตั้งค่าไว้ที่เซิร์ฟเวอร์แล้ว แก้ไขจากหน้านี้ไม่ได้"
                : "ใช้ยืนยันว่าบทบาทบุคลากรเป็นของเทศบาลนี้ ดูรหัสจาก Gov กลาง หากยังไม่ระบุจะไม่ให้สิทธิ์บุคลากรแก่บัญชีใหม่",
            )}
          >
            <Input
              maxLength={200}
              disabled={busy || saved.municipalityLocked}
              placeholder={t("รหัสเทศบาลจาก Gov กลาง")}
            />
          </Form.Item>
          <Form.Item
            name="serviceId"
            label={t("รหัส ID ของบริการ Gov (ถ้ามี)")}
            extra={t(
              "กรอกเมื่อ Gov ส่งมาเฉพาะ ID โดยไม่มี service code ระบบจะรับสิทธิ์เฉพาะบริการ TownTrack",
            )}
          >
            <Input
              maxLength={200}
              placeholder={t("เว้นว่างได้เมื่อ Gov ส่ง service code มาด้วย")}
            />
          </Form.Item>
          <Form.List name="mappings">
            {(fields, { add, remove }) => (
              <>
                {fields.map((field, index) => {
                  const role = rules[field.name]?.role;
                  const fieldRole = ["LEADER", "FIELD"].includes(role);
                  return (
                    <Card
                      key={field.key}
                      size="small"
                      style={{ marginBottom: 12 }}
                      title={t("การจับคู่ {{number}}", { number: index + 1 })}
                      extra={
                        <Button
                          aria-label={t("ลบการจับคู่ {{number}}", { number: index + 1 })}
                          icon={<DeleteOutlined />}
                          onClick={() => remove(field.name)}
                        />
                      }
                    >
                      <Form.Item
                        name={[field.name, "govRole"]}
                        label={t("รหัสบทบาทจาก Gov")}
                        rules={[
                          {
                            required: true,
                            whitespace: true,
                            max: 100,
                            message: t("กรุณากรอกรหัสบทบาท Gov"),
                          },
                        ]}
                      >
                        <Input
                          aria-label={t("รหัสบทบาท Gov {{number}}", { number: index + 1 })}
                          maxLength={100}
                        />
                      </Form.Item>
                      <Form.Item
                        name={[field.name, "role"]}
                        label={t("บทบาทใน TownTrack")}
                        rules={[{ required: true }]}
                      >
                        <Select
                          className="admin-role-select"
                          classNames={{ popup: { root: "admin-role-options" } }}
                          aria-label={t("บทบาทใน TownTrack {{number}}", { number: index + 1 })}
                          options={Object.entries(roleNames).map(([value, label]) => ({
                            value,
                            label: t(label),
                          }))}
                          onChange={() =>
                            form.setFieldValue(["mappings", field.name, "departmentId"], null)
                          }
                        />
                      </Form.Item>
                      {fieldRole ? (
                        <Form.Item
                          name={[field.name, "departmentId"]}
                          label={t("กอง / หน่วยงาน")}
                          extra={t("เว้นว่างได้ บัญชีใหม่จะรอผู้มีสิทธิ์กำหนดกองก่อนเริ่มใช้งาน")}
                        >
                          <Select
                            aria-label={t("กองสำหรับบทบาท Gov {{number}}", { number: index + 1 })}
                            allowClear
                            options={departments.map((d) => ({ value: d.id, label: d.name }))}
                          />
                        </Form.Item>
                      ) : (
                        <Typography.Text type="secondary">
                          {["OFFICER", "APPROVER"].includes(role)
                            ? t("ดูแลงานระดับเทศบาล ไม่สังกัดกอง")
                            : t("ไม่สังกัดกอง")}
                        </Typography.Text>
                      )}
                    </Card>
                  );
                })}
                <Button
                  icon={<PlusOutlined />}
                  disabled={fields.length >= 100 || busy}
                  onClick={() => add({ govRole: "", role: "CITIZEN", departmentId: null })}
                >
                  {t("เพิ่มการจับคู่บทบาท")}
                </Button>
                {missing.length > 0 && fields.length + missing.length <= 100 && (
                  <Button
                    style={{ marginInlineStart: 8 }}
                    disabled={busy}
                    onClick={() => form.setFieldValue("mappings", [...rules, ...missing])}
                  >
                    {t("เพิ่มตำแหน่งมาตรฐานที่ยังไม่มี ({{count}})", { count: missing.length })}
                  </Button>
                )}
              </>
            )}
          </Form.List>
          <Space wrap style={{ marginTop: 20 }}>
            <Button
              onClick={() => {
                form.resetFields();
                form.setFieldsValue(saved);
                setError("");
              }}
            >
              {t("ยกเลิกการแก้ไข")}
            </Button>
            <Button type="primary" htmlType="submit" loading={busy} disabled={busy}>
              {t("บันทึกการจับคู่บทบาท")}
            </Button>
          </Space>
        </Form>
      )}
    </>
  );
}
