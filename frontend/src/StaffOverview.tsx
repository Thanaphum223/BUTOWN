import "./staffWorkspace.css";
import "./staffOverview.css";
import { Alert, Button, Card, Empty, Space, Statistic, Tag, Typography } from "antd";
import { RightOutlined } from "./icons";
import { statusNames } from "./api";
import { useLiveQuery } from "./useLiveQuery";
import { useI18n } from "./i18n/useI18n";

type CaseSummary = { id: string; title: string; status: string; address: string };
type Summary = { total: number; items: CaseSummary[] };
type Catalog = { queues: { value: string; label: string }[] };
const { Title, Text } = Typography;

export default function StaffOverview({
  user,
  onQueue,
  onHistory,
  onOpen,
}: {
  user: { id: string; role: string };
  onQueue: (queue?: string) => void;
  onHistory: () => void;
  onOpen: (id: string) => void;
}) {
  const { t } = useI18n();
  const scope = `${user.id}:${user.role}`;
  const active = useLiveQuery<Summary>(
    "/complaints?activeOnly=true&page=0&size=5&sort=newest",
    0,
    scope,
  );
  const history = useLiveQuery<Summary>("/complaints?historyOnly=true&page=0&size=1", 0, scope);
  const catalog = useLiveQuery<Catalog>("/catalog", 0, scope);
  return (
    <div className="staff-overview">
      <div className="page-heading">
        <div>
          <Title level={2}>
            {t(user.role === "FIELD" ? "งานลงพื้นที่ของฉัน" : "ภาพรวมการดำเนินงาน")}
          </Title>
        </div>
        <Button type="primary" onClick={() => onQueue()}>
          {t("เปิดคิวงาน")}
        </Button>
      </div>
      <div className="overview-summary-cards">
        <Card>
          <Statistic
            title={t("งานที่รอดำเนินการของคุณ")}
            value={active.error ? "—" : (active.data?.total ?? "—")}
          />
          <Button type="link" onClick={() => onQueue()}>
            {t("เปิดคิวงานทั้งหมด")} <RightOutlined aria-hidden />
          </Button>
        </Card>
        <Card>
          <Statistic
            title={t("งานในประวัติ")}
            value={history.error ? "—" : (history.data?.total ?? "—")}
          />
          <Button type="link" onClick={onHistory}>
            {t("ดูประวัติงาน")} <RightOutlined aria-hidden />
          </Button>
        </Card>
      </div>
      {active.error && <Alert type="error" showIcon message={t(active.error)} />}
      {history.error && history.error !== active.error && (
        <Alert type="warning" showIcon message={t(history.error)} />
      )}
      <div className="overview-sections">
        <Card title={t("ขั้นตอนที่คุณรับผิดชอบ")} className="overview-shortcuts">
          <Space direction="vertical" style={{ width: "100%" }}>
            {(catalog.data?.queues || []).map((queue) => (
              <Button block key={queue.value} onClick={() => onQueue(queue.value)}>
                <span>{t(queue.label)}</span>
                <RightOutlined aria-hidden />
              </Button>
            ))}
          </Space>
          {catalog.error && <Alert type="warning" showIcon message={t(catalog.error)} />}
          {!catalog.loading && !catalog.error && !catalog.data?.queues?.length && (
            <Text type="secondary">{t("เลือกเปิดคิวงานเพื่อดูรายการที่คุณดำเนินการได้")}</Text>
          )}
        </Card>
        <Card title={t("รายการคำร้อง")} className="overview-recent" loading={active.loading}>
          {!active.loading && !active.data?.items?.length && !active.error && (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={t("ไม่มีงานรอดำเนินการในขั้นตอนของคุณ")}
            />
          )}
          {(active.data?.items || []).slice(0, 5).map((item) => (
            <button
              className="overview-case"
              key={item.id}
              onClick={() => onOpen(item.id)}
              aria-label={t("เปิดงาน {{title}} เลขเรื่อง {{reference}}", {
                title: item.title,
                reference: item.id.slice(0, 8).toUpperCase(),
              })}
            >
              <div>
                <Tag>{t(statusNames[item.status] || item.status)}</Tag>
                <Text type="secondary">#{item.id.slice(0, 8).toUpperCase()}</Text>
              </div>
              <strong>{item.title}</strong>
              <span className="overview-case-address">{item.address}</span>
              <RightOutlined />
            </button>
          ))}
        </Card>
      </div>
    </div>
  );
}
