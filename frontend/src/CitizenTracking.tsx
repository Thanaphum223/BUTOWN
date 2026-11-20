import { categoryLabel } from "./i18n/categories";
import { useLiveQuery } from "./useLiveQuery";
import { useI18n } from "./i18n/useI18n";
import { useState } from "react";
import {
  App,
  Alert,
  Button,
  Card,
  Empty,
  List,
  Pagination,
  Space,
  Tabs,
  Tag,
  Typography,
} from "antd";
import {
  BellOutlined,
  CalendarOutlined,
  EnvironmentOutlined,
  EyeOutlined,
  LikeOutlined,
} from "./icons";
import { api, date, progressLabel } from "./api";
type D = Record<string, any>;
export default function CitizenTracking({
  initialTab = "mine",
  open,
}: {
  initialTab?: string;
  open: (id: string, publicView?: boolean) => void;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState(initialTab),
    [page, setPage] = useState(1),
    [revision, setRevision] = useState(0);
  const [removing, setRemoving] = useState<string>();
  const { message } = App.useApp();
  const {
    data,
    error,
    loading: busy,
  } = useLiveQuery<D>(`/citizen/tracking?tab=${tab}&page=${page - 1}`, revision);
  async function unfollow(id: string) {
    setRemoving(id);
    try {
      await api(`/complaints/${id}/follow`, { method: "DELETE" });
      setPage(1);
      setRevision((v) => v + 1);
      message.success(t("ยกเลิกการติดตามแล้ว"));
    } catch (e) {
      message.error(t((e as Error).message));
    } finally {
      setRemoving(undefined);
    }
  }
  return (
    <section className="citizen-tracking">
      <div className="page-heading tracking-heading">
        <div>
          <Typography.Title level={2}>{t("ติดตามสถานะ")}</Typography.Title>
        </div>
      </div>
      <Tabs
        activeKey={tab}
        onChange={(value) => {
          setTab(value);
          setPage(1);
        }}
        items={[
          { key: "mine", label: t("เรื่องที่ฉันแจ้ง") },
          { key: "following", label: t("เรื่องที่ติดตาม") },
        ]}
      />
      {error && (
        <Alert
          type="error"
          showIcon
          message={t(error)}
          action={<Button onClick={() => setRevision((v) => v + 1)}>{t("ลองใหม่")}</Button>}
        />
      )}
      <List
        className="tracking-list"
        loading={busy}
        dataSource={data?.items || []}
        locale={{
          emptyText: (
            <Empty
              description={
                busy
                  ? t("กำลังโหลด…")
                  : tab === "mine"
                    ? t("ยังไม่มีเรื่องที่แจ้ง")
                    : t("ยังไม่มีเรื่องที่ติดตาม")
              }
            />
          ),
        }}
        renderItem={(item: D) => (
          <List.Item key={item.id}>
            <Card className="tracking-card">
              <div className="tracking-card-top">
                <Tag
                  color={
                    ["REJECTED", "TERMINATED"].includes(item.status)
                      ? "error"
                      : item.status === "CLOSED"
                        ? "success"
                        : "processing"
                  }
                >
                  {progressLabel(item)}
                </Tag>
                <Typography.Text type="secondary">
                  #{item.id.slice(0, 8).toUpperCase()}
                </Typography.Text>
              </div>
              <Typography.Title level={4}>{categoryLabel(item.category_name)}</Typography.Title>
              {item.description && (
                <Typography.Paragraph className="tracking-description" ellipsis={{ rows: 2 }}>
                  {item.description}
                </Typography.Paragraph>
              )}
              {item.address && (
                <Typography.Text type="secondary" className="tracking-address">
                  <EnvironmentOutlined aria-hidden /> {item.address}
                </Typography.Text>
              )}
              <div className="tracking-dates">
                <span>
                  <CalendarOutlined aria-hidden /> {t("แจ้งเมื่อ")}
                  {date(item.created_at)}
                </span>
                <span>
                  {t("อัปเดตล่าสุด")}
                  {date(item.updated_at)}
                </span>
                <span>
                  <LikeOutlined aria-hidden /> {Number(item.votes || 0)} {t("โหวต")}
                </span>
              </div>
              <Space className="tracking-card-actions" wrap>
                <Button
                  aria-label={t("ดูรายละเอียด")}
                  type="primary"
                  icon={<EyeOutlined />}
                  onClick={() => open(item.id, tab === "following")}
                >
                  {t("ดูรายละเอียด")}
                </Button>
                {tab === "following" && (
                  <Button
                    aria-label={t("ยกเลิกการติดตาม")}
                    icon={<BellOutlined />}
                    loading={removing === item.id}
                    disabled={!!removing && removing !== item.id}
                    onClick={() => void unfollow(item.id)}
                  >
                    {t("ยกเลิกการติดตาม")}
                  </Button>
                )}
              </Space>
            </Card>
          </List.Item>
        )}
      />
      <Pagination
        className="tracking-pagination"
        align="center"
        current={page}
        pageSize={6}
        total={Number(data?.total || 0)}
        showSizeChanger={false}
        showTotal={(total) => t("ทั้งหมด {{count}} เรื่อง", { count: total })}
        onChange={setPage}
        hideOnSinglePage
      />
    </section>
  );
}
