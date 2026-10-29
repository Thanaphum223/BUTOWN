import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Empty,
  Input,
  Pagination,
  Select,
  Space,
  Statistic,
  Tag,
  Typography,
} from "antd";
import {
  FileTextOutlined,
  ReloadOutlined,
  ClockCircleOutlined,
} from "@ant-design/icons";
import { api, statusNames, date } from "./api";
import Detail from "./Detail";
type D = Record<string, any>;
const { Title, Text } = Typography;
export default function StaffWorkspace({
  user,
  dashboard,
}: {
  user: D;
  dashboard: boolean;
}) {
  const [data, setData] = useState<D>(),
    [error, setError] = useState(""),
    [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState<string>(),
    [selected, setSelected] = useState(""),
    [page, setPage] = useState(1),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    let alive = true;
    setError("");
    api<D>(
      "/complaints?page=" +
        (page - 1) +
        "&size=10&q=" +
        encodeURIComponent(query) +
        "&status=" +
        encodeURIComponent(status || ""),
    )
      .then((d) => {
        if (alive) setData(d);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [page, query, status, refresh]);
  const reload = () => setRefresh((x) => x + 1);
  return (
    <div className="staff-workspace">
      <div className="page-heading">
        <div>
          <Text className="eyebrow">ศูนย์ประสานงาน · TOWNTRACK</Text>
          <Title level={2}>
            {dashboard ? "ภาพรวมการดำเนินงาน" : "รายการคำร้อง"}
          </Title>
          <Text type="secondary">
            ตรวจข้อมูล ประสานทีม และติดตามผลจนทุกเรื่องได้รับการดูแล
          </Text>
        </div>
        <Space>
          <Tag color="green">พื้นที่ทำงานของคุณ</Tag>
          <Button icon={<ReloadOutlined />} onClick={reload}>
            โหลดใหม่
          </Button>
        </Space>
      </div>
      <div className="workspace-stats">
        {[
          ["งานในขอบเขต", data?.stats.total || 0],
          ["กำลังดำเนินการ", data?.stats.in_progress || 0],
          ["ปิดเรื่องแล้ว", data?.stats.closed || 0],
          ["เกินกำหนด", data?.stats.overdue || 0],
        ].map(([label, value]) => (
          <Card key={String(label)}>
            <Statistic title={label} value={value} />
          </Card>
        ))}
      </div>
      {error && (
        <Alert
          type="error"
          showIcon
          message={error}
          style={{ marginBottom: 20 }}
        />
      )}
      {Number(data?.stats.overdue) > 0 && (
        <div className="attention-panel">
          <div>
            <ClockCircleOutlined />
            <strong> งานที่ต้องติดตาม</strong>
            <p>
              มี {data?.stats.overdue} คำร้องที่เกินกำหนดดำเนินการในขอบเขตของคุณ
            </p>
          </div>
          <Tag color="red">เกิน SLA</Tag>
        </div>
      )}
      <div className={"work-grid" + (selected ? " has-selection" : "")}>
        <Card
          className="queue-panel"
          title={dashboard ? "รายการคำร้อง" : "คิวงาน"}
          extra={<Text type="secondary">{data?.total || 0} เรื่อง</Text>}
        >
          <label className="control-label" htmlFor="workspace-query">
            ค้นหาเลขเรื่อง / หัวข้อ
          </label>
          <Input.Search
            id="workspace-query"
            placeholder="ค้นหาเรื่อง…"
            value={search}
            allowClear
            onChange={(e) => setSearch(e.target.value)}
          />
          <label className="control-label">สถานะ</label>
          <Select
            aria-label="กรองสถานะคำร้อง"
            placeholder="ทุกสถานะ"
            style={{ width: "100%" }}
            value={status}
            allowClear
            onChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
            options={Object.entries(statusNames).map(([value, label]) => ({
              value,
              label,
            }))}
          />
          <div className="queue-caption">
            <span>เลขเรื่อง / ประเภทปัญหา</span>
            <span>เปิดเพื่อตรวจสอบ</span>
          </div>
          <div className="queue-items">
            {!data && !error ? (
              <Card loading />
            ) : !data?.items.length ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="ไม่พบงานตามตัวกรอง"
              />
            ) : (
              data.items.map((r: D) => (
                <div
                  className={
                    "queue-item" + (r.id === selected ? " selected" : "")
                  }
                  key={r.id}
                >
                  <div className="queue-item-top">
                    <Tag
                      color={
                        ["CLOSED", "RESOLVED"].includes(r.status)
                          ? "green"
                          : ["REJECTED", "TERMINATED"].includes(r.status)
                            ? "red"
                            : "gold"
                      }
                    >
                      {statusNames[r.status]}
                    </Tag>
                    <Text type="secondary">
                      #{r.id.slice(0, 8).toUpperCase()}
                    </Text>
                  </div>
                  <Button
                    type="text"
                    className="queue-title"
                    onClick={() => setSelected(r.id)}
                  >
                    {r.title}
                  </Button>
                  <div className="queue-meta">
                    {r.category_name} · {date(r.created_at)}
                  </div>
                  <div className="queue-due">กำหนดเสร็จ {date(r.due_at)}</div>
                </div>
              ))
            )}
          </div>
          <Pagination
            size="small"
            current={page}
            pageSize={10}
            total={data?.total || 0}
            showSizeChanger={false}
            onChange={setPage}
          />
        </Card>
        <div className="workspace-detail">
          {selected ? (
            <Detail
              key={selected}
              id={selected}
              user={user}
              embedded
              onChanged={reload}
              back={() => {
                setSelected("");
                reload();
              }}
            />
          ) : (
            <Card className="workspace-welcome">
              <div className="welcome-icon">
                <FileTextOutlined />
              </div>
              <Title level={3}>ทุกเรื่องต้องมีคนดูแล</Title>
              <p>
                เลือกคำร้องจากคิวงานเพื่อดูรายละเอียด
                <br />
                ตรวจหลักฐาน และดำเนินการตามขั้นตอน
              </p>
              <div className="welcome-process">
                <span>รับเรื่อง</span>
                <i>→</i>
                <span>ประสานทีม</span>
                <i>→</i>
                <span>ติดตามผล</span>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
