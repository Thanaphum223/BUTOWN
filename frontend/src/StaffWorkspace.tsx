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
  EnvironmentOutlined,
  RightOutlined,
  LikeOutlined,
  FilterOutlined,
} from "@ant-design/icons";
import { api, statusNames, date } from "./api";
import Detail from "./Detail";
type D = Record<string, any>;
const { Title, Text } = Typography;
export default function StaffWorkspace({
  user,
  dashboard,
  history = false,
}: {
  user: D;
  dashboard: boolean;
  history?: boolean;
}) {
  const [catalog, setCatalog] = useState<D>();
  const [category, setCategory] = useState<string>();
  const [area, setArea] = useState("");
  const [sort, setSort] = useState("newest");
  useEffect(() => {
    api<D>("/catalog")
      .then(setCatalog)
      .catch(() => {});
  }, []);
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
        `&size=10&${history ? "completedOnly" : "activeOnly"}=true&q=` +
        encodeURIComponent(query) +
        "&status=" +
        encodeURIComponent(status || "") +
        `&sort=${sort}&area=${encodeURIComponent(area)}${category ? `&categoryId=${category}` : ""}`,
    )
      .then((d) => {
        if (alive) {
          if (page > 1 && !d.items.length && d.total <= (page - 1) * 10) {
            setPage(Math.max(1, Math.ceil(d.total / 10)));
          } else setData(d);
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [page, query, status, refresh, category, area, sort, history]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") setRefresh((v) => v + 1);
    }, 4000);
    return () => clearInterval(timer);
  }, []);
  const reload = () => setRefresh((x) => x + 1);
  return (
    <div
      className={
        "staff-workspace split-workspace" +
        (user.role === "FIELD" ? " field-workspace" : "") +
        (selected ? " viewing-work" : "")
      }
    >
      <div className="page-heading">
        <div>
          <Text className="eyebrow">ศูนย์ประสานงาน · TOWNTRACK</Text>
          <Title level={2}>
            {history
              ? "ประวัติงาน"
              : user.role === "FIELD"
                ? "งานลงพื้นที่ของฉัน"
                : dashboard
                  ? "ภาพรวมการดำเนินงาน"
                  : "รายการคำร้อง"}
          </Title>
          <Text type="secondary">
            {history
              ? "งานที่ปิดเรื่องหรือยุติแล้วในขอบเขตสิทธิ์ของคุณ ค้นหาและเปิดดูรายละเอียดได้"
              : user.role === "FIELD"
                ? "เลือกงานเพื่อรับงาน ดูเส้นทาง ถ่ายรูป และส่งรายงาน"
                : "ตรวจข้อมูล ประสานทีม และติดตามผลจนทุกเรื่องได้รับการดูแล"}
          </Text>
        </div>
        <Space>
          <Tag color="green">พื้นที่ทำงานของคุณ</Tag>
          <Button icon={<ReloadOutlined />} onClick={reload}>
            โหลดใหม่
          </Button>
        </Space>
      </div>
      {user.role === "APPROVER" && !history && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 20 }}
          message={
            user.account_role === "ADMIN"
              ? "งานอนุมัติทั้งหมดในเทศบาล"
              : "งานที่ส่งถึงบัญชี “" + user.display_name + "”"
          }
          description={
            user.account_role === "ADMIN"
              ? "ผู้ดูแลดูงานของผู้อนุมัติทุกคนได้ และอนุมัติได้เฉพาะงานที่ส่งถึงบัญชีของตน"
              : "แสดงเฉพาะงานที่ระบุคุณเป็นผู้อนุมัติ"
          }
        />
      )}
      {dashboard && !history && !selected && (
        <div className="workspace-stats">
          {[
            ["งานในขอบเขต", error ? "—" : (data?.stats.total ?? "—")],
            ["กำลังดำเนินการ", error ? "—" : (data?.stats.in_progress ?? "—")],
            ["ปิดเรื่องแล้ว", error ? "—" : (data?.stats.closed ?? "—")],
            ["เกินกำหนด", error ? "—" : (data?.stats.overdue ?? "—")],
          ].map(([label, value]) => (
            <Card key={String(label)}>
              <Statistic title={label} value={value} />
            </Card>
          ))}
        </div>
      )}
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 20 }} />}
      {dashboard && !history && !selected && Number(data?.stats.overdue) > 0 && (
        <div className="attention-panel">
          <div>
            <ClockCircleOutlined />
            <strong> งานที่ต้องติดตาม</strong>
            <p>มี {data?.stats.overdue} คำร้องที่เกินกำหนดดำเนินการในขอบเขตของคุณ</p>
          </div>
          <Tag color="red">เกิน SLA</Tag>
        </div>
      )}
      <div className={"work-grid" + (selected ? " has-selection" : "")}>
        <Card
          className="queue-panel"
          title={history ? "ประวัติงาน" : dashboard ? "รายการคำร้อง" : "คิวงาน"}
          extra={<Text type="secondary">{error ? "—" : (data?.total ?? "—")} เรื่อง</Text>}
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
          <details className="queue-filters">
            <summary>
              <FilterOutlined /> ตัวกรองและการเรียงลำดับ
              {[status, category, area].filter(Boolean).length > 0 && (
                <Tag color="green">{[status, category, area].filter(Boolean).length}</Tag>
              )}
            </summary>
            <div className="queue-filter-fields">
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
                options={Object.entries(statusNames)
                  .filter(
                    ([value]) => history === ["CLOSED", "REJECTED", "TERMINATED"].includes(value),
                  )
                  .map(([value, label]) => ({
                    value,
                    label,
                  }))}
              />
              <Space direction="vertical" style={{ width: "100%", marginTop: 12 }}>
                <Select
                  style={{ width: "100%" }}
                  aria-label="ประเภทปัญหา"
                  placeholder="ทุกประเภท"
                  allowClear
                  value={category}
                  onChange={(v) => {
                    setCategory(v);
                    setPage(1);
                  }}
                  options={(catalog?.categories || []).map((c: D) => ({
                    value: c.id,
                    label: c.name,
                  }))}
                />
                <Input.Search
                  aria-label="พื้นที่"
                  placeholder="ค้นหาพื้นที่ / สถานที่"
                  value={area}
                  onChange={(e) => {
                    setArea(e.target.value);
                    setPage(1);
                  }}
                  onSearch={(v) => {
                    setArea(v);
                    setPage(1);
                  }}
                  allowClear
                />
                <Select
                  style={{ width: "100%" }}
                  aria-label="เรียงลำดับคำร้อง"
                  value={sort}
                  onChange={(v) => {
                    setSort(v);
                    setPage(1);
                  }}
                  options={[
                    { value: "newest", label: "ใหม่ที่สุด" },
                    { value: "oldest", label: "เก่าที่สุด" },
                    { value: "votes", label: "คะแนนโหวตสูงสุด" },
                  ]}
                />
              </Space>
              {(status || category || area) && (
                <Button
                  type="link"
                  onClick={() => {
                    setStatus(undefined);
                    setCategory(undefined);
                    setArea("");
                    setPage(1);
                  }}
                >
                  ล้างตัวกรอง
                </Button>
              )}
            </div>
          </details>
          <div className="queue-quick-status" aria-label="สถานะงานที่ใช้บ่อย">
            {(history
              ? [
                  { value: undefined, label: "ทั้งหมด" },
                  { value: "CLOSED", label: "ปิดเรื่อง" },
                  { value: "REJECTED", label: "ปฏิเสธ" },
                  { value: "TERMINATED", label: "ยุติเรื่อง" },
                ]
              : [
                  { value: undefined, label: "ทั้งหมด" },
                  { value: "NEW", label: "รอรับเรื่อง" },
                  { value: "IN_PROGRESS", label: "กำลังดำเนินการ" },
                  { value: "OFFICER_REVIEW", label: "รอเจ้าหน้าที่ตรวจ" },
                  { value: "RESOURCE_APPROVAL", label: "รออนุมัติ" },
                ]
            ).map((option) => (
              <Button
                key={option.value || "all"}
                type={status === option.value ? "primary" : "default"}
                aria-pressed={status === option.value}
                onClick={() => {
                  setStatus(option.value);
                  setPage(1);
                }}
              >
                {option.label}
              </Button>
            ))}
          </div>
          <div className="queue-caption">
            <span>เลขเรื่อง / ประเภทปัญหา</span>
            <span>{history ? "เปิดดูประวัติ" : "เปิดเพื่อตรวจสอบ"}</span>
          </div>
          <div className="queue-items">
            {!data && !error ? (
              <Card loading />
            ) : !data?.items.length ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  error ? "โหลดรายการงานไม่สำเร็จ กรุณากดโหลดใหม่" : "ไม่พบงานตามตัวกรอง"
                }
              />
            ) : (
              data.items.map((r: D) => {
                const overdue =
                  new Date(r.due_at).getTime() < Date.now() &&
                  !["CLOSED", "RESOLVED", "REJECTED", "TERMINATED"].includes(r.status);
                return (
                  <button
                    type="button"
                    className={"queue-item" + (r.id === selected ? " selected" : "")}
                    key={r.id}
                    aria-label={`เปิดงาน ${r.title} เลขเรื่อง ${r.id.slice(0, 8).toUpperCase()}`}
                    aria-pressed={r.id === selected}
                    onClick={() => {
                      setSelected(r.id);
                      window.scrollTo({ top: 0, behavior: "instant" });
                    }}
                  >
                    <span className="queue-item-top">
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
                      <span className="queue-reference">#{r.id.slice(0, 8).toUpperCase()}</span>
                    </span>
                    <span className="queue-card-title">{r.title}</span>
                    <span className="queue-card-category">{r.category_name}</span>
                    <span className="queue-card-location">
                      <EnvironmentOutlined />
                      <span>{r.address || "ไม่ระบุสถานที่"}</span>
                    </span>
                    <span className="queue-card-footer">
                      <span className={"queue-card-due" + (overdue ? " is-overdue" : "")}>
                        <ClockCircleOutlined />
                        <span>
                          กำหนดเสร็จ {date(r.due_at)}
                          {overdue ? " · เกินกำหนด" : ""}
                        </span>
                      </span>
                      <span className="queue-open-hint">
                        {r.id === selected ? "กำลังเปิด" : history ? "ดูประวัติ" : "เปิดงาน"}
                        <RightOutlined />
                      </span>
                    </span>
                    {Number(r.votes) > 0 && (
                      <span className="queue-card-votes">
                        <LikeOutlined /> {r.votes} โหวต
                      </span>
                    )}
                  </button>
                );
              })
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
              <Title level={3}>{history ? "ประวัติการดำเนินงาน" : "ทุกเรื่องต้องมีคนดูแล"}</Title>
              <p>
                {history
                  ? "เลือกงานเพื่อดูรายละเอียดและประวัติการดำเนินงาน"
                  : "เลือกคำร้องจากคิวงานเพื่อดูรายละเอียด"}
                <br />
                {history
                  ? "ดูเอกสาร หลักฐาน และผลการดำเนินงานย้อนหลัง"
                  : "ตรวจหลักฐาน และดำเนินการตามขั้นตอน"}
              </p>
              {!history && (
                <div className="welcome-process">
                  <span>รับเรื่อง</span>
                  <i>→</i>
                  <span>ประสานทีม</span>
                  <i>→</i>
                  <span>ติดตามผล</span>
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
