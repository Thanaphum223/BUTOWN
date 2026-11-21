import { useEffect, useState } from "react";
import {
  App,
  Alert,
  Button,
  Card,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Segmented,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from "antd";
import { HistoryOutlined, PlusOutlined } from "./icons";
import { api, date, post, roleNames } from "./api";
import { useI18n } from "./i18n/useI18n";

type D = Record<string, any>;
const amount = (value: unknown) =>
  Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
const kindNames: Record<string, string> = {
  RECEIVE: "รับเข้า",
  ISSUE: "เบิกจ่าย",
  RETURN: "คืนคลัง",
  ADJUST: "ปรับยอด",
};
const kindColors: Record<string, string> = {
  RECEIVE: "green",
  ISSUE: "orange",
  RETURN: "blue",
  ADJUST: "purple",
};

// Municipal stock register: what is on hand, what is out on jobs, and every movement.
export default function Inventory({ admin }: { admin: boolean }) {
  const { t } = useI18n();
  const { message } = App.useApp();
  const [data, setData] = useState<{ keeper: boolean; items: D[] }>();
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [adding, setAdding] = useState(false);
  const [moving, setMoving] = useState<{ item: D; kind: "RECEIVE" | "ADJUST" }>();
  const [history, setHistory] = useState<{ item: D; rows: D[] }>();
  const [keepers, setKeepers] = useState<D[]>();
  const [busy, setBusy] = useState(false);
  const [form] = Form.useForm();
  useEffect(() => {
    api<{ keeper: boolean; items: D[] }>("/stock")
      .then((value) => {
        setData(value);
        setError("");
      })
      .catch((e) => setError((e as Error).message));
  }, [revision]);
  async function save(values: D) {
    setBusy(true);
    try {
      if (adding) await post("/stock", values);
      else if (moving)
        await post(`/stock/${moving.item.id}/movements`, {
          kind: moving.kind,
          quantity:
            moving.kind === "ADJUST" && values.direction === "OUT"
              ? -values.quantity
              : values.quantity,
          note: values.note,
        });
      message.success(t("บันทึกแล้ว"));
      setAdding(false);
      setMoving(undefined);
      form.resetFields();
      setRevision((v) => v + 1);
    } catch (e) {
      message.error(t((e as Error).message));
    } finally {
      setBusy(false);
    }
  }
  async function openHistory(item: D) {
    try {
      setHistory({ item, rows: await api<D[]>(`/stock/${item.id}/movements`) });
    } catch (e) {
      message.error(t((e as Error).message));
    }
  }
  async function openKeepers() {
    try {
      setKeepers(await api<D[]>("/stock/keepers"));
    } catch (e) {
      message.error(t((e as Error).message));
    }
  }
  const keeper = !!data?.keeper;
  return (
    <div className="inventory-page">
      <div className="page-heading">
        <div>
          <Typography.Title level={2}>{t("คลังวัสดุ / ทรัพยากร")}</Typography.Title>
          <Typography.Text type="secondary">
            {t("ยอดคงเหลือตัดเมื่อผู้ลงพื้นที่เริ่มงาน และเพิ่มคืนเมื่อส่งรายงานพร้อมของที่เหลือ")}
          </Typography.Text>
        </div>
        <Space wrap>
          {admin && <Button onClick={openKeepers}>{t("กำหนดผู้ดูแลคลัง")}</Button>}
          {keeper && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setAdding(true)}>
              {t("เพิ่มวัสดุใหม่")}
            </Button>
          )}
        </Space>
      </div>
      {error && <Alert type="error" showIcon message={t(error)} style={{ marginBottom: 16 }} />}
      {!keeper && data && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={t("ดูยอดคงคลังได้ การรับเข้าและปรับยอดทำได้เฉพาะผู้ดูแลคลัง")}
        />
      )}
      <Card>
        <Table
          rowKey="id"
          loading={!data && !error}
          dataSource={data?.items || []}
          scroll={{ x: true }}
          pagination={{ pageSize: 20, hideOnSinglePage: true }}
          locale={{ emptyText: t("ยังไม่มีวัสดุในคลัง") }}
          columns={[
            {
              title: t("วัสดุ"),
              dataIndex: "name",
              render: (name, item) => (
                <>
                  <strong>{name}</strong> {!item.active && <Tag>{t("ปิดใช้งาน")}</Tag>}
                </>
              ),
            },
            {
              title: t("คงเหลือ"),
              render: (_, item) => (
                <Tag color={Number(item.on_hand) <= 0 ? "red" : "green"}>
                  {amount(item.on_hand)} {item.unit}
                </Tag>
              ),
            },
            {
              title: t("กำลังใช้งานหน้างาน"),
              render: (_, item) => `${amount(item.in_use)} ${item.unit}`,
            },
            {
              title: t("ทั้งหมดในเทศบาล"),
              render: (_, item) =>
                `${amount(Number(item.on_hand) + Number(item.in_use))} ${item.unit}`,
            },
            {
              title: t("จัดการ"),
              render: (_, item) => (
                <Space wrap>
                  <Button size="small" icon={<HistoryOutlined />} onClick={() => openHistory(item)}>
                    {t("ประวัติ")}
                  </Button>
                  {keeper && (
                    <>
                      <Button size="small" onClick={() => setMoving({ item, kind: "RECEIVE" })}>
                        {t("รับเข้า")}
                      </Button>
                      <Button size="small" onClick={() => setMoving({ item, kind: "ADJUST" })}>
                        {t("ปรับยอด")}
                      </Button>
                      <Switch
                        size="small"
                        checked={item.active}
                        aria-label={t("เปิดใช้งาน {{name}}", { name: item.name })}
                        onChange={async (active) => {
                          try {
                            await api(`/stock/${item.id}`, {
                              method: "PATCH",
                              body: JSON.stringify({ active }),
                            });
                            setRevision((v) => v + 1);
                          } catch (e) {
                            message.error(t((e as Error).message));
                          }
                        }}
                      />
                    </>
                  )}
                </Space>
              ),
            },
          ]}
        />
      </Card>
      <Modal
        open={adding || !!moving}
        destroyOnHidden
        title={
          adding
            ? t("เพิ่มวัสดุใหม่")
            : moving?.kind === "RECEIVE"
              ? t("รับเข้าคลัง: {{name}}", { name: moving.item.name })
              : t("ปรับยอด: {{name}}", { name: moving?.item.name })
        }
        okText={t("บันทึก")}
        cancelText={t("ยกเลิก")}
        confirmLoading={busy}
        onOk={() => form.submit()}
        onCancel={() => {
          setAdding(false);
          setMoving(undefined);
          form.resetFields();
        }}
      >
        <Form form={form} layout="vertical" onFinish={save} initialValues={{ direction: "OUT" }}>
          {adding && (
            <>
              <Form.Item
                name="name"
                label={t("ชื่อวัสดุ")}
                rules={[{ required: true, whitespace: true, max: 200 }]}
              >
                <Input placeholder={t("เช่น ปูนซีเมนต์")} />
              </Form.Item>
              <Form.Item
                name="unit"
                label={t("หน่วย")}
                rules={[
                  { required: true, whitespace: true, max: 50 },
                  {
                    pattern: /^[^\p{N}]*\p{L}[^\p{N}]*$/u,
                    message: t("หน่วยเป็นคำ เช่น ถุง เมตร ห้ามใส่ตัวเลข"),
                  },
                ]}
              >
                <Input placeholder={t("เช่น ถุง ท่อน เมตร")} />
              </Form.Item>
            </>
          )}
          {moving?.kind === "ADJUST" && (
            <Form.Item name="direction" label={t("ทิศทาง")}>
              <Segmented
                options={[
                  { value: "OUT", label: t("ลดยอด (ชำรุด/สูญหาย)") },
                  { value: "IN", label: t("เพิ่มยอด (ตรวจนับพบเพิ่ม)") },
                ]}
              />
            </Form.Item>
          )}
          <Form.Item
            name="quantity"
            label={adding ? t("ยอดยกมา / รับเข้าครั้งแรก (ไม่บังคับ)") : t("จำนวน")}
            rules={[{ required: !adding, type: "number", min: 0.01 }]}
          >
            <InputNumber min={0.01} precision={2} inputMode="decimal" style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item
            name="note"
            label={
              moving?.kind === "RECEIVE"
                ? t("หลักฐานการรับเข้า (เช่น เลขที่ใบส่งของ)")
                : moving?.kind === "ADJUST"
                  ? t("เหตุผลการปรับยอด")
                  : t("หมายเหตุ")
            }
            rules={[{ required: !!moving, whitespace: true, max: 1000 }]}
          >
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
      <Drawer
        open={!!history}
        width="min(560px, 100vw)"
        title={t("ประวัติเข้า-ออก: {{name}}", { name: history?.item.name })}
        onClose={() => setHistory(undefined)}
      >
        <Table
          size="small"
          rowKey="id"
          pagination={false}
          scroll={{ x: true }}
          dataSource={history?.rows || []}
          locale={{ emptyText: t("ยังไม่มีการเคลื่อนไหว") }}
          columns={[
            { title: t("วันที่"), render: (_, r) => date(r.created_at) },
            {
              title: t("รายการ"),
              render: (_, r) => <Tag color={kindColors[r.kind]}>{t(kindNames[r.kind])}</Tag>,
            },
            {
              title: t("จำนวน"),
              render: (_, r) =>
                `${Number(r.delta) > 0 ? "+" : ""}${amount(r.delta)} ${history?.item.unit}`,
            },
            { title: t("คงเหลือ"), render: (_, r) => amount(r.balance_after) },
            { title: t("ผู้บันทึก"), dataIndex: "actor_name" },
            {
              title: t("หมายเหตุ"),
              render: (_, r) => (
                <>
                  {t(r.note)}
                  {r.complaint_id && (
                    <Typography.Text type="secondary">
                      {" "}
                      #{String(r.complaint_id).slice(0, 8).toUpperCase()}
                    </Typography.Text>
                  )}
                </>
              ),
            },
          ]}
        />
      </Drawer>
      <Modal
        open={!!keepers}
        title={t("ผู้ดูแลคลัง (ผู้สั่งจ่ายพัสดุ)")}
        footer={null}
        onCancel={() => {
          setKeepers(undefined);
          setRevision((v) => v + 1);
        }}
      >
        <Typography.Paragraph type="secondary">
          {t("ผู้ดูแลคลังรับเข้า ปรับยอด และเพิ่มวัสดุได้ ผู้ดูแลระบบทำได้เสมอ")}
        </Typography.Paragraph>
        <Table
          size="small"
          rowKey="id"
          pagination={{ pageSize: 10, hideOnSinglePage: true }}
          dataSource={keepers || []}
          columns={[
            { title: t("ชื่อ"), dataIndex: "display_name" },
            { title: t("บทบาท"), render: (_, p) => t(roleNames[p.role] || p.role) },
            {
              title: t("ผู้ดูแลคลัง"),
              render: (_, p) => (
                <Switch
                  checked={p.stock_keeper}
                  aria-label={t("ผู้ดูแลคลัง {{name}}", { name: p.display_name })}
                  onChange={async (value) => {
                    try {
                      await api(`/stock/keepers/${p.id}`, {
                        method: "PUT",
                        body: JSON.stringify({ keeper: value }),
                      });
                      setKeepers((list) =>
                        list?.map((row) =>
                          row.id === p.id ? { ...row, stock_keeper: value } : row,
                        ),
                      );
                    } catch (e) {
                      message.error(t((e as Error).message));
                    }
                  }}
                />
              ),
            },
          ]}
        />
      </Modal>
    </div>
  );
}
