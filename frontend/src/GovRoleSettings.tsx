import { useEffect, useRef, useState } from "react";
import { Alert, App, Button, Card, Form, Input, Select, Space, Typography } from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { api, post, roleNames } from "./api";

type Mapping = { govRole: string; role: string; departmentId: string | null };
type Settings = { municipalityId: string; serviceId: string; mappings: Mapping[] };
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
  const { message } = App.useApp();
  const rules = Form.useWatch("mappings", form) || [];
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
      setSaved(clean);
      form.setFieldsValue(clean);
      message.success("บันทึกการจับคู่บทบาทแล้ว");
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
        message="ใช้กับบัญชีใหม่เท่านั้น รวมถึงบัญชีที่กลับมาใช้งานหลังถูกลบ"
        description="ใช้บทบาทของบริการ TownTrack ที่ Gov ยืนยันแล้ว บัญชีที่มีอยู่จะคงบทบาทและกองที่ผู้ดูแลตั้งไว้ในระบบนี้"
      />
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
      {!saved ? (
        <Card loading={!error} />
      ) : (
        <Form form={form} layout="vertical" onFinish={save} disabled={busy}>
          <Form.Item
            name="municipalityId"
            label="รหัสเทศบาลใน Gov Center"
            extra="ใช้ยืนยันว่าบทบาทบุคลากรเป็นของเทศบาลนี้ ดูรหัสจาก Gov กลาง หากยังไม่ระบุจะไม่ให้สิทธิ์บุคลากรแก่บัญชีใหม่"
          >
            <Input maxLength={200} placeholder="รหัสเทศบาลจาก Gov กลาง" />
          </Form.Item>
          <Form.Item
            name="serviceId"
            label="รหัส ID ของบริการ Gov (ถ้ามี)"
            extra="กรอกเมื่อ Gov ส่งมาเฉพาะ ID โดยไม่มี service code ระบบจะรับสิทธิ์เฉพาะบริการ TownTrack"
          >
            <Input maxLength={200} placeholder="เว้นว่างได้เมื่อ Gov ส่ง service code มาด้วย" />
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
                      title={`การจับคู่ ${index + 1}`}
                      extra={
                        <Button
                          aria-label={`ลบการจับคู่ ${index + 1}`}
                          icon={<DeleteOutlined />}
                          onClick={() => remove(field.name)}
                        />
                      }
                    >
                      <Form.Item
                        name={[field.name, "govRole"]}
                        label="รหัสบทบาทจาก Gov"
                        rules={[
                          {
                            required: true,
                            whitespace: true,
                            max: 100,
                            message: "กรุณากรอกรหัสบทบาท Gov",
                          },
                        ]}
                      >
                        <Input aria-label={`รหัสบทบาท Gov ${index + 1}`} maxLength={100} />
                      </Form.Item>
                      <Form.Item
                        name={[field.name, "role"]}
                        label="บทบาทใน TownTrack"
                        rules={[{ required: true }]}
                      >
                        <Select
                          aria-label={`บทบาทใน TownTrack ${index + 1}`}
                          options={Object.entries(roleNames).map(([value, label]) => ({
                            value,
                            label,
                          }))}
                          onChange={() =>
                            form.setFieldValue(["mappings", field.name, "departmentId"], null)
                          }
                        />
                      </Form.Item>
                      {fieldRole ? (
                        <Form.Item
                          name={[field.name, "departmentId"]}
                          label="กอง / หน่วยงาน"
                          extra="ต้องเลือกกองก่อนให้บัญชีใหม่ใช้บทบาทหัวหน้าหรือผู้ลงพื้นที่"
                        >
                          <Select
                            aria-label={`กองสำหรับบทบาท Gov ${index + 1}`}
                            allowClear
                            options={departments.map((d) => ({ value: d.id, label: d.name }))}
                          />
                        </Form.Item>
                      ) : (
                        <Typography.Text type="secondary">
                          {["OFFICER", "APPROVER"].includes(role)
                            ? "ดูแลงานระดับเทศบาล ไม่สังกัดกอง"
                            : "ไม่สังกัดกอง"}
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
                  เพิ่มการจับคู่บทบาท
                </Button>
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
              ยกเลิกการแก้ไข
            </Button>
            <Button type="primary" htmlType="submit" loading={busy} disabled={busy}>
              บันทึกการจับคู่บทบาท
            </Button>
          </Space>
        </Form>
      )}
    </>
  );
}
