import { categoryLabel } from "./i18n/categories";
import { useLocalizedFormErrors } from "./i18n/useLocalizedFormErrors";
import { useI18n } from "./i18n/useI18n";
import { useEffect, useRef, useState } from "react";
import {
  App,
  Alert,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  List,
  Modal,
  Pagination,
  Space,
  Tag,
  Typography,
  Upload,
} from "antd";
import {
  CameraOutlined,
  EnvironmentOutlined,
  UploadOutlined,
  CheckOutlined,
  ArrowLeftOutlined,
  VideoCameraOutlined,
  SafetyCertificateOutlined,
} from "./icons";
import { api, post, statusNames } from "./api";
import { useGeo } from "./GeoContext";
import LocationMap from "./LocationMap";
import CommunityActions from "./CommunityActions";
import CommunityDetail from "./CommunityDetail";
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_HELP,
  MAX_ATTACHMENT_BYTES,
  attachmentError,
} from "./attachments";
import { reportDescriptionExample } from "./reportExamples";
import { reportSymptoms, withSymptoms } from "./reportSymptoms";
import VideoRecorder, { canRecordVideo } from "./VideoRecorder";
import ReporterEmail from "./ReporterEmail";
type D = Record<string, any>;
type Place = { place_id: number; lat: string; lon: string; display_name: string };
const { Title, Text } = Typography;
const icons = [
  "▧",
  "≈",
  "ϟ",
  "♻",
  "≈",
  "≋",
  "♧",
  "♧",
  "◉",
  "↔",
  "⚑",
  "♙",
  "⊕",
  "✓",
  "⌂",
  "⌂",
  "♧",
  "≈",
  "▤",
  "♡",
  "⚒",
  "◈",
  "☷",
  "…",
];
// The server finds cases within the radius by their exact location but only shares coordinates
// rounded to about 100 m, so a match can plot outside the circle. Pull such markers just inside.
function insideRadius(
  centre: [number, number] | undefined,
  [latitude, longitude]: [number, number],
  meters: number,
) {
  if (!centre) return { latitude, longitude };
  const metersPerDegree = 111_320;
  const north = (latitude - centre[0]) * metersPerDegree;
  const east = (longitude - centre[1]) * metersPerDegree * Math.cos((centre[0] * Math.PI) / 180);
  const distance = Math.hypot(north, east);
  const limit = meters * 0.85;
  if (distance <= limit) return { latitude, longitude };
  const scale = limit / distance;
  return {
    latitude: centre[0] + (latitude - centre[0]) * scale,
    longitude: centre[1] + (longitude - centre[1]) * scale,
  };
}
export default function NewCase({ onDone }: { onDone: (id: string) => void }) {
  const { t } = useI18n();
  const geo = useGeo();
  const submissionKey = useRef(crypto.randomUUID());
  const [form] = Form.useForm();
  useLocalizedFormErrors(form);
  const address = Form.useWatch("address", form);
  const [categories, setCategories] = useState<D[]>([]),
    [category, setCategory] = useState<D>(),
    [step, setStep] = useState(0),
    [position, setPosition] = useState<[number, number] | undefined>(geo.point),
    [files, setFiles] = useState<File[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [nearby, setNearby] = useState<D[]>([]),
    [receipt, setReceipt] = useState<D>(),
    [placeQuery, setPlaceQuery] = useState("");
  const [locationConfirmation, setLocationConfirmation] = useState<{
    address: string;
    point?: [number, number];
  }>();
  const [categoryQuery, setCategoryQuery] = useState("");
  const [categorySearch, setCategorySearch] = useState("");
  const [categoryPage, setCategoryPage] = useState(1);
  const [nearbyBusy, setNearbyBusy] = useState(false);
  const [nearbyError, setNearbyError] = useState("");
  const [nearbyActionError, setNearbyActionError] = useState("");
  const [nearbyAction, setNearbyAction] = useState<{ id: string; type: "vote" | "follow" }>();
  const [nearbyDetail, setNearbyDetail] = useState<string>();
  const nearbyActionLock = useRef(false);
  const nearbyVersion = useRef(0);
  const [nearbyRevision, setNearbyRevision] = useState(0);
  const nearbyUrl =
    position && (step === 0 || (step === 1 && category))
      ? `/nearby?latitude=${position[0]}&longitude=${position[1]}${category ? `&categoryId=${category.id}` : ""}`
      : undefined;
  const nearbyContext = useRef(nearbyUrl);
  nearbyContext.current = nearbyUrl;
  const [nearbyPage, setNearbyPage] = useState(1);
  useEffect(() => setNearbyPage(1), [nearbyUrl]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [showPlaces, setShowPlaces] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchNotice, setSearchNotice] = useState("");
  const [selectedPlace, setSelectedPlace] = useState<number>();
  const [addressLoading, setAddressLoading] = useState(false);
  const [addressNotice, setAddressNotice] = useState("");
  const [addressRevision, setAddressRevision] = useState(0);
  const searchVersion = useRef(0);
  const pendingFiles = useRef<File[]>([]);
  const [attachmentMissing, setAttachmentMissing] = useState(false);
  const attachmentField = useRef<HTMLDivElement>(null);
  const [symptoms, setSymptoms] = useState<string[]>([]);
  function pickSymptoms(next: string[]) {
    form.setFieldValue(
      "description",
      withSymptoms(form.getFieldValue("description"), symptoms, next),
    );
    setSymptoms(next);
  }
  const [recording, setRecording] = useState(false);
  const { message } = App.useApp();
  const [previews, setPreviews] = useState<Record<string, string>>({});
  useEffect(() => {
    const urls: Record<string, string> = {};
    for (const f of files)
      urls[(f as File & { uid?: string }).uid || f.name] = URL.createObjectURL(f);
    setPreviews(urls);
    return () => Object.values(urls).forEach((url) => URL.revokeObjectURL(url));
  }, [files]);
  const addAttachment = (file: File) => {
    const used = pendingFiles.current.reduce((total, f) => total + f.size, 0);
    const problem = attachmentError(file, used);
    if (problem) {
      message.error(t(problem));
      return Upload.LIST_IGNORE;
    }
    setAttachmentMissing(false);
    pendingFiles.current = [...pendingFiles.current, file];
    setFiles(pendingFiles.current);
    return false;
  };
  const manual = useRef(false);
  const search = categorySearch.toLocaleLowerCase("th");
  const filteredCategories = categories.filter((c) =>
    [c.name, categoryLabel(c.name)].some((name) => name.toLocaleLowerCase("th").includes(search)),
  );
  const categoryPageSize = 6;
  const visibleCategories = filteredCategories.slice(
    (categoryPage - 1) * categoryPageSize,
    categoryPage * categoryPageSize,
  );
  const fields: D[] = category ? JSON.parse(category.fields) : [];
  useEffect(() => {
    api<D>("/catalog")
      .then((c) =>
        setCategories(
          [...c.categories].sort((a: D, b: D) => {
            const order = [
              "ถนนและทางเท้า",
              "ท่อระบายน้ำ / น้ำท่วมขัง",
              "ไฟส่องสว่างสาธารณะ",
              "ขยะตกค้าง / ลักลอบทิ้งขยะ",
              "น้ำเสีย / กลิ่นเหม็น",
              "เสียงดัง / ฝุ่นควัน / เหตุรำคาญ",
              "ต้นไม้ / กิ่งไม้รบกวนทางสาธารณะ",
              "ต้นไม้ล้ม / กิ่งไม้เสี่ยงอันตราย",
              "ประปาเทศบาล / น้ำไม่ไหล / ท่อแตก",
              "สิ่งกีดขวางทางสาธารณะ",
              "ป้ายจราจร / สัญญาณไฟในความดูแลเทศบาล",
              "สัตว์จรจัด / สัตว์ก่อเหตุเดือดร้อน",
              "ยุงลาย / แหล่งเพาะโรค",
              "สุขาภิบาลตลาด / อาหาร / สถานประกอบการ",
              "อาคาร / การก่อสร้างผิดข้อบัญญัติ",
              "อาคารเสี่ยงอันตราย / ก่อสร้างผิดข้อบัญญัติ",
              "สวนสาธารณะ / สนามเด็กเล่น / ลานกีฬา",
              "คลอง / ทางน้ำสาธารณะ",
              "โรงเรียน / ศูนย์พัฒนาเด็กเล็กของเทศบาล",
              "สวัสดิการเด็ก / ผู้สูงอายุ / ผู้พิการ",
              "พื้นที่สาธารณะ / ทรัพย์สินเทศบาลชำรุด",
              "สุสาน / ฌาปนสถานในความดูแลเทศบาล",
              "บริการเทศบาล / การปฏิบัติงานเจ้าหน้าที่",
              "อื่น ๆ (ในอำนาจหน้าที่เทศบาล)",
            ];
            const rank = (n: string) => {
              const i = order.indexOf(n);
              return i < 0 ? order.length - 1.5 : i;
            };
            return rank(a.name) - rank(b.name);
          }),
        ),
      )
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (geo.point && !position) selectPoint(geo.point);
  }, [geo.point]);
  function selectPoint(p: [number, number]) {
    setPosition(p);
    setNearby([]);
    setNearbyRevision((v) => v + 1);
    setSelectedPlace(undefined);
    setAddressLoading(false);
    setAddressNotice("");
    setAddressRevision((v) => v + 1);
    if (!manual.current) {
      const known = places.find((place) => {
        const radians = Math.PI / 180;
        const dLat = (Number(place.lat) - p[0]) * radians;
        const dLon = (Number(place.lon) - p[1]) * radians;
        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos(p[0] * radians) *
            Math.cos(Number(place.lat) * radians) *
            Math.sin(dLon / 2) ** 2;
        return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) <= 100;
      });
      form.setFieldValue("address", known?.display_name || "");
    }
  }
  useEffect(() => {
    if (!position || manual.current || step !== 0) return;
    const point = position;
    const controller = new AbortController();
    let attempts = 0;
    let active = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    setAddressLoading(true);
    setAddressNotice("");
    async function lookup() {
      attempts++;
      let retrying = false;
      try {
        const r = await api<D>(
          "/geocoding/reverse?latitude=" + point[0] + "&longitude=" + point[1],
          { signal: controller.signal },
        );
        if (active && !manual.current) {
          const name = typeof r?.display_name === "string" ? r.display_name.trim() : "";
          if (name) form.setFieldValue("address", name);
          else setAddressNotice("ไม่พบชื่อสถานที่ตรงจุดนี้ กรุณากรอกสถานที่หรือจุดสังเกตเอง");
        }
      } catch (e) {
        if (active && !manual.current) {
          // A recent place search may still occupy the provider's rate-limit window.
          if (attempts < 3 && (e as Error).message.includes("กรุณารอสักครู่")) {
            retrying = true;
            retry = setTimeout(() => {
              if (active) void lookup();
            }, 1200);
          } else setAddressNotice("ค้นหาที่อยู่ไม่สำเร็จ กรุณาระบุสถานที่หรือจุดสังเกตเอง");
        }
      } finally {
        if (active && !retrying) setAddressLoading(false);
      }
    }
    const timer = setTimeout(() => void lookup(), 1200);
    return () => {
      active = false;
      clearTimeout(timer);
      clearTimeout(retry);
      controller.abort();
    };
  }, [position?.[0], position?.[1], step, addressRevision]);
  async function next() {
    try {
      const values = await form.validateFields(["address"]);
      setLocationConfirmation({
        address: values.address,
        point: position ? [...position] : undefined,
      });
    } catch {}
  }
  useEffect(() => {
    const version = ++nearbyVersion.current;
    setNearby([]);
    setNearbyError("");
    setNearbyActionError("");
    if (!nearbyUrl) {
      setNearbyBusy(false);
      return;
    }
    const controller = new AbortController();
    let active = true;
    setNearbyBusy(true);
    const timer = setTimeout(async () => {
      try {
        const results = await api<D[]>(nearbyUrl, { signal: controller.signal });
        if (active && version === nearbyVersion.current) setNearby(results);
      } catch (e) {
        if (active && version === nearbyVersion.current) setNearbyError((e as Error).message);
      } finally {
        if (active && version === nearbyVersion.current) setNearbyBusy(false);
      }
    }, 400);
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [nearbyUrl, nearbyRevision]);
  async function updateNearby(item: D, type: "vote" | "follow") {
    if (nearbyActionLock.current || nearbyBusy || !nearbyUrl || !position) return;
    nearbyActionLock.current = true;
    setNearbyAction({ id: item.id, type });
    setNearbyActionError("");
    const context = nearbyUrl;
    try {
      if (type === "vote") {
        await api(`/community/complaints/${item.id}/vote`, {
          method: item.voted ? "DELETE" : "POST",
        });
      } else if (item.following) {
        await api(`/complaints/${item.id}/follow`, { method: "DELETE" });
      } else {
        await post(`/complaints/${item.id}/follow`, {
          categoryId: item.category_id,
          latitude: position[0],
          longitude: position[1],
        });
      }
      const refreshedContext = nearbyContext.current;
      if (!refreshedContext) return;
      // Keep the saved action visible even if the subsequent read fails.
      setNearby((rows) =>
        rows.map((row) =>
          row.id !== item.id
            ? row
            : type === "vote"
              ? {
                  ...row,
                  voted: !item.voted,
                  votes: Math.max(
                    0,
                    Number(row.votes ?? 0) +
                      (!!row.voted === !item.voted ? 0 : item.voted ? -1 : 1),
                  ),
                }
              : { ...row, following: !item.following },
        ),
      );
      const version = ++nearbyVersion.current;
      setNearbyBusy(true);
      try {
        const rows = await api<D[]>(refreshedContext);
        if (nearbyContext.current === refreshedContext && nearbyVersion.current === version)
          setNearby(rows);
      } catch {
        if (nearbyContext.current === refreshedContext && nearbyVersion.current === version)
          setNearbyActionError("บันทึกแล้ว แต่โหลดข้อมูลล่าสุดไม่สำเร็จ กรุณาเลือกจุดเดิมอีกครั้ง");
      } finally {
        if (nearbyContext.current === refreshedContext && nearbyVersion.current === version)
          setNearbyBusy(false);
      }
    } catch (e) {
      if (nearbyContext.current === context) setNearbyActionError((e as Error).message);
    } finally {
      nearbyActionLock.current = false;
      setNearbyAction(undefined);
    }
  }
  function choosePlace(place: Place) {
    manual.current = true;
    selectPoint([Number(place.lat), Number(place.lon)]);
    form.setFieldValue("address", place.display_name);
    setSelectedPlace(place.place_id);
    setShowPlaces(false);
  }
  async function searchPlace() {
    const query = placeQuery.trim();
    if (!query || searching) return;
    const version = ++searchVersion.current;
    setPlaces([]);
    setSelectedPlace(undefined);
    setSearchNotice("");
    const parts = query.split(/[, ]+/).map(Number);
    if (
      parts.length === 2 &&
      parts.every(Number.isFinite) &&
      Math.abs(parts[0]) <= 90 &&
      Math.abs(parts[1]) <= 180
    ) {
      manual.current = false;
      selectPoint([parts[0], parts[1]]);
      setSearchNotice("ปักหมุดตามพิกัดแล้ว กรุณาตรวจสอบจุดเกิดเหตุบนแผนที่");
      return;
    }
    setSearching(true);
    try {
      const results = await api<Place[]>(
        "/geocoding/search?q=" + encodeURIComponent(query.replace(/^รพ\.?\s*/, "โรงพยาบาล")),
      );
      if (version !== searchVersion.current) return;
      setPlaces(results);
      setShowPlaces(true);
      if (!results.length) {
        setSearchNotice("ไม่พบสถานที่ ลองใช้ชื่อเต็ม เพิ่มตำบลหรือจังหวัด หรือปักหมุดเอง");
      }
    } catch (e) {
      if (version === searchVersion.current) setSearchNotice((e as Error).message);
    } finally {
      if (version === searchVersion.current) setSearching(false);
    }
  }
  async function submit() {
    if (!category) {
      message.info(t("กรุณาเลือกประเภทปัญหา"));
      return;
    }
    try {
      await form.validateFields();
    } catch (e) {
      // Bring the topmost unfilled field into view; the submit button sits far below it.
      const first = (e as { errorFields?: { name: (string | number)[] }[] }).errorFields?.[0];
      if (first)
        form.scrollToField(first.name, { behavior: "smooth", block: "center", focus: true });
      return;
    }
    if (!files.length) {
      setAttachmentMissing(true);
      attachmentField.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      message.error(t("กรุณาแนบหลักฐานอย่างน้อย 1 ไฟล์"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const v = form.getFieldsValue(true);
      const payload = {
        categoryId: category!.id,
        title: v.title?.trim() || category!.name,
        description: v.description.trim(),
        address: v.address,
        answers: v.answers || {},
        latitude: position?.[0] ?? null,
        longitude: position?.[1] ?? null,
        contactName: v.contactName,
        contactPhone: v.contactPhone,
      };
      const key = submissionKey.current;
      const body = new FormData();
      body.append("complaint", new Blob([JSON.stringify(payload)], { type: "application/json" }));
      for (const file of files) body.append("files", file);
      const result = await api<{ id: string }>("/complaints", {
        method: "POST",
        body,
        headers: { "Idempotency-Key": key },
      });
      const id = result.id;
      setReceipt({
        id,
        category: category!.name,
        address: v.address,
      });
      window.scrollTo({ top: 0 });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const nearbyList = (
    <>
      <div role="status" aria-live="polite" style={{ marginTop: 16 }}>
        <Text strong>
          {category ? t("เคสประเภทเดียวกัน") : t("เคสใกล้เคียง")}
          {t("ในรัศมี 100 เมตร")}
        </Text>
        <p>
          {!position
            ? t("เลือกจุดเกิดเหตุเพื่อค้นหาเคสใกล้เคียงอัตโนมัติ")
            : nearbyBusy
              ? t("กำลังค้นหาเคสใกล้เคียง…")
              : nearbyError
                ? t(nearbyError)
                : nearby.length
                  ? t("พบ {{count}} เคสใกล้เคียง", { count: nearby.length })
                  : category
                    ? t("ไม่พบเคสประเภทเดียวกันในรัศมี 100 เมตร")
                    : t("ไม่พบเคสใกล้เคียงในรัศมี 100 เมตร")}
        </p>
      </div>
      {nearbyActionError && <Alert type="error" showIcon message={t(nearbyActionError)} />}
      <List
        className="nearby-issues"
        dataSource={nearby}
        locale={{ emptyText: <span /> }}
        pagination={{
          current: nearbyPage,
          pageSize: 5,
          onChange: setNearbyPage,
          showSizeChanger: false,
          hideOnSinglePage: true,
          responsive: true,
          align: "center",
          locale: { prev_page: t("หน้าก่อนหน้า"), next_page: t("หน้าถัดไป") },
        }}
        renderItem={(r) => (
          <List.Item key={r.id}>
            <Card className="nearby-issue" size="small">
              <div className="nearby-issue-heading">
                <Text strong>{categoryLabel(r.category_name)}</Text>
                <Tag color={r.status === "NEW" ? "orange" : "blue"}>
                  {t(statusNames[r.status] || r.status)}
                </Tag>
              </div>
              <Text type="secondary">#{r.id.slice(0, 8).toUpperCase()}</Text>
              {r.mock && <Tag>{t("MOCK · ข้อมูลจำลอง")}</Tag>}
              <CommunityActions
                item={r as any}
                disabled={nearbyBusy || !!nearbyAction}
                voting={nearbyAction?.id === r.id && nearbyAction?.type === "vote"}
                following={nearbyAction?.id === r.id && nearbyAction?.type === "follow"}
                onDetails={() => setNearbyDetail(r.id)}
                onVote={() => void updateNearby(r, "vote")}
                onFollow={() => void updateNearby(r, "follow")}
              />
            </Card>
          </List.Item>
        )}
      />
    </>
  );
  if (receipt)
    return (
      <div className="report-wizard report-receipt">
        <div className="receipt-check">
          <CheckOutlined />
        </div>
        <Title level={2}>{t("บันทึกคำร้องแล้ว")}</Title>
        <Card className="receipt-card">
          <Text className="eyebrow">{t("เลขรับเรื่อง")}</Text>
          <Title level={3}>#{receipt.id.slice(0, 8).toUpperCase()}</Title>
          <Text strong>{receipt.category}</Text>
          <p>{receipt.address}</p>
        </Card>
        <Button type="primary" block size="large" onClick={() => onDone(receipt.id)}>
          {t("ติดตามเรื่องนี้")}
        </Button>
        <Button
          block
          style={{ marginTop: 12 }}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(receipt.id);
              message.success(t("คัดลอกเลขเรื่องแล้ว"));
            } catch {
              message.info(receipt.id);
            }
          }}
        >
          {t("คัดลอกเลขเรื่อง")}
        </Button>
      </div>
    );
  return (
    <div className="report-wizard">
      <ol className="report-stepper" aria-label={t("ขั้นตอนแจ้งปัญหา")}>
        {["จุดเกิดเหตุ", "รายละเอียดปัญหา"].map((label, i) => (
          <li
            key={label}
            aria-current={step === i ? "step" : undefined}
            className={i <= step ? "active" : ""}
          >
            {i + 1} {t(label)}
          </li>
        ))}
      </ol>
      {error && <Alert type="error" showIcon message={t(error)} style={{ marginBottom: 16 }} />}
      <Modal
        title={t("ยืนยันตำแหน่งจุดเกิดเหตุ")}
        open={!!locationConfirmation}
        okText={t("ยืนยันตำแหน่ง")}
        cancelText={t("กลับไปแก้ไข")}
        maskClosable={false}
        onCancel={() => setLocationConfirmation(undefined)}
        onOk={() => {
          setLocationConfirmation(undefined);
          setStep(1);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
      >
        <p>{t("กรุณาตรวจสอบว่าจุดเกิดเหตุอยู่ที่สถานที่นี้ก่อนดำเนินการต่อ")}</p>
        <Text strong>{t("สถานที่ / จุดสังเกต")}</Text>
        <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
          {locationConfirmation?.address}
        </p>
        <Text strong>{t("พิกัดจุดเกิดเหตุ")}</Text>
        <p>
          {locationConfirmation?.point
            ? `${locationConfirmation.point[0].toFixed(6)}, ${locationConfirmation.point[1].toFixed(6)}`
            : t("ยังไม่ได้ปักหมุด ใช้ที่อยู่ที่ระบุด้านบน")}
        </p>
      </Modal>
      <Form form={form} layout="vertical" preserve>
        <div hidden={step !== 0}>
          <Title level={2}>{t("เกิดเหตุที่ไหน?")}</Title>
          <Text type="secondary">{category && categoryLabel(category.name)}</Text>
          <label className="control-label" htmlFor="place-query">
            {t("ค้นหาชื่อสถานที่ หรือพิกัด")}
          </label>
          <Input
            id="place-query"
            placeholder={t("เช่น วัด โรงเรียน ตลาด หรือ 13.75, 100.50")}
            value={placeQuery}
            onChange={(e) => {
              setPlaceQuery(e.target.value);
              searchVersion.current++;
              setSearching(false);
              setPlaces([]);
              setSearchNotice("");
              setSelectedPlace(undefined);
            }}
            onPressEnter={(e) => {
              e.preventDefault();
              searchPlace();
            }}
            maxLength={200}
          />
          <Button
            block
            style={{ margin: "10px 0 18px" }}
            onClick={searchPlace}
            loading={searching}
            disabled={!placeQuery.trim()}
          >
            {t("ค้นหา")}
          </Button>
          <div aria-live="polite" aria-busy={searching}>
            {searchNotice && (
              <Alert type="info" showIcon message={t(searchNotice)} style={{ marginBottom: 16 }} />
            )}
            {showPlaces && places.length > 0 && (
              <section aria-label={t("ผลการค้นหาสถานที่")} style={{ marginBottom: 18 }}>
                <Text strong>
                  {t("พบ {{count}} สถานที่ — เลือกจุดเกิดเหตุ", { count: places.length })}
                </Text>
                <List
                  dataSource={places}
                  rowKey="place_id"
                  renderItem={(place) => (
                    <List.Item>
                      <Button
                        block
                        type={selectedPlace === place.place_id ? "primary" : "default"}
                        aria-pressed={selectedPlace === place.place_id}
                        onClick={() => choosePlace(place)}
                        style={{
                          height: "auto",
                          whiteSpace: "normal",
                          textAlign: "left",
                          padding: 12,
                        }}
                        icon={<EnvironmentOutlined />}
                      >
                        {place.display_name}
                        {selectedPlace === place.place_id && t(" ✓ เลือกแล้ว")}
                      </Button>
                    </List.Item>
                  )}
                />
                <Text type="secondary">{t("ข้อมูลสถานที่ © OpenStreetMap contributors")}</Text>
              </section>
            )}
          </div>
          <Button
            block
            type="primary"
            icon={<EnvironmentOutlined />}
            loading={geo.busy}
            onClick={async () => {
              if (geo.declined) return geo.reviewConsent();
              const p = await geo.request();
              if (p) {
                manual.current = false;
                selectPoint(p);
              }
            }}
          >
            {t("ตำแหน่งของฉัน")}
          </Button>
          {geo.error && (
            <Alert
              type="info"
              message={t(geo.error)}
              style={{ marginTop: 12 }}
              action={
                geo.declined && (
                  <Button size="small" onClick={geo.reviewConsent}>
                    {t("ทบทวนความยินยอม")}
                  </Button>
                )
              }
            />
          )}
          <Text className="map-help">
            {t("แตะบนแผนที่เพื่อย้ายหมุดให้ตรงจุดเกิดเหตุ หรือกรอกที่อยู่เอง")}
          </Text>
          {step === 0 && (
            <LocationMap
              value={position}
              radiusMeters={100}
              points={nearby.map((r) => ({
                id: r.id,
                ...insideRadius(position, [Number(r.latitude), Number(r.longitude)], 100),
                status: r.status,
                categoryName: r.category_name,
              }))}
              onChange={(p) => {
                manual.current = false;
                selectPoint(p);
              }}
            />
          )}
          <Form.Item
            label={t("สถานที่ / จุดสังเกต")}
            name="address"
            rules={[
              { required: true, whitespace: true, message: t("กรุณาระบุสถานที่หรือจุดสังเกต") },
              { max: 1000 },
            ]}
            extra={
              addressLoading ? (
                <span role="status">{t("กำลังค้นหาที่อยู่…")}</span>
              ) : addressNotice ? (
                <Space wrap>
                  <span role="status">{t(addressNotice)}</span>
                  <Button
                    size="small"
                    onClick={() => {
                      manual.current = false;
                      setAddressRevision((v) => v + 1);
                    }}
                  >
                    {t("ค้นหาที่อยู่อีกครั้ง")}
                  </Button>
                </Space>
              ) : undefined
            }
          >
            <Input.TextArea
              rows={3}
              placeholder={t("ชื่อสถานที่ ถนน ซอย หรือจุดสังเกต")}
              onChange={() => {
                manual.current = true;
                setAddressLoading(false);
                setAddressNotice("");
              }}
            />
          </Form.Item>
          <details className="coordinate-details">
            <summary>{t("ดูหรือแก้ไขพิกัด GPS")}</summary>
            <Space>
              <InputNumber
                aria-label={t("ละติจูด")}
                min={-90}
                max={90}
                value={position?.[0]}
                onChange={(v) => {
                  if (v !== null) {
                    manual.current = false;
                    selectPoint([Number(v), position?.[1] ?? 100.5]);
                  }
                }}
              />
              <InputNumber
                aria-label={t("ลองจิจูด")}
                min={-180}
                max={180}
                value={position?.[1]}
                onChange={(v) => {
                  if (v !== null) {
                    manual.current = false;
                    selectPoint([position?.[0] ?? 13.75, Number(v)]);
                  }
                }}
              />
            </Space>
          </details>
          {step === 0 && nearbyList}
          <CommunityDetail id={nearbyDetail} onClose={() => setNearbyDetail(undefined)} />
        </div>
        <div hidden={step !== 1}>
          <Title level={2}>{t("รายละเอียดปัญหา")}</Title>
          <section aria-label={t("ประเภทปัญหา")}>
            <Title level={2}>{t("พบปัญหาอะไร?")}</Title>
            <label className="control-label" htmlFor="category-query">
              {t("ค้นหาประเภทปัญหา")}
            </label>
            <Input.Search
              id="category-query"
              placeholder={t("เช่น ขยะ น้ำท่วม ไฟส่องสว่าง หรืออื่น ๆ")}
              enterButton={t("ค้นหา")}
              allowClear
              value={categoryQuery}
              onChange={(e) => {
                setCategoryQuery(e.target.value);
                if (!e.target.value) {
                  setCategorySearch("");
                  setCategoryPage(1);
                }
              }}
              onSearch={(value) => {
                setCategorySearch(value.trim());
                setCategoryPage(1);
              }}
              onPressEnter={(e) => e.preventDefault()}
            />
            <p aria-live="polite">
              {categorySearch
                ? t("พบ {{count}} ประเภทปัญหา", { count: filteredCategories.length })
                : t("ทั้งหมด {{count}} ประเภทปัญหา", { count: categories.length })}
            </p>
            <div className="report-categories" id="report-category-options">
              {visibleCategories.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  aria-pressed={category?.id === c.id}
                  onClick={() => {
                    const currentTitle = form.getFieldValue("title");
                    if (!currentTitle?.trim() || currentTitle === category?.name)
                      form.setFieldValue("title", c.name);
                    setCategory(c);
                    pickSymptoms(
                      symptoms.filter((symptom) => reportSymptoms(c.name).includes(symptom)),
                    );
                    setNearby([]);
                  }}
                >
                  <span>{icons[categories.indexOf(c) % icons.length]}</span>
                  {categoryLabel(c.name)}
                </button>
              ))}
            </div>
            {filteredCategories.length === 0 && (
              <Alert
                type="info"
                showIcon
                message={t("ไม่พบประเภทปัญหา ลองใช้คำอื่น หรือล้างคำค้นแล้วเลือกหมวดอื่น ๆ")}
              />
            )}
            <Pagination
              current={categoryPage}
              pageSize={categoryPageSize}
              total={filteredCategories.length}
              onChange={setCategoryPage}
              showSizeChanger={false}
              hideOnSinglePage
              responsive
              locale={{ prev_page: t("หน้าก่อนหน้า"), next_page: t("หน้าถัดไป") }}
              style={{ marginBottom: 20 }}
            />
          </section>
          {step === 1 && category && (nearbyBusy || nearby.length > 0) && (
            <section className="duplicate-hint" aria-label={t("อาจเป็นเรื่องเดียวกัน")}>
              <Alert
                type="warning"
                showIcon
                message={t("อาจเป็นเรื่องเดียวกับที่มีคนแจ้งแล้ว")}
                description={t(
                  "มีเรื่องประเภทเดียวกันใกล้จุดนี้ ถ้าเป็นปัญหาเดียวกัน กดติดตามหรือโหวตแทนการแจ้งซ้ำได้",
                )}
              />
              {nearbyList}
            </section>
          )}

          <div className="report-context">
            <strong>{category && categoryLabel(category.name)}</strong>
            <p>{address}</p>
          </div>
          {category && (
            <section className="symptom-picker" aria-label={t("อาการที่พบ")}>
              <Text strong>{t("อาการที่พบ (แตะเลือกได้หลายข้อ ไม่บังคับ)")}</Text>
              <div className="symptom-options">
                {reportSymptoms(category.name).map((symptom) => (
                  <Tag.CheckableTag
                    key={symptom}
                    checked={symptoms.includes(symptom)}
                    onChange={(checked) =>
                      pickSymptoms(
                        checked ? [...symptoms, symptom] : symptoms.filter((s) => s !== symptom),
                      )
                    }
                  >
                    {t(symptom)}
                  </Tag.CheckableTag>
                ))}
              </div>
            </section>
          )}
          <Form.Item
            label={t("หัวข้อปัญหา (ไม่บังคับ)")}
            name="title"
            rules={[{ max: 200 }]}
            extra={t("ถ้าไม่กรอก ระบบจะใช้ชื่อประเภทปัญหาเป็นหัวข้อ")}
          >
            <Input placeholder={t("สรุปปัญหาที่พบ")} />
          </Form.Item>
          <Form.Item
            label={t("รายละเอียด")}
            name="description"
            rules={[
              {
                required: step === 1,
                whitespace: true,
                message: t("กรุณากรอกรายละเอียด หรือแตะเลือกอาการที่พบ"),
              },
              { max: 19000 },
            ]}
          >
            <Input.TextArea rows={3} placeholder={reportDescriptionExample(category?.name, t)} />
          </Form.Item>
          {fields.map((f) => (
            <Form.Item
              key={f.key}
              label={f.label}
              name={["answers", f.key]}
              rules={[{ required: step === 1 && f.required, max: 4000 }]}
            >
              <Input />
            </Form.Item>
          ))}
          <div ref={attachmentField} />
          <Form.Item
            label={t("ภาพ วิดีโอ หรือเอกสารประกอบ")}
            required
            validateStatus={attachmentMissing ? "error" : undefined}
            help={attachmentMissing ? t("กรุณาแนบหลักฐานอย่างน้อย 1 ไฟล์") : undefined}
          >
            <Upload
              accept="image/jpeg,image/png"
              capture="environment"
              showUploadList={false}
              beforeUpload={addAttachment}
            >
              <Button icon={<CameraOutlined />}>{t("ถ่ายรูปด้วยกล้อง")}</Button>
            </Upload>
            {canRecordVideo() && (
              <Button icon={<VideoCameraOutlined />} onClick={() => setRecording(true)}>
                {t("ถ่ายวิดีโอ (ไม่เกิน 60 วินาที)")}
              </Button>
            )}
            <VideoRecorder
              open={recording}
              onClose={() => setRecording(false)}
              onRecorded={addAttachment}
            />
            <Upload
              multiple
              accept={ATTACHMENT_ACCEPT}
              listType="picture"
              fileList={files.map((f) => {
                const uid = (f as File & { uid?: string }).uid || f.name;
                return {
                  uid,
                  name: f.name,
                  size: f.size,
                  type: f.type,
                  status: "done" as const,
                  url: previews[uid],
                  thumbUrl: f.type.startsWith("image/") ? previews[uid] : undefined,
                };
              })}
              beforeUpload={addAttachment}
              onRemove={(file) => {
                pendingFiles.current = pendingFiles.current.filter(
                  (f) => (f as File & { uid?: string }).uid !== file.uid,
                );
                setFiles(pendingFiles.current);
                setAttachmentMissing(pendingFiles.current.length === 0);
                return true;
              }}
            >
              <Button icon={<UploadOutlined />}>{t("แนบภาพ วิดีโอ หรือเอกสาร")}</Button>
            </Upload>
            <Text type="secondary">
              {t("ต้องแนบอย่างน้อย 1 ไฟล์ —")}
              {t(ATTACHMENT_HELP)}
            </Text>
            <p aria-live="polite">
              {t("ขนาดรวมที่เลือก:")}{" "}
              {(files.reduce((total, f) => total + f.size, 0) / 1_000_000).toFixed(1)} /{" "}
              {MAX_ATTACHMENT_BYTES / 1_000_000} MB
            </p>
            <Alert
              className="media-privacy-note"
              type="info"
              showIcon
              message={t(
                "ภาพและวิดีโออาจติดใบหน้า ทะเบียนรถ หรือบ้านเลขที่ของผู้อื่น กรุณาถ่ายเฉพาะจุดเกิดเหตุเท่าที่จำเป็น",
              )}
            />
          </Form.Item>
          <Title level={5}>{t("ข้อมูลติดต่อผู้แจ้ง")}</Title>
          <Alert
            className="contact-privacy-note"
            type="success"
            showIcon
            icon={<SafetyCertificateOutlined />}
            message={t("ข้อมูลส่วนตัวของคุณจะไม่ถูกเผยแพร่")}
            description={t(
              "ชื่อ เบอร์โทร และอีเมลจะเห็นได้เฉพาะเจ้าหน้าที่ที่รับผิดชอบเรื่องนี้ เพื่อติดต่อกลับเท่านั้น ไม่แสดงต่อประชาชนคนอื่น ตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562",
            )}
          />
          <Form.Item
            label={t("ชื่อ–นามสกุล (ไม่บังคับ)")}
            name="contactName"
            rules={[{ max: 200 }]}
          >
            <Input placeholder={t("เช่น สมชาย ใจดี")} autoComplete="name" />
          </Form.Item>
          <Form.Item
            label={t("เบอร์ติดต่อ (ไม่บังคับ)")}
            name="contactPhone"
            normalize={(value: string) => value.replace(/\D/g, "").slice(0, 10)}
            rules={[
              {
                pattern: /^0\d{8,9}$/,
                message: t("เบอร์โทรต้องขึ้นต้นด้วย 0 และมี 9–10 หลัก"),
              },
            ]}
          >
            <Input
              placeholder={t("เช่น 0812345678")}
              inputMode="numeric"
              autoComplete="tel"
              maxLength={10}
            />
          </Form.Item>
          <ReporterEmail />
        </div>
        <div className="wizard-actions">
          {step > 0 && (
            <Button
              aria-label={t("ย้อนกลับ")}
              icon={<ArrowLeftOutlined />}
              disabled={busy}
              onClick={() => setStep((v) => v - 1)}
            >
              {t("ย้อนกลับ")}
            </Button>
          )}
          {step < 1 ? (
            <Button block type="primary" onClick={next}>
              {t("ถัดไป")}
            </Button>
          ) : (
            <Button block type="primary" loading={busy} onClick={submit}>
              {t("ส่งคำร้อง")}
            </Button>
          )}
        </div>
      </Form>
    </div>
  );
}
