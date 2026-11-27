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
import { amount } from "./format";
import { useI18n } from "./i18n/useI18n";
import StockVerifications from "./StockVerifications";
import UnitInput from "./UnitInput";

type D = Record<string, any>;
type StockData = {
  keeper: boolean;
  canVerify?: boolean;
  vehicleLocalExempt?: boolean;
  items: D[];
};
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
  const [data, setData] = useState<StockData>();
  const [issues, setIssues] = useState<D[]>([]);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [adding, setAdding] = useState(false);
  const [moving, setMoving] = useState<{ item: D; kind: "RECEIVE" | "ADJUST" }>();
  const [history, setHistory] = useState<{ item: D; rows: D[] }>();
  const [loans, setLoans] = useState<D[]>();
  const [trips, setTrips] = useState<D[]>();
  const [keepers, setKeepers] = useState<D[]>();
  const [returningLoan, setReturningLoan] = useState<D>();
  const [delegatingApprover, setDelegatingApprover] = useState<D>();
  const [busy, setBusy] = useState(false);
  const [form] = Form.useForm();
  const [loanForm] = Form.useForm();
  const [delegateForm] = Form.useForm();
  const [plating, setPlating] = useState<D>();
  const [plateForm] = Form.useForm();
  async function savePlate(values: D) {
    if (!plating) return;
    setBusy(true);
    try {
      await api(`/stock/${plating.id}`, {
        method: "PATCH",
        body: JSON.stringify({ vehiclePlate: values.vehiclePlate ?? "" }),
      });
      message.success(t("บันทึกแล้ว"));
      setPlating(undefined);
      setRevision((v) => v + 1);
    } catch (e) {
      message.error(t((e as Error).message));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    api<StockData>("/stock")
      .then((value) => {
        setData(value);
        setError("");
        if (value.canVerify)
          api<D[]>("/stock/pending-verifications")
            .then((list) => setIssues(Array.isArray(list) ? list : []))
            .catch((e) => setError((e as Error).message));
      })
      .catch((e) => setError((e as Error).message));
    api<D[]>("/stock/loans")
      .then(setLoans)
      .catch(() => setLoans([]));
    api<D[]>("/stock/vehicle-trips")
      .then(setTrips)
      .catch(() => setTrips([]));
  }, [revision]);
  async function setLocalExempt(localExempt: boolean) {
    try {
      await api("/stock/vehicle-settings", {
        method: "PUT",
        body: JSON.stringify({ localExempt }),
      });
      setData((value) => value && { ...value, vehicleLocalExempt: localExempt });
    } catch (e) {
      message.error(t((e as Error).message));
    }
  }
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
  async function returnLoan(values: D) {
    if (!returningLoan) return;
    setBusy(true);
    try {
      await post(`/stock/loans/${returningLoan.id}/return`, {
        condition: values.condition,
        note: values.note ?? "",
      });
      message.success(t("บันทึกแล้ว"));
      setReturningLoan(undefined);
      loanForm.resetFields();
      setRevision((v) => v + 1);
    } catch (e) {
      message.error(t((e as Error).message));
    } finally {
      setBusy(false);
    }
  }
  async function saveDelegation(values: D) {
    if (!delegatingApprover) return;
    setBusy(true);
    try {
      await api(`/stock/loan-approvers/${delegatingApprover.id}`, {
        method: "PUT",
        body: JSON.stringify({ approver: true, reference: values.reference }),
      });
      setKeepers((list) =>
        list?.map((row) =>
          row.id === delegatingApprover.id ? { ...row, loan_approver: true } : row,
        ),
      );
      setDelegatingApprover(undefined);
      delegateForm.resetFields();
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
          <Button href="/api/stock/export.csv">{t("ส่งออกรายงานคลัง (CSV)")}</Button>
          {admin && <Button onClick={openKeepers}>{t("กำหนดผู้ดูแลคลัง")}</Button>}
          {admin && data && (
            <Space size={6}>
              <Switch
                size="small"
                checked={!!data.vehicleLocalExempt}
                aria-label={t("ยกเว้นใบขออนุญาตใช้รถ (แบบ 3) เมื่อใช้ภายในเขตเทศบาล")}
                onChange={setLocalExempt}
              />
              <Typography.Text>
                {t("ยกเว้นใบขออนุญาตใช้รถ (แบบ 3) เมื่อใช้ภายในเขตเทศบาล")}
              </Typography.Text>
            </Space>
          )}
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
                  <strong>{name}</strong>{" "}
                  <Tag color={item.item_type === "EQUIPMENT" ? "blue" : "default"}>
                    {item.item_type === "EQUIPMENT" ? t("ครุภัณฑ์") : t("วัสดุสิ้นเปลือง")}
                  </Tag>
                  {item.vehicle_plate && (
                    <Tag color="geekblue">
                      {t("ยานพาหนะ {{plate}}", { plate: item.vehicle_plate })}
                    </Tag>
                  )}
                  {!item.active && <Tag>{t("ปิดใช้งาน")}</Tag>}
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
              title: t("จองรอเบิก"),
              render: (_, item) => `${amount(item.reserved)} ${item.unit}`,
            },
            {
              title: t("พร้อมเบิก"),
              render: (_, item) => `${amount(item.available ?? item.on_hand)} ${item.unit}`,
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
                      {item.item_type === "EQUIPMENT" && (
                        <Button size="small" onClick={() => setPlating(item)}>
                          {t("ทะเบียนรถ")}
                        </Button>
                      )}
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
      <StockVerifications rows={issues} onChanged={() => setRevision((v) => v + 1)} />
      {loans && loans.length > 0 && (
        <Card
          title={t("ทะเบียนคุมการยืมครุภัณฑ์")}
          style={{ marginTop: 16 }}
          extra={
            <Typography.Text type="secondary">
              {t("แสดง {{n}} รายการล่าสุด", { n: loans.length })}
            </Typography.Text>
          }
        >
          <Table
            size="small"
            rowKey="id"
            dataSource={loans}
            scroll={{ x: true }}
            pagination={{ pageSize: 10, hideOnSinglePage: true }}
            rowClassName={(r) => (r.overdue ? "loan-overdue-row" : "")}
            columns={[
              {
                title: t("ครุภัณฑ์"),
                render: (_, r) => `${r.name} ${amount(r.quantity)} ${r.unit}`,
              },
              { title: t("ผู้ยืม"), dataIndex: "borrower_name" },
              { title: t("ผู้อนุมัติ"), dataIndex: "approved_by_name" },
              {
                title: t("กำหนดคืน"),
                render: (_, r) => (
                  <Typography.Text type={r.overdue ? "danger" : undefined}>
                    {date(r.due_on)}
                  </Typography.Text>
                ),
              },
              {
                title: t("สถานะ"),
                render: (_, r) =>
                  r.returned_at ? (
                    <Tag color="green">
                      {t("คืนแล้ว")} ({date(r.returned_at)})
                    </Tag>
                  ) : r.overdue ? (
                    <Tag color="red">{t("เกินกำหนด")}</Tag>
                  ) : (
                    <Tag>{t("ยังอยู่")}</Tag>
                  ),
              },
              {
                title: t("จัดการ"),
                render: (_, r) =>
                  keeper && !r.returned_at ? (
                    <Button
                      size="small"
                      onClick={() => {
                        setReturningLoan(r);
                        loanForm.setFieldsValue({ condition: "GOOD" });
                      }}
                    >
                      {t("รับคืน")}
                    </Button>
                  ) : null,
              },
            ]}
          />
        </Card>
      )}
      {trips && trips.length > 0 && (
        <Card
          title={t("บันทึกการใช้รถส่วนกลาง (แบบ 4)")}
          style={{ marginTop: 16 }}
          extra={
            <Typography.Text type="secondary">
              {t("แสดง {{n}} รายการล่าสุด", { n: trips.length })}
            </Typography.Text>
          }
        >
          <Table
            size="small"
            rowKey="id"
            dataSource={trips}
            scroll={{ x: true }}
            pagination={{ pageSize: 10, hideOnSinglePage: true }}
            columns={[
              {
                title: t("รถ"),
                render: (_, r) => (
                  <>
                    <strong>{r.vehicle_plate}</strong> {r.name}
                  </>
                ),
              },
              { title: t("ผู้ใช้รถ"), dataIndex: "user_name" },
              { title: t("ผู้ขับ"), render: (_, r) => r.driver_name || "-" },
              {
                title: t("สถานที่ไป / วัตถุประสงค์"),
                render: (_, r) => (
                  <>
                    {r.destination || (r.local_use ? t("ภายในเขตเทศบาล") : "-")}
                    {r.purpose && (
                      <div>
                        <Typography.Text type="secondary">{r.purpose}</Typography.Text>
                      </div>
                    )}
                  </>
                ),
              },
              {
                title: t("ออก"),
                render: (_, r) => `${date(r.departed_at)} · ${amount(r.odometer_out)} ${t("กม.")}`,
              },
              {
                title: t("กลับ"),
                render: (_, r) =>
                  r.arrived_at ? (
                    `${date(r.arrived_at)} · ${amount(r.odometer_in)} ${t("กม.")}`
                  ) : (
                    <Tag color="orange">{t("ยังไม่กลับ")}</Tag>
                  ),
              },
              {
                title: t("ระยะทาง"),
                render: (_, r) => (r.distance == null ? "-" : `${amount(r.distance)} ${t("กม.")}`),
              },
            ]}
          />
        </Card>
      )}
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
        <Form
          form={form}
          layout="vertical"
          onFinish={save}
          initialValues={{ direction: "OUT", itemType: "CONSUMABLE" }}
        >
          {adding && (
            <>
              <Form.Item name="itemType" label={t("ประเภท")}>
                <Segmented
                  options={[
                    { value: "CONSUMABLE", label: t("วัสดุสิ้นเปลือง") },
                    { value: "EQUIPMENT", label: t("ครุภัณฑ์") },
                  ]}
                />
              </Form.Item>
              <Form.Item noStyle shouldUpdate={(a, b) => a.itemType !== b.itemType}>
                {({ getFieldValue }) =>
                  getFieldValue("itemType") === "EQUIPMENT" ? (
                    <Form.Item
                      name="vehiclePlate"
                      label={t("ทะเบียนรถ (เฉพาะยานพาหนะ ไม่บังคับ)")}
                      extra={t(
                        "ครุภัณฑ์ที่มีทะเบียนรถต้องกรอกใบขออนุญาตใช้รถ (แบบ 3) และบันทึกเลขไมล์ (แบบ 4) ทุกครั้ง",
                      )}
                      rules={[{ max: 20, whitespace: true }]}
                    >
                      <Input placeholder={t("เช่น กข 1234 ขอนแก่น")} maxLength={20} />
                    </Form.Item>
                  ) : null
                }
              </Form.Item>
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
                <UnitInput known={(data?.items || []).map((item) => item.unit)} />
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
            {
              title: t("ผู้รับมอบอำนาจอนุมัติยืมครุภัณฑ์"),
              render: (_, p) =>
                p.role === "APPROVER" ? (
                  <Switch
                    checked={p.loan_approver}
                    aria-label={t("ผู้รับมอบอำนาจอนุมัติยืมครุภัณฑ์ {{name}}", {
                      name: p.display_name,
                    })}
                    onChange={async (value) => {
                      if (value) {
                        setDelegatingApprover(p);
                      } else {
                        try {
                          await api(`/stock/loan-approvers/${p.id}`, {
                            method: "PUT",
                            body: JSON.stringify({ approver: false, reference: "" }),
                          });
                          setKeepers((list) =>
                            list?.map((row) =>
                              row.id === p.id ? { ...row, loan_approver: false } : row,
                            ),
                          );
                        } catch (e) {
                          message.error(t((e as Error).message));
                        }
                      }
                    }}
                  />
                ) : null,
            },
          ]}
        />
      </Modal>
      <Modal
        open={!!returningLoan}
        destroyOnHidden
        title={t("รับคืนครุภัณฑ์: {{name}}", { name: returningLoan?.name })}
        okText={t("บันทึก")}
        cancelText={t("ยกเลิก")}
        confirmLoading={busy}
        onOk={() => loanForm.submit()}
        onCancel={() => {
          setReturningLoan(undefined);
          loanForm.resetFields();
        }}
      >
        <Form
          form={loanForm}
          layout="vertical"
          onFinish={returnLoan}
          initialValues={{ condition: "GOOD" }}
        >
          <Form.Item name="condition" label={t("สภาพที่รับคืน")} rules={[{ required: true }]}>
            <Segmented
              options={[
                { value: "GOOD", label: t("สภาพปกติ") },
                { value: "DAMAGED", label: t("ชำรุด") },
                { value: "LOST", label: t("สูญหาย") },
              ]}
            />
          </Form.Item>
          <Form.Item shouldUpdate>
            {({ getFieldValue }) => {
              const condition = getFieldValue("condition");
              return (
                <Form.Item
                  name="note"
                  label={condition === "GOOD" ? t("หมายเหตุ (ไม่บังคับ)") : t("หมายเหตุ")}
                  rules={[
                    {
                      required: condition !== "GOOD",
                      whitespace: true,
                      max: 500,
                      message: t("กรุณาระบุสภาพครุภัณฑ์ที่ชำรุดหรือสูญหายไม่เกิน 500 ตัวอักษร"),
                    },
                  ]}
                >
                  <Input.TextArea rows={2} maxLength={500} />
                </Form.Item>
              );
            }}
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        open={!!delegatingApprover}
        destroyOnHidden
        title={t("มอบอำนาจอนุมัติยืมครุภัณฑ์: {{name}}", {
          name: delegatingApprover?.display_name,
        })}
        okText={t("บันทึก")}
        cancelText={t("ยกเลิก")}
        confirmLoading={busy}
        onOk={() => delegateForm.submit()}
        onCancel={() => {
          setDelegatingApprover(undefined);
          delegateForm.resetFields();
        }}
      >
        <Form form={delegateForm} layout="vertical" onFinish={saveDelegation}>
          <Form.Item
            name="reference"
            label={t("เลขที่หนังสือมอบอำนาจ")}
            rules={[{ required: true, whitespace: true, max: 200 }]}
          >
            <Input placeholder={t("เช่น มท 0808.1/1234")} maxLength={200} />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        open={!!plating}
        destroyOnHidden
        title={t("ทะเบียนรถ: {{name}}", { name: plating?.name })}
        okText={t("บันทึก")}
        cancelText={t("ยกเลิก")}
        confirmLoading={busy}
        onOk={() => plateForm.submit()}
        onCancel={() => setPlating(undefined)}
      >
        <Form
          form={plateForm}
          layout="vertical"
          onFinish={savePlate}
          initialValues={{ vehiclePlate: plating?.vehicle_plate ?? "" }}
        >
          <Form.Item
            name="vehiclePlate"
            label={t("ทะเบียนรถ (เว้นว่างถ้าไม่ใช่ยานพาหนะ)")}
            rules={[{ max: 20 }]}
          >
            <Input placeholder={t("เช่น กข 1234 ขอนแก่น")} maxLength={20} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
