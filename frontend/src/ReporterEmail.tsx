import { useEffect, useState } from "react";
import { Button, Form, Input, Typography } from "antd";
import { LockOutlined } from "@ant-design/icons";
import { api } from "./api";

export default function ReporterEmail() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState("loading");
    setEmail("");
    api<{ profile?: { email?: string | null } }>("/auth/gov-profile", { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) {
          setEmail(data.profile?.email?.trim() || "");
          setState("ready");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setState("error");
      });
    return () => controller.abort();
  }, [revision]);
  return (
    <Form.Item
      label="อีเมล"
      htmlFor="report-contact-email"
      extra={
        state === "error" ? (
          <>
            <Typography.Text type="danger">โหลดอีเมลไม่สำเร็จ</Typography.Text>{" "}
            <Button type="link" onClick={() => setRevision((v) => v + 1)}>
              ลองโหลดอีเมลอีกครั้ง
            </Button>
          </>
        ) : state === "loading" ? (
          "กำลังโหลดอีเมลจากบัญชี Gov Center…"
        ) : !email ? (
          "บัญชี Gov Center ยังไม่ได้ระบุอีเมล"
        ) : undefined
      }
    >
      <Input
        id="report-contact-email"
        type="email"
        autoComplete="off"
        value={email}
        readOnly
        aria-readonly="true"
        aria-busy={state === "loading"}
        suffix={<LockOutlined aria-label="แก้ไขอีเมลไม่ได้" />}
      />
    </Form.Item>
  );
}
