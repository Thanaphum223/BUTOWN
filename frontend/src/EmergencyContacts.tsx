import { useI18n } from "./i18n/useI18n";
import { useEffect, useState } from "react";
import { Alert, Button, Card, Empty, Space, Spin, Tag, Typography } from "antd";
import { AlertOutlined, EnvironmentOutlined, PhoneOutlined } from "@ant-design/icons";
import { api } from "./api";
import { useGeo } from "./GeoContext";
import LocationMap from "./LocationMap";

const { Title, Text } = Typography;
const sources = {
  government: "https://info.go.th/emergency-number",
  disaster: "https://www.disaster.go.th/",
};
const hotlines = [
  {
    number: "1669",
    title: "เจ็บป่วยฉุกเฉิน / รถพยาบาล",
    detail: "สถาบันการแพทย์ฉุกเฉินแห่งชาติ",
    source: sources.government,
  },
  { number: "191", title: "เหตุด่วนเหตุร้าย", detail: "ตำรวจ", source: sources.government },
  {
    number: "199",
    title: "แจ้งเหตุเพลิงไหม้",
    detail: "ดับเพลิงและกู้ภัย",
    source: sources.government,
  },
  {
    number: "1784",
    title: "สาธารณภัย / ขอความช่วยเหลือ",
    detail: "กรมป้องกันและบรรเทาสาธารณภัย",
    source: sources.disaster,
  },
  { number: "1193", title: "ตำรวจทางหลวง", detail: "เหตุบนทางหลวง", source: sources.government },
  {
    number: "1155",
    title: "ตำรวจท่องเที่ยว",
    detail: "ช่วยเหลือนักท่องเที่ยว",
    source: sources.government,
  },
];
const utilities = [
  { number: "1130", title: "การไฟฟ้านครหลวง", detail: "กรุงเทพฯ นนทบุรี สมุทรปราการ" },
  { number: "1129", title: "การไฟฟ้าส่วนภูมิภาค", detail: "พื้นที่อื่นนอกเขตการไฟฟ้านครหลวง" },
  { number: "1125", title: "การประปานครหลวง", detail: "กรุงเทพฯ นนทบุรี สมุทรปราการ" },
  {
    number: "1662",
    title: "การประปาส่วนภูมิภาค",
    detail: "พื้นที่ให้บริการของการประปาส่วนภูมิภาค",
  },
];
const types = [
  { value: "hospital", label: "โรงพยาบาล" },
  { value: "police", label: "สถานีตำรวจ" },
  { value: "fire_station", label: "สถานีดับเพลิง" },
  { value: "clinic", label: "คลินิก / สถานพยาบาล" },
];
type Place = {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  distanceMeters: number;
  phones: string[];
  sourceUrl: string;
  phoneSourceUrl: string;
  phoneCheckedAt: string;
  website: string;
};
export default function EmergencyContacts() {
  const { t } = useI18n();
  const geo = useGeo();
  const [point, setPoint] = useState<[number, number] | undefined>(geo.point);
  const [type, setType] = useState("hospital");
  const radiusKm = 50;
  const [places, setPlaces] = useState<Place[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (geo.point) setPoint((current) => current ?? geo.point);
  }, [geo.point?.[0], geo.point?.[1]]);

  useEffect(() => {
    if (!point) return;
    const controller = new AbortController();
    let active = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    setBusy(true);
    setError("");
    setPlaces([]);
    setSearched(false);
    async function search(attempt = 0) {
      try {
        const result = await api<{ places: Place[] }>(
          `/emergency/nearby?latitude=${point![0]}&longitude=${point![1]}&type=${type}&radiusKm=${radiusKm}`,
          { signal: controller.signal },
        );
        if (active) {
          setPlaces(result.places);
          setSearched(true);
          setBusy(false);
        }
      } catch (e) {
        if (!active) return;
        if (attempt < 2 && (e as Error).message.includes("กรุณารอสักครู่")) {
          retry = setTimeout(() => void search(attempt + 1), 1200);
          return;
        }
        setError((e as Error).message);
        setBusy(false);
      }
    }
    const timer = setTimeout(() => void search(), 1200);
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
      clearTimeout(retry);
    };
  }, [point?.[0], point?.[1], type, radiusKm, refresh]);

  return (
    <div className="emergency-page">
      <Title level={2}>
        <AlertOutlined /> {t("เหตุฉุกเฉิน")}
      </Title>
      <Title level={3}>{t("สายด่วนฉุกเฉิน")}</Title>
      <div className="emergency-hotlines">
        {hotlines.map((line) => (
          <Card key={line.number} size="small">
            <a
              className="emergency-call"
              href={`tel:${line.number}`}
              aria-label={t("โทร {{number}} {{title}}", {
                number: line.number,
                title: t(line.title),
              })}
            >
              <PhoneOutlined />
              <strong>{line.number}</strong>
            </a>
            <Title level={5}>{t(line.title)}</Title>
            <Text type="secondary">{t(line.detail)}</Text>
            <div>
              <a href={line.source} target="_blank" rel="noopener noreferrer">
                {t("ข้อมูลจากหน่วยงานรัฐ")}
              </a>
            </div>
          </Card>
        ))}
      </div>
      <details className="emergency-utilities">
        <summary>{t("ไฟฟ้าและประปา")}</summary>
        <div className="emergency-hotlines">
          {utilities.map((line) => (
            <Card size="small" key={line.number}>
              <a
                href={`tel:${line.number}`}
                className="emergency-call"
                aria-label={t("โทร {{number}} {{title}}", {
                  number: line.number,
                  title: t(line.title),
                })}
              >
                <PhoneOutlined />
                <strong>{line.number}</strong>
              </a>
              <Title level={5}>{t(line.title)}</Title>
              <Text type="secondary">{t(line.detail)}</Text>
            </Card>
          ))}
        </div>
        <a href={sources.government} target="_blank" rel="noopener noreferrer">
          {t("แหล่งข้อมูลหมายเลขสาธารณูปโภค")}
        </a>
      </details>
      <section aria-label={t("สถานที่สำคัญใกล้ฉัน")} className="emergency-nearby">
        <Title level={3}>
          <EnvironmentOutlined /> {t("สถานที่สำคัญใกล้ฉัน")}
        </Title>
        <p>{t("ภายใน 50 กม. จากจุดที่เลือก เรียงตามระยะทางเส้นตรงจากใกล้ไปไกล")}</p>
        {geo.error && (
          <Alert type="info" showIcon message={t(geo.error)} style={{ marginBottom: 12 }} />
        )}
        <details className="emergency-manual-point">
          <summary>{t("เลือกจุดค้นหาบนแผนที่เอง")}</summary>
          <LocationMap value={point || geo.point} onChange={setPoint} />
        </details>
        <Space wrap className="emergency-types">
          {types.map((item) => (
            <Button
              key={item.value}
              type={type === item.value ? "primary" : "default"}
              aria-pressed={type === item.value}
              onClick={() => setType(item.value)}
            >
              {t(item.label)}
            </Button>
          ))}
        </Space>
        <div role="status" aria-live="polite">
          {busy && (
            <p>
              <Spin size="small" /> {t("กำลังค้นหาสถานที่ใกล้เคียง…")}
            </p>
          )}
          {error && (
            <Alert
              type="warning"
              showIcon
              message={t(error)}
              action={<Button onClick={() => setRefresh((v) => v + 1)}>{t("ลองอีกครั้ง")}</Button>}
            />
          )}
          {!point && (
            <p>
              {geo.busy ? (
                <>
                  <Spin size="small" /> {t("กำลังระบุตำแหน่งเพื่อค้นหาสถานที่ใกล้เคียง…")}
                </>
              ) : (
                t("เลือกจุดบนแผนที่เพื่อค้นหาสถานที่และเบอร์ตรงอัตโนมัติ")
              )}
            </p>
          )}
          {searched && !places.length && (
            <Empty
              description={t(
                "ไม่พบข้อมูลในรัศมี {{radius}} กม. เลือกจุดค้นหาใหม่ หรือใช้สายด่วนด้านบน",
                { radius: radiusKm },
              )}
            />
          )}
        </div>
        <div className="emergency-place-list">
          {places.map((place) => (
            <Card
              key={place.id}
              size="small"
              title={place.name}
              extra={
                <Tag>
                  {(place.distanceMeters / 1000).toFixed(1)} {t("กม.")}
                </Tag>
              }
            >
              <p>{place.address}</p>
              {place.phones.length ? (
                <Space wrap>
                  {place.phones.map((phone) => (
                    <Button
                      key={phone}
                      href={`tel:${phone}`}
                      icon={<PhoneOutlined />}
                      aria-label={t("โทรตรง {{place}} {{phone}}", { place: place.name, phone })}
                    >
                      {phone}
                    </Button>
                  ))}
                </Space>
              ) : (
                <Text type="secondary">{t("ยังไม่มีเบอร์ตรงในแหล่งข้อมูล")}</Text>
              )}
              <Space wrap style={{ display: "flex", marginTop: 12 }}>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.latitude},${place.longitude}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t("ดูบนแผนที่")}
                </a>
                <a href={place.phoneSourceUrl} target="_blank" rel="noopener noreferrer">
                  {t("แหล่งข้อมูลติดต่อ")}
                </a>
                {place.website && (
                  <a href={place.website} target="_blank" rel="noopener noreferrer">
                    {t("เว็บไซต์สถานที่")}
                  </a>
                )}
              </Space>
              {place.phoneCheckedAt && (
                <Text type="secondary">
                  {t("ตรวจข้อมูลเบอร์จากเว็บไซต์หน่วยงาน:")}
                  {place.phoneCheckedAt}
                </Text>
              )}
            </Card>
          ))}
        </div>
        <p className="emergency-attribution">
          {t(
            "ข้อมูลสถานที่ © OpenStreetMap contributors · เบอร์ตรงบางแห่งอาจไม่มีข้อมูลหรือมีการเปลี่ยนแปลง",
          )}
        </p>
      </section>
    </div>
  );
}
