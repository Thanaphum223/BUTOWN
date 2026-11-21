import { useEffect, useState } from "react";
import { App, Alert, Button, Card, Descriptions, Input, List, Modal, Tag, Typography } from "antd";
import { ClockCircleOutlined } from "./icons";
import { api, date, post } from "./api";
import { useI18n } from "./i18n/useI18n";

type D = Record<string, any>;
const dayOptions = [3, 7, 15, 30];
const extensionReasons = [
  "รอวัสดุหรืองบประมาณ",
  "สภาพอากาศไม่เอื้ออำนวย",
  "ต้องประสานหน่วยงานภายนอก",
  "งานซับซ้อนกว่าที่ประเมินไว้",
];
const decisionReasons = [
  "เหตุผลเพียงพอ",
  "ขยายเวลาได้ตามความจำเป็น",
  "ควรเร่งดำเนินการตามกำหนดเดิม",
];
const statusColor: Record<string, string> = {
  PENDING: "gold",
  APPROVED: "green",
  REJECTED: "red",
};
const statusLabel: Record<string, string> = {
  PENDING: "รอพิจารณา",
  APPROVED: "อนุมัติแล้ว",
  REJECTED: "ไม่อนุมัติ",
};

function Choices({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="symptom-options">
      {options.map((option) => (
        <Tag.CheckableTag
          key={option}
          checked={value.includes(option)}
          onChange={(checked) =>
            onChange(checked ? [...value, option] : value.filter((v) => v !== option))
          }
        >
          {t(option)}
        </Tag.CheckableTag>
      ))}
    </div>
  );
}

const joinReason = (picked: string[], note: string) =>
  [picked.join(" / "), note.trim()].filter(Boolean).join(" — ");

export default function SlaPanel({
  id,
  version,
  onChanged,
}: {
  id: string;
  version: number;
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const { message } = App.useApp();
  const [sla, setSla] = useState<D>();
  const [revision, setRevision] = useState(0);
  const [requesting, setRequesting] = useState(false);
  const [deciding, setDeciding] = useState<{ id: string; approve: boolean }>();
  const [days, setDays] = useState(7);
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    api<D>(`/complaints/${id}/sla`, { signal: controller.signal })
      .then(setSla)
      .catch(() => {});
    return () => controller.abort();
  }, [id, version, revision]);
  if (!sla) return null;
  const now = Date.now();
  const overdue = sla.open && new Date(sla.due_at).getTime() < now;
  const progressLate = sla.open && new Date(sla.progress_due_at).getTime() < now;
  const pending = (sla.extensions || []).find((x: D) => x.status === "PENDING");
  const reset = () => {
    setPicked([]);
    setNote("");
    setDays(7);
  };
  async function send() {
    const reason = joinReason(picked, note);
    if (!reason) return message.error(t("กรุณาเลือกหรือระบุเหตุผล"));
    setBusy(true);
    try {
      if (requesting) await post(`/complaints/${id}/sla-extensions`, { days, reason });
      else if (deciding)
        await post(`/complaints/${id}/sla-extensions/${deciding.id}/decision`, {
          approve: deciding.approve,
          reason,
        });
      message.success(t("บันทึกแล้ว"));
      setRequesting(false);
      setDeciding(undefined);
      reset();
      setRevision((v) => v + 1);
      onChanged();
    } catch (e) {
      message.error(t((e as Error).message));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card
      className="sla-panel"
      style={{ marginTop: 20 }}
      title={
        <span>
          <ClockCircleOutlined /> {t("ระยะเวลาดำเนินการ (นับวันตามปฏิทิน)")}
        </span>
      }
      extra={
        sla.canRequest &&
        !pending && <Button onClick={() => setRequesting(true)}>{t("ขอขยายเวลา")}</Button>
      }
    >
      <Descriptions
        column={1}
        size="small"
        items={[
          {
            key: "due",
            label: t("กำหนดแก้ไขแล้วเสร็จ"),
            children: (
              <>
                {date(sla.due_at)}{" "}
                {sla.open && (
                  <Tag color={overdue ? "red" : "green"}>
                    {overdue ? t("เกินกำหนด") : t("อยู่ในกำหนด")}
                  </Tag>
                )}
              </>
            ),
          },
          ...(sla.open
            ? [
                {
                  key: "progress",
                  label: t("แจ้งความคืบหน้าให้ผู้แจ้งภายใน"),
                  children: (
                    <>
                      {date(sla.progress_due_at)}{" "}
                      <Tag color={progressLate ? "red" : "blue"}>
                        {progressLate
                          ? t("เลยกำหนดแจ้งความคืบหน้า")
                          : t("{{days}} วันนับจากความเคลื่อนไหวล่าสุด", {
                              days: sla.progress_days,
                            })}
                      </Tag>
                    </>
                  ),
                },
              ]
            : []),
        ]}
      />
      {(sla.extensions || []).length > 0 && (
        <List
          size="small"
          header={<Typography.Text strong>{t("ประวัติการขอขยายเวลา")}</Typography.Text>}
          dataSource={sla.extensions}
          renderItem={(x: D) => (
            <List.Item
              actions={
                x.status === "PENDING" && sla.canDecide
                  ? [
                      <Button
                        key="approve"
                        type="primary"
                        size="small"
                        onClick={() => setDeciding({ id: x.id, approve: true })}
                      >
                        {t("อนุมัติ")}
                      </Button>,
                      <Button
                        key="reject"
                        danger
                        size="small"
                        onClick={() => setDeciding({ id: x.id, approve: false })}
                      >
                        {t("ไม่อนุมัติ")}
                      </Button>,
                    ]
                  : undefined
              }
            >
              <div>
                <Tag color={statusColor[x.status]}>{t(statusLabel[x.status])}</Tag>
                {t("ขอเพิ่ม {{days}} วัน · จาก {{from}} เป็น {{to}}", {
                  days: x.days,
                  from: date(x.previous_due_at),
                  to: date(x.requested_due_at),
                })}
                <div>
                  <Typography.Text type="secondary">
                    {x.requested_by_name}: {x.reason}
                  </Typography.Text>
                </div>
                {x.decision_reason && (
                  <div>
                    <Typography.Text type="secondary">
                      {x.decided_by_name}: {x.decision_reason}
                    </Typography.Text>
                  </div>
                )}
              </div>
            </List.Item>
          )}
        />
      )}
      <Modal
        open={requesting || !!deciding}
        title={
          requesting
            ? t("ขอขยายระยะเวลาดำเนินการ")
            : deciding?.approve
              ? t("อนุมัติการขยายเวลา")
              : t("ไม่อนุมัติการขยายเวลา")
        }
        okText={t("ยืนยัน")}
        cancelText={t("ยกเลิก")}
        confirmLoading={busy}
        onOk={send}
        onCancel={() => {
          setRequesting(false);
          setDeciding(undefined);
          reset();
        }}
      >
        {requesting && (
          <>
            <Typography.Text strong>{t("ขอเพิ่มกี่วัน")}</Typography.Text>
            <div className="symptom-options" style={{ marginBottom: 16 }}>
              {dayOptions.map((option) => (
                <Tag.CheckableTag
                  key={option}
                  checked={days === option}
                  onChange={() => setDays(option)}
                >
                  {t("{{days}} วัน", { days: option })}
                </Tag.CheckableTag>
              ))}
            </div>
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message={t("เจ้าหน้าที่จะพิจารณา เมื่ออนุมัติระบบจะแจ้งกำหนดใหม่ให้ผู้แจ้งทราบ")}
            />
          </>
        )}
        <Typography.Text strong>{t("เหตุผล (แตะเลือกได้หลายข้อ)")}</Typography.Text>
        <Choices
          options={requesting ? extensionReasons : decisionReasons}
          value={picked}
          onChange={setPicked}
        />
        <Input.TextArea
          style={{ marginTop: 12 }}
          rows={3}
          maxLength={3000}
          aria-label={t("เหตุผลอื่น ๆ (กรอกเพิ่มเองได้)")}
          placeholder={t("เหตุผลอื่น ๆ (กรอกเพิ่มเองได้)")}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Modal>
    </Card>
  );
}
