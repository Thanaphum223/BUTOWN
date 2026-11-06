import { useEffect, useState } from "react";
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
import { BellOutlined, CalendarOutlined, EyeOutlined, ReloadOutlined } from "@ant-design/icons";
import { api, date, progressLabel } from "./api";
type D = Record<string, any>;
export default function CitizenTracking({
  initialTab = "mine",
  open,
}: {
  initialTab?: string;
  open: (id: string, publicView?: boolean) => void;
}) {
  const [tab, setTab] = useState(initialTab),
    [page, setPage] = useState(1),
    [revision, setRevision] = useState(0);
  const [data, setData] = useState<D>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [removing, setRemoving] = useState<string>();
  const { message } = App.useApp();
  useEffect(() => {
    const c = new AbortController();
    setBusy(true);
    setError("");
    setData(undefined);
    api<D>(`/citizen/tracking?tab=${tab}&page=${page - 1}`, { signal: c.signal })
      .then(setData)
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setBusy(false);
      });
    return () => c.abort();
  }, [tab, page, revision]);
  async function unfollow(id: string) {
    setRemoving(id);
    try {
      await api(`/complaints/${id}/follow`, { method: "DELETE" });
      setPage(1);
      setRevision((v) => v + 1);
      message.success("ยกเลิกการติดตามแล้ว");
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setRemoving(undefined);
    }
  }
  return (
    <section className="citizen-tracking">
      <div className="page-heading tracking-heading">
        <div>
          <Typography.Title level={2}>ติดตามสถานะ</Typography.Title>
          <Typography.Text type="secondary">
            ความคืบหน้าของเรื่องที่แจ้งและเรื่องที่ติดตาม
          </Typography.Text>
        </div>
        <Button icon={<ReloadOutlined />} loading={busy} onClick={() => setRevision((v) => v + 1)}>
          โหลดใหม่
        </Button>
      </div>
      <Tabs
        activeKey={tab}
        onChange={(value) => {
          setTab(value);
          setPage(1);
        }}
        items={[
          { key: "mine", label: "เรื่องที่ฉันแจ้ง" },
          { key: "following", label: "เรื่องที่ติดตาม" },
        ]}
      />
      {error && (
        <Alert
          type="error"
          showIcon
          message={error}
          action={<Button onClick={() => setRevision((v) => v + 1)}>ลองใหม่</Button>}
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
                  ? "กำลังโหลด…"
                  : tab === "mine"
                    ? "ยังไม่มีเรื่องที่แจ้ง"
                    : "ยังไม่มีเรื่องที่ติดตาม"
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
              <Typography.Title level={4}>{item.category_name}</Typography.Title>
              <div className="tracking-dates">
                <span>
                  <CalendarOutlined aria-hidden /> แจ้งเมื่อ {date(item.created_at)}
                </span>
                <span>อัปเดตล่าสุด {date(item.updated_at)}</span>
              </div>
              <Space className="tracking-card-actions" wrap>
                <Button
                  aria-label="ดูรายละเอียด"
                  type="primary"
                  icon={<EyeOutlined />}
                  onClick={() => open(item.id, tab === "following")}
                >
                  ดูรายละเอียด
                </Button>
                {tab === "following" && (
                  <Button
                    aria-label="ยกเลิกการติดตาม"
                    icon={<BellOutlined />}
                    loading={removing === item.id}
                    disabled={!!removing && removing !== item.id}
                    onClick={() => void unfollow(item.id)}
                  >
                    ยกเลิกการติดตาม
                  </Button>
                )}
              </Space>
            </Card>
          </List.Item>
        )}
      />
      <Pagination
        current={page}
        pageSize={5}
        total={Number(data?.total || 0)}
        showSizeChanger={false}
        showTotal={(total) => `ทั้งหมด ${total} เรื่อง`}
        onChange={setPage}
        hideOnSinglePage
      />
    </section>
  );
}
