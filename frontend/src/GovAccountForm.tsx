import { useRef, useState } from "react";
import { Alert, Button, Form, Input } from "antd";
import { post, refreshCsrf } from "./api";
import { useGovConfig } from "./govSso";
export type GovAccountMode = "register" | "login";
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
    return (
      <Alert
        type="warning"
        showIcon
        message={
          loadError ||
          (config ? "ยังไม่ได้ตั้งค่า Gov Center SSO ครบถ้วน" : "กำลังโหลดข้อมูล Gov Center")
        }
      />
    );
  if (new URL(config.callbackUrl).origin !== window.location.origin)
    return (
      <Alert type="warning" showIcon message="กรุณาเข้า TownTrack ด้วยโดเมนที่ลงทะเบียน SSO ไว้" />
    );
  const register = mode === "register";
  return (
    <>
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
      <Form
        form={form}
        name="gov-account"
        layout="vertical"
        requiredMark={false}
        disabled={disabled}
        onFinish={submit}
      >
        {register && (
          <Form.Item
            label="ชื่อ-นามสกุล"
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
            <Input autoComplete="name" maxLength={200} placeholder="ชื่อและนามสกุล" />
          </Form.Item>
        )}
        <Form.Item
          label="อีเมล"
          name="email"
          rules={[{ required: true, type: "email", max: 320, message: "กรุณากรอกอีเมลให้ถูกต้อง" }]}
        >
          <Input autoComplete="email" type="email" maxLength={320} placeholder="name@example.com" />
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
            placeholder="รหัสผ่าน"
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
            <Input.Password
              autoComplete="new-password"
              maxLength={72}
              placeholder="กรอกรหัสผ่านอีกครั้ง"
            />
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
      <p className="auth-switch">
        {register ? "มีบัญชีอยู่แล้ว?" : "ยังไม่มีบัญชี?"}{" "}
        <Button
          type="link"
          aria-label={register ? "กลับไปหน้าเข้าสู่ระบบ" : "สมัครสมาชิก"}
          disabled={disabled}
          onClick={() => change(register ? "login" : "register")}
        >
          {register ? "เข้าสู่ระบบ" : "สมัครสมาชิก"}
        </Button>
      </p>
    </>
  );
}
