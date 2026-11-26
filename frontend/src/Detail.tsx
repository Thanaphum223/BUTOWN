import { useLiveQuery } from "./useLiveQuery";
import { useLocalizedFormErrors } from "./i18n/useLocalizedFormErrors";
import { useI18n } from "./i18n/useI18n";
import { govTokens } from "./govTheme";
import AttachmentList from "./AttachmentList";
import AssignmentPicker from "./AssignmentPicker";
import ResourceReview from "./ResourceReview";
import CitizenOutcome from "./CitizenOutcome";
import { DeleteOutlined, PlusOutlined } from "./icons";
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
  Form,
  Input,
  InputNumber,
  List,
  Modal,
  Radio,
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
import { ArrowLeftOutlined, UploadOutlined, EnvironmentOutlined } from "./icons";
import { api, actionNames, date, requiredReasonActions, progressLabel } from "./api";
import LocationMap from "./LocationMap";
import { useGeo } from "./GeoContext";
import { ATTACHMENT_HELP, STAFF_ATTACHMENT_HELP, attachmentError } from "./attachments";
import SlaPanel from "./SlaPanel";
import RetentionNotice from "./RetentionNotice";
import { amount, composeReason } from "./format";
import ComplaintChat from "./ComplaintChat";
import {
  APPROVAL_LIMIT,
  SPECIFIC_METHOD_LIMIT,
  govTitleWithLimit,
  limitedApprover,
  withTitle,
} from "./govRoles";
import StockUsage from "./StockUsage";
import { StockReturns, StockTaken, stockOptions } from "./StockFields";
type D = Record<string, any>;
const { Title, Text, Paragraph } = Typography;
const denialPresets = [
  {
    topic: "เกินวงเงินซ่อมบำรุงปกติ",
    reason:
      "เกินวงเงินซ่อมบำรุงปกติ เห็นควรยุติใบงานเฉพาะกิจนี้เพื่อบรรจุเข้าแผนพัฒนาท้องถิ่น/ตั้งงบประมาณประจำปี",
  },
  {
    topic: "นอกอำนาจงบประมาณของเทศบาล",
    reason:
      "อยู่นอกเหนืออำนาจงบประมาณของเทศบาล ให้ยุติใบงานและทำหนังสือประสานหน่วยงานเจ้าของพื้นที่ (กฟภ./กปภ./กรมทางหลวง)",
  },
  {
    topic: "ไม่คุ้มค่าทางวิศวกรรม",
    reason:
      "ไม่คุ้มค่าทางวิศวกรรม ให้ยุติการใช้งบประมาณพิเศษและให้กองช่างซ่อมแซมบรรเทาความเดือดร้อนชั่วคราวตามวัสดุคงคลัง",
  },
];
const reasonPresets: Record<string, string[]> = {
  APPROVE: [
    "เอกสารและหลักฐานประกอบครบถ้วน",
    "ราคาสมเหตุสมผลเทียบราคากลาง",
    "อยู่ในวงเงินงบประมาณที่ได้รับจัดสรร",
    "จำเป็นเร่งด่วนต่อความปลอดภัยของประชาชน",
    "ใช้วัสดุจากคลังของเทศบาลได้",
    "เป็นไปตามระเบียบพัสดุฯ พ.ศ. 2560",
    "อยู่ในอำนาจอนุมัติตามวงเงินที่กำหนด",
  ],
  REJECT: [
    "อยู่นอกเขตความรับผิดชอบของเทศบาล",
    "ข้อมูลหรือหลักฐานไม่เพียงพอต่อการตรวจสอบ",
    "เป็นเรื่องซ้ำกับคำร้องที่กำลังดำเนินการอยู่",
    "ไม่อยู่ในอำนาจหน้าที่ของเทศบาล",
  ],
  DECLINE: [
    "ติดภารกิจเร่งด่วนในพื้นที่อื่น",
    "อุปกรณ์หรือเครื่องจักรไม่พร้อมใช้งาน",
    "งานเกินขีดความสามารถของทีม",
  ],
  RETURN_FIELD: [
    "ภาพหลังทำไม่ชัดเจนหรือไม่เห็นจุดที่ซ่อม",
    "งานซ่อมยังไม่เรียบร้อยตามมาตรฐาน",
    "สรุปผลการปฏิบัติงานไม่ครบถ้วน",
  ],
  RETURN_LEADER: [
    "ภาพถ่ายไม่ชัดเจนสำหรับแจ้งประชาชน",
    "มีข้อมูลส่วนบุคคลติดในภาพที่ต้องตรวจสอบ",
    "รายละเอียดสรุปผลไม่ครบถ้วน",
  ],
  RETURN_RESOURCE: [
    "เอกสารแนบไม่ครบถ้วนหรือไม่ชัดเจน",
    "รายการหรือราคาประมาณการไม่สอดคล้องกัน",
    "ข้อมูลความจำเป็นไม่เพียงพอ",
  ],
  CLOSE: [
    "ตรวจสอบผลการซ่อมแซมเรียบร้อยตามมาตรฐาน",
    "แจ้งผลการดำเนินการและหลักฐานให้ประชาชนทราบแล้ว",
  ],
};
const secondaryActions = [
  "REJECT",
  "DENY",
  "DECLINE",
  "RETURN_RESOURCE",
  "RETURN_FIELD",
  "RETURN_LEADER",
  "WITHDRAW_RESOURCE_REQUEST",
  "WITHDRAW_PROPOSAL",
  "WITHDRAW_APPROVAL",
  "UNDO_START",
];
// Items the field worker asked for on the current request; leaders price exactly these.
const fieldRequestedItems = (data?: D): D[] =>
  JSON.parse(
    (data?.resources || []).filter((r: D) => r.status !== "WITHDRAWN").at(-1)?.requested_items ||
      "[]",
  );
const activeWorkOrder = (data?: D) =>
  (data?.workOrders || [])
    .filter((w: D) => !w.handed_off && !["DECLINED", "CANCELLED", "COMPLETE"].includes(w.status))
    .at(-1);
// Site photos for the current job: just taken before START, or already stamped by START.
const startPhotosOf = (data: D | undefined, userId: string) => {
  const work = activeWorkOrder(data);
  return (data?.files || []).filter(
    (f: D) =>
      f.evidence_stage === "BEFORE" &&
      !f.report_id &&
      !f.resource_id &&
      ((work && f.work_order_id === work.id) || (!f.work_order_id && f.uploaded_by === userId)),
  );
};
// Leaders compare where work started with the reported point; GPS is recorded, never required.
const FAR_FROM_REPORT_M = 300;
function StartDistance({ work }: { work?: D }) {
  const { t } = useI18n();
  if (!work || !["IN_PROGRESS", "COMPLETE"].includes(work.status)) return null;
  if (work.start_distance_m == null)
    return (
      <Tag color="default" className="start-distance">
        {work.start_latitude == null
          ? t("ไม่มีพิกัดตอนเริ่มงาน")
          : t("จุดแจ้งไม่มีพิกัดให้เทียบระยะ")}
      </Tag>
    );
  const meters = Math.round(Number(work.start_distance_m));
  const far = meters > FAR_FROM_REPORT_M;
  return (
    <Tag color={far ? "warning" : "success"} className="start-distance">
      {far
        ? t("เริ่มงานห่างจากจุดแจ้ง {{meters}} ม.", { meters: meters.toLocaleString() })
        : t("เริ่มงานใกล้จุดแจ้ง ({{meters}} ม.)", { meters: meters.toLocaleString() })}
    </Tag>
  );
}
const terminationNotice =
  "คำร้องนี้สิ้นสุดใน TownTrack การเข้าแผนงบประมาณหรือทำหนังสือประสานหน่วยงานภายนอกเป็นแนวทางที่ผู้รับผิดชอบต้องดำเนินการต่อเอง ปุ่มนี้ไม่สร้างแผนงบประมาณหรือส่งงานภายนอกอัตโนมัติ";
const terminalSubtitle =
  "ยุติใบงานซ่อมด่วนตามผลพิจารณางบประมาณ (ดูเหตุผลและแนวทางดำเนินการต่อในรายละเอียด)";
export default function Detail({
  id,
  user,
  back,
  embedded = false,
  historyOnly = false,
  publicView = false,
  onChanged,
}: {
  id: string;
  user: D;
  back: () => void;
  embedded?: boolean;
  historyOnly?: boolean;
  publicView?: boolean;
  onChanged?: () => void;
}) {
  const { t, language } = useI18n();
  const actionButton = (key: string) =>
    t(
      (
        {
          ACCEPT: "กดรับงานและลงพื้นที่สำรวจ",
          DECLINE: "กดปฏิเสธงาน",
          REQUEST_RESOURCE: "ส่งเอกสารประเมินทรัพยากร/ของบจากหน้างาน",
          START:
            data?.complaint?.status === "READY"
              ? "เริ่มปฏิบัติงานซ่อมแซม (ใช้ทรัพยากรที่ได้รับอนุมัติ)"
              : "เริ่มปฏิบัติงานซ่อมแซม (ใช้วัสดุ/อุปกรณ์ปกติ)",
          APPROVE: "อนุมัติ",
          DENY: "ไม่อนุมัติงบประมาณเฉพาะกิจ (ยุติใบงานซ่อมด่วนเพื่อนำเข้าแผนฯ / ประสานหน่วยงานภายนอก)",
          SEND_APPROVAL: "เอกสารครบถ้วนตามระเบียบสารบรรณ - ส่งต่อผู้มีอำนาจ",
          RETURN_LEADER: "ส่งกลับให้แก้ไข",
        } as Record<string, string>
      )[key] ||
        actionNames[key] ||
        key,
    );
  const [action, setAction] = useState(""),
    [denialTopic, setDenialTopic] = useState<string>(),
    [reasonPicked, setReasonPicked] = useState<string[]>([]),
    [approverFallback, setApproverFallback] = useState(false),
    [stockItems, setStockItems] = useState<D[]>([]),
    [heldStock, setHeldStock] = useState<D[]>([]),
    [teams, setTeams] = useState<D[]>([]),
    [people, setPeople] = useState<D[]>([]),
    [busy, setBusy] = useState(false);
  const [transferDepartments, setTransferDepartments] = useState<D[]>([]);
  const [publishSource, setPublishSource] = useState<D>();
  const [publishFile, setPublishFile] = useState<File>();
  const [confirmedClean, setConfirmedClean] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const draftKey = `${user.id}:${id}`;
  const [draft, setDraft] = useState<FieldDraft>({ values: {}, files: [] });
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    setDenialTopic(undefined);
    setReasonPicked([]);
  }, [action]);
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
  useLocalizedFormErrors(form);
  const resourceItems = Form.useWatch("lineItems", form) as D[] | undefined;
  const requestItems = Form.useWatch("items", form) as D[] | undefined;
  const stockLeft = (stockId?: string) => {
    const item = stockId ? stockItems.find((s) => s.id === stockId) : undefined;
    return item ? Math.max(0, Number(item.available ?? item.on_hand)) : undefined;
  };
  const chosenApprovers = Form.useWatch("approverIds", form) as string[] | undefined;
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
  const refreshConfirmation = useRef<(() => void) | undefined>(undefined);
  useEffect(() => {
    refreshConfirmation.current?.();
  }, [language]);
  const [evidenceStage, setEvidenceStage] = useState("BEFORE");
  const geo = useGeo();
  // undefined: locating, null: unavailable.
  const [startPoint, setStartPoint] = useState<[number, number] | null>();
  const { message, modal } = App.useApp();
  const submitting = useRef(false);
  const {
    data,
    error,
    reload: load,
  } = useLiveQuery<D>(
    (publicView ? "/community/complaints/" : "/complaints/") +
      id +
      (!publicView && historyOnly ? "?historyOnly=true" : ""),
    0,
    `${user.id}:${user.role}`,
    !action && !busy && !uploadBusy && !publishing && !publishSource,
  );
  async function choose(a: string) {
    if (publicView || data?.readOnlyHistory) return;
    form.resetFields();
    operationKey.current = crypto.randomUUID();
    setPeople([]);
    setTeams([]);
    setAction(a);
    if (a === "REQUEST_RESOURCE") form.setFieldsValue({ items: [{ name: "", unit: "" }] });
    setHeldStock([]);
    if (["REQUEST_RESOURCE", "START", "REPORT"].includes(a)) {
      api<D>("/stock")
        .then((s) => setStockItems(s.items.filter((item: D) => item.active)))
        .catch(() => setStockItems([]));
    }
    if (a === "REPORT") {
      const work = activeWorkOrder(data);
      api<D[]>(`/stock/complaints/${id}`)
        .then((rows) => {
          const held = rows.filter((r) => r.work_order_id === work?.id && Number(r.used) > 0);
          setHeldStock(held);
          if (!form.getFieldValue("stockReturns"))
            form.setFieldsValue({
              stockReturns: held.map((r) => ({
                stockItemId: r.stock_item_id,
                quantity: r.item_type === "EQUIPMENT" ? Number(r.used) : 0,
              })),
            });
        })
        .catch(() => setHeldStock([]));
    }
    if (a === "START") {
      setStartPoint(undefined);
      void geo.request().then((p) => setStartPoint(p ?? null));
    }
    if (["REQUEST_TRANSFER", "TRANSFER_DEPARTMENT"].includes(a)) {
      try {
        const catalog = await api<D>("/catalog");
        setTransferDepartments(
          catalog.departments.filter((d: D) => d.id !== data?.complaint.department_id),
        );
        const pending = data?.transfers?.find((t: D) => t.state === "PENDING");
        if (a === "TRANSFER_DEPARTMENT" && pending) {
          form.setFieldsValue({ targetDepartmentId: pending.target_department_id });
          setPeople(await api("/people?role=LEADER&departmentId=" + pending.target_department_id));
        }
      } catch (e) {
        message.error(t((e as Error).message));
      }
    }
    if (a === "PROPOSE") {
      const revisions = (data?.resources || []).flatMap((resource: D) =>
        JSON.parse(resource.revisions || "[]"),
      );
      const previous = revisions.at(-1);
      const requested = fieldRequestedItems(data);
      const prior: D[] = previous?.line_items || [];
      const reusePrior = prior.length === requested.length;
      form.setFieldsValue({
        proposal: previous?.proposal,
        durationDays: previous?.duration_days,
        lineItems: requested.length
          ? requested.map((item, index) => ({
              name: item.name,
              unit: item.unit,
              quantity: Number((reusePrior && prior[index].quantity) || item.quantity),
              amount:
                reusePrior && prior[index].amount != null ? Number(prior[index].amount) : null,
            }))
          : prior.length
            ? prior
            : [{ name: "", amount: null }],
      });
      try {
        const catalog = await api<D>("/catalog");
        setResourceDepartment(
          catalog.departments.find((d: D) => d.id === data?.complaint.department_id)?.name || "",
        );
      } catch {
        setResourceDepartment("");
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
        message.warning(t("เปิดร่างในอุปกรณ์ไม่ได้ กรุณาตรวจพื้นที่ว่าง"));
      }
    }
    if (a === "ASSIGN") {
      try {
        setTeams(await api("/teams"));
      } catch (e) {
        message.error(t((e as Error).message));
      }
    }
    const role = ["TRIAGE", "REASSIGN_LEADER"].includes(a)
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
        const found = await api<D[]>("/people?role=" + role + department);
        setPeople(found);
        if (a === "SEND_APPROVAL") {
          const stages = data?.approvalStages || 1;
          // Fill only the unbroken run from step 1 so nobody lands in another step's slot.
          const usual: string[] = [];
          for (let step = 1; step <= stages; step++) {
            const person = found.find((p) => p.usual_step === step);
            if (!person) break;
            usual.push(person.id);
          }
          const fallback = !usual.length && found.length >= stages;
          setApproverFallback(fallback);
          if (usual.length || fallback)
            form.setFieldsValue({
              approverIds: usual.length ? usual : found.slice(0, stages).map((p) => p.id),
            });
        }
      } catch (e) {
        message.error(t((e as Error).message));
      }
    }
  }
  async function saveFailedFile(file: File, stage: string) {
    try {
      const saved = (await readDraft(draftKey)) || { values: {}, files: [] };
      saved.files.push({ file, stage });
      await saveDraft(draftKey, saved);
      setDraft(saved);
      message.info(t("เก็บไฟล์ที่ส่งไม่สำเร็จเป็นร่างแล้ว กดส่งไฟล์อีกครั้งเมื่อเชื่อมต่อได้"));
    } catch {
      message.error(t("บันทึกไฟล์ร่างไม่ได้ กรุณาเก็บไฟล์ต้นฉบับไว้"));
    }
  }
  async function submit(input: D) {
    const v: D = reasonPresets[action]
      ? { ...input, reason: composeReason(reasonPicked, input.reason) }
      : { ...input };
    // Only lines with an item and a positive amount reach the stock register.
    for (const key of ["stockItems", "stockReturns"])
      if (v[key])
        v[key] = (v[key] as D[]).filter((line) => line?.stockItemId && Number(line.quantity) > 0);
    if (data?.readOnlyHistory) return;
    if (submitting.current) return;
    if (uploadBusy) {
      message.warning(t("กรุณารอให้อัปโหลดไฟล์เสร็จก่อน"));
      return;
    }
    const pendingFiles = (data?.files || []).filter(
      (f: D) => f.uploaded_by === user.id && !f.report_id && !f.resource_id && !f.work_order_id,
    );
    const startPhotos = startPhotosOf(data, user.id);
    if (action === "START" && !startPhotos.length) {
      message.error(t("กรุณาถ่ายรูปหน้างานก่อนเริ่มปฏิบัติงาน"));
      return;
    }
    if (
      action === "PROPOSE" &&
      (!pendingFiles.length ||
        pendingFiles.some(
          (f: D) =>
            !["application/pdf", "image/jpeg", "image/png"].includes(f.content_type) ||
            Number(f.size_bytes) > 15_000_000,
        ))
    ) {
      message.error(
        t("กรุณาแนบเอกสารคำขอ PDF หรือรูปภาพ PNG/JPEG ขนาดไม่เกิน 15 MB ต่อไฟล์ในแบบฟอร์มนี้"),
      );
      return;
    }
    if (
      action === "REPORT" &&
      (draft.files.length > 0 ||
        !(startPhotos.some((f: D) => f.work_order_id) ? ["AFTER"] : ["BEFORE", "AFTER"]).every(
          (stage) =>
            pendingFiles.some(
              (f: D) => f.evidence_stage === stage && f.content_type?.startsWith("image/"),
            ),
        ))
    ) {
      message.error(t("กรุณาส่งภาพก่อนทำและหลังทำให้ครบ และส่งไฟล์ร่างที่ค้างก่อนยืนยันรายงาน"));
      return;
    }
    submitting.current = true;
    setBusy(true);
    try {
      if (["REJECT", "CLOSE", "APPROVE", "DENY"].includes(action)) {
        const confirmed = await new Promise<boolean>((resolve) => {
          const copy = () => ({
            title: t("ตรวจสอบก่อนยืนยัน"),
            content: (
              <div>
                <p>
                  {t("เลขเรื่อง #")} {id.slice(0, 8).toUpperCase()} · {t("ฉบับที่")}{" "}
                  {data!.complaint.version}
                </p>
                <p>{actionButton(action)}</p>
                <p>
                  {t("เหตุผล:")} {v.reason}
                </p>
                {action === "DENY" && (
                  <Alert type="warning" showIcon message={t(terminationNotice)} />
                )}
              </div>
            ),
            okText: t("ยืนยัน"),
            cancelText: t("กลับไปแก้ไข"),
          });
          const confirmation = modal.confirm({
            ...copy(),
            zIndex: 2000,
            maskClosable: false,
            onOk: () => resolve(true),
            onCancel: () => resolve(false),
          });
          refreshConfirmation.current = () => confirmation.update(copy());
        });
        refreshConfirmation.current = undefined;
        if (!confirmed) return;
      }
      await api("/complaints/" + id + "/actions", {
        method: "POST",
        headers: { "Idempotency-Key": operationKey.current },
        body: JSON.stringify({
          ...v,
          ...(action === "PROPOSE" ? { amount: resourceTotal } : {}),
          ...(action === "START" && startPoint
            ? { latitude: startPoint[0], longitude: startPoint[1] }
            : {}),
          action,
          version: data!.complaint.version,
        }),
      });
      if (action === "REPORT") {
        await removeDraft(draftKey);
        setDraft({ values: {}, files: [] });
      }
      message.success(t("บันทึกแล้ว"));
      setAction("");
      if (action === "DECLINE" || action === "RETURN_ASSIGNMENT") {
        back();
        return;
      }
      await load();
      onChanged?.();
    } catch (e) {
      message.error(t((e as Error).message));
      await load();
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  if (error && !data)
    return (
      <>
        <Button onClick={back}>{t("กลับรายการ")}</Button>
        <Alert type="error" showIcon message={t(error)} />
      </>
    );
  if (!data) return <Spin />;
  const pendingEvidence = (data.files || []).filter(
    (f: D) => f.uploaded_by === user.id && !f.report_id && !f.resource_id && !f.work_order_id,
  );
  const startPhotos = startPhotosOf(data, user.id);
  const startedWithPhoto = startPhotos.some((f: D) => f.work_order_id);
  const proposalItemsFixed = fieldRequestedItems(data).length > 0;
  // Reporter and staff files have separate allowances, as on the server.
  const pendingBytes = (data.files || [])
    .filter((f: D) => user.role === "CITIZEN" || f.uploaded_by !== data.complaint.reporter_id)
    .reduce((total: number, f: D) => total + Number(f.size_bytes), 0);
  const evidenceList = (stage?: string) => (
    <List
      size="small"
      className="pending-evidence"
      locale={{ emptyText: t("ยังไม่ได้แนบไฟล์") }}
      dataSource={pendingEvidence.filter((f: D) =>
        stage
          ? f.evidence_stage === stage
          : ["application/pdf", "image/jpeg", "image/png"].includes(f.content_type),
      )}
      renderItem={(file: D) => (
        <List.Item>
          <a href={"/api/files/" + file.id} target="_blank" rel="noreferrer">
            {file.original_name}
          </a>
          <Tag color="green">{t("แนบแล้ว")}</Tag>
        </List.Item>
      )}
    />
  );
  const c = data.complaint;
  // Citizens see their own files in the gallery, so only list files it does not show.
  const citizenExtraFiles = (data.files || []).filter(
    (f: D) => !(data.media || []).some((m: D) => m.id === f.id),
  );
  const returnReasons = Array.from(
    new Set<string>(
      [
        ...(data.workOrders || []).map((w: D) => w.reason),
        ...(data.history || [])
          .filter((h: D) => ["DECLINE", "RETURN_ASSIGNMENT"].includes(h.action))
          .map((h: D) => h.reason),
      ].filter(
        (reason: unknown): reason is string => typeof reason === "string" && !!reason.trim(),
      ),
    ),
  );
  const citizen = user.role === "CITIZEN";
  const latestResource = data.resources?.at(-1);
  const requestedAmount = Number(JSON.parse(latestResource?.revisions || "[]").at(-1)?.amount || 0);
  const finalApprover = people.find(
    (p) => p.id === chosenApprovers?.[(data.approvalStages || 1) - 1],
  );
  const overLimit =
    action === "SEND_APPROVAL" &&
    requestedAmount > APPROVAL_LIMIT &&
    limitedApprover(finalApprover?.gov_role);
  const uploadAllowed =
    !publicView &&
    !data.readOnlyHistory &&
    ((citizen && c.status === "NEW") ||
      (user.role === "FIELD" && ["IN_PROGRESS", "FIELD_REVISION"].includes(c.status)) ||
      (user.role === "LEADER" && ["RESOURCE_DRAFT", "RESOURCE_REVISION"].includes(c.status)));
  const stageStatuses = [
    ["NEW"],
    ["TRIAGED", "DEPARTMENT_RETURNED"],
    [
      "ASSIGNED",
      "ACCEPTED",
      "RESOURCE_DRAFT",
      "RESOURCE_CHECK",
      "RESOURCE_REVISION",
      "RESOURCE_APPROVAL",
      "READY",
    ],
    ["IN_PROGRESS"],
    [
      "RESOLVED",
      "OFFICER_REVIEW",
      "LEADER_REVISION",
      "LEADER_REVIEW",
      "FIELD_REVISION",
      "TRANSFER_PENDING",
    ],
    ["CLOSED", "REJECTED", "TERMINATED"],
  ];
  const current = Math.max(
    0,
    stageStatuses.findIndex((statuses) => statuses.includes(c.status)),
  );
  const endedWithoutCompletion = ["REJECTED", "TERMINATED"].includes(c.status);
  const visitedStatuses = new Set(
    (data.history || []).flatMap((h: D) => [h.from_status, h.to_status]),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={back}>
            {embedded ? t("กลับคิวงาน") : t("กลับรายการ")}
          </Button>
          <Title level={embedded ? 3 : 2}>{c.title || c.category_name}</Title>
          <Space wrap>
            <Text type="secondary">#{id.slice(0, 8).toUpperCase()}</Text>
            {publicView && c.mock && <Tag>{t("MOCK · ข้อมูลจำลอง")}</Tag>}
            <Tag color={["REJECTED", "TERMINATED"].includes(c.status) ? "red" : "cyan"}>
              {progressLabel(c)}
            </Tag>
          </Space>
        </div>
      </div>
      {error && !action && (
        <Alert
          type="warning"
          showIcon
          message={t("ข้อมูลล่าสุดยังอัปเดตไม่ได้ ระบบจะลองใหม่อัตโนมัติ")}
          description={t(error)}
        />
      )}
      {!publicView && data.actions?.some((item: D) => item.action === "REASSIGN_LEADER") && (
        <Alert
          className="operational-guidance"
          type="warning"
          showIcon
          message={t(
            "หัวหน้าที่รับผิดชอบเดิมไม่สามารถรับงานต่อได้ กรุณาเลือกหัวหน้าหน่วยงานใหม่ก่อนจัดทีม",
          )}
        />
      )}
      {c.status === "TERMINATED" && (
        <Alert
          className="operational-guidance"
          type="warning"
          showIcon
          message={t(terminalSubtitle)}
        />
      )}
      {!citizen &&
        ["RESOURCE_DRAFT", "RESOURCE_CHECK", "RESOURCE_APPROVAL", "RESOURCE_REVISION"].includes(
          c.status,
        ) &&
        latestResource?.status !== "APPROVED" && (
          <Alert
            className="operational-guidance"
            type="warning"
            showIcon
            message={t("ระงับการใช้ทรัพยากรที่ขอชั่วคราว (รอผลการพิจารณาอนุมัติ)")}
          />
        )}
      {user.role === "LEADER" && (
        <Card className="assignment-summary" title={t("การมอบหมาย")}>
          <Descriptions
            column={1}
            items={[
              {
                key: "urgency",
                label: t("ความเร่งด่วน"),
                children: t(
                  ({ NORMAL: "ปกติ", PRIORITY: "เร่งด่วน" } as D)[
                    (typeof c.assignment_details === "string"
                      ? JSON.parse(c.assignment_details || "{}")
                      : c.assignment_details
                    )?.urgency
                  ] || "ไม่ระบุ",
                ),
              },
            ]}
          />
          {c.latitude != null && c.longitude != null && (
            <LocationMap value={[Number(c.latitude), Number(c.longitude)]} />
          )}
        </Card>
      )}
      {!citizen && c.status === "RESOURCE_APPROVAL" && latestResource?.status === "PENDING" && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 20 }}
          message={
            t("รออนุมัติโดย ") +
            (withTitle(latestResource.approver_name, latestResource.approver_gov_role, t) ||
              t("ผู้อนุมัติที่ได้รับมอบหมาย"))
          }
          description={
            latestResource.approver_id === user.id
              ? user.role === "ADMIN"
                ? t("งานนี้ส่งถึงบัญชีของคุณ สลับเป็นบทบาทผู้อนุมัติเพื่อพิจารณา")
                : t("งานนี้ส่งถึงบัญชีของคุณ")
              : t("ผู้รับที่ระบุจะเห็นงานนี้ในคิวผู้อนุมัติของตน")
          }
        />
      )}
      {embedded && (
        <section className="split-case-summary">
          <div className="split-case-facts">
            <span>
              <EnvironmentOutlined /> {c.address || t("ไม่ระบุสถานที่")}
            </span>
          </div>
          <h3>{t("รายละเอียด")}</h3>
          <Paragraph style={{ whiteSpace: "pre-wrap" }}>{c.description}</Paragraph>
          <h3>{t("หลักฐานประกอบ")}</h3>
          <EvidenceGallery
            media={(data.files || []).filter(
              (f: D) =>
                f.content_type?.startsWith("image/") || f.content_type?.startsWith("video/"),
            )}
          />
        </section>
      )}
      <section className="workflow-section" aria-label={t("ขั้นตอนการดำเนินงาน")}>
        <h3>{t("ขั้นตอนการดำเนินงาน")}</h3>
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
            responsive={false}
            items={[
              t("รับคำร้อง"),
              t("จัดหน่วยงาน"),
              t("มอบหมายทีม"),
              t("ลงพื้นที่"),
              t("ตรวจผลงาน"),
              t("ปิดเรื่อง"),
            ].map((title, index) => {
              if (!endedWithoutCompletion || index === 5) return { title };
              const visited =
                index === 0 || stageStatuses[index].some((status) => visitedStatuses.has(status));
              return {
                title,
                status: visited ? ("finish" as const) : ("wait" as const),
                description: visited ? undefined : t("ไม่ได้ดำเนินการ"),
              };
            })}
          />
        </Card>
      </section>
      {citizen && <CitizenOutcome status={c.status} history={data.history || []} />}
      {data.readOnlyHistory && (
        <Alert
          type="info"
          showIcon
          message={
            data.limitedHistory
              ? t("ประวัติการทำงานของคุณ แสดงเฉพาะข้อมูลที่เคยดำเนินการและไม่สามารถแก้ไขได้")
              : t("ประวัติงาน เปิดดูข้อมูลได้ ไม่สามารถดำเนินการจากหน้านี้")
          }
        />
      )}
      {data.readOnlyHistory && returnReasons.length > 0 && (
        <Card title={<Title level={5}>{t("เหตุผลส่งคืนงาน")}</Title>}>
          <List
            dataSource={returnReasons}
            renderItem={(reason) => <List.Item>{reason}</List.Item>}
          />
        </Card>
      )}
      {!citizen && !data.limitedHistory && (
        <details
          className="split-section"
          open={
            ["RESOURCE_DRAFT", "RESOURCE_CHECK", "RESOURCE_REVISION", "RESOURCE_APPROVAL"].includes(
              c.status,
            ) || undefined
          }
        >
          <summary>
            {t("คำขอทรัพยากรและเอกสารประกอบ (")}
            {data.resources?.length || 0})
          </summary>
          <ResourceReview resources={data.resources} files={data.files} />
        </details>
      )}
      {!citizen && data.transfers?.length > 0 && (
        <Card title={t("การส่งต่อหน่วยงาน")}>
          <List
            dataSource={data.transfers}
            renderItem={(transfer: D) => (
              <List.Item>
                <div>
                  <Text strong>
                    {transfer.source_department_name} → {transfer.target_department_name}
                  </Text>
                  <Paragraph>{transfer.reason}</Paragraph>
                  <Text type="secondary">
                    {transfer.state === "PENDING"
                      ? t("รอเจ้าหน้าที่ส่งต่อ")
                      : transfer.state === "ACCEPTED"
                        ? t("ส่งต่อแล้ว")
                        : t("ส่งกลับแก้ไข")}{" "}
                    · {date(transfer.created_at)}
                  </Text>
                  {transfer.review_reason && <Paragraph>{transfer.review_reason}</Paragraph>}
                </div>
              </List.Item>
            )}
          />
        </Card>
      )}
      {!citizen &&
        data.reports?.length > 0 &&
        [
          "LEADER_REVIEW",
          "OFFICER_REVIEW",
          "LEADER_REVISION",
          "RESOLVED",
          "TRANSFER_PENDING",
        ].includes(c.status) && (
          <Card className="report-review-card" title={t("รายงานล่าสุดและหลักฐานประกอบ")}>
            <StartDistance
              work={(data.workOrders || []).find(
                (w: D) => w.id === data.reports.at(-1).work_order_id,
              )}
            />
            <Paragraph>{data.reports.at(-1).content}</Paragraph>
            <EvidenceGallery
              paired
              media={(data.files || []).filter(
                (file: D) =>
                  (file.report_id === data.reports.at(-1).id ||
                    (file.work_order_id &&
                      file.work_order_id === data.reports.at(-1).work_order_id)) &&
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
              emptyText={t("ไม่มีเอกสาร PDF เพิ่มเติมในรายงานนี้")}
            />
          </Card>
        )}
      {!publicView && <SlaPanel id={id} version={c.version} onChanged={load} />}
      {!publicView && !data.readOnlyHistory && (
        <RetentionNotice
          id={id}
          retention={data.retention}
          admin={user.account_role === "ADMIN" || user.role === "ADMIN"}
          onDeleted={() => {
            onChanged?.();
            back();
          }}
        />
      )}
      {!publicView && !data.limitedHistory && (
        <ComplaintChat
          id={id}
          user={user}
          readOnly={
            !!data.readOnlyHistory || ["CLOSED", "REJECTED", "TERMINATED"].includes(c.status)
          }
        />
      )}
      <details
        className={embedded ? "split-section split-extra-info" : "split-full-info"}
        open={embedded ? undefined : true}
      >
        <summary>{t("ข้อมูลคำร้อง เอกสาร และรายงานทั้งหมด")}</summary>
        <Row gutter={[20, 20]}>
          <Col xs={24} xl={embedded || citizen ? 24 : 16}>
            {user.role !== "CITIZEN" && c.assignment_details && (
              <Card title={t("คำแนะนำและความปลอดภัยก่อนรับงาน")} style={{ marginBottom: 16 }}>
                <Descriptions
                  column={1}
                  items={Object.entries(
                    typeof c.assignment_details === "string"
                      ? JSON.parse(c.assignment_details)
                      : c.assignment_details,
                  )
                    .filter(([key]) => key !== "appointment")
                    .map(([key, value]) => ({
                      key,
                      label:
                        (
                          {
                            operationMethod: t("วิธีดำเนินงาน"),
                            urgency: t("ความเร่งด่วน"),
                            workScope: t("ขอบเขตงาน"),
                            precautions: t("ข้อควรระวัง"),
                            coordinator: t("ช่องทางประสานงาน"),
                          } as D
                        )[key] || key,
                      children:
                        key === "urgency"
                          ? ({ NORMAL: t("ปกติ"), PRIORITY: t("เร่งด่วน") } as D)[String(value)] ||
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
                    {t("เปิดเส้นทางไปจุดเกิดเหตุ")}
                  </a>
                )}
              </Card>
            )}
            <Card title={t("รายละเอียดคำร้อง")}>
              <Descriptions
                column={1}
                items={[
                  ...(publicView
                    ? []
                    : [
                        {
                          key: "description",
                          label: t("ปัญหาที่แจ้ง"),
                          children: (
                            <Paragraph style={{ whiteSpace: "pre-wrap" }}>
                              {c.description}
                            </Paragraph>
                          ),
                        },
                      ]),
                  ...(!citizen
                    ? [
                        {
                          key: "contact_name",
                          label: t("ชื่อผู้ติดต่อ"),
                          children: c.contact_name || t("ไม่ระบุ"),
                        },
                        {
                          key: "contact_phone",
                          label: t("เบอร์ติดต่อ"),
                          children: c.contact_phone || t("ไม่ระบุ"),
                        },
                        {
                          key: "contact_email",
                          label: t("อีเมลติดต่อ"),
                          children: c.contact_email || t("ไม่ระบุ"),
                        },
                      ]
                    : []),
                  {
                    key: "address",
                    label: t("สถานที่"),
                    children: publicView ? t("ตำแหน่งโดยประมาณบนแผนที่") : c.address,
                  },
                  {
                    key: "created",
                    label: t("วันที่แจ้ง"),
                    children: date(c.created_at),
                  },
                ]}
              />
              {user.role !== "LEADER" && c.latitude != null && (
                <LocationMap value={[Number(c.latitude), Number(c.longitude)]} />
              )}{" "}
              {c.answers && Object.keys(JSON.parse(c.answers)).length > 0 && (
                <Descriptions
                  column={1}
                  title={t("ข้อมูลเพิ่มเติม")}
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
            {!citizen && !publicView && <StockUsage id={id} version={c.version} />}
            {!citizen && (
              <Card style={{ marginTop: 20 }}>
                <Tabs
                  items={[
                    {
                      key: "reports",
                      label: t("รายงานผล (") + (data.reports?.length || 0) + ")",
                      children: (
                        <List
                          dataSource={data.reports}
                          locale={{ emptyText: t("ยังไม่มีรายงาน") }}
                          renderItem={(r: D) => (
                            <List.Item>
                              <div>
                                <Text strong>
                                  {t("ฉบับที่")} {r.revision}
                                </Text>
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
                      label: t("คำขอทรัพยากร"),
                      children: (
                        <>
                          {(() => {
                            const withdrawals = (data.history || []).filter(
                              (h: D) => h.action === "WITHDRAW_RESOURCE_REQUEST",
                            );
                            return (
                              withdrawals.length > 0 && (
                                <div className="resource-withdrawals">
                                  <Text type="secondary">
                                    {t("ยกเลิกคำขอ {{count}} ครั้ง", {
                                      count: withdrawals.length,
                                    })}
                                  </Text>
                                  <ul>
                                    {withdrawals.map((h: D) => (
                                      <li key={h.id || h.created_at}>
                                        {t("ยกเลิกเมื่อ")} {date(h.created_at)}
                                        {h.actor_name && ` • ${h.actor_name}`}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )
                            );
                          })()}
                          <List
                            dataSource={(data.resources || []).filter(
                              (r: D) => r.status !== "WITHDRAWN",
                            )}
                            locale={{ emptyText: t("ยังไม่มีคำขอทรัพยากร") }}
                            renderItem={(r: D) => (
                              <List.Item>
                                <div>
                                  <Tag color={r.status === "WITHDRAWN" ? "red" : undefined}>
                                    {(
                                      {
                                        WITHDRAWN: t("ยกเลิกแล้ว"),
                                        DRAFT: t("ร่างข้อเสนอ"),
                                        CHECK: t("รอตรวจเอกสาร"),
                                        REVISION: t("แก้ไขข้อเสนอ"),
                                        PENDING: t("รออนุมัติ"),
                                        APPROVED: t("อนุมัติแล้ว"),
                                        DENIED: t("ไม่อนุมัติ"),
                                      } as Record<string, string>
                                    )[r.status] || r.status}
                                  </Tag>
                                  {JSON.parse(r.revisions).map((v: D) => (
                                    <div key={v.id} className="revision">
                                      <Text strong>
                                        {t("ฉบับที่")} {v.revision} •{" "}
                                        {Number(v.amount).toLocaleString(
                                          language === "en" ? "en-GB" : "th-TH",
                                        )}
                                        {t("บาท •")} {v.duration_days}
                                        {t("วัน")}
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
                                              <span>
                                                {item.name}
                                                {item.quantity != null &&
                                                  ` ${Number(item.quantity).toLocaleString()} ${item.unit}`}
                                              </span>
                                              <Text>
                                                {Number(item.amount).toLocaleString(
                                                  language === "en" ? "en-GB" : "th-TH",
                                                  {
                                                    minimumFractionDigits: 2,
                                                    maximumFractionDigits: 2,
                                                  },
                                                )}{" "}
                                                {t("บาท")}
                                              </Text>
                                            </List.Item>
                                          )}
                                        />
                                      )}
                                      <AttachmentList
                                        files={(data.files || []).filter(
                                          (file: D) => file.resource_revision_id === v.id,
                                        )}
                                        emptyText={t("ไม่มีเอกสารที่ระบุฉบับนี้")}
                                      />
                                    </div>
                                  ))}
                                </div>
                              </List.Item>
                            )}
                          />
                          <List
                            header={t("ลำดับการอนุมัติ")}
                            dataSource={data.approvals}
                            renderItem={(r: D) => (
                              <List.Item>
                                <Space wrap>
                                  <Text>
                                    {r.step}. {withTitle(r.approver_name, r.approver_gov_role, t)}
                                  </Text>
                                  <Tag>
                                    {r.decision
                                      ? t(actionNames[r.decision] || r.decision)
                                      : t("รอพิจารณา")}
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
                      label: t("การมอบหมาย"),
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
                                      ASSIGNED: t("รอรับงาน"),
                                      ACCEPTED: t("รับงานแล้ว"),
                                      IN_PROGRESS: t("กำลังดำเนินการ"),
                                      DECLINED: t("ปฏิเสธงาน"),
                                      CANCELLED: t("ยกเลิกงาน"),
                                      COMPLETE: t("เสร็จสิ้น"),
                                    } as Record<string, string>
                                  )[r.status] || r.status}{" "}
                                  {r.reason && "• " + r.reason}
                                </Text>
                                <StartDistance work={r} />
                                <Text type="secondary">{date(r.created_at)}</Text>
                              </Space>
                            </List.Item>
                          )}
                        />
                      ),
                    },
                    {
                      key: "reviews",
                      label: t("ผลการตรวจ"),
                      children: (
                        <List
                          dataSource={data.reviews}
                          renderItem={(r: D) => (
                            <List.Item>
                              <div>
                                <Text strong>
                                  {t(actionNames[r.decision] || r.decision)} • {r.actor_name}
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
              title={t("ไฟล์หลักฐาน")}
              style={{ marginTop: 20 }}
              extra={
                uploadAllowed ? (
                  <Space wrap>
                    {user.role === "FIELD" && (
                      <Select
                        aria-label={t("ชนิดหลักฐาน")}
                        value={evidenceStage}
                        disabled={uploadBusy}
                        onChange={setEvidenceStage}
                        options={[
                          { value: "BEFORE", label: t("ภาพก่อนทำ") },
                          { value: "AFTER", label: t("ภาพหลังทำ") },
                          { value: "GENERAL", label: t("วิดีโอ / เอกสารประกอบ") },
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
              {uploadAllowed && (
                <Text type="secondary">{t(citizen ? ATTACHMENT_HELP : STAFF_ATTACHMENT_HELP)}</Text>
              )}
              {(citizen ||
                (data.files || []).some(
                  (f: D) =>
                    f.content_type?.startsWith("image/") || f.content_type?.startsWith("video/"),
                )) && (
                <EvidenceGallery
                  paired={citizen}
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
              {(!citizen || citizenExtraFiles.length > 0) && (
                <AttachmentList
                  files={citizen ? citizenExtraFiles : data.files}
                  extraActions={(f: D) =>
                    !data.readOnlyHistory &&
                    ["OFFICER", "ADMIN"].includes(user.role) &&
                    (f.content_type?.startsWith("image/") ||
                      f.content_type?.startsWith("video/")) ? (
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
                              message.error(t((e as Error).message));
                            }
                          }}
                        >
                          {f.public_approved ? t("หยุดเผยแพร่") : t("ไม่เผยแพร่แล้ว")}
                        </Button>
                      ) : (
                        <Button
                          onClick={() => {
                            setPublishSource(f);
                            setPublishFile(undefined);
                            setConfirmedClean(false);
                          }}
                        >
                          {t("เผยแพร่สำเนา")}
                        </Button>
                      )
                    ) : null
                  }
                />
              )}
            </Card>
          </Col>
          <Col xs={24} xl={embedded ? 24 : 8}>
            {!publicView && !data.readOnlyHistory && !embedded && data.actions?.length > 0 && (
              <Card title={t("ดำเนินการ")} style={{ marginBottom: 20 }}>
                <Space direction="vertical" style={{ width: "100%" }}>
                  {data.actions.map((r: D) => (
                    <Button
                      block
                      key={r.action}
                      disabled={!!error}
                      type={secondaryActions.includes(r.action) ? "default" : "primary"}
                      danger={["REJECT", "DENY", "DECLINE"].includes(r.action)}
                      onClick={() => choose(r.action)}
                    >
                      {r.action === "DENY" ? t("ไม่อนุมัติ") : actionButton(r.action)}
                    </Button>
                  ))}
                </Space>
              </Card>
            )}
          </Col>
        </Row>
      </details>
      <details className="split-section" open={embedded ? undefined : true}>
        <summary>
          {t("ประวัติการดำเนินงาน (")}
          {data.history.length})
        </summary>
        <Card title={t("ประวัติการดำเนินการ")}>
          <Timeline
            items={data.history.map((h: D) => ({
              color: ["DENY", "REJECT"].includes(h.action) ? "red" : govTokens["brand-primary"],
              children: (
                <>
                  <Text strong>{t(actionNames[h.action] || h.action)}</Text>
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
      {!publicView && !data.readOnlyHistory && embedded && data.actions?.length > 0 && (
        <Card className="embedded-actions split-action-dock" title={t("ดำเนินการ")}>
          <Space wrap>
            {data.actions.map((r: D) => (
              <Button
                key={r.action}
                disabled={!!error}
                type={secondaryActions.includes(r.action) ? "default" : "primary"}
                danger={["REJECT", "DENY", "DECLINE"].includes(r.action)}
                onClick={() => choose(r.action)}
              >
                {r.action === "DENY" ? t("ไม่อนุมัติ") : actionButton(r.action)}
              </Button>
            ))}
          </Space>
        </Card>
      )}
      <Modal
        open={!data.readOnlyHistory && !!publishSource}
        title={t("เผยแพร่สำเนาหลักฐานในชุมชน")}
        onCancel={() => setPublishSource(undefined)}
        okText={t("ยืนยันเผยแพร่สำเนา")}
        confirmLoading={publishing}
        okButtonProps={{ disabled: !publishFile || !confirmedClean }}
        onOk={async () => {
          if (data.readOnlyHistory || !publishFile || !publishSource || !confirmedClean) return;
          setPublishing(true);
          try {
            const body = new FormData();
            body.append("sourceId", publishSource.id);
            body.append("confirmedClean", "true");
            body.append("file", publishFile);
            await api(`/complaints/${id}/shared-media`, { method: "POST", body });
            setPublishSource(undefined);
            await load();
            message.success(t("เผยแพร่สำเนาที่ตรวจแล้ว"));
          } catch (e) {
            message.error(t((e as Error).message));
          } finally {
            setPublishing(false);
          }
        }}
      >
        <Alert
          type="info"
          message={t(
            "อัปโหลดสำเนาที่ปกปิดใบหน้า ทะเบียนรถ และข้อมูลส่วนตัวแล้ว ไฟล์ต้นฉบับยังเป็นส่วนตัว",
          )}
          style={{ marginBottom: 16 }}
        />
        <p>
          {t("ต้นฉบับ:")} {publishSource?.original_name}
        </p>
        <Upload
          accept=".jpg,.jpeg,.png,.mp4,.mov,.webm"
          maxCount={1}
          fileList={publishFile ? [{ uid: "copy", name: publishFile.name, status: "done" }] : []}
          beforeUpload={(file) => {
            const error = attachmentError(file, 0);
            if (error) {
              message.error(t(error));
              return Upload.LIST_IGNORE;
            }
            setPublishFile(file);
            return false;
          }}
          onRemove={() => setPublishFile(undefined)}
        >
          <Button icon={<UploadOutlined />}>{t("เลือกสำเนาที่ปกปิดข้อมูลแล้ว")}</Button>
        </Upload>
        <Checkbox
          checked={confirmedClean}
          onChange={(e) => setConfirmedClean(e.target.checked)}
          style={{ marginTop: 16 }}
        >
          {t("ตรวจและปกปิดข้อมูลส่วนบุคคลแล้ว และอนุญาตให้แสดงสำเนานี้ในชุมชน")}
        </Checkbox>
      </Modal>
      <Modal
        open={!!action}
        className={"workflow-modal" + (action === "PROPOSE" ? " resource-modal" : "")}
        width={action === "PROPOSE" ? 760 : 520}
        maskClosable={false}
        closable={!busy && !uploadBusy}
        keyboard={!busy && !uploadBusy}
        title={actionButton(action)}
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
                message.warning(t("บันทึกร่างไม่ได้ กรุณาเก็บข้อมูลไว้ก่อนปิดหน้า"));
              }
          }}
        >
          {error && (
            <Alert
              type="warning"
              showIcon
              message={t("ข้อมูลล่าสุดยังอัปเดตไม่ได้ ระบบจะลองใหม่อัตโนมัติ")}
              description={t(error)}
              style={{ marginBottom: 16 }}
            />
          )}
          {action === "REPORT" && (
            <Alert
              style={{ marginBottom: 16 }}
              type={online ? "info" : "warning"}
              message={
                online
                  ? t("ตรวจข้อมูลร่างและยืนยันส่งด้วยตนเอง ระบบไม่ส่งอัตโนมัติ")
                  : t("ออฟไลน์: เก็บข้อมูลเป็นร่างในอุปกรณ์ ยังไม่ได้ส่งรายงาน")
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
                          message.error(t((e as Error).message));
                        } finally {
                          setUploadBusy(false);
                        }
                      }}
                    >
                      {t("ส่งไฟล์อีกครั้ง")}
                    </Button>,
                  ]}
                >
                  {pending.stage} · {pending.file.name}
                </List.Item>
              )}
            />
          )}

          {action === "DENY" && (
            <div className="denial-presets">
              <Alert
                type="warning"
                showIcon
                message={t(
                  "เหตุผลตัวอย่าง: โปรดตรวจทานข้อเท็จจริง อำนาจหน้าที่ และแนวทางต่อก่อนยืนยัน ข้อความนี้ไม่ใช่ข้อกฎหมายที่ใช้ได้ทุกกรณี",
                )}
              />
              <Radio.Group
                aria-label={t("หัวข้อเหตุผลที่ไม่อนุมัติ")}
                value={denialTopic}
                onChange={(e) => {
                  const preset = denialPresets.find((p) => p.topic === e.target.value);
                  setDenialTopic(e.target.value);
                  if (preset) form.setFieldsValue({ reason: t(preset.reason) });
                }}
              >
                <Space direction="vertical">
                  {denialPresets.map((preset) => (
                    <Radio
                      key={preset.topic}
                      value={preset.topic}
                      // Clicking the chosen preset again clears it; onChange only fires for a new one.
                      onClick={() => {
                        if (denialTopic !== preset.topic) return;
                        setDenialTopic(undefined);
                        form.setFieldsValue({ reason: "" });
                      }}
                    >
                      {t(preset.topic)}
                    </Radio>
                  ))}
                </Space>
              </Radio.Group>
              <Alert type="info" message={t(terminationNotice)} />
              <Alert
                style={{ marginBottom: 16 }}
                type="error"
                showIcon
                message={t("การไม่อนุมัติจะยุติคำร้องทั้งเรื่องและยกเลิกงานที่ค้าง")}
              />
            </div>
          )}
          {["REQUEST_TRANSFER", "TRANSFER_DEPARTMENT"].includes(action) && (
            <>
              <Form.Item
                name="targetDepartmentId"
                label={t("หน่วยงานที่จะรับช่วงต่อ")}
                rules={[{ required: true, message: t("กรุณาเลือกหน่วยงาน") }]}
              >
                <Select
                  disabled={action === "TRANSFER_DEPARTMENT" && c.status === "TRANSFER_PENDING"}
                  options={transferDepartments.map((d) => ({ value: d.id, label: d.name }))}
                  onChange={async (department) => {
                    form.setFieldsValue({ leaderId: undefined });
                    setPeople([]);
                    if (action === "TRANSFER_DEPARTMENT")
                      try {
                        setPeople(await api("/people?role=LEADER&departmentId=" + department));
                      } catch (e) {
                        message.error(t((e as Error).message));
                      }
                  }}
                />
              </Form.Item>
              {action === "TRANSFER_DEPARTMENT" && (
                <Form.Item
                  name="leaderId"
                  label={t("หัวหน้าหน่วยงานที่รับช่วงต่อ")}
                  rules={[{ required: true, message: t("กรุณาเลือกหัวหน้า") }]}
                >
                  <Select options={people.map((p) => ({ value: p.id, label: p.display_name }))} />
                </Form.Item>
              )}
            </>
          )}
          {action === "TRIAGE" && (
            <>
              <Form.Item
                name="operationMethod"
                label={t("วิธีดำเนินงาน")}
                rules={[{ required: true }]}
              >
                <Input />
              </Form.Item>
              <Form.Item name="urgency" label={t("ความเร่งด่วน")} rules={[{ required: true }]}>
                <Select
                  options={[
                    { value: "NORMAL", label: t("ปกติ") },
                    { value: "PRIORITY", label: t("เร่งด่วน") },
                  ]}
                />
              </Form.Item>
              <Form.Item name="workScope" label={t("ขอบเขตงาน")} rules={[{ required: true }]}>
                <Input.TextArea />
              </Form.Item>
              <Form.Item name="precautions" label={t("ข้อควรระวัง")} rules={[{ required: true }]}>
                <Input.TextArea />
              </Form.Item>
              <Form.Item
                name="coordinator"
                label={t("ช่องทางประสานงาน")}
                rules={[{ required: true }]}
              >
                <Input />
              </Form.Item>
            </>
          )}
          {action === "ASSIGN" && <AssignmentPicker form={form} teams={teams} people={people} />}
          {["TRIAGE", "REASSIGN_LEADER", "SEND_APPROVAL"].includes(action) && (
            <Form.Item
              label={
                ["TRIAGE", "REASSIGN_LEADER"].includes(action)
                  ? t("หัวหน้าหน่วยงาน")
                  : t("ผู้อนุมัติตามลำดับ (เลือก ") + data.approvalStages + t(" คน)")
              }
              name={["TRIAGE", "REASSIGN_LEADER"].includes(action) ? "leaderId" : "approverIds"}
              rules={[{ required: true }]}
            >
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                mode={action === "SEND_APPROVAL" ? "multiple" : undefined}
                options={people.map((p) => {
                  const title = action === "SEND_APPROVAL" ? govTitleWithLimit(p.gov_role, t) : "";
                  const name = title ? `${p.display_name} — ${title}` : p.display_name;
                  return {
                    value: p.id,
                    label: p.usual_step
                      ? t("{{name}} (เลือกบ่อย · ลำดับ {{step}})", { name, step: p.usual_step })
                      : name,
                  };
                })}
              />
            </Form.Item>
          )}
          {action === "SEND_APPROVAL" && people.some((p) => p.usual_step) && (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message={t("ระบบเลือกผู้อนุมัติที่คุณส่งให้บ่อยไว้ให้แล้ว เปลี่ยนเป็นคนอื่นได้")}
            />
          )}
          {overLimit && (
            <Alert
              type="error"
              showIcon
              style={{ marginBottom: 16 }}
              message={t(
                "วงเงินเกิน 500,000 บาท เกินอำนาจอนุมัติของผู้อำนวยการกองคลัง/หัวหน้าเจ้าหน้าที่พัสดุ กรุณาเลือกปลัดเทศบาล รองปลัดเทศบาล รองนายกเทศมนตรี หรือนายกเทศมนตรีเป็นผู้อนุมัติลำดับสุดท้าย",
              )}
            />
          )}
          {action === "SEND_APPROVAL" && requestedAmount > SPECIFIC_METHOD_LIMIT && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
              message={t(
                "วงเงินเกิน 50,000,000 บาท กรุณาตรวจอำนาจสั่งซื้อสั่งจ้างโดยวิธีเฉพาะเจาะจงตามระเบียบพัสดุฯ พ.ศ. 2560 ข้อ 86–87 ก่อนส่ง",
              )}
            />
          )}
          {action === "SEND_APPROVAL" && approverFallback && (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message={t(
                "ระบบเลือกผู้อนุมัติเริ่มต้นตามลำดับชื่อ เปลี่ยนเป็นผู้อนุมัติคนอื่นได้เสมอ",
              )}
            />
          )}
          {reasonPresets[action] && (
            <section
              className="approval-presets"
              aria-label={action === "APPROVE" ? t("เหตุผลที่อนุมัติ") : t("เหตุผลสำเร็จรูป")}
            >
              <Text strong>
                {action === "APPROVE"
                  ? t("เหตุผลที่อนุมัติ (แตะเลือกได้หลายข้อ)")
                  : t("เหตุผล (แตะเลือกได้หลายข้อ)")}
              </Text>
              <div className="symptom-options">
                {reasonPresets[action].map((preset) => (
                  <Tag.CheckableTag
                    key={preset}
                    checked={reasonPicked.includes(preset)}
                    onChange={(checked) => {
                      setReasonPicked((picked) =>
                        checked ? [...picked, preset] : picked.filter((p) => p !== preset),
                      );
                      void form.validateFields(["reason"]).catch(() => {});
                    }}
                  >
                    {t(preset)}
                  </Tag.CheckableTag>
                ))}
              </div>
            </section>
          )}
          {action === "PROPOSE" && (
            <>
              <div className="resource-request-header">
                <Form.Item
                  label={t("ชื่อคำขอทรัพยากร")}
                  name="proposal"
                  rules={[{ required: true, whitespace: true, max: 20000 }]}
                >
                  <Input placeholder={t("เช่น วัสดุซ่อมทางเท้า")} />
                </Form.Item>
                <Form.Item label={t("หน่วยงานผู้ขอ")}>
                  <Input
                    value={resourceDepartment || t("หน่วยงานตามคำร้อง")}
                    aria-label={t("หน่วยงานผู้ขอ")}
                    readOnly
                  />
                </Form.Item>
              </div>
              <Form.List
                name="lineItems"
                rules={[
                  {
                    validator: async (_, items) => {
                      if (!items?.length)
                        throw new Error(t("เพิ่มรายการทรัพยากรอย่างน้อย 1 รายการ"));
                      if (items.length > 50) throw new Error(t("เพิ่มได้ไม่เกิน 50 รายการ"));
                      if (
                        items.reduce(
                          (sum: number, item: D) =>
                            sum + Math.round(Number(item?.amount || 0) * 100),
                          0,
                        ) > 99999999999999
                      )
                        throw new Error(t("งบประมาณรวมต้องไม่เกิน 999,999,999,999.99 บาท"));
                    },
                  },
                ]}
              >
                {(fields, { add, remove }, { errors }) => (
                  <>
                    <div className="resource-items">
                      {fields.map((field, index) => (
                        <div
                          className={
                            "resource-item-row" + (proposalItemsFixed ? " priced-item-row" : "")
                          }
                          key={field.key}
                        >
                          <Form.Item
                            label={t("รายการที่ ") + (index + 1)}
                            name={[field.name, "name"]}
                            rules={[{ required: true, whitespace: true, max: 200 }]}
                          >
                            <Input
                              aria-label={t("ชื่อรายการ ") + (index + 1)}
                              placeholder={t("ชื่อรายการ เช่น ทราย ปูนซีเมนต์")}
                              maxLength={200}
                              readOnly={proposalItemsFixed}
                            />
                          </Form.Item>
                          {proposalItemsFixed && (
                            <Form.Item
                              label={t("จำนวน")}
                              name={[field.name, "quantity"]}
                              rules={[
                                { required: true, type: "number", min: 0.01, max: 1000000000 },
                              ]}
                            >
                              <InputNumber
                                aria-label={t("จำนวนรายการ ") + (index + 1)}
                                min={0.01}
                                max={1000000000}
                                precision={2}
                                inputMode="decimal"
                                addonAfter={form.getFieldValue(["lineItems", field.name, "unit"])}
                                style={{ width: "100%" }}
                              />
                            </Form.Item>
                          )}
                          <Form.Item
                            label={t("ราคา (บาท)")}
                            name={[field.name, "amount"]}
                            rules={[
                              { required: true, type: "number", min: 0, max: 999999999999.99 },
                            ]}
                          >
                            <InputNumber
                              aria-label={t("ราคารายการ ") + (index + 1)}
                              min={0}
                              max={999999999999.99}
                              precision={2}
                              inputMode="decimal"
                              onKeyDown={(e) => {
                                if (
                                  !e.ctrlKey &&
                                  !e.metaKey &&
                                  e.key.length === 1 &&
                                  !/[0-9.]/.test(e.key)
                                )
                                  e.preventDefault();
                              }}
                              onPaste={(e) => {
                                if (!/^\d*(\.\d{0,2})?$/.test(e.clipboardData.getData("text")))
                                  e.preventDefault();
                              }}
                              placeholder="0.00"
                              style={{ width: "100%" }}
                            />
                          </Form.Item>
                          {index > 0 && !proposalItemsFixed && (
                            <Button
                              className="resource-remove"
                              icon={<DeleteOutlined />}
                              danger
                              aria-label={t("ลบรายการ ") + (index + 1)}
                              onClick={() => remove(field.name)}
                            >
                              {t("ลบ")}
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                    <Form.ErrorList errors={errors} />
                    {proposalItemsFixed ? (
                      <Text type="secondary">
                        {t("รายการตามที่ผู้ลงพื้นที่ขอ ปรับได้เฉพาะจำนวนและราคา")}
                      </Text>
                    ) : (
                      <Button
                        icon={<PlusOutlined />}
                        disabled={fields.length >= 50}
                        onClick={() => add({ name: "", amount: null })}
                      >
                        {t("เพิ่มรายการ")}
                      </Button>
                    )}
                    <div className="resource-total" aria-live="polite">
                      <Text>
                        {t("งบประมาณรวม")} {fields.length}
                        {t("รายการ")}{" "}
                      </Text>
                      <Text strong>
                        {resourceTotal.toLocaleString(language === "en" ? "en-GB" : "th-TH", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{" "}
                        {t("บาท")}
                      </Text>
                    </div>
                  </>
                )}
              </Form.List>
              <Form.Item
                label={t("ระยะเวลาดำเนินการ (วัน)")}
                name="durationDays"
                rules={[{ required: true }]}
              >
                <InputNumber min={1} max={3650} precision={0} />
              </Form.Item>
              <Form.Item label={t("เอกสารคำขอ (PDF หรือ PNG/JPEG ไม่เกิน 15 MB ต่อไฟล์)")} required>
                <EvidenceUpload
                  complaintId={id}
                  proposalDocument
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
                label={t("ข้อเท็จจริงและผลดำเนินการ")}
                name="content"
                rules={[{ required: true, max: 20000 }]}
              >
                <Input.TextArea rows={6} />
              </Form.Item>
              <div className="field-evidence-steps">
                {[
                  { stage: "BEFORE", label: t("1. ภาพก่อนทำ") },
                  { stage: "AFTER", label: t("2. ภาพหลังทำ") },
                ].map((item) =>
                  item.stage === "BEFORE" && startedWithPhoto ? (
                    <section key={item.stage}>
                      <h4>{item.label}</h4>
                      <Alert
                        type="success"
                        showIcon
                        message={t("ถ่ายไว้ตอนเริ่มปฏิบัติงานแล้ว {{count}} รูป", {
                          count: startPhotos.length,
                        })}
                      />
                    </section>
                  ) : (
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
                  ),
                )}
                <section className="additional-evidence">
                  <h4>{t("3. วิดีโอหรือเอกสารประกอบเพิ่มเติม (ไม่บังคับ)")}</h4>
                  <EvidenceUpload
                    complaintId={id}
                    used={pendingBytes}
                    disabled={uploadBusy}
                    onUploaded={load}
                    onBusy={setUploadBusy}
                    onFailed={saveFailedFile}
                  />
                  {evidenceList("GENERAL")}
                </section>
              </div>
              <Text type="secondary">
                {t("ภาพก่อนและหลังต้องเป็น PNG/JPEG ·")}
                {t(citizen ? ATTACHMENT_HELP : STAFF_ATTACHMENT_HELP)}
              </Text>
              <StockReturns held={heldStock} />
            </>
          )}
          {action === "START" && (
            <div className="start-photo">
              <Alert
                className="start-location"
                type={startPoint === null ? "warning" : "info"}
                showIcon
                icon={<EnvironmentOutlined />}
                message={
                  startPoint === undefined
                    ? t("กำลังระบุพิกัดหน้างาน...")
                    : startPoint === null
                      ? t("ระบุพิกัดไม่ได้ ระบบจะบันทึกว่าไม่มีพิกัดตอนเริ่มงาน")
                      : t("บันทึกพิกัดหน้างานแล้ว ระบบจะเทียบระยะกับจุดที่แจ้ง")
                }
              />
              <Alert
                type="info"
                showIcon
                message={t(
                  "ถ่ายรูปหน้างานก่อนเริ่มปฏิบัติงาน ระบบบันทึกเวลาและผู้ถ่ายไว้เป็นหลักฐาน",
                )}
              />
              <EvidenceUpload
                complaintId={id}
                stage="BEFORE"
                photos
                used={pendingBytes}
                disabled={uploadBusy}
                onUploaded={load}
                onBusy={setUploadBusy}
              />
              <List
                size="small"
                locale={{ emptyText: t("ยังไม่ได้ถ่ายรูปหน้างาน") }}
                dataSource={startPhotos}
                renderItem={(file: D) => (
                  <List.Item>
                    <a href={"/api/files/" + file.id} target="_blank" rel="noreferrer">
                      {file.original_name}
                    </a>
                    <Tag color="green">{t("แนบแล้ว")}</Tag>
                  </List.Item>
                )}
              />
              <StockTaken items={stockItems} approved={c.status === "READY"} />
            </div>
          )}
          {action === "REQUEST_RESOURCE" && (
            <Form.List
              name="items"
              rules={[
                {
                  validator: async (_, items) => {
                    if (!items?.length) throw new Error(t("เพิ่มรายการที่ขออย่างน้อย 1 รายการ"));
                    if (items.length > 50) throw new Error(t("เพิ่มได้ไม่เกิน 50 รายการ"));
                  },
                },
              ]}
            >
              {(fields, { add, remove }, { errors }) => (
                <>
                  <div className="resource-items">
                    {fields.map((field, index) => {
                      const left = stockLeft(requestItems?.[index]?.stockItemId);
                      return (
                        <div className="resource-item-row requested-item-row" key={field.key}>
                          <Form.Item name={[field.name, "stockItemId"]} hidden>
                            <Input />
                          </Form.Item>
                          <Form.Item
                            label={
                              requestItems?.[index]?.stockItemId
                                ? t("รายการที่ {{n}} (จากคลัง)", { n: index + 1 })
                                : t("รายการที่ ") + (index + 1)
                            }
                            name={[field.name, "name"]}
                            rules={[{ required: true, whitespace: true, max: 200 }]}
                          >
                            <Input
                              aria-label={t("ชื่อรายการที่ขอ ") + (index + 1)}
                              placeholder={t("ชื่อรายการ เช่น ทราย ปูนซีเมนต์")}
                              maxLength={200}
                              readOnly={!!requestItems?.[index]?.stockItemId}
                            />
                          </Form.Item>
                          <Form.Item
                            label={t("จำนวน")}
                            name={[field.name, "quantity"]}
                            rules={[
                              { required: true, type: "number", min: 0.01, max: 1000000000 },
                              ...(left === undefined
                                ? []
                                : [
                                    {
                                      type: "number" as const,
                                      max: left,
                                      message: t("ขอได้ไม่เกินคงเหลือในคลัง {{left}} {{unit}}", {
                                        left: amount(left),
                                        unit: requestItems?.[index]?.unit,
                                      }),
                                    },
                                  ]),
                            ]}
                          >
                            <InputNumber
                              aria-label={t("จำนวนรายการ ") + (index + 1)}
                              min={0.01}
                              max={left ?? 1000000000}
                              precision={2}
                              inputMode="decimal"
                              style={{ width: "100%" }}
                            />
                          </Form.Item>
                          <Form.Item
                            label={t("หน่วย")}
                            name={[field.name, "unit"]}
                            rules={[
                              { required: true, whitespace: true, max: 50 },
                              {
                                pattern: /^[^\p{N}]*\p{L}[^\p{N}]*$/u,
                                message: t("หน่วยเป็นคำ เช่น ถุง เมตร ห้ามใส่ตัวเลข"),
                              },
                            ]}
                          >
                            <Input
                              aria-label={t("หน่วยรายการ ") + (index + 1)}
                              placeholder={t("เช่น ถุง ท่อน เมตร")}
                              maxLength={50}
                              readOnly={!!requestItems?.[index]?.stockItemId}
                            />
                          </Form.Item>
                          {fields.length > 1 && (
                            <Button
                              className="resource-remove"
                              icon={<DeleteOutlined />}
                              danger
                              aria-label={t("ลบรายการ ") + (index + 1)}
                              onClick={() => remove(field.name)}
                            >
                              {t("ลบ")}
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <Form.ErrorList errors={errors} />
                  <div className="stock-quick-add">
                    {stockItems.length > 0 && (
                      <Select
                        showSearch
                        value={null}
                        optionFilterProp="label"
                        aria-label={t("เลือกจากคลังวัสดุ")}
                        placeholder={t("+ เลือกจากคลังวัสดุ")}
                        disabled={fields.length >= 50}
                        options={stockOptions(stockItems, t).filter(
                          (o) => !requestItems?.some((row) => row?.stockItemId === o.value),
                        )}
                        onChange={(stockId: string) => {
                          const item = stockItems.find((s) => s.id === stockId);
                          const rows: D[] = form.getFieldValue("items") || [];
                          if (!item || rows.some((r) => r?.stockItemId === item.id)) return;
                          const blank = rows.findIndex((r) => !r?.name?.trim() && !r?.stockItemId);
                          const line = {
                            stockItemId: item.id,
                            name: item.name,
                            unit: item.unit,
                            quantity: Math.min(1, stockLeft(item.id) ?? 1),
                          };
                          if (blank >= 0) {
                            rows[blank] = line;
                            form.setFieldsValue({ items: [...rows] });
                          } else add(line);
                        }}
                      />
                    )}
                    <Button
                      icon={<PlusOutlined />}
                      disabled={fields.length >= 50}
                      onClick={() => add({ name: "", unit: "" })}
                    >
                      {t("เพิ่มรายการที่ขอ (นอกคลัง)")}
                    </Button>
                  </div>
                </>
              )}
            </Form.List>
          )}
          {!["ACCEPT", "START", "PROPOSE", "REPORT"].includes(action) && (
            <Form.Item
              label={
                action === "RETURN_LEADER"
                  ? t(
                      "ระบุสิ่งที่ต้องปรับปรุงเพิ่มเติม (เช่น ภาพถ่ายไม่ชัดเจนสำหรับแจ้งประชาชน หรือข้อมูลสรุปไม่ครบถ้วน)",
                    )
                  : action === "APPROVE"
                    ? t("เหตุผลอื่น ๆ (กรอกเพิ่มเองได้)")
                    : t("เหตุผล / บันทึกการดำเนินการ")
              }
              name="reason"
              rules={[
                {
                  required:
                    requiredReasonActions.has(action) &&
                    !(reasonPresets[action] && reasonPicked.length > 0),
                  whitespace: true,
                  max: 4000,
                  message: t("กรุณาระบุเหตุผลให้ครบถ้วน"),
                },
              ]}
              extra={requiredReasonActions.has(action) ? undefined : t("ไม่บังคับกรอก")}
            >
              <Input.TextArea
                rows={3}
                placeholder={
                  reasonPresets[action] ? t("เหตุผลอื่น ๆ (กรอกเพิ่มเองได้)") : undefined
                }
              />
            </Form.Item>
          )}
          <Button
            htmlType="submit"
            type="primary"
            danger={action === "DENY"}
            loading={busy}
            disabled={!!error || overLimit || uploadBusy || (action === "REPORT" && !online)}
            block
          >
            {t("ยืนยัน{{action}}", { action: actionButton(action) })}
          </Button>
        </Form>
      </Modal>
    </>
  );
}
