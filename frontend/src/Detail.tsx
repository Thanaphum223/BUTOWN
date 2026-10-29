import { useEffect, useState } from "react";
import {
  App,
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Form,
  Input,
  InputNumber,
  List,
  Modal,
  Row,
  Select,
  Space,
  Spin,
  Steps,
  Tag,
  Tabs,
  Timeline,
  Typography,
  Upload,
} from "antd";
import {
  ArrowLeftOutlined,
  ReloadOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { api, post, statusNames, actionNames, date } from "./api";
import LocationMap from "./LocationMap";
type D = Record<string, any>;
const { Title, Text, Paragraph } = Typography;
export default function Detail({
  id,
  user,
  back,
  embedded = false,
  onChanged,
}: {
  id: string;
  user: D;
  back: () => void;
  embedded?: boolean;
  onChanged?: () => void;
}) {
  const [data, setData] = useState<D>(),
    [error, setError] = useState(""),
    [action, setAction] = useState(""),
    [teams, setTeams] = useState<D[]>([]),
    [people, setPeople] = useState<D[]>([]),
    [busy, setBusy] = useState(false);
  const [form] = Form.useForm();
  const { message } = App.useApp();
  async function load() {
    setError("");
    try {
      setData(await api("/complaints/" + id));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    setData(undefined);
    void load();
  }, [id]);
  async function choose(a: string) {
    form.resetFields();
    setPeople([]);
    setTeams([]);
    setAction(a);
    if (a === "ASSIGN") {
      try {
        setTeams(await api("/teams"));
      } catch (e) {
        message.error((e as Error).message);
      }
    }
    const role =
      a === "TRIAGE"
        ? "LEADER"
        : a === "ASSIGN"
          ? "FIELD"
          : a === "SEND_APPROVAL"
            ? "APPROVER"
            : null;
    if (role) {
      try {
        setPeople(await api("/people?role=" + role));
      } catch (e) {
        message.error((e as Error).message);
      }
    }
  }
  async function submit(v: D) {
    setBusy(true);
    try {
      await post("/complaints/" + id + "/actions", {
        ...v,
        action,
        version: data!.complaint.version,
      });
      message.success("บันทึกแล้ว");
      setAction("");
      if (action === "DECLINE") {
        back();
        return;
      }
      await load();
      onChanged?.();
    } catch (e) {
      message.error((e as Error).message);
      await load();
    } finally {
      setBusy(false);
    }
  }
  if (error)
    return (
      <>
        <Button onClick={back}>กลับรายการ</Button>
        <Alert type="error" showIcon message={error} />
      </>
    );
  if (!data) return <Spin />;
  const c = data.complaint;
  const citizen = user.role === "CITIZEN";
  const uploadAllowed =
    (citizen && c.status === "NEW") ||
    (user.role === "FIELD" &&
      ["IN_PROGRESS", "FIELD_REVISION"].includes(c.status)) ||
    (user.role === "LEADER" &&
      ["RESOURCE_DRAFT", "RESOURCE_REVISION"].includes(c.status));
  const stages = [
    "NEW",
    "TRIAGED",
    "ASSIGNED",
    "IN_PROGRESS",
    "LEADER_REVIEW",
    "CLOSED",
  ];
  let current = ["CLOSED"].includes(c.status)
    ? 5
    : [
          "RESOLVED",
          "OFFICER_REVIEW",
          "LEADER_REVISION",
          "LEADER_REVIEW",
          "FIELD_REVISION",
        ].includes(c.status)
      ? 4
      : c.status === "IN_PROGRESS"
        ? 3
        : [
              "ASSIGNED",
              "ACCEPTED",
              "RESOURCE_DRAFT",
              "RESOURCE_CHECK",
              "RESOURCE_REVISION",
              "RESOURCE_APPROVAL",
              "READY",
            ].includes(c.status)
          ? 2
          : c.status === "TRIAGED"
            ? 1
            : 0;
  return (
    <>
      <div className="page-heading">
        <div>
          {!embedded && (
            <Button type="text" icon={<ArrowLeftOutlined />} onClick={back}>
              กลับรายการ
            </Button>
          )}
          <Title level={embedded ? 3 : 2}>{c.title}</Title>
          <Space wrap>
            <Text type="secondary">#{id.slice(0, 8).toUpperCase()}</Text>
            <Tag
              color={
                ["REJECTED", "TERMINATED"].includes(c.status) ? "red" : "cyan"
              }
            >
              {statusNames[c.status]}
            </Tag>
          </Space>
        </div>
        <Button icon={<ReloadOutlined />} onClick={load}>
          โหลดใหม่
        </Button>
      </div>
      <Card style={{ marginBottom: 20 }}>
        <Steps
          current={current}
          status={
            ["REJECTED", "TERMINATED"].includes(c.status)
              ? "error"
              : c.status === "CLOSED"
                ? "finish"
                : "process"
          }
          responsive
          items={[
            "รับคำร้อง",
            "จัดหน่วยงาน",
            "มอบหมายทีม",
            "ลงพื้นที่",
            "ตรวจผลงาน",
            "ปิดเรื่อง",
          ].map((title) => ({ title }))}
        />
      </Card>
      {embedded && data.actions?.length > 0 && (
        <Card className="embedded-actions" title="ดำเนินการ">
          <Space wrap>
            {data.actions.map((r: D) => (
              <Button
                key={r.action}
                type={
                  ["REJECT", "DENY", "DECLINE"].includes(r.action)
                    ? "default"
                    : "primary"
                }
                danger={["REJECT", "DENY", "DECLINE"].includes(r.action)}
                onClick={() => choose(r.action)}
              >
                {actionNames[r.action]}
              </Button>
            ))}
          </Space>
        </Card>
      )}
      <Row gutter={[20, 20]}>
        <Col xs={24} xl={embedded ? 24 : 16}>
          <Card title="รายละเอียดคำร้อง">
            <Descriptions
              column={1}
              items={[
                {
                  key: "description",
                  label: "ปัญหาที่แจ้ง",
                  children: (
                    <Paragraph style={{ whiteSpace: "pre-wrap" }}>
                      {c.description}
                    </Paragraph>
                  ),
                },
                ...(!citizen
                  ? [
                      {
                        key: "contact_name",
                        label: "ชื่อผู้ติดต่อ",
                        children: c.contact_name || "ไม่ระบุ",
                      },
                      {
                        key: "contact_phone",
                        label: "เบอร์ติดต่อ",
                        children: c.contact_phone || "ไม่ระบุ",
                      },
                    ]
                  : []),
                { key: "address", label: "สถานที่", children: c.address },
                {
                  key: "created",
                  label: "วันที่แจ้ง",
                  children: date(c.created_at),
                },
                { key: "due", label: "กำหนดเสร็จ", children: date(c.due_at) },
              ]}
            />
            {c.latitude != null && (
              <LocationMap value={[Number(c.latitude), Number(c.longitude)]} />
            )}{" "}
            {c.answers && Object.keys(JSON.parse(c.answers)).length > 0 && (
              <Descriptions
                column={1}
                title="ข้อมูลเพิ่มเติม"
                items={Object.entries(JSON.parse(c.answers)).map(
                  ([key, value]) => ({
                    key,
                    label: c.form_schema
                      ? JSON.parse(c.form_schema).find((f: D) => f.key === key)
                          ?.label || key
                      : key,
                    children: String(value),
                  }),
                )}
              />
            )}
          </Card>
          {!citizen && (
            <Card style={{ marginTop: 20 }}>
              <Tabs
                items={[
                  {
                    key: "reports",
                    label: "รายงานผล (" + (data.reports?.length || 0) + ")",
                    children: (
                      <List
                        dataSource={data.reports}
                        locale={{ emptyText: "ยังไม่มีรายงาน" }}
                        renderItem={(r: D) => (
                          <List.Item>
                            <div>
                              <Text strong>ฉบับที่ {r.revision}</Text>
                              <Paragraph style={{ whiteSpace: "pre-wrap" }}>
                                {r.content}
                              </Paragraph>
                              <Text type="secondary">{date(r.created_at)}</Text>
                            </div>
                          </List.Item>
                        )}
                      />
                    ),
                  },
                  {
                    key: "resources",
                    label: "คำขอทรัพยากร",
                    children: (
                      <>
                        <List
                          dataSource={data.resources}
                          locale={{ emptyText: "ยังไม่มีคำขอทรัพยากร" }}
                          renderItem={(r: D) => (
                            <List.Item>
                              <div>
                                <Tag>
                                  {(
                                    {
                                      DRAFT: "ร่างข้อเสนอ",
                                      CHECK: "รอตรวจเอกสาร",
                                      REVISION: "แก้ไขข้อเสนอ",
                                      PENDING: "รออนุมัติ",
                                      APPROVED: "อนุมัติแล้ว",
                                      DENIED: "ไม่อนุมัติ",
                                    } as Record<string, string>
                                  )[r.status] || r.status}
                                </Tag>
                                {JSON.parse(r.revisions).map((v: D) => (
                                  <div key={v.id} className="revision">
                                    <Text strong>
                                      ฉบับที่ {v.revision} •{" "}
                                      {Number(v.amount).toLocaleString("th-TH")}{" "}
                                      บาท • {v.duration_days} วัน
                                    </Text>
                                    <Paragraph
                                      style={{ whiteSpace: "pre-wrap" }}
                                    >
                                      {v.proposal}
                                    </Paragraph>
                                  </div>
                                ))}
                              </div>
                            </List.Item>
                          )}
                        />
                        <List
                          header="ลำดับการอนุมัติ"
                          dataSource={data.approvals}
                          renderItem={(r: D) => (
                            <List.Item>
                              <Space wrap>
                                <Text>
                                  {r.step}. {r.approver_name}
                                </Text>
                                <Tag>
                                  {r.decision
                                    ? actionNames[r.decision]
                                    : "รอพิจารณา"}
                                </Tag>
                                <Text>{r.reason}</Text>
                              </Space>
                            </List.Item>
                          )}
                        />
                      </>
                    ),
                  },
                  {
                    key: "work",
                    label: "การมอบหมาย",
                    children: (
                      <List
                        dataSource={data.workOrders}
                        renderItem={(r: D) => (
                          <List.Item>
                            <Space direction="vertical">
                              <Text strong>{r.assignee_name}</Text>
                              <Text>
                                {(
                                  {
                                    ASSIGNED: "รอรับงาน",
                                    ACCEPTED: "รับงานแล้ว",
                                    IN_PROGRESS: "กำลังดำเนินการ",
                                    DECLINED: "ปฏิเสธงาน",
                                    CANCELLED: "ยกเลิกงาน",
                                    COMPLETE: "เสร็จสิ้น",
                                  } as Record<string, string>
                                )[r.status] || r.status}{" "}
                                {r.reason && "• " + r.reason}
                              </Text>
                              <Text type="secondary">{date(r.created_at)}</Text>
                            </Space>
                          </List.Item>
                        )}
                      />
                    ),
                  },
                  {
                    key: "reviews",
                    label: "ผลการตรวจ",
                    children: (
                      <List
                        dataSource={data.reviews}
                        renderItem={(r: D) => (
                          <List.Item>
                            <div>
                              <Text strong>
                                {actionNames[r.decision] || r.decision} •{" "}
                                {r.actor_name}
                              </Text>
                              <Paragraph>{r.reason}</Paragraph>
                              <Text type="secondary">{date(r.created_at)}</Text>
                            </div>
                          </List.Item>
                        )}
                      />
                    ),
                  },
                ]}
              />
            </Card>
          )}
          <Card
            title="ไฟล์หลักฐาน"
            style={{ marginTop: 20 }}
            extra={
              uploadAllowed ? (
                <Upload
                  showUploadList={false}
                  accept=".png,.jpg,.jpeg,.pdf"
                  customRequest={async ({ file, onSuccess, onError }) => {
                    try {
                      const f = new FormData();
                      f.append("file", file);
                      await api("/complaints/" + id + "/files", {
                        method: "POST",
                        body: f,
                      });
                      onSuccess?.({});
                      message.success("แนบไฟล์แล้ว");
                      await load();
                    } catch (e) {
                      onError?.(e as Error);
                      message.error((e as Error).message);
                    }
                  }}
                >
                  <Button icon={<UploadOutlined />}>แนบไฟล์</Button>
                </Upload>
              ) : undefined
            }
          >
            <List
              dataSource={data.files}
              locale={{ emptyText: "ยังไม่มีไฟล์หลักฐาน" }}
              renderItem={(f: D) => (
                <List.Item>
                  <a href={"/api/files/" + f.id}>{f.original_name}</a>
                  <Text type="secondary">
                    {(f.size_bytes / 1024).toFixed(0)} KB
                  </Text>
                </List.Item>
              )}
            />
          </Card>
        </Col>
        <Col xs={24} xl={embedded ? 24 : 8}>
          {!embedded && data.actions?.length > 0 && (
            <Card title="ดำเนินการ" style={{ marginBottom: 20 }}>
              <Space direction="vertical" style={{ width: "100%" }}>
                {data.actions.map((r: D) => (
                  <Button
                    block
                    key={r.action}
                    type={
                      ["REJECT", "DENY", "DECLINE"].includes(r.action)
                        ? "default"
                        : "primary"
                    }
                    danger={["REJECT", "DENY", "DECLINE"].includes(r.action)}
                    onClick={() => choose(r.action)}
                  >
                    {actionNames[r.action]}
                  </Button>
                ))}
              </Space>
            </Card>
          )}
          <Card title="ประวัติการดำเนินการ">
            <Timeline
              items={data.history.map((h: D) => ({
                color: ["DENY", "REJECT"].includes(h.action)
                  ? "red"
                  : "#087f75",
                children: (
                  <>
                    <Text strong>{actionNames[h.action] || h.action}</Text>
                    <div>
                      <Text type="secondary">
                        {date(h.created_at)}
                        {h.actor_name && " • " + h.actor_name}
                      </Text>
                    </div>
                    {h.reason && <Paragraph>{h.reason}</Paragraph>}
                  </>
                ),
              }))}
            />
          </Card>
        </Col>
      </Row>
      <Modal
        open={!!action}
        title={actionNames[action]}
        onCancel={() => setAction("")}
        footer={null}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={submit}>
          {action === "DENY" && (
            <Alert
              style={{ marginBottom: 16 }}
              type="error"
              showIcon
              message="การไม่อนุมัติจะยุติคำร้องทั้งเรื่องและยกเลิกงานที่ค้าง"
            />
          )}
          {action === "ASSIGN" && (
            <Form.Item
              name="teamId"
              label="เลือกทีม (หรือเลือกผู้ลงพื้นที่รายบุคคลด้านล่าง)"
            >
              <Select
                allowClear
                options={teams.map((t) => ({
                  value: t.id,
                  label: t.name + " • " + t.representative_name,
                }))}
              />
            </Form.Item>
          )}
          {["TRIAGE", "ASSIGN", "SEND_APPROVAL"].includes(action) && (
            <Form.Item
              label={
                action === "TRIAGE"
                  ? "หัวหน้าหน่วยงาน"
                  : action === "ASSIGN"
                    ? "ผู้ลงพื้นที่"
                    : "ผู้อนุมัติตามลำดับ (เลือก " +
                      data.approvalStages +
                      " คน)"
              }
              name={
                action === "TRIAGE"
                  ? "leaderId"
                  : action === "ASSIGN"
                    ? "assigneeId"
                    : "approverIds"
              }
              rules={[{ required: action !== "ASSIGN" }]}
            >
              <Select
                allowClear
                mode={action === "SEND_APPROVAL" ? "multiple" : undefined}
                options={people.map((p) => ({
                  value: p.id,
                  label: p.display_name,
                }))}
              />
            </Form.Item>
          )}
          {action === "PROPOSE" && (
            <>
              <Form.Item
                label="ข้อเสนอและรายการทรัพยากร"
                name="proposal"
                rules={[{ required: true, max: 20000 }]}
              >
                <Input.TextArea rows={4} />
              </Form.Item>
              <Form.Item
                label="งบประมาณ (บาท)"
                name="amount"
                rules={[{ required: true }]}
              >
                <InputNumber
                  min={0}
                  max={999999999999.99}
                  precision={2}
                  style={{ width: "100%" }}
                />
              </Form.Item>
              <Form.Item
                label="ระยะเวลาดำเนินการ (วัน)"
                name="durationDays"
                rules={[{ required: true }]}
              >
                <InputNumber min={1} max={3650} precision={0} />
              </Form.Item>
              <Alert
                style={{ marginBottom: 16 }}
                message="แนบเอกสารประกอบที่หน้าไฟล์หลักฐานก่อนส่งข้อเสนอ"
              />
            </>
          )}
          {action === "REPORT" && (
            <>
              <Form.Item
                label="ข้อเท็จจริงและผลดำเนินการ"
                name="content"
                rules={[{ required: true, max: 20000 }]}
              >
                <Input.TextArea rows={6} />
              </Form.Item>
              <Alert
                style={{ marginBottom: 16 }}
                message="ต้องแนบหลักฐานใหม่ก่อนส่งรายงานแต่ละฉบับ"
              />
            </>
          )}
          <Form.Item
            label="เหตุผล / บันทึกการดำเนินการ"
            name="reason"
            rules={[{ required: true, max: 4000 }]}
          >
            <Input.TextArea rows={3} />
          </Form.Item>
          <Button
            htmlType="submit"
            type="primary"
            danger={action === "DENY"}
            loading={busy}
            block
          >
            ยืนยัน{actionNames[action]}
          </Button>
        </Form>
      </Modal>
    </>
  );
}
