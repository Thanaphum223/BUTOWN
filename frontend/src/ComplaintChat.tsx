import { useState } from "react";
import { Alert, App, Button, Card, Input, Tag, Typography } from "antd";
import { date, post } from "./api";
import { useI18n } from "./i18n/useI18n";
import { useLiveQuery } from "./useLiveQuery";

type D = Record<string, any>;
const questions = [
  "ขอทราบจุดสังเกตหรือเลขที่บ้านใกล้เคียงเพิ่มเติม",
  "ขอทราบช่วงเวลาที่พบปัญหาบ่อยที่สุด",
  "เจ้าหน้าที่กำลังเข้าตรวจสอบพื้นที่ หากสะดวกกรุณาให้ข้อมูลเพิ่มเติม",
];

// Private to the reporter and the staff on this report; followers never see it.
export default function ComplaintChat({
  id,
  user,
  readOnly,
}: {
  id: string;
  user: D;
  readOnly: boolean;
}) {
  const { t } = useI18n();
  const { message } = App.useApp();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const { data, error, reload } = useLiveQuery<D[]>(
    `/complaints/${id}/messages`,
    0,
    `${user.id}:${user.role}`,
  );
  const messages = Array.isArray(data) ? data : [];
  const canWrite = !readOnly && user.role !== "APPROVER";
  async function send() {
    if (!body.trim() || busy) return;
    setBusy(true);
    try {
      await post(`/complaints/${id}/messages`, { body: body.trim() });
      setBody("");
      await reload();
    } catch (e) {
      message.error(t((e as Error).message));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card
      className="complaint-chat"
      style={{ marginTop: 20 }}
      title={t("สอบถาม / สื่อสารเพิ่มเติม")}
    >
      {error && !data && <Alert type="warning" showIcon message={t(error)} />}
      <div className="chat-messages" role="log" aria-label={t("ประวัติการสนทนา")}>
        {!messages.length && (
          <Typography.Text type="secondary">{t("ยังไม่มีข้อความ")}</Typography.Text>
        )}
        {messages.map((m) => (
          <div key={m.id} className={"chat-message" + (m.mine ? " is-mine" : "")}>
            <Typography.Text type="secondary">
              {m.mine ? t("คุณ") : t(m.sender_name)} · {date(m.created_at)}
            </Typography.Text>
            <p>{m.body}</p>
          </div>
        ))}
      </div>
      {canWrite && (
        <>
          {user.role !== "CITIZEN" && (
            <div className="symptom-options">
              {questions.map((question) => (
                <Tag.CheckableTag
                  key={question}
                  checked={body === t(question)}
                  onChange={(checked) => setBody(checked ? t(question) : "")}
                >
                  {t(question)}
                </Tag.CheckableTag>
              ))}
            </div>
          )}
          <Input.TextArea
            rows={3}
            maxLength={2000}
            aria-label={t("พิมพ์ข้อความ")}
            placeholder={t("พิมพ์ข้อความ")}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <Button
            type="primary"
            className="chat-send"
            loading={busy}
            disabled={!body.trim()}
            onClick={() => void send()}
          >
            {t("ส่งข้อความ")}
          </Button>
        </>
      )}
      {readOnly && (
        <Typography.Text type="secondary">
          {t("การสนทนานี้ปิดแล้ว อ่านย้อนหลังได้อย่างเดียว")}
        </Typography.Text>
      )}
    </Card>
  );
}
