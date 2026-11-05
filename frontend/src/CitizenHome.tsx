import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Empty,
  List,
  Pagination,
  Radio,
  Select,
  Space,
  Tag,
  Typography,
} from "antd";
import {
  PictureOutlined,
  FilePdfOutlined,
  PlayCircleOutlined,
  LikeOutlined,
  TrophyOutlined,
  EnvironmentOutlined,
  FileTextOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
} from "@ant-design/icons";
import { api, statusNames } from "./api";
import { useGeo } from "./GeoContext";
import CommunityDetail from "./CommunityDetail";
import CommunityActions from "./CommunityActions";
import LocationMap from "./LocationMap";
type D = Record<string, any>;
const { Title, Text } = Typography;
export default function CitizenHome({
  onTrack,
  onFollowing,
}: {
  onTrack: () => void;
  onFollowing: () => void;
}) {
  const geo = useGeo();
  const [area, setArea] = useState<"nearby" | "municipality">("municipality");
  const municipal = area === "municipality";
  const [point, setPoint] = useState<[number, number] | undefined>(geo.point);
  useEffect(() => {
    if (geo.point) setPoint((p) => p ?? geo.point);
  }, [geo.point]);
  useEffect(() => {
    if (!geo.busy && !geo.point && !point) {
      const c = new AbortController();
      api<{ latitude: number; longitude: number }>("/municipal-center", { signal: c.signal })
        .then((p) => setPoint([p.latitude, p.longitude]))
        .catch((e) => {
          if (!c.signal.aborted) setError(e.message);
        });
      return () => c.abort();
    }
  }, [geo.busy, geo.point, point]);
  const [catalog, setCatalog] = useState<D>();
  const [category, setCategory] = useState<string>();
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<D>();
  const [revision, setRevision] = useState(0);
  const [detailId, setDetailId] = useState<string>();
  const [followingId, setFollowingId] = useState<string>();
  const [voting, setVoting] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    api<D>("/catalog", { signal: controller.signal })
      .then(setCatalog)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!municipal && !point) return;
    const controller = new AbortController();
    setBusy(true);
    setError("");
    api<D>(
      `/community/complaints?scope=${area}${!municipal && point ? `&latitude=${point[0]}&longitude=${point[1]}` : ""}&page=${page - 1}&size=12${category ? `&categoryId=${category}` : ""}`,
      { signal: controller.signal },
    )
      .then(setResult)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [page, category, area, point?.[0], point?.[1], revision]);
  function changeArea(next: "nearby" | "municipality") {
    setArea(next);
    setPage(1);
    setResult(undefined);
    setRevision((v) => v + 1);
  }
  const items: D[] = result?.items || [];
  async function vote(item: D) {
    setVoting(item.id);
    try {
      await api(`/community/complaints/${item.id}/vote`, {
        method: item.voted ? "DELETE" : "POST",
      });
      setRevision((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setVoting(undefined);
    }
  }
  const issueActions = (item: D) => (
    <CommunityActions
      item={item as any}
      disabled={busy || !!voting || !!followingId}
      voting={voting === item.id}
      following={followingId === item.id}
      onDetails={() => setDetailId(item.id)}
      onVote={() => void vote(item)}
      onFollow={async () => {
        setFollowingId(item.id);
        try {
          await api(
            item.following
              ? `/complaints/${item.id}/follow`
              : `/community/complaints/${item.id}/follow`,
            {
              method: item.following ? "DELETE" : "POST",
            },
          );
          setRevision((v) => v + 1);
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setFollowingId(undefined);
        }
      }}
    />
  );
  const statusTag = (item: D) => (
    <Tag color={item.status === "CLOSED" ? "green" : item.status === "NEW" ? "orange" : "blue"}>
      {statusNames[item.status] || item.status}
    </Tag>
  );
  const renderIssue = (item: D) => (
    <Card
      className="community-issue"
      key={item.id}
      cover={
        item.cover ? (
          <button
            className="issue-media-cover"
            onClick={() => setDetailId(item.id)}
            aria-label={`ดูหลักฐาน ${item.category_name}`}
          >
            {item.cover.content_type.startsWith("image/") && item.cover.has_thumbnail ? (
              <img
                loading="lazy"
                src={`/api/media/${item.cover.id}?thumbnail=true`}
                alt={`หลักฐาน ${item.category_name}`}
              />
            ) : (
              <div className="issue-media-placeholder">
                {item.cover.content_type.startsWith("video/") ? (
                  <PlayCircleOutlined />
                ) : item.cover.content_type === "application/pdf" ? (
                  <FilePdfOutlined />
                ) : (
                  <PictureOutlined />
                )}
                <span>
                  {item.cover.content_type.startsWith("video/")
                    ? "เปิดดูวิดีโอหลักฐาน"
                    : item.cover.content_type === "application/pdf"
                      ? "เปิดดูเอกสาร PDF"
                      : "เปิดดูรูปหลักฐาน"}
                </span>
              </div>
            )}
            <span className="issue-media-count">{item.media_count} ไฟล์หลักฐาน</span>
          </button>
        ) : (
          <div className="issue-media-cover issue-media-empty">
            <div className="issue-media-placeholder">
              <PictureOutlined aria-hidden />
              <span>ไม่มีไฟล์แนบ</span>
            </div>
          </div>
        )
      }
    >
      <div className="issue-top">
        <span className="issue-category-icon">
          <EnvironmentOutlined />
        </span>
        {statusTag(item)}
      </div>
      <Title level={4}>{item.category_name}</Title>
      <Text type="secondary">
        #{item.id.slice(0, 8).toUpperCase()} ·{" "}
        {new Date(item.created_at).toLocaleDateString("th-TH")}
      </Text>
      <div className="issue-card-footer">
        {item.mock ? <Tag>MOCK · ข้อมูลจำลอง</Tag> : <span />}
      </div>
      {issueActions(item)}
    </Card>
  );
  return (
    <div className="community-home">
      <CommunityDetail id={detailId} onClose={() => setDetailId(undefined)} />
      <div className="page-heading community-heading">
        <div>
          <Text className="eyebrow">ชุมชน · TOWNTRACK</Text>
          <Title level={2}>{municipal ? "เรื่องแจ้งในเทศบาล" : "เรื่องแจ้งใกล้จุดที่เลือก"}</Title>
        </div>
      </div>
      <div className="community-area-control">
        <Radio.Group
          aria-label="พื้นที่ค้นหาปัญหา"
          optionType="button"
          buttonStyle="solid"
          value={area}
          onChange={(e) => changeArea(e.target.value)}
          options={[
            { value: "municipality", label: "ทั้งเทศบาล" },
            { value: "nearby", label: "ใกล้จุดที่เลือก (5 กม.)" },
          ]}
        />
      </div>
      <div className="community-metrics">
        {[
          [
            FileTextOutlined,
            municipal ? "เรื่องทั้งหมด" : "เรื่องใกล้จุดที่เลือก",
            result?.stats?.total ?? "—",
          ],
          [LikeOutlined, "เสียงสนับสนุน", result?.stats?.votes ?? "—"],
          [ClockCircleOutlined, "กำลังดำเนินการ", result?.stats?.in_progress ?? "—"],
          [CheckCircleOutlined, "ปิดเรื่องแล้ว", result?.stats?.closed ?? "—"],
          [
            CheckCircleOutlined,
            "สัดส่วนปิดเรื่อง",
            result?.stats?.total > 0
              ? `${Math.round((Number(result?.stats?.closed) / Number(result?.stats?.total)) * 100)}%`
              : "—",
          ],
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
      {!municipal && !point && (
        <Alert
          type="info"
          showIcon
          message={
            geo.busy ? "กำลังระบุตำแหน่ง…" : geo.error || "เลือกจุดบนแผนที่เพื่อดูปัญหาในระยะ 5 กม."
          }
        />
      )}
      {!municipal && !busy && !error && result?.total === 0 && (
        <Alert
          className="community-empty-area"
          type="info"
          showIcon
          message="ไม่พบเรื่องในรัศมี 5 กม. จากจุดที่เลือก"
          description={
            Number(result.municipalityTotal) > 0
              ? `มีอีก ${result.municipalityTotal} เรื่องในเทศบาล`
              : "ลองเปลี่ยนจุดบนแผนที่หรือเลือกประเภทปัญหาอื่น"
          }
          action={
            Number(result.municipalityTotal) > 0 ? (
              <Button onClick={() => changeArea("municipality")}>
                ดูทั้งเทศบาล ({result.municipalityTotal} เรื่อง)
              </Button>
            ) : undefined
          }
        />
      )}
      {error && (
        <Alert
          type="warning"
          showIcon
          message={error}
          action={<Button onClick={() => setRevision((v) => v + 1)}>ลองใหม่</Button>}
          style={{ margin: "16px 0" }}
        />
      )}
      <div className="community-toolbar">
        <Space wrap>
          <Text strong>ประเภทปัญหา</Text>
          <Select
            aria-label="ประเภทปัญหาที่ค้นหา"
            value={category || ""}
            style={{ minWidth: 240 }}
            options={[
              { value: "", label: "ทุกประเภทปัญหา" },
              ...(catalog?.categories || []).map((c: D) => ({ value: c.id, label: c.name })),
            ]}
            onChange={(value) => {
              setCategory(value || undefined);
              setPage(1);
              setResult(undefined);
            }}
          />
        </Space>
        <Button onClick={onFollowing}>เรื่องที่ติดตาม</Button>
      </div>
      <div className="community-explorer">
        <Card
          className="community-map-panel"
          title="ปัญหาบนแผนที่"
          extra={<Tag color="green">{municipal ? "ทั้งเทศบาล" : "รัศมี 5 กม."}</Tag>}
        >
          <LocationMap
            value={municipal ? undefined : point}
            radiusMeters={municipal ? undefined : 5000}
            fitPoints={municipal}
            onChange={(p) => {
              setPoint(p);
              changeArea("nearby");
            }}
            points={items
              .filter((i) => i.latitude != null && i.longitude != null)
              .map((i) => ({
                id: i.id,
                latitude: Number(i.latitude),
                longitude: Number(i.longitude),
                status: i.status,
                categoryName: i.category_name,
              }))}
          />
          <Text type="secondary">
            {municipal ? "ตำแหน่งโดยประมาณของรายการในหน้านี้" : "ตำแหน่งโดยประมาณ"}
          </Text>
        </Card>
        <section className="community-results">
          <div className="ranking-heading">
            <div>
              <Text className="eyebrow">เสียงจากชุมชน</Text>
              <Title level={4}>
                <TrophyOutlined /> 5 ปัญหาที่มีโหวตสูงสุด
              </Title>
            </div>
            <Tag>TOP 5</Tag>
          </div>
          <List
            loading={busy}
            dataSource={result?.top || []}
            locale={{
              emptyText: municipal
                ? "ยังไม่มีปัญหาที่ได้รับโหวตในเทศบาล"
                : "ยังไม่มีปัญหาที่ได้รับโหวตในระยะ 5 กม.",
            }}
            renderItem={(item: D, index: number) => (
              <List.Item className="ranking-row">
                <span className={"ranking-number rank-" + (index + 1)}>{index + 1}</span>
                <div className="ranking-copy">
                  <strong>
                    <button className="community-detail-link" onClick={() => setDetailId(item.id)}>
                      {item.category_name}
                    </button>
                  </strong>
                  <div>
                    {statusTag(item)}
                    {item.mock && <span className="mock-label">MOCK</span>}
                  </div>
                </div>
                {issueActions(item)}
              </List.Item>
            )}
          />
        </section>
      </div>
      <section className="community-all-results">
        <div className="row-title">
          <Title level={4}>{municipal ? "เรื่องแจ้งทั้งหมด" : "เรื่องแจ้งรอบจุดที่เลือก"}</Title>
          <Tag color="green">{result?.total ?? "—"} เรื่อง</Tag>
        </div>
        <List
          loading={busy}
          dataSource={items}
          locale={{
            emptyText: (
              <Empty
                description={
                  municipal
                    ? "ยังไม่มีเรื่องในเทศบาลสำหรับประเภทปัญหาที่เลือก"
                    : "ยังไม่มีปัญหาในระยะนี้ ลองเปลี่ยนพื้นที่ค้นหาด้านบน"
                }
              />
            ),
          }}
          renderItem={(item) => <List.Item>{renderIssue(item)}</List.Item>}
        />
        <Pagination
          current={page}
          pageSize={12}
          total={Number(result?.total || 0)}
          showSizeChanger={false}
          onChange={setPage}
          style={{ marginTop: 16 }}
        />
        <Button className="my-cases-link" style={{ marginTop: 16 }} onClick={onTrack}>
          ดูคำร้องของฉันทั้งหมด
        </Button>
      </section>
    </div>
  );
}
