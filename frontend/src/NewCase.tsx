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
  Space,
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
type D = Record<string, any>;
const { Title, Text } = Typography;
const icons = ["▧", "≈", "↔", "ϟ", "◉", "♧", "♨", "⚒"];
export default function NewCase({
  onDone,
  onCancel,
}: {
  onDone: (id: string) => void;
  onCancel: () => void;
}) {
  const geo = useGeo();
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
  const saved = useRef<string | undefined>(undefined);
  const { message } = App.useApp();
  const manual = useRef(false);
  const fields: D[] = category ? JSON.parse(category.fields) : [];
  useEffect(() => {
    api<D>("/catalog")
      .then((c) =>
        setCategories(
          [...c.categories].sort((a: D, b: D) => {
            const order = [
              "ถนน",
              "น้ำรั่ว",
              "รถติด",
              "ไฟดับ",
              "น้ำไม่ไหล",
              "ต้นไม้",
              "ไฟไหม้",
              "กระเช้า",
            ];
            const rank = (n: string) => {
              const i = order.findIndex((word) => n.includes(word));
              return i < 0 ? 100 : i;
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
    if (!manual.current)
      form.setFieldValue(
        "address",
        "พิกัด " + p[0].toFixed(6) + ", " + p[1].toFixed(6),
      );
  }
  useEffect(() => {
    if (position && !form.getFieldValue("address"))
      form.setFieldValue(
        "address",
        "พิกัด " + position[0].toFixed(6) + ", " + position[1].toFixed(6),
      );
  }, []);
  useEffect(() => {
    if (!position) return;
    let active = true;
    const timer = setTimeout(() => {
      api<D>(
        "/geocoding/reverse?latitude=" +
          position[0] +
          "&longitude=" +
          position[1],
      )
        .then((r) => {
          if (active && !manual.current && r.display_name)
            form.setFieldValue("address", r.display_name);
        })
        .catch(() => {});
    }, 600);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [position?.[0], position?.[1]]);
  async function next() {
    try {
      if (step === 0) {
        if (!category) {
          message.info("กรุณาเลือกประเภทปัญหา");
          return;
        }
        setStep(1);
      } else {
        await form.validateFields(["address"]);
        setStep(2);
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {}
  }
  async function nearbySearch() {
    if (!category || !position) return;
    try {
      setNearby(
        await api(
          "/nearby?categoryId=" +
            category.id +
            "&latitude=" +
            position[0] +
            "&longitude=" +
            position[1],
        ),
      );
      message.info("ค้นหาในรัศมี 100 เมตรแล้ว");
    } catch (e) {
      message.error((e as Error).message);
    }
  }
  async function searchPlace() {
    const parts = placeQuery.trim().split(/[, ]+/).map(Number);
    if (
      parts.length === 2 &&
      parts.every(Number.isFinite) &&
      Math.abs(parts[0]) <= 90 &&
      Math.abs(parts[1]) <= 180
    ) {
      manual.current = false;
      selectPoint([parts[0], parts[1]]);
      return;
    }
    try {
      const results = await api<D[]>(
        "/geocoding/search?q=" + encodeURIComponent(placeQuery),
      );
      if (!results.length) {
        message.info("ไม่พบสถานที่ กรุณาปักหมุดเอง");
        return;
      }
      const first = results[0];
      manual.current = true;
      setPosition([Number(first.lat), Number(first.lon)]);
      form.setFieldValue("address", first.display_name);
    } catch (e) {
      message.info((e as Error).message);
    }
  }
  async function submit() {
    try {
      await form.validateFields();
    } catch {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const v = form.getFieldsValue(true);
      let id = saved.current;
      if (!id) {
        const result = await post("/complaints", {
          categoryId: category!.id,
          title: v.title,
          description: v.description,
          address: v.address,
          answers: v.answers || {},
          latitude: position?.[0] ?? null,
          longitude: position?.[1] ?? null,
          contactName: v.contactName,
          contactPhone: v.contactPhone,
        });
        id = result.id;
        saved.current = id;
      }
      const failed: File[] = [];
      for (const file of files) {
        try {
          const data = new FormData();
          data.append("file", file);
          await api("/complaints/" + id + "/files", {
            method: "POST",
            body: data,
          });
        } catch {
          failed.push(file);
        }
      }
      setFiles(failed);
      setReceipt({
        id,
        category: category!.name,
        address: v.address,
        partial: failed.length > 0,
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
        {receipt.partial && (
          <Alert
            type="warning"
            showIcon
            message="คำร้องบันทึกแล้ว แต่แนบไฟล์ไม่ครบ กรุณาแนบเพิ่มในหน้ารายละเอียด"
          />
        )}
        <Button
          type="primary"
          block
          size="large"
          onClick={() => onDone(receipt.id)}
        >
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
      <Button
        type="text"
        onClick={onCancel}
        style={{ padding: 0, marginBottom: 16, fontSize: 12 }}
      >
        ยกเลิกและกลับหน้าชุมชน
      </Button>
      <Text className="eyebrow" style={{ display: "block" }}>
        แจ้งปัญหาในชุมชน
      </Text>
      <ol className="report-stepper" aria-label="ขั้นตอนแจ้งปัญหา">
        {["เลือกปัญหา", "จุดเกิดเหตุ", "รายละเอียด"].map((label, i) => (
          <li
            key={label}
            aria-current={step === i ? "step" : undefined}
            className={i <= step ? "active" : ""}
          >
            {i + 1} {label}
          </li>
        ))}
      </ol>
      {error && (
        <Alert
          type="error"
          showIcon
          message={error}
          style={{ marginBottom: 16 }}
        />
      )}
      <Form form={form} layout="vertical" preserve>
        <div hidden={step !== 0}>
          <Title level={2}>พบปัญหาอะไร?</Title>
          <Text type="secondary">แตะเลือกปัญหาที่ใกล้เคียงที่สุด</Text>
          <div className="report-categories">
            {categories.slice(0, 8).map((c, i) => (
              <button
                type="button"
                key={c.id}
                aria-pressed={category?.id === c.id}
                onClick={() => {
                  setCategory(c);
                  setNearby([]);
                }}
              >
                <span>{icons[i % icons.length]}</span>
                {c.name}
              </button>
            ))}
          </div>
          {categories.length > 8 && (
            <details>
              <summary>ปัญหาอื่น ๆ</summary>
              <div className="report-categories">
                {categories.slice(8).map((c) => (
                  <button
                    type="button"
                    key={c.id}
                    aria-pressed={category?.id === c.id}
                    onClick={() => setCategory(c)}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </details>
          )}
        </div>
        <div hidden={step !== 1}>
          <Title level={2}>เกิดเหตุที่ไหน?</Title>
          <Text type="secondary">{category?.name}</Text>
          {category?.name.includes("ฉุกเฉิน") && (
            <Alert
              type="warning"
              message="หากมีอันตรายเร่งด่วน โปรดติดต่อหน่วยฉุกเฉินโดยตรง การส่งคำร้องนี้ไม่ใช่การเรียกหน่วยฉุกเฉิน"
              style={{ marginTop: 12 }}
            />
          )}
          <label className="control-label" htmlFor="place-query">
            ค้นหาชื่อสถานที่ หรือพิกัด
          </label>
          <Input
            id="place-query"
            placeholder="เช่น วัด โรงเรียน ตลาด หรือ 13.75, 100.50"
            value={placeQuery}
            onChange={(e) => setPlaceQuery(e.target.value)}
          />
          <Button block style={{ margin: "10px 0 18px" }} onClick={searchPlace}>
            ค้นหา
          </Button>
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
          {geo.error && (
            <Alert type="info" message={geo.error} style={{ marginTop: 12 }} />
          )}
          <Text className="map-help">
            แตะบนแผนที่เพื่อย้ายหมุดให้ตรงจุดเกิดเหตุ หรือกรอกที่อยู่เอง
          </Text>
          {step === 1 && (
            <LocationMap
              value={position}
              onChange={(p) => {
                manual.current = false;
                selectPoint(p);
              }}
            />
          )}
          <Form.Item
            label="สถานที่ / จุดสังเกต"
            name="address"
            rules={[{ required: true, max: 1000 }]}
          >
            <Input.TextArea
              rows={3}
              onChange={() => {
                manual.current = true;
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
          <Button
            block
            style={{ marginTop: 16 }}
            disabled={!position}
            onClick={nearbySearch}
          >
            ค้นหาเคสใกล้เคียง 100 เมตร
          </Button>
          <List
            dataSource={nearby}
            locale={{ emptyText: <span /> }}
            renderItem={(r) => (
              <List.Item
                actions={[
                  <Button
                    key="follow"
                    onClick={async () => {
                      try {
                        await post("/complaints/" + r.id + "/follow", {
                          categoryId: category!.id,
                          latitude: position![0],
                          longitude: position![1],
                        });
                        message.success("ติดตามเรื่องแล้ว");
                      } catch (e) {
                        message.error((e as Error).message);
                      }
                    }}
                  >
                    ติดตาม
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  title={r.category_name}
                  description={statusNames[r.status]}
                />
              </List.Item>
            )}
          />
        </div>
        <div hidden={step !== 2}>
          <Title level={2}>เล่าให้เราทราบ</Title>
          <div className="report-context">
            <strong>{category?.name}</strong>
            <p>{address}</p>
          </div>
          <Title level={5}>ข้อมูลติดต่อผู้แจ้ง</Title>
          <Form.Item
            label="ชื่อ–นามสกุล (ไม่บังคับ)"
            name="contactName"
            rules={[{ max: 200 }]}
          >
            <Input placeholder="เช่น สมชาย ใจดี" autoComplete="name" />
          </Form.Item>
          <Form.Item
            label="เบอร์ติดต่อ (ไม่บังคับ)"
            name="contactPhone"
            rules={[{ max: 30, pattern: /^[0-9+() -]*$/ }]}
            extra="ใช้สำหรับให้เจ้าหน้าที่ติดต่อกลับ ไม่แสดงต่อประชาชนอื่น"
          >
            <Input
              placeholder="เช่น 0812345678"
              inputMode="tel"
              autoComplete="tel"
            />
          </Form.Item>
          <Form.Item
            label="หัวข้อปัญหา"
            name="title"
            rules={[{ required: step === 2, max: 200 }]}
          >
            <Input placeholder="สรุปปัญหาที่พบ" />
          </Form.Item>
          <Form.Item
            label="รายละเอียด"
            name="description"
            rules={[{ required: step === 2, max: 20000 }]}
          >
            <Input.TextArea
              rows={5}
              placeholder="เช่น น้ำท่วมสูงประมาณ 20 ซม. รถเล็กผ่านลำบาก"
            />
          </Form.Item>
          {fields.map((f) => (
            <Form.Item
              key={f.key}
              label={f.label}
              name={["answers", f.key]}
              rules={[{ required: step === 2 && f.required, max: 4000 }]}
            >
              <Input />
            </Form.Item>
          ))}
          <Form.Item label="ภาพหรือเอกสารประกอบ">
            <Upload
              multiple
              accept=".png,.jpg,.jpeg,.pdf"
              beforeUpload={(file) => {
                if (file.size > 10 * 1024 * 1024) {
                  message.error("ไฟล์ต้องไม่เกิน 10 MB");
                  return Upload.LIST_IGNORE;
                }
                setFiles((v) => [...v, file]);
                return false;
              }}
              onRemove={(file) => {
                setFiles((v) =>
                  v.filter(
                    (f) => (f as File & { uid?: string }).uid !== file.uid,
                  ),
                );
                return true;
              }}
            >
              <Button icon={<UploadOutlined />}>แนบภาพหรือเอกสาร</Button>
            </Upload>
            <Text type="secondary">PNG, JPEG, PDF ไม่เกิน 10 MB ต่อไฟล์</Text>
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
          {step < 2 ? (
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
