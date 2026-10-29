import { useGeo } from "./GeoContext";
import { useEffect, useState } from "react";
import {
  App,
  Alert,
  Button,
  Card,
  Empty,
  List,
  Select,
  Space,
  Tag,
  Typography,
} from "antd";
import {
  EnvironmentOutlined,
  PlusOutlined,
  AimOutlined,
  FileTextOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
} from "@ant-design/icons";
import { api, post, statusNames } from "./api";
import LocationMap from "./LocationMap";
type D = Record<string, any>;
const { Title, Text } = Typography;
export default function CitizenHome({
  onNew,
  onTrack,
  onFollowing,
}: {
  onNew: () => void;
  onTrack: () => void;
  onFollowing: () => void;
}) {
  const geo = useGeo();
  const [catalog, setCatalog] = useState<D>(),
    [stats, setStats] = useState<D>(),
    [category, setCategory] = useState<string>(),
    [point, setPoint] = useState<[number, number] | undefined>(geo.point),
    [nearby, setNearby] = useState<D[]>([]),
    [searched, setSearched] = useState(false),
    [busy, setBusy] = useState(false),
    [locating, setLocating] = useState(false),
    [error, setError] = useState("");
  const { message } = App.useApp();
  useEffect(() => {
    let alive = true;
    Promise.all([api<D>("/catalog"), api<D>("/complaints?size=1")])
      .then(([c, s]) => {
        if (alive) {
          setCatalog(c);
          setCategory(c.categories[0]?.id);
          setStats(s.stats);
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, []);
  const selectPoint = (p: [number, number]) => {
    setPoint(p);
    setSearched(false);
    setNearby([]);
  };
  async function search(p = point) {
    if (!p || !category) {
      message.info("เลือกตำแหน่งบนแผนที่และประเภทปัญหาก่อน");
      return;
    }
    setBusy(true);
    setError("");
    try {
      setNearby(
        await api(
          "/nearby?categoryId=" +
            category +
            "&latitude=" +
            p[0] +
            "&longitude=" +
            p[1],
        ),
      );
      setSearched(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (geo.point && !point) {
      selectPoint(geo.point);
    }
  }, [geo.point]);
  async function locate() {
    setLocating(true);
    const p = await geo.request();
    setLocating(false);
    if (p) {
      selectPoint(p);
      void search(p);
    } else setError("ไม่สามารถใช้ GPS ได้ กรุณาปักหมุดเอง");
  }

  return (
    <div className="community-home">
      <div className="page-heading community-heading">
        <div>
          <Text className="eyebrow">ชุมชน · TOWNTRACK</Text>
          <Title level={2}>ภาพรวมการดำเนินงาน</Title>
          <p className="community-lead">มองเห็นปัญหา ร่วมดูแลชุมชน</p>
          <Text type="secondary">
            แจ้งปัญหาใกล้ตัว และติดตามการแก้ไขในที่เดียว
          </Text>
        </div>
        <Button
          type="primary"
          size="large"
          icon={<PlusOutlined />}
          onClick={onNew}
        >
          แจ้งปัญหา
        </Button>
      </div>
      <div className="community-metrics">
        {[
          [FileTextOutlined, "คำร้องของฉัน", stats?.total || 0],
          [ClockCircleOutlined, "กำลังดำเนินการ", stats?.in_progress || 0],
          [CheckCircleOutlined, "ปิดเรื่องแล้ว", stats?.closed || 0],
        ].map(([Icon, label, value]) => {
          const Symbol = Icon as typeof FileTextOutlined;
          return (
            <div key={String(label)}>
              <span className="metric-symbol">
                <Symbol />
              </span>
              <strong>{String(value)}</strong>
              <span>{String(label)}</span>
            </div>
          );
        })}
      </div>
      <div className="citizen-notice">
        <EnvironmentOutlined />
        <span>
          ค้นหาปัญหาประเภทเดียวกันในรัศมี <strong>100 เมตร</strong>{" "}
          โดยไม่เปิดเผยชื่อและข้อมูลส่วนตัวของผู้แจ้ง
        </span>
      </div>
      {error && (
        <Alert
          type="warning"
          showIcon
          message={error}
          closable
          onClose={() => setError("")}
          style={{ margin: "16px 0" }}
        />
      )}
      <div className="community-toolbar">
        <Space wrap>
          <Text strong>ประเภทปัญหา</Text>
          <Select
            aria-label="ประเภทปัญหาที่ค้นหา"
            value={category}
            style={{ minWidth: 200 }}
            options={catalog?.categories.map((c: D) => ({
              value: c.id,
              label: c.name,
            }))}
            onChange={(value) => {
              setCategory(value);
              setNearby([]);
              setSearched(false);
            }}
          />
          <Button
            aria-label="ใช้ตำแหน่งของฉัน"
            icon={<AimOutlined />}
            loading={locating}
            onClick={locate}
          >
            ใช้ตำแหน่งของฉัน
          </Button>
          <Button
            type="primary"
            loading={busy}
            disabled={!point || !category}
            onClick={() => search()}
          >
            ค้นหารอบจุดนี้
          </Button>
        </Space>
        <Button onClick={onFollowing}>เรื่องที่ติดตาม</Button>
      </div>
      <div className="community-explorer">
        <Card
          className="community-map-panel"
          title="ปัญหาบนแผนที่"
          extra={<Text type="secondary">แตะเพื่อเลือกตำแหน่ง</Text>}
        >
          <LocationMap
            value={point}
            onChange={selectPoint}
            points={nearby.map((item) => ({
              id: item.id,
              latitude: Number(item.latitude),
              longitude: Number(item.longitude),
              status: item.status,
            }))}
          />
          <div className="map-caption">
            {point
              ? "จุดค้นหา " + point[0].toFixed(5) + ", " + point[1].toFixed(5)
              : "เลือกตำแหน่งเอง หรืออนุญาตให้ใช้ GPS เพื่อค้นหาเคสใกล้คุณ"}
          </div>
          <div className="map-legend">
            <span>
              <i className="legend-dot orange" />
              รอรับเรื่อง
            </span>
            <span>
              <i className="legend-dot blue" />
              กำลังดำเนินการ
            </span>
            <span>
              <i className="legend-dot green" />
              จุดที่เลือก
            </span>
          </div>
        </Card>
        <section className="community-results">
          <div className="row-title">
            <Title level={4}>รายการปัญหาใกล้คุณ</Title>
            <Tag color="green">{nearby.length} เรื่อง</Tag>
          </div>
          {nearby.length ? (
            <List
              loading={busy}
              dataSource={nearby}
              renderItem={(item) => (
                <Card className="community-issue" key={item.id}>
                  <div className="issue-top">
                    <span className="issue-category-icon">
                      <EnvironmentOutlined />
                    </span>
                    <Tag color={item.status === "NEW" ? "orange" : "blue"}>
                      {statusNames[item.status]}
                    </Tag>
                  </div>
                  <Title level={4}>{item.category_name}</Title>
                  <Text type="secondary">
                    #{item.id.slice(0, 8).toUpperCase()} · อยู่ในรัศมีค้นหา 100
                    เมตร
                  </Text>
                  <div className="issue-privacy">
                    แสดงเฉพาะข้อมูลสรุปเพื่อรักษาความเป็นส่วนตัวของผู้แจ้ง
                  </div>
                  <Button
                    block
                    onClick={async () => {
                      try {
                        await post("/complaints/" + item.id + "/follow", {
                          categoryId: category,
                          latitude: point![0],
                          longitude: point![1],
                        });
                        message.success("ติดตามความคืบหน้าเรื่องนี้แล้ว");
                      } catch (e) {
                        message.error((e as Error).message);
                      }
                    }}
                  >
                    ติดตามความคืบหน้า
                  </Button>
                </Card>
              )}
            />
          ) : (
            <Card className="nearby-empty">
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  searched
                    ? "ไม่พบปัญหาประเภทนี้ในรัศมี 100 เมตร"
                    : "เลือกตำแหน่งเพื่อดูปัญหาใกล้คุณ"
                }
              />
              <Text type="secondary">
                หากเป็นปัญหาใหม่ คุณสามารถแจ้งเรื่องให้เทศบาลตรวจสอบได้
              </Text>
            </Card>
          )}
          <Button block style={{ marginTop: 16 }} onClick={onTrack}>
            ดูคำร้องของฉันทั้งหมด
          </Button>
        </section>
      </div>
    </div>
  );
}
