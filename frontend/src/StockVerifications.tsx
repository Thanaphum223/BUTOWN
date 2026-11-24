import { useState } from "react";
import { App, Button, Card, Input, List, Modal, Space, Tag, Typography } from "antd";
import { date, post } from "./api";
import { amount } from "./format";
import { useI18n } from "./i18n/useI18n";

type D = Record<string, any>;

// Items taken on site without a prior request, waiting for the leader and the stock keeper.
export default function StockVerifications({
  rows,
  onChanged,
}: {
  rows: D[];
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const { message } = App.useApp();
  const [target, setTarget] = useState<D>();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  if (!rows.length) return null;
  async function verify() {
    setBusy(true);
    try {
      await post(`/stock/movements/${target!.id}/verify`, { note });
      message.success(t("บันทึกแล้ว"));
      setTarget(undefined);
      setNote("");
      onChanged();
    } catch (e) {
      message.error(t((e as Error).message));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card
      className="stock-verifications"
      style={{ marginTop: 20 }}
      title={t("ใบเบิกหน้างานย้อนหลัง")}
    >
      <List
        size="small"
        dataSource={rows}
        renderItem={(r) => (
          <List.Item>
            <div className="stock-verification">
              <strong>
                {r.name} · {amount(r.quantity)} {r.unit}
              </strong>
              <Typography.Text type="secondary">
                {r.actor_name} · {date(r.created_at)} · #
                {String(r.complaint_id).slice(0, 8).toUpperCase()}
              </Typography.Text>
              <Space wrap>
                {!r.leader_verified_at && <Tag color="gold">{t("รอหัวหน้ารับรอง")}</Tag>}
                {!r.keeper_verified_at && <Tag color="gold">{t("รอผู้ดูแลคลังรับรอง")}</Tag>}
                {r.leader_verified_at && r.keeper_verified_at && (
                  <Tag color="green">{t("รับรองแล้ว")}</Tag>
                )}
                {r.verify_as && (
                  <Button size="small" type="primary" onClick={() => setTarget(r)}>
                    {t("รับรองการเบิกหน้างาน")}
                  </Button>
                )}
              </Space>
              {[
                [r.leader_verified_by, r.leader_note],
                [r.keeper_verified_by, r.keeper_note],
              ].map(
                ([name, text], index) =>
                  name && (
                    <Typography.Text type="secondary" key={index}>
                      {t("รับรองโดย {{name}}", { name })}
                      {text ? ` — ${text}` : ""}
                    </Typography.Text>
                  ),
              )}
            </div>
          </List.Item>
        )}
      />
      <Modal
        open={!!target}
        title={t("รับรองการเบิกหน้างาน")}
        okText={t("ยืนยัน")}
        cancelText={t("ยกเลิก")}
        confirmLoading={busy}
        onOk={verify}
        onCancel={() => setTarget(undefined)}
      >
        <Input.TextArea
          rows={3}
          maxLength={1000}
          aria-label={t("หมายเหตุ (ไม่บังคับ)")}
          placeholder={t("หมายเหตุ (ไม่บังคับ)")}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Modal>
    </Card>
  );
}
