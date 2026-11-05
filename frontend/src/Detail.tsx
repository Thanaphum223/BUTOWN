import { govTokens } from "./govTheme";
import AttachmentList from "./AttachmentList";
import ResourceReview from "./ResourceReview";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import EvidenceUpload from "./EvidenceUpload";
import EvidenceGallery from "./EvidenceGallery";
import { readDraft, saveDraft, removeDraft, type FieldDraft } from "./fieldDraft";
import { useEffect, useRef, useState } from "react";
import {
  App,
  Alert,
  Button,
  Card,
  Checkbox,
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
  EnvironmentOutlined,
  CalendarOutlined,
} from "@ant-design/icons";
import { api, post, statusNames, actionNames, date } from "./api";
import LocationMap from "./LocationMap";
import { ATTACHMENT_ACCEPT, ATTACHMENT_HELP, attachmentError } from "./attachments";
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
  const [publishSource, setPublishSource] = useState<D>();
  const [publishFile, setPublishFile] = useState<File>();
  const [confirmedClean, setConfirmedClean] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const draftKey = `${user.id}:${id}`;
  const [draft, setDraft] = useState<FieldDraft>({ values: {}, files: [] });
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  const [form] = Form.useForm();
  const resourceItems = Form.useWatch("lineItems", form) as D[] | undefined;
  const resourceTotal =
    (resourceItems || []).reduce(
      (total: number, item: D) => total + Math.round(Number(item?.amount || 0) * 100),
      0,
    ) / 100;
  const [resourceDepartment, setResourceDepartment] = useState("");
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (uploadBusy || (action && form.isFieldsTouched())) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [uploadBusy, action, form]);
  const operationKey = useRef(crypto.randomUUID());
  const [evidenceStage, setEvidenceStage] = useState("BEFORE");
  const { message, modal } = App.useApp();
  const submitting = useRef(false);
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
    operationKey.current = crypto.randomUUID();
    setPeople([]);
    setTeams([]);
    setAction(a);
    if (a === "PROPOSE") {
      const revisions = (data?.resources || []).flatMap((resource: D) =>
        JSON.parse(resource.revisions || "[]"),
      );
      const previous = revisions.at(-1);
      form.setFieldsValue({
        proposal: previous?.proposal,
        durationDays: previous?.duration_days,
        lineItems: previous?.line_items?.length
          ? previous.line_items
          : [{ name: "", amount: null }],
      });
      try {
        const catalog = await api<D>("/catalog");
        setResourceDepartment(
          catalog.departments.find((d: D) => d.id === data?.complaint.department_id)?.name ||
            "หน่วยงานตามคำร้อง",
        );
      } catch {
        setResourceDepartment("หน่วยงานตามคำร้อง");
      }
    }
    if (a === "REPORT") {
      try {
        const saved = await readDraft(draftKey);
        if (saved) {
          setDraft(saved);
          form.setFieldsValue(saved.values);
        }
      } catch {
        message.warning("เปิดร่างในอุปกรณ์ไม่ได้ กรุณาตรวจพื้นที่ว่าง");
      }
    }
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
        const department =
          role === "APPROVER" ? "" : `&departmentId=${data?.complaint.department_id}`;
        setPeople(await api("/people?role=" + role + department));
      } catch (e) {
        message.error((e as Error).message);
      }
    }
  }
  async function saveFailedFile(file: File, stage: string) {
    try {
      const saved = (await readDraft(draftKey)) || { values: {}, files: [] };
      saved.files.push({ file, stage });
      await saveDraft(draftKey, saved);
      setDraft(saved);
      message.info("เก็บไฟล์ที่ส่งไม่สำเร็จเป็นร่างแล้ว กดส่งไฟล์อีกครั้งเมื่อเชื่อมต่อได้");
    } catch {
      message.error("บันทึกไฟล์ร่างไม่ได้ กรุณาเก็บไฟล์ต้นฉบับไว้");
    }
  }
  async function submit(v: D) {
    if (submitting.current) return;
    if (uploadBusy) {
      message.warning("กรุณารอให้อัปโหลดไฟล์เสร็จก่อน");
      return;
    }
    const pendingFiles = (data?.files || []).filter(
      (f: D) => f.uploaded_by === user.id && !f.report_id && !f.resource_id,
    );
    if (
      action === "PROPOSE" &&
      !pendingFiles.some(
        (f: D) => f.content_type === "application/pdf" && Number(f.size_bytes) <= 15_000_000,
      )
    ) {
      message.error("กรุณาแนบเอกสารคำขอ PDF ขนาดไม่เกิน 15 MB ในแบบฟอร์มนี้");
      return;
    }
    if (
      action === "REPORT" &&
      (draft.files.length > 0 ||
        !["BEFORE", "AFTER"].every((stage) =>
          pendingFiles.some(
            (f: D) => f.evidence_stage === stage && f.content_type?.startsWith("image/"),
          ),
        ))
    ) {
      message.error("กรุณาส่งภาพก่อนทำและหลังทำให้ครบ และส่งไฟล์ร่างที่ค้างก่อนยืนยันรายงาน");
      return;
    }
    submitting.current = true;
    setBusy(true);
    try {
      if (["REJECT", "CLOSE", "APPROVE", "DENY"].includes(action)) {
        const confirmed = await new Promise<boolean>((resolve) =>
          modal.confirm({
            title: "ตรวจสอบก่อนยืนยัน",
            content: (
              <div>
                <p>
                  เลขเรื่อง #{id.slice(0, 8).toUpperCase()} · ฉบับ {data!.complaint.version}
                </p>
                <p>{actionNames[action]}</p>
                <p>เหตุผล: {v.reason}</p>
              </div>
            ),
            zIndex: 2000,
            maskClosable: false,
            okText: "ยืนยัน",
            cancelText: "กลับไปแก้ไข",
            onOk: () => resolve(true),
            onCancel: () => resolve(false),
          }),
        );
        if (!confirmed) return;
      }
      await api("/complaints/" + id + "/actions", {
        method: "POST",
        headers: { "Idempotency-Key": operationKey.current },
        body: JSON.stringify({
          ...v,
          ...(action === "PROPOSE" ? { amount: resourceTotal } : {}),
          action,
          version: data!.complaint.version,
        }),
      });
      if (action === "REPORT") {
        await removeDraft(draftKey);
        setDraft({ values: {}, files: [] });
      }
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
      submitting.current = false;
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
  const pendingEvidence = (data.files || []).filter(
    (f: D) => f.uploaded_by === user.id && !f.report_id && !f.resource_id,
  );
  const pendingBytes = (data.files || []).reduce(
    (total: number, f: D) => total + Number(f.size_bytes),
    0,
  );
  const evidenceList = (stage?: string) => (
    <List
      size="small"
      className="pending-evidence"
      locale={{ emptyText: "ยังไม่ได้แนบไฟล์" }}
      dataSource={pendingEvidence.filter((f: D) =>
        stage ? f.evidence_stage === stage : f.content_type === "application/pdf",
      )}
      renderItem={(file: D) => (
        <List.Item>
          <a href={"/api/files/" + file.id} target="_blank" rel="noreferrer">
            {file.original_name}
          </a>
          <Tag color="green">แนบแล้ว</Tag>
        </List.Item>
      )}
    />
  );
  const c = data.complaint;
  const citizen = user.role === "CITIZEN";
  const latestResource = data.resources?.at(-1);
  const uploadAllowed =
    (citizen && c.status === "NEW") ||
    (user.role === "FIELD" && ["IN_PROGRESS", "FIELD_REVISION"].includes(c.status)) ||
    (user.role === "LEADER" && ["RESOURCE_DRAFT", "RESOURCE_REVISION"].includes(c.status));
  const stages = ["NEW", "TRIAGED", "ASSIGNED", "IN_PROGRESS", "LEADER_REVIEW", "CLOSED"];
  let current = ["CLOSED"].includes(c.status)
    ? 5
    : ["RESOLVED", "OFFICER_REVIEW", "LEADER_REVISION", "LEADER_REVIEW", "FIELD_REVISION"].includes(
          c.status,
        )
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
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={back}>
            {embedded ? "กลับคิวงาน" : "กลับรายการ"}
          </Button>
          <Title level={embedded ? 3 : 2}>{c.title}</Title>
          <Space wrap>
            <Text type="secondary">#{id.slice(0, 8).toUpperCase()}</Text>
            <Tag color={["REJECTED", "TERMINATED"].includes(c.status) ? "red" : "cyan"}>
              {statusNames[c.status]}
            </Tag>
          </Space>
        </div>
        <Button icon={<ReloadOutlined />} onClick={load}>
          โหลดใหม่
        </Button>
      </div>
      {!citizen && c.status === "RESOURCE_APPROVAL" && latestResource?.status === "PENDING" && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 20 }}
          message={"รออนุมัติโดย " + (latestResource.approver_name || "ผู้อนุมัติที่ได้รับมอบหมาย")}
          description={
            latestResource.approver_id === user.id
              ? user.role === "ADMIN"
                ? "งานนี้ส่งถึงบัญชีของคุณ สลับเป็นบทบาทผู้อนุมัติเพื่อพิจารณา"
                : "งานนี้ส่งถึงบัญชีของคุณ"
              : "ผู้รับที่ระบุจะเห็นงานนี้ในคิวผู้อนุมัติของตน"
          }
        />
      )}
      {embedded && (
        <section className="split-case-summary">
          <div className="split-case-facts">
            <span>
              <EnvironmentOutlined /> {c.address || "ไม่ระบุสถานที่"}
            </span>
            <span>
              <CalendarOutlined /> กำหนดเสร็จ {date(c.due_at)}
            </span>
          </div>
          <h3>รายละเอียด</h3>
          <Paragraph style={{ whiteSpace: "pre-wrap" }}>{c.description}</Paragraph>
          <h3>หลักฐานประกอบ</h3>
          <EvidenceGallery
            media={(data.files || []).filter(
              (f: D) =>
                f.content_type?.startsWith("image/") || f.content_type?.startsWith("video/"),
            )}
          />
        </section>
      )}
      <details
        className={embedded ? "split-section" : "workflow-section"}
        open={embedded ? undefined : true}
      >
        <summary>ขั้นตอนการดำเนินงาน</summary>
        <Card className="workflow-progress" style={{ marginBottom: 20 }}>
          <Steps
            current={current}
            status={
              ["REJECTED", "TERMINATED"].includes(c.status)
                ? "error"
                : c.status === "CLOSED"
                  ? "finish"
                  : "process"
            }
            responsive={citizen}
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
      </details>
      {!citizen && (
        <details
          className="split-section"
          open={
            ["RESOURCE_DRAFT", "RESOURCE_CHECK", "RESOURCE_REVISION", "RESOURCE_APPROVAL"].includes(
              c.status,
            ) || undefined
          }
        >
          <summary>คำขอทรัพยากรและเอกสารประกอบ ({data.resources?.length || 0})</summary>
          <ResourceReview resources={data.resources} files={data.files} />
        </details>
      )}
      {!citizen &&
        data.reports?.length > 0 &&
        ["LEADER_REVIEW", "OFFICER_REVIEW", "LEADER_REVISION", "RESOLVED"].includes(c.status) && (
          <Card className="report-review-card" title="รายงานล่าสุดและหลักฐานประกอบ">
            <Paragraph>{data.reports.at(-1).content}</Paragraph>
            <EvidenceGallery
              media={(data.files || []).filter(
                (file: D) =>
                  file.report_id === data.reports.at(-1).id &&
                  (file.content_type?.startsWith("image/") ||
                    file.content_type?.startsWith("video/")),
              )}
            />
            <AttachmentList
              files={(data.files || []).filter(
                (file: D) =>
                  file.report_id === data.reports.at(-1).id &&
                  file.content_type === "application/pdf",
              )}
              emptyText="ไม่มีเอกสาร PDF เพิ่มเติมในรายงานนี้"
            />
          </Card>
        )}
      <details
        className={embedded ? "split-section split-extra-info" : "split-full-info"}
        open={embedded ? undefined : true}
      >
        <summary>ข้อมูลคำร้อง เอกสาร และรายงานทั้งหมด</summary>
        <Row gutter={[20, 20]}>
          <Col xs={24} xl={embedded ? 24 : 16}>
            {user.role !== "CITIZEN" && c.assignment_details && (
              <Card title="คำแนะนำและความปลอดภัยก่อนรับงาน" style={{ marginBottom: 16 }}>
                <Descriptions
                  column={1}
                  items={Object.entries(
                    typeof c.assignment_details === "string"
                      ? JSON.parse(c.assignment_details)
                      : c.assignment_details,
                  ).map(([key, value]) => ({
                    key,
                    label:
                      (
                        {
                          operationMethod: "วิธีดำเนินงาน",
                          urgency: "ความเร่งด่วน",
                          appointment: "วันนัดหมาย",
                          workScope: "ขอบเขตงาน",
                          precautions: "ข้อควรระวัง",
                          coordinator: "ช่องทางประสานงาน",
                        } as D
                      )[key] || key,
                    children:
                      key === "urgency"
                        ? ({ NORMAL: "ปกติ", PRIORITY: "เร่งด่วน" } as D)[String(value)] ||
                          String(value)
                        : String(value),
                  }))}
                />
                {c.latitude != null && (
                  <a
                    target="_blank"
                    rel="noopener noreferrer"
                    href={`https://www.google.com/maps/dir/?api=1&destination=${c.latitude},${c.longitude}`}
                  >
                    เปิดเส้นทางไปจุดเกิดเหตุ
                  </a>
                )}
              </Card>
            )}
            <Card title="รายละเอียดคำร้อง">
              <Descriptions
                column={1}
                items={[
                  {
                    key: "description",
                    label: "ปัญหาที่แจ้ง",
                    children: (
                      <Paragraph style={{ whiteSpace: "pre-wrap" }}>{c.description}</Paragraph>
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
                  items={Object.entries(JSON.parse(c.answers)).map(([key, value]) => ({
                    key,
                    label: c.form_schema
                      ? JSON.parse(c.form_schema).find((f: D) => f.key === key)?.label || key
                      : key,
                    children: String(value),
                  }))}
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
                                        {Number(v.amount).toLocaleString("th-TH")} บาท •{" "}
                                        {v.duration_days} วัน
                                      </Text>
                                      <Paragraph style={{ whiteSpace: "pre-wrap" }}>
                                        {v.proposal}
                                      </Paragraph>
                                      {Array.isArray(v.line_items) && v.line_items.length > 0 && (
                                        <List
                                          size="small"
                                          className="resource-revision-items"
                                          dataSource={v.line_items}
                                          renderItem={(item: D) => (
                                            <List.Item>
                                              <span>{item.name}</span>
                                              <Text>
                                                {Number(item.amount).toLocaleString("th-TH", {
                                                  minimumFractionDigits: 2,
                                                  maximumFractionDigits: 2,
                                                })}{" "}
                                                บาท
                                              </Text>
                                            </List.Item>
                                          )}
                                        />
                                      )}
                                      <AttachmentList
                                        files={(data.files || []).filter(
                                          (file: D) => file.resource_revision_id === v.id,
                                        )}
                                        emptyText="ไม่มีเอกสารที่ระบุฉบับนี้"
                                      />
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
                                  <Tag>{r.decision ? actionNames[r.decision] : "รอพิจารณา"}</Tag>
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
                                  {actionNames[r.decision] || r.decision} • {r.actor_name}
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
                  <Space wrap>
                    {user.role === "FIELD" && (
                      <Select
                        aria-label="ชนิดหลักฐาน"
                        value={evidenceStage}
                        disabled={uploadBusy}
                        onChange={setEvidenceStage}
                        options={[
                          { value: "BEFORE", label: "ภาพก่อนทำ" },
                          { value: "AFTER", label: "ภาพหลังทำ" },
                          { value: "GENERAL", label: "วิดีโอ / เอกสารประกอบ" },
                        ]}
                      />
                    )}
                    <EvidenceUpload
                      complaintId={id}
                      stage={user.role === "FIELD" ? evidenceStage : "GENERAL"}
                      photos={user.role === "FIELD" && evidenceStage !== "GENERAL"}
                      used={pendingBytes}
                      onUploaded={load}
                      onBusy={setUploadBusy}
                      onFailed={user.role === "FIELD" ? saveFailedFile : undefined}
                    />
                  </Space>
                ) : undefined
              }
            >
              <Text type="secondary">{ATTACHMENT_HELP}</Text>
              {(citizen ||
                (data.files || []).some(
                  (f: D) =>
                    f.content_type?.startsWith("image/") || f.content_type?.startsWith("video/"),
                )) && (
                <EvidenceGallery
                  media={
                    citizen
                      ? data.media || []
                      : (data.files || []).filter(
                          (f: D) =>
                            f.content_type?.startsWith("image/") ||
                            f.content_type?.startsWith("video/"),
                        )
                  }
                />
              )}
              <AttachmentList
                files={data.files}
                extraActions={(f: D) =>
                  ["OFFICER", "ADMIN"].includes(user.role) &&
                  (f.content_type?.startsWith("image/") || f.content_type?.startsWith("video/")) ? (
                    f.public_copy_of ? (
                      <Button
                        disabled={!f.public_approved}
                        onClick={async () => {
                          try {
                            await api(`/complaints/${id}/shared-media/${f.id}`, {
                              method: "DELETE",
                            });
                            await load();
                          } catch (e) {
                            message.error((e as Error).message);
                          }
                        }}
                      >
                        {f.public_approved ? "หยุดเผยแพร่" : "ไม่เผยแพร่แล้ว"}
                      </Button>
                    ) : (
                      <Button
                        onClick={() => {
                          setPublishSource(f);
                          setPublishFile(undefined);
                          setConfirmedClean(false);
                        }}
                      >
                        เผยแพร่สำเนา
                      </Button>
                    )
                  ) : null
                }
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
                        [
                          "REJECT",
                          "DENY",
                          "DECLINE",
                          "RETURN_RESOURCE",
                          "RETURN_FIELD",
                          "RETURN_LEADER",
                        ].includes(r.action)
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
          </Col>
        </Row>
      </details>
      <details className="split-section" open={embedded ? undefined : true}>
        <summary>ประวัติการดำเนินงาน ({data.history.length})</summary>
        <Card title="ประวัติการดำเนินการ">
          <Timeline
            items={data.history.map((h: D) => ({
              color: ["DENY", "REJECT"].includes(h.action) ? "red" : govTokens["brand-primary"],
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
      </details>
      {embedded && data.actions?.length > 0 && (
        <Card className="embedded-actions split-action-dock" title="ดำเนินการ">
          <Space wrap>
            {data.actions.map((r: D) => (
              <Button
                key={r.action}
                type={
                  [
                    "REJECT",
                    "DENY",
                    "DECLINE",
                    "RETURN_RESOURCE",
                    "RETURN_FIELD",
                    "RETURN_LEADER",
                  ].includes(r.action)
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
      <Modal
        open={!!publishSource}
        title="เผยแพร่สำเนาหลักฐานในชุมชน"
        onCancel={() => setPublishSource(undefined)}
        okText="ยืนยันเผยแพร่สำเนา"
        confirmLoading={publishing}
        okButtonProps={{ disabled: !publishFile || !confirmedClean }}
        onOk={async () => {
          if (!publishFile || !publishSource || !confirmedClean) return;
          setPublishing(true);
          try {
            const body = new FormData();
            body.append("sourceId", publishSource.id);
            body.append("confirmedClean", "true");
            body.append("file", publishFile);
            await api(`/complaints/${id}/shared-media`, { method: "POST", body });
            setPublishSource(undefined);
            await load();
            message.success("เผยแพร่สำเนาที่ตรวจแล้ว");
          } catch (e) {
            message.error((e as Error).message);
          } finally {
            setPublishing(false);
          }
        }}
      >
        <Alert
          type="info"
          message="อัปโหลดสำเนาที่ปกปิดใบหน้า ทะเบียนรถ และข้อมูลส่วนตัวแล้ว ไฟล์ต้นฉบับยังเป็นส่วนตัว"
          style={{ marginBottom: 16 }}
        />
        <p>ต้นฉบับ: {publishSource?.original_name}</p>
        <Upload
          accept=".jpg,.jpeg,.png,.mp4,.mov,.webm"
          maxCount={1}
          fileList={publishFile ? [{ uid: "copy", name: publishFile.name, status: "done" }] : []}
          beforeUpload={(file) => {
            const error = attachmentError(file, 0);
            if (error) {
              message.error(error);
              return Upload.LIST_IGNORE;
            }
            setPublishFile(file);
            return false;
          }}
          onRemove={() => setPublishFile(undefined)}
        >
          <Button icon={<UploadOutlined />}>เลือกสำเนาที่ปกปิดข้อมูลแล้ว</Button>
        </Upload>
        <Checkbox
          checked={confirmedClean}
          onChange={(e) => setConfirmedClean(e.target.checked)}
          style={{ marginTop: 16 }}
        >
          ตรวจและปกปิดข้อมูลส่วนบุคคลแล้ว และอนุญาตให้แสดงสำเนานี้ในชุมชน
        </Checkbox>
      </Modal>
      <Modal
        open={!!action}
        className={"workflow-modal" + (action === "PROPOSE" ? " resource-modal" : "")}
        width={action === "PROPOSE" ? 760 : 520}
        maskClosable={false}
        closable={!busy && !uploadBusy}
        keyboard={!busy && !uploadBusy}
        title={actionNames[action]}
        onCancel={() => {
          if (!busy && !uploadBusy) setAction("");
        }}
        footer={null}
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={submit}
          onValuesChange={async (_, values) => {
            if (action === "REPORT")
              try {
                const saved = (await readDraft(draftKey)) || { values: {}, files: [] };
                saved.values = values;
                await saveDraft(draftKey, saved);
                setDraft(saved);
              } catch {
                message.warning("บันทึกร่างไม่ได้ กรุณาเก็บข้อมูลไว้ก่อนปิดหน้า");
              }
          }}
        >
          {action === "REPORT" && (
            <Alert
              style={{ marginBottom: 16 }}
              type={online ? "info" : "warning"}
              message={
                online
                  ? "ตรวจข้อมูลร่างและยืนยันส่งด้วยตนเอง ระบบไม่ส่งอัตโนมัติ"
                  : "ออฟไลน์: เก็บข้อมูลเป็นร่างในอุปกรณ์ ยังไม่ได้ส่งรายงาน"
              }
            />
          )}
          {action === "REPORT" && draft.files.length > 0 && (
            <List
              dataSource={draft.files}
              renderItem={(pending, index) => (
                <List.Item
                  actions={[
                    <Button
                      key="retry"
                      disabled={!online || uploadBusy}
                      onClick={async () => {
                        setUploadBusy(true);
                        try {
                          const body = new FormData();
                          body.append("file", pending.file);
                          body.append("evidenceStage", pending.stage);
                          await api(`/complaints/${id}/files`, { method: "POST", body });
                          const next = {
                            ...draft,
                            files: draft.files.filter((_, i) => i !== index),
                          };
                          setDraft(next);
                          await saveDraft(draftKey, next);
                          await load();
                        } catch (e) {
                          message.error((e as Error).message);
                        } finally {
                          setUploadBusy(false);
                        }
                      }}
                    >
                      ส่งไฟล์อีกครั้ง
                    </Button>,
                  ]}
                >
                  {pending.stage} · {pending.file.name}
                </List.Item>
              )}
            />
          )}

          {action === "DENY" && (
            <Alert
              style={{ marginBottom: 16 }}
              type="error"
              showIcon
              message="การไม่อนุมัติจะยุติคำร้องทั้งเรื่องและยกเลิกงานที่ค้าง"
            />
          )}
          {action === "TRIAGE" && (
            <>
              <Form.Item name="operationMethod" label="วิธีดำเนินงาน" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item name="urgency" label="ความเร่งด่วน" rules={[{ required: true }]}>
                <Select
                  options={[
                    { value: "NORMAL", label: "ปกติ" },
                    { value: "PRIORITY", label: "เร่งด่วน" },
                  ]}
                />
              </Form.Item>
              <Form.Item name="appointment" label="วันนัดหมาย" rules={[{ required: true }]}>
                <Input type="date" />
              </Form.Item>
              <Form.Item name="workScope" label="ขอบเขตงาน" rules={[{ required: true }]}>
                <Input.TextArea />
              </Form.Item>
              <Form.Item name="precautions" label="ข้อควรระวัง" rules={[{ required: true }]}>
                <Input.TextArea />
              </Form.Item>
              <Form.Item name="coordinator" label="ช่องทางประสานงาน" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </>
          )}
          {action === "ASSIGN" && (
            <Form.Item name="teamId" label="เลือกทีม (หรือเลือกผู้ลงพื้นที่รายบุคคลด้านล่าง)">
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
                    : "ผู้อนุมัติตามลำดับ (เลือก " + data.approvalStages + " คน)"
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
                showSearch
                optionFilterProp="label"
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
              <div className="resource-request-header">
                <Form.Item
                  label="ชื่อคำขอทรัพยากร"
                  name="proposal"
                  rules={[{ required: true, whitespace: true, max: 20000 }]}
                >
                  <Input placeholder="เช่น วัสดุซ่อมทางเท้า" />
                </Form.Item>
                <Form.Item label="หน่วยงานผู้ขอ">
                  <Input value={resourceDepartment} readOnly />
                </Form.Item>
              </div>
              <Form.List
                name="lineItems"
                rules={[
                  {
                    validator: async (_, items) => {
                      if (!items?.length) throw new Error("เพิ่มรายการทรัพยากรอย่างน้อย 1 รายการ");
                      if (items.length > 50) throw new Error("เพิ่มได้ไม่เกิน 50 รายการ");
                      if (
                        items.reduce(
                          (sum: number, item: D) =>
                            sum + Math.round(Number(item?.amount || 0) * 100),
                          0,
                        ) > 99999999999999
                      )
                        throw new Error("งบประมาณรวมต้องไม่เกิน 999,999,999,999.99 บาท");
                    },
                  },
                ]}
              >
                {(fields, { add, remove }, { errors }) => (
                  <>
                    <div className="resource-items">
                      {fields.map((field, index) => (
                        <div className="resource-item-row" key={field.key}>
                          <Form.Item
                            label={"รายการที่ " + (index + 1)}
                            name={[field.name, "name"]}
                            rules={[{ required: true, whitespace: true, max: 200 }]}
                          >
                            <Input
                              aria-label={"ชื่อรายการ " + (index + 1)}
                              placeholder="ชื่อรายการ เช่น ทราย ปูนซีเมนต์"
                              maxLength={200}
                            />
                          </Form.Item>
                          <Form.Item
                            label="ราคา (บาท)"
                            name={[field.name, "amount"]}
                            rules={[
                              { required: true, type: "number", min: 0, max: 999999999999.99 },
                            ]}
                          >
                            <InputNumber
                              aria-label={"ราคารายการ " + (index + 1)}
                              min={0}
                              max={999999999999.99}
                              precision={2}
                              placeholder="0.00"
                              style={{ width: "100%" }}
                            />
                          </Form.Item>
                          <Button
                            className="resource-remove"
                            icon={<DeleteOutlined />}
                            danger
                            aria-label={"ลบรายการ " + (index + 1)}
                            onClick={() => remove(field.name)}
                          >
                            ลบ
                          </Button>
                        </div>
                      ))}
                    </div>
                    <Form.ErrorList errors={errors} />
                    <Button
                      icon={<PlusOutlined />}
                      disabled={fields.length >= 50}
                      onClick={() => add({ name: "", amount: null })}
                    >
                      เพิ่มรายการ
                    </Button>
                    <div className="resource-total" aria-live="polite">
                      <Text>งบประมาณรวม {fields.length} รายการ</Text>
                      <Text strong>
                        {resourceTotal.toLocaleString("th-TH", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{" "}
                        บาท
                      </Text>
                    </div>
                  </>
                )}
              </Form.List>
              <Form.Item
                label="ระยะเวลาดำเนินการ (วัน)"
                name="durationDays"
                rules={[{ required: true }]}
              >
                <InputNumber min={1} max={3650} precision={0} />
              </Form.Item>
              <Form.Item label="เอกสารคำขอ (PDF ไม่เกิน 15 MB)" required>
                <EvidenceUpload
                  complaintId={id}
                  pdf
                  used={pendingBytes}
                  onUploaded={load}
                  onBusy={setUploadBusy}
                />
                {evidenceList()}
              </Form.Item>
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
              <div className="field-evidence-steps">
                {[
                  { stage: "BEFORE", label: "1. ภาพก่อนทำ" },
                  { stage: "AFTER", label: "2. ภาพหลังทำ" },
                ].map((item) => (
                  <section key={item.stage}>
                    <h4>
                      {item.label} <span className="required-mark">*</span>
                    </h4>
                    <EvidenceUpload
                      complaintId={id}
                      stage={item.stage}
                      photos
                      used={pendingBytes}
                      disabled={uploadBusy}
                      onUploaded={load}
                      onBusy={setUploadBusy}
                      onFailed={saveFailedFile}
                    />
                    {evidenceList(item.stage)}
                  </section>
                ))}
              </div>
              <details className="additional-evidence">
                <summary>วิดีโอหรือเอกสารประกอบเพิ่มเติม</summary>
                <EvidenceUpload
                  complaintId={id}
                  used={pendingBytes}
                  disabled={uploadBusy}
                  onUploaded={load}
                  onBusy={setUploadBusy}
                  onFailed={saveFailedFile}
                />
              </details>
              <Text type="secondary">ภาพก่อนและหลังต้องเป็น PNG/JPEG · {ATTACHMENT_HELP}</Text>
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
            disabled={uploadBusy || (action === "REPORT" && !online)}
            block
          >
            ยืนยัน{actionNames[action]}
          </Button>
        </Form>
      </Modal>
    </>
  );
}
