import { useLocalizedFormErrors } from "./i18n/useLocalizedFormErrors";
import { useI18n } from "./i18n/useI18n";
import { useRef, useState } from "react";
import { Alert, Button, Form, Input } from "antd";
import { AuthUnavailableError, post, refreshCsrf } from "./api";
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
  const { t } = useI18n();
  const { config, error: loadError, errorDetail: loadErrorDetail } = useGovConfig();
  const [form] = Form.useForm<Fields>();
  useLocalizedFormErrors(form);
  const [errorDetail, setErrorDetail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  function change(next: GovAccountMode) {
    form.resetFields();
    setError("");
    setErrorDetail("");
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
    setErrorDetail("");
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
      setErrorDetail(e instanceof AuthUnavailableError ? e.detail : "");
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
        message={t(
          loadError ||
            (config ? "ยังไม่ได้ตั้งค่า Gov Center SSO ครบถ้วน" : "กำลังโหลดข้อมูล Gov Center"),
        )}
        description={loadErrorDetail || undefined}
      />
    );
  if (new URL(config.callbackUrl).origin !== window.location.origin)
    return (
      <Alert
        type="warning"
        showIcon
        message={t("กรุณาเข้า TownTrack ด้วยโดเมนที่ลงทะเบียน SSO ไว้")}
      />
    );
  const register = mode === "register";
  return (
    <>
      {error && (
        <Alert
          type="error"
          showIcon
          message={t(error)}
          description={errorDetail || undefined}
          style={{ marginBottom: 16 }}
        />
      )}
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
            label={t("ชื่อ-นามสกุล")}
            name="name"
            rules={[
              {
                required: true,
                whitespace: true,
                min: 2,
                max: 200,
                message: t("กรุณากรอกชื่อ 2–200 ตัวอักษร"),
              },
            ]}
          >
            <Input autoComplete="name" maxLength={200} placeholder={t("ชื่อและนามสกุล")} />
          </Form.Item>
        )}
        <Form.Item
          label={t("อีเมล")}
          name="email"
          rules={[
            { required: true, type: "email", max: 320, message: t("กรุณากรอกอีเมลให้ถูกต้อง") },
          ]}
        >
          <Input autoComplete="email" type="email" maxLength={320} placeholder="name@example.com" />
        </Form.Item>
        <Form.Item
          label={t("รหัสผ่าน")}
          name="password"
          extra={register ? t("อย่างน้อย 12 ตัวอักษร") : undefined}
          rules={[
            {
              required: true,
              whitespace: true,
              min: register ? 12 : 1,
              max: 72,
              message: register ? t("กรุณากรอกรหัสผ่าน 12–72 ตัวอักษร") : t("กรุณากรอกรหัสผ่าน"),
            },
          ]}
        >
          <Input.Password
            autoComplete={register ? "new-password" : "current-password"}
            maxLength={72}
            placeholder={t("รหัสผ่าน")}
          />
        </Form.Item>
        {register && (
          <Form.Item
            label={t("ยืนยันรหัสผ่าน")}
            name="confirmation"
            dependencies={["password"]}
            rules={[
              { required: true, message: t("กรุณายืนยันรหัสผ่าน") },
              ({ getFieldValue }) => ({
                validator(_, v) {
                  return !v || getFieldValue("password") === v
                    ? Promise.resolve()
                    : Promise.reject(new Error(t("รหัสผ่านไม่ตรงกัน")));
                },
              }),
            ]}
          >
            <Input.Password
              autoComplete="new-password"
              maxLength={72}
              placeholder={t("กรอกรหัสผ่านอีกครั้ง")}
            />
          </Form.Item>
        )}
        <Button
          type="primary"
          aria-label={register ? t("สมัครและเข้าสู่ระบบ") : t("เข้าสู่ระบบ")}
          htmlType="submit"
          block
          size="large"
          disabled={disabled}
          loading={busy}
        >
          {register ? t("สมัครและเข้าสู่ระบบ") : t("เข้าสู่ระบบ")}
        </Button>
      </Form>
      <p className="auth-switch">
        {register ? t("มีบัญชีอยู่แล้ว?") : t("ยังไม่มีบัญชี?")}{" "}
        <Button
          type="link"
          aria-label={register ? t("กลับไปหน้าเข้าสู่ระบบ") : t("สมัครสมาชิก")}
          disabled={disabled}
          onClick={() => change(register ? "login" : "register")}
        >
          {register ? t("เข้าสู่ระบบ") : t("สมัครสมาชิก")}
        </Button>
      </p>
    </>
  );
}
