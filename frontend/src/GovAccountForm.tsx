import { useRef, useState } from "react";
import { Alert, Button, Form, Input, Space, Typography } from "antd";
import { ArrowLeftOutlined, MailOutlined, UserAddOutlined } from "@ant-design/icons";
import { post, refreshCsrf } from "./api";
import { useGovConfig } from "./govSso";
export type GovAccountMode = "register" | "login" | null;
type Fields = { name?: string; email: string; password: string; confirmation?: string };
export default function GovAccountForm({
  mode,
  onModeChange,
  disabled,
  onBusyChange,
  onLogin,
}: {
  mode: GovAccountMode;
  onModeChange: (mode: GovAccountMode) => void;
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
  onLogin: () => void;
}) {
  const { config, error: loadError } = useGovConfig();
  const [form] = Form.useForm<Fields>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  function change(next: GovAccountMode) {
    form.resetFields();
    setError("");
    onModeChange(next);
  }
  function sameOrigin() {
    if (!config?.configured) throw new Error("ยังไม่ได้ตั้งค่า Gov Center SSO ครบถ้วน");
    if (new URL(config.callbackUrl).origin !== window.location.origin)
      throw new Error("กรุณาเข้า TownTrack ด้วยโดเมนที่ลงทะเบียน SSO ไว้");
  }
  function open(next: GovAccountMode) {
    try {
      sameOrigin();
      change(next);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function submit(values: Fields) {
    if (disabled || submitting.current || !mode) return;
    submitting.current = true;
    setBusy(true);
    onBusyChange(true);
    setError("");
    let sent = false;
    try {
      sameOrigin();
      const state = Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) =>
        n.toString(16).padStart(2, "0"),
      ).join("");
      await refreshCsrf();
      await post("/auth/gov/start", {
        state,
        purpose: mode === "register" ? "REGISTER" : "PASSWORD_LOGIN",
      });
      sent = true;
      await post(mode === "register" ? "/auth/gov/register" : "/auth/gov/password-login", {
        state,
        email: values.email.trim(),
        password: values.password,
        ...(mode === "register" ? { name: values.name?.trim() } : {}),
      });
      form.resetFields();
      await refreshCsrf();
      onLogin();
    } catch (e) {
      const message = (e as Error).message;
      setError(
        sent && mode === "register" && e instanceof TypeError
          ? "ยังตรวจสอบผลการสมัครไม่ได้ กรุณาลองเข้าสู่ระบบด้วยอีเมล Gov Center ก่อนสมัครใหม่"
          : message,
      );
    } finally {
      form.setFieldsValue({ password: "", confirmation: "" });
      submitting.current = false;
      setBusy(false);
      onBusyChange(false);
    }
  }
  if (!config?.configured)
    return mode ? (
      <>
        <Button
          type="text"
          aria-label="กลับไปหน้าเข้าสู่ระบบ"
          icon={<ArrowLeftOutlined />}
          onClick={() => change(null)}
        >
          กลับไปหน้าเข้าสู่ระบบ
        </Button>
        <Alert
          type="warning"
          showIcon
          message={
            loadError ||
            (config ? "ยังไม่ได้ตั้งค่า Gov Center SSO ครบถ้วน" : "กำลังโหลดข้อมูล Gov Center")
          }
        />
      </>
    ) : null;
  if (!mode)
    return (
      <Space direction="vertical" style={{ width: "100%", marginTop: 8 }}>
        <Button
          block
          aria-label="สมัครบัญชีประชาชนผ่าน Gov Center"
          icon={<UserAddOutlined />}
          disabled={disabled}
          onClick={() => open("register")}
        >
          สมัครบัญชีประชาชนผ่าน Gov Center
        </Button>
        <Button
          block
          aria-label="เข้าสู่ระบบด้วยอีเมล Gov Center"
          icon={<MailOutlined />}
          disabled={disabled}
          onClick={() => open("login")}
        >
          เข้าสู่ระบบด้วยอีเมล Gov Center
        </Button>
        {error && <Alert type="error" showIcon message={error} />}
      </Space>
    );
  const register = mode === "register";
  return (
    <>
      <Button
        type="text"
        aria-label="กลับไปหน้าเข้าสู่ระบบ"
        icon={<ArrowLeftOutlined />}
        disabled={disabled}
        onClick={() => change(null)}
        style={{ marginBottom: 16 }}
      >
        กลับไปหน้าเข้าสู่ระบบ
      </Button>
      <Typography.Title level={3}>
        {register ? "สมัครบัญชี Gov Center" : "เข้าสู่ระบบด้วยอีเมล Gov Center"}
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        {register
          ? "ใช้บัญชีนี้เข้า TownTrack และบริการที่เชื่อมกับ Gov Center"
          : "ใช้บัญชีอีเมลที่สมัครกับ Gov Center"}
      </Typography.Paragraph>
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
      <Form form={form} name="gov-account" layout="vertical" disabled={disabled} onFinish={submit}>
        {register && (
          <Form.Item
            label="ชื่อที่ใช้ติดต่อ"
            name="name"
            rules={[
              {
                required: true,
                whitespace: true,
                min: 2,
                max: 200,
                message: "กรุณากรอกชื่อ 2–200 ตัวอักษร",
              },
            ]}
          >
            <Input autoComplete="name" maxLength={200} size="large" />
          </Form.Item>
        )}
        <Form.Item
          label="อีเมล"
          name="email"
          rules={[{ required: true, type: "email", max: 320, message: "กรุณากรอกอีเมลให้ถูกต้อง" }]}
        >
          <Input autoComplete="email" type="email" maxLength={320} size="large" />
        </Form.Item>
        <Form.Item
          label="รหัสผ่าน"
          name="password"
          extra={register ? "อย่างน้อย 12 ตัวอักษร" : undefined}
          rules={[
            {
              required: true,
              whitespace: true,
              min: register ? 12 : 1,
              max: 72,
              message: register ? "กรุณากรอกรหัสผ่าน 12–72 ตัวอักษร" : "กรุณากรอกรหัสผ่าน",
            },
          ]}
        >
          <Input.Password
            autoComplete={register ? "new-password" : "current-password"}
            maxLength={72}
            size="large"
          />
        </Form.Item>
        {register && (
          <Form.Item
            label="ยืนยันรหัสผ่าน"
            name="confirmation"
            dependencies={["password"]}
            rules={[
              { required: true, message: "กรุณายืนยันรหัสผ่าน" },
              ({ getFieldValue }) => ({
                validator(_, v) {
                  return !v || getFieldValue("password") === v
                    ? Promise.resolve()
                    : Promise.reject(new Error("รหัสผ่านไม่ตรงกัน"));
                },
              }),
            ]}
          >
            <Input.Password autoComplete="new-password" maxLength={72} size="large" />
          </Form.Item>
        )}
        <Button
          type="primary"
          aria-label={register ? "สมัครและเข้าสู่ระบบ" : "เข้าสู่ระบบ"}
          htmlType="submit"
          block
          size="large"
          disabled={disabled}
          loading={busy}
        >
          {register ? "สมัครและเข้าสู่ระบบ" : "เข้าสู่ระบบ"}
        </Button>
      </Form>
      <Button
        type="link"
        block
        disabled={disabled}
        onClick={() => change(register ? "login" : "register")}
        style={{ marginTop: 16 }}
      >
        {register ? "มีบัญชีแล้ว เข้าสู่ระบบด้วยอีเมล Gov" : "ยังไม่มีบัญชี สมัครบัญชี Gov Center"}
      </Button>
    </>
  );
}
