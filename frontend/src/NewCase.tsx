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
  EnvironmentOutlined,
  UploadOutlined,
  CheckOutlined,
  ArrowLeftOutlined,
} from "@ant-design/icons";
import { api, post, statusNames } from "./api";
import { useGeo } from "./GeoContext";
import LocationMap from "./LocationMap";
import CommunityActions from "./CommunityActions";
import CommunityDetail from "./CommunityDetail";
import { ATTACHMENT_ACCEPT, ATTACHMENT_HELP, attachmentError } from "./attachments";
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
export default function NewCase({ onDone }: { onDone: (id: string) => void }) {
  const geo = useGeo();
  const submissionKey = useRef(crypto.randomUUID());
  const [form] = Form.useForm();
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
    position && step === 0
      ? `/nearby?latitude=${position[0]}&longitude=${position[1]}${category ? `&categoryId=${category.id}` : ""}`
      : undefined;
  const nearbyContext = useRef(nearbyUrl);
  nearbyContext.current = nearbyUrl;
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
  const { message } = App.useApp();
  const manual = useRef(false);
  const filteredCategories = categories.filter((c) =>
    c.name.toLocaleLowerCase("th").includes(categorySearch.toLocaleLowerCase("th")),
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
      message.info("กรุณาเลือกประเภทปัญหา");
      return;
    }
    try {
      await form.validateFields();
    } catch {
      return;
    }
    if (!files.length) {
      setAttachmentMissing(true);
      message.error("กรุณาแนบหลักฐานอย่างน้อย 1 ไฟล์");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const v = form.getFieldsValue(true);
      const payload = {
        categoryId: category!.id,
        title: v.title,
        description: v.description,
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
  if (receipt)
    return (
      <div className="report-wizard report-receipt">
        <div className="receipt-check">
          <CheckOutlined />
        </div>
        <Title level={2}>บันทึกคำร้องแล้ว</Title>
        <Text type="secondary">เทศบาลจะตรวจสอบและดำเนินการตามขั้นตอน</Text>
        <Card className="receipt-card">
          <Text className="eyebrow">เลขรับเรื่อง</Text>
          <Title level={3}>#{receipt.id.slice(0, 8).toUpperCase()}</Title>
          <Text strong>{receipt.category}</Text>
          <p>{receipt.address}</p>
        </Card>
        <Button type="primary" block size="large" onClick={() => onDone(receipt.id)}>
          ติดตามเรื่องนี้
        </Button>
        <Button
          block
          style={{ marginTop: 12 }}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(receipt.id);
              message.success("คัดลอกเลขเรื่องแล้ว");
            } catch {
              message.info(receipt.id);
            }
          }}
        >
          คัดลอกเลขเรื่อง
        </Button>
      </div>
    );
  return (
    <div className="report-wizard">
      <Text className="eyebrow" style={{ display: "block" }}>
        แจ้งปัญหาในชุมชน
      </Text>
      <ol className="report-stepper" aria-label="ขั้นตอนแจ้งปัญหา">
        {["จุดเกิดเหตุ", "รายละเอียดปัญหา"].map((label, i) => (
          <li
            key={label}
            aria-current={step === i ? "step" : undefined}
            className={i <= step ? "active" : ""}
          >
            {i + 1} {label}
          </li>
        ))}
      </ol>
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
      <Modal
        title="ยืนยันตำแหน่งจุดเกิดเหตุ"
        open={!!locationConfirmation}
        okText="ยืนยันตำแหน่ง"
        cancelText="กลับไปแก้ไข"
        maskClosable={false}
        onCancel={() => setLocationConfirmation(undefined)}
        onOk={() => {
          setLocationConfirmation(undefined);
          setStep(1);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
      >
        <p>กรุณาตรวจสอบว่าจุดเกิดเหตุอยู่ที่สถานที่นี้ก่อนดำเนินการต่อ</p>
        <Text strong>สถานที่ / จุดสังเกต</Text>
        <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
          {locationConfirmation?.address}
        </p>
        <Text strong>พิกัดจุดเกิดเหตุ</Text>
        <p>
          {locationConfirmation?.point
            ? `${locationConfirmation.point[0].toFixed(6)}, ${locationConfirmation.point[1].toFixed(6)}`
            : "ยังไม่ได้ปักหมุด ใช้ที่อยู่ที่ระบุด้านบน"}
        </p>
      </Modal>
      <Form form={form} layout="vertical" preserve>
        <div hidden={step !== 0}>
          <Title level={2}>เกิดเหตุที่ไหน?</Title>
          <Text type="secondary">{category?.name}</Text>
          <label className="control-label" htmlFor="place-query">
            ค้นหาชื่อสถานที่ หรือพิกัด
          </label>
          <Input
            id="place-query"
            placeholder="เช่น วัด โรงเรียน ตลาด หรือ 13.75, 100.50"
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
            ค้นหา
          </Button>
          <div aria-live="polite" aria-busy={searching}>
            {searchNotice && (
              <Alert type="info" showIcon message={searchNotice} style={{ marginBottom: 16 }} />
            )}
            {showPlaces && places.length > 0 && (
              <section aria-label="ผลการค้นหาสถานที่" style={{ marginBottom: 18 }}>
                <Text strong>พบ {places.length} สถานที่ — เลือกจุดเกิดเหตุ</Text>
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
                        {selectedPlace === place.place_id && " ✓ เลือกแล้ว"}
                      </Button>
                    </List.Item>
                  )}
                />
                <Text type="secondary">ข้อมูลสถานที่ © OpenStreetMap contributors</Text>
              </section>
            )}
          </div>
          <Button
            block
            type="primary"
            icon={<EnvironmentOutlined />}
            loading={geo.busy}
            onClick={async () => {
              const p = await geo.request();
              if (p) {
                manual.current = false;
                selectPoint(p);
              }
            }}
          >
            ตำแหน่งของฉัน
          </Button>
          {geo.error && <Alert type="info" message={geo.error} style={{ marginTop: 12 }} />}
          <Text className="map-help">
            แตะบนแผนที่เพื่อย้ายหมุดให้ตรงจุดเกิดเหตุ หรือกรอกที่อยู่เอง
          </Text>
          {step === 0 && (
            <LocationMap
              value={position}
              radiusMeters={100}
              points={nearby.map((r) => ({
                id: r.id,
                latitude: Number(r.latitude),
                longitude: Number(r.longitude),
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
            label="สถานที่ / จุดสังเกต"
            name="address"
            rules={[
              { required: true, whitespace: true, message: "กรุณาระบุสถานที่หรือจุดสังเกต" },
              { max: 1000 },
            ]}
            extra={
              addressLoading ? (
                <span role="status">กำลังค้นหาที่อยู่…</span>
              ) : addressNotice ? (
                <Space wrap>
                  <span role="status">{addressNotice}</span>
                  <Button
                    size="small"
                    onClick={() => {
                      manual.current = false;
                      setAddressRevision((v) => v + 1);
                    }}
                  >
                    ค้นหาที่อยู่อีกครั้ง
                  </Button>
                </Space>
              ) : undefined
            }
          >
            <Input.TextArea
              rows={3}
              placeholder="ชื่อสถานที่ ถนน ซอย หรือจุดสังเกต"
              onChange={() => {
                manual.current = true;
                setAddressLoading(false);
                setAddressNotice("");
              }}
            />
          </Form.Item>
          <details className="coordinate-details">
            <summary>ดูหรือแก้ไขพิกัด GPS</summary>
            <Space>
              <InputNumber
                aria-label="ละติจูด"
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
                aria-label="ลองจิจูด"
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
          <div role="status" aria-live="polite" style={{ marginTop: 16 }}>
            <Text strong>{category ? "เคสประเภทเดียวกัน" : "เคสใกล้เคียง"}ในรัศมี 100 เมตร</Text>
            <p>
              {!position
                ? "เลือกจุดเกิดเหตุเพื่อค้นหาเคสใกล้เคียงอัตโนมัติ"
                : nearbyBusy
                  ? "กำลังค้นหาเคสใกล้เคียง…"
                  : nearbyError
                    ? nearbyError
                    : nearby.length
                      ? `พบ ${nearby.length} เคสใกล้เคียง`
                      : "ไม่พบเคสใกล้เคียงในรัศมี 100 เมตร"}
            </p>
          </div>
          {nearbyActionError && <Alert type="error" showIcon message={nearbyActionError} />}
          <List
            className="nearby-issues"
            dataSource={nearby}
            locale={{ emptyText: <span /> }}
            renderItem={(r) => (
              <List.Item key={r.id}>
                <Card className="nearby-issue" size="small">
                  <div className="nearby-issue-heading">
                    <Text strong>{r.category_name}</Text>
                    <Tag color={r.status === "NEW" ? "orange" : "blue"}>
                      {statusNames[r.status]}
                    </Tag>
                  </div>
                  <Text type="secondary">#{r.id.slice(0, 8).toUpperCase()}</Text>
                  {r.mock && <Tag>MOCK · ข้อมูลจำลอง</Tag>}
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
          <CommunityDetail id={nearbyDetail} onClose={() => setNearbyDetail(undefined)} />
        </div>
        <div hidden={step !== 1}>
          <Title level={2}>รายละเอียดปัญหา</Title>
          <section aria-label="ประเภทปัญหา">
            <Title level={2}>พบปัญหาอะไร?</Title>
            <Text type="secondary">
              เลือกปัญหาในพื้นที่หรือบริการที่เทศบาลรับผิดชอบ หากไม่ตรงหมวดให้เลือกอื่น ๆ
            </Text>
            <label className="control-label" htmlFor="category-query">
              ค้นหาประเภทปัญหา
            </label>
            <Input.Search
              id="category-query"
              placeholder="เช่น ขยะ น้ำท่วม ไฟส่องสว่าง หรืออื่น ๆ"
              enterButton="ค้นหา"
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
                ? `พบ ${filteredCategories.length} ประเภทปัญหา`
                : `ทั้งหมด ${categories.length} ประเภทปัญหา`}
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
                    setNearby([]);
                  }}
                >
                  <span>{icons[categories.indexOf(c) % icons.length]}</span>
                  {c.name}
                </button>
              ))}
            </div>
            {filteredCategories.length === 0 && (
              <Alert
                type="info"
                showIcon
                message="ไม่พบประเภทปัญหา ลองใช้คำอื่น หรือล้างคำค้นแล้วเลือกหมวดอื่น ๆ"
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
              locale={{ prev_page: "หน้าก่อนหน้า", next_page: "หน้าถัดไป" }}
              style={{ marginBottom: 20 }}
            />
          </section>

          <div className="report-context">
            <strong>{category?.name}</strong>
            <p>{address}</p>
          </div>
          <Title level={5}>ข้อมูลติดต่อผู้แจ้ง</Title>
          <Form.Item label="ชื่อ–นามสกุล (ไม่บังคับ)" name="contactName" rules={[{ max: 200 }]}>
            <Input placeholder="เช่น สมชาย ใจดี" autoComplete="name" />
          </Form.Item>
          <Form.Item
            label="เบอร์ติดต่อ (ไม่บังคับ)"
            name="contactPhone"
            rules={[{ max: 30, pattern: /^[0-9+() -]*$/ }]}
            extra="ใช้สำหรับให้เจ้าหน้าที่ติดต่อกลับ ไม่แสดงต่อประชาชนอื่น"
          >
            <Input placeholder="เช่น 0812345678" inputMode="tel" autoComplete="tel" />
          </Form.Item>
          <Form.Item label="หัวข้อปัญหา" name="title" rules={[{ required: step === 1, max: 200 }]}>
            <Input placeholder="สรุปปัญหาที่พบ" />
          </Form.Item>
          <Form.Item
            label="รายละเอียด"
            name="description"
            rules={[{ required: step === 1, max: 20000 }]}
          >
            <Input.TextArea rows={5} placeholder="เช่น น้ำท่วมสูงประมาณ 20 ซม. รถเล็กผ่านลำบาก" />
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
          <Form.Item
            label="ภาพ วิดีโอ หรือเอกสารประกอบ"
            required
            validateStatus={attachmentMissing ? "error" : undefined}
            help={attachmentMissing ? "กรุณาแนบหลักฐานอย่างน้อย 1 ไฟล์" : undefined}
          >
            <Upload
              multiple
              accept={ATTACHMENT_ACCEPT}
              fileList={files.map((f) => ({
                uid: (f as File & { uid?: string }).uid || f.name,
                name: f.name,
                size: f.size,
                status: "done" as const,
              }))}
              beforeUpload={(file) => {
                const used = pendingFiles.current.reduce((total, f) => total + f.size, 0);
                const problem = attachmentError(file, used);
                if (problem) {
                  message.error(problem);
                  return Upload.LIST_IGNORE;
                }
                setAttachmentMissing(false);
                pendingFiles.current = [...pendingFiles.current, file];
                setFiles(pendingFiles.current);
                return false;
              }}
              onRemove={(file) => {
                pendingFiles.current = pendingFiles.current.filter(
                  (f) => (f as File & { uid?: string }).uid !== file.uid,
                );
                setFiles(pendingFiles.current);
                setAttachmentMissing(pendingFiles.current.length === 0);
                return true;
              }}
            >
              <Button icon={<UploadOutlined />}>แนบภาพ วิดีโอ หรือเอกสาร</Button>
            </Upload>
            <Text type="secondary">ต้องแนบอย่างน้อย 1 ไฟล์ — {ATTACHMENT_HELP}</Text>
            <p aria-live="polite">
              ขนาดรวมที่เลือก:{" "}
              {(files.reduce((total, f) => total + f.size, 0) / 1_000_000).toFixed(1)} / 1,000 MB
            </p>
          </Form.Item>
        </div>
        <div className="wizard-actions">
          {step > 0 && (
            <Button
              aria-label="ย้อนกลับ"
              icon={<ArrowLeftOutlined />}
              disabled={busy}
              onClick={() => setStep((v) => v - 1)}
            >
              ย้อนกลับ
            </Button>
          )}
          {step < 1 ? (
            <Button block type="primary" onClick={next}>
              ถัดไป
            </Button>
          ) : (
            <Button block type="primary" loading={busy} onClick={submit}>
              ส่งคำร้อง
            </Button>
          )}
        </div>
      </Form>
    </div>
  );
}
