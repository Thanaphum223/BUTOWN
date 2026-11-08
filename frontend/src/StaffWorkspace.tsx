import FieldTaskCard, { type CardMetadata } from "./FieldTaskCard";
import { useI18n } from "./i18n/useI18n";
import { useEffect, useRef, useState } from "react";
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
  const { t } = useI18n();
  const metadataCache = useRef(new Map<string, CardMetadata>());
  const [metadata, setMetadata] = useState<Record<string, CardMetadata>>({});
  const [metadataRetry, setMetadataRetry] = useState(0);
  const [openMap, setOpenMap] = useState("");
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
    if (search === query) return;
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
        `&size=10&${history ? "historyOnly" : "activeOnly"}=true&q=` +
        encodeURIComponent(query) +
        (history ? "&status=" : "&queue=") +
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
  }, [page, query, status, refresh, category, area, sort, history, user.id, user.role]);
  // Cache belongs to this account; workers never publish results after cleanup.
  useEffect(() => {
    metadataCache.current.clear();
    setMetadata({});
    setSelected("");
    setOpenMap("");
    setData(undefined);
  }, [user.id, user.role, history]);
  // Polls may update card text without changing the metadata each card needs.
  // Only membership/version changes invalidate the current batch of requests.
  const metadataItems = JSON.stringify(
    (data?.items || [])
      .map((item: D) => ({ id: item.id, version: item.version }))
      .sort((left: D, right: D) => String(left.id).localeCompare(String(right.id))),
  );
  useEffect(() => {
    const items: D[] = JSON.parse(metadataItems);
    if (user.role !== "FIELD" || !items.length) return;
    const controller = new AbortController();
    let alive = true,
      cursor = 0;
    const account = user.id;
    const keyFor = (item: D) => `${account}:${history}:${item.id}:${item.version}`;
    const cached: Record<string, CardMetadata> = {};
    items.forEach((item) => {
      const value = metadataCache.current.get(keyFor(item));
      if (value) cached[item.id] = value;
    });
    setMetadata(cached);
    setOpenMap((current) => (items.some((item) => item.id === current) ? current : ""));
    async function worker() {
      while (alive && cursor < items.length) {
        const item = items[cursor++],
          key = keyFor(item);
        if (metadataCache.current.has(key)) continue;
        let result: CardMetadata;
        try {
          const detail = await api<D>(
            "/complaints/" + item.id + (history ? "?historyOnly=true" : ""),
            { signal: controller.signal },
          );
          result = { complaint: detail.complaint };
          if (!result.complaint) throw new Error("โหลดตำแหน่งไม่สำเร็จ");
        } catch (error) {
          if (!alive) return;
          result = { error: (error as Error).message };
        }
        if (!alive) return;
        if (!result.error) {
          metadataCache.current.set(key, result);
          // Bound retained metadata as well as the three concurrent requests.
          if (metadataCache.current.size > 100)
            metadataCache.current.delete(metadataCache.current.keys().next().value!);
        }
        setMetadata((current) => ({ ...current, [item.id]: result }));
      }
    }
    void Promise.all(Array.from({ length: Math.min(3, items.length) }, () => worker()));
    return () => {
      alive = false;
      controller.abort();
    };
  }, [metadataItems, user.id, user.role, history, metadataRetry]);
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
          <Text className="eyebrow">{t("ศูนย์ประสานงาน · TOWNTRACK")}</Text>
          <Title level={2}>
            {history
              ? t("ประวัติงาน")
              : user.role === "FIELD"
                ? t("งานลงพื้นที่ของฉัน")
                : dashboard
                  ? t("ภาพรวมการดำเนินงาน")
                  : t("รายการคำร้อง")}
          </Title>
          <Text type="secondary">
            {history
              ? t("งานที่ปิดเรื่องหรือยุติแล้วในขอบเขตสิทธิ์ของคุณ ค้นหาและเปิดดูรายละเอียดได้")
              : user.role === "FIELD"
                ? t("เลือกงานเพื่อรับงาน ดูตำแหน่ง ถ่ายรูป และส่งรายงาน")
                : t("ตรวจข้อมูล ประสานทีม และติดตามผลจนทุกเรื่องได้รับการดูแล")}
          </Text>
        </div>
        <Space>
          <Tag color="green">{t("พื้นที่ทำงานของคุณ")}</Tag>
          <Button icon={<ReloadOutlined />} onClick={reload}>
            {t("โหลดใหม่")}
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
              ? t("งานอนุมัติทั้งหมดในเทศบาล")
              : t("งานที่ส่งถึงบัญชี “") + user.display_name + "”"
          }
          description={
            user.account_role === "ADMIN"
              ? t("ผู้ดูแลดูงานของผู้อนุมัติทุกคนได้ และอนุมัติได้เฉพาะงานที่ส่งถึงบัญชีของตน")
              : t("แสดงเฉพาะงานที่ระบุคุณเป็นผู้อนุมัติ")
          }
        />
      )}
      {dashboard && !history && !selected && (
        <div className="workspace-stats">
          {[
            [t("งานในขอบเขต"), error ? "—" : (data?.stats.total ?? "—")],
            [t("กำลังดำเนินการ"), error ? "—" : (data?.stats.in_progress ?? "—")],
            [t("ปิดเรื่องแล้ว"), error ? "—" : (data?.stats.closed ?? "—")],
          ].map(([label, value]) => (
            <Card key={String(label)}>
              <Statistic title={label} value={value} />
            </Card>
          ))}
        </div>
      )}
      {error && <Alert type="error" showIcon message={t(error)} style={{ marginBottom: 20 }} />}
      <div className={"work-grid" + (selected ? " has-selection" : "")}>
        <Card
          className="queue-panel"
          title={history ? t("ประวัติงาน") : dashboard ? t("รายการคำร้อง") : t("คิวงาน")}
          extra={
            <Text type="secondary">
              {error ? "—" : (data?.total ?? "—")}
              {t("เรื่อง")}
            </Text>
          }
        >
          <label className="control-label" htmlFor="workspace-query">
            {t("ค้นหาเลขเรื่อง / หัวข้อ")}
          </label>
          <Input.Search
            id="workspace-query"
            placeholder={t("ค้นหาเรื่อง…")}
            value={search}
            allowClear
            onChange={(e) => setSearch(e.target.value)}
          />
          <details className="queue-filters">
            <summary>
              <FilterOutlined />
              {t("ตัวกรองและการเรียงลำดับ")}
              {[status, category, area].filter(Boolean).length > 0 && (
                <Tag color="green">{[status, category, area].filter(Boolean).length}</Tag>
              )}
            </summary>
            <div className="queue-filter-fields">
              <label className="control-label">{t("สถานะ")}</label>
              <Select
                aria-label={t("กรองสถานะคำร้อง")}
                placeholder={t("ทุกสถานะ")}
                style={{ width: "100%" }}
                value={status}
                allowClear
                onChange={(v) => {
                  setStatus(v);
                  setPage(1);
                }}
                options={
                  history
                    ? Object.entries(statusNames)
                        .filter(([value]) => ["CLOSED", "REJECTED", "TERMINATED"].includes(value))
                        .map(([value, label]) => ({ value, label: t(label) }))
                    : (catalog?.queues || []).map((queue: D) => ({
                        ...queue,
                        label: t(queue.label),
                      }))
                }
              />
              <Space direction="vertical" style={{ width: "100%", marginTop: 12 }}>
                <Select
                  style={{ width: "100%" }}
                  aria-label={t("ประเภทปัญหา")}
                  placeholder={t("ทุกประเภท")}
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
                  aria-label={t("พื้นที่")}
                  placeholder={t("ค้นหาพื้นที่ / สถานที่")}
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
                  aria-label={t("เรียงลำดับคำร้อง")}
                  value={sort}
                  onChange={(v) => {
                    setSort(v);
                    setPage(1);
                  }}
                  options={[
                    { value: "newest", label: t("ใหม่ที่สุด") },
                    { value: "oldest", label: t("เก่าที่สุด") },
                    { value: "votes", label: t("คะแนนโหวตสูงสุด") },
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
                  {t("ล้างตัวกรอง")}
                </Button>
              )}
            </div>
          </details>
          <div className="queue-quick-status" aria-label={t("สถานะงานที่ใช้บ่อย")}>
            {(history
              ? [
                  { value: undefined, label: t("ทั้งหมด") },
                  { value: "CLOSED", label: t("ปิดเรื่อง") },
                  { value: "REJECTED", label: t("ปฏิเสธ") },
                  { value: "TERMINATED", label: t("ยุติเรื่อง") },
                ]
              : [{ value: undefined, label: t("งานทั้งหมด") }, ...(catalog?.queues || [])]
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
                {t(option.label)}
              </Button>
            ))}
          </div>
          <div className="queue-caption">
            <span>{t("เลขเรื่อง / ประเภทปัญหา")}</span>
            <span>{history ? t("เปิดดูประวัติ") : t("เปิดเพื่อตรวจสอบ")}</span>
          </div>
          <div className="queue-items">
            {!data && !error ? (
              <Card loading />
            ) : !data?.items.length ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  error ? t("โหลดรายการงานไม่สำเร็จ กรุณากดโหลดใหม่") : t("ไม่พบงานตามตัวกรอง")
                }
              />
            ) : (
              data.items.map((r: D) => {
                if (user.role === "FIELD")
                  return (
                    <FieldTaskCard
                      key={r.id}
                      item={r}
                      metadata={metadata[r.id]}
                      selected={r.id === selected}
                      mapOpen={openMap === r.id}
                      onOpen={() => {
                        setSelected(r.id);
                        setOpenMap("");
                        window.scrollTo({ top: 0, behavior: "instant" });
                      }}
                      onMap={() => {
                        setSelected("");
                        setOpenMap((current) => (current === r.id ? "" : r.id));
                      }}
                      onRetry={() => setMetadataRetry((current) => current + 1)}
                    />
                  );
                return (
                  <button
                    type="button"
                    className={"queue-item" + (r.id === selected ? " selected" : "")}
                    key={r.id}
                    aria-label={t("เปิดงาน {{title}} เลขเรื่อง {{reference}}", {
                      title: r.title,
                      reference: r.id.slice(0, 8).toUpperCase(),
                    })}
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
                        {t(statusNames[r.status] || r.status)}
                      </Tag>
                      <span className="queue-reference">#{r.id.slice(0, 8).toUpperCase()}</span>
                    </span>
                    <span className="queue-card-title">{r.title}</span>
                    <span className="queue-card-category">{r.category_name}</span>
                    {r.status === "TERMINATED" && (
                      <span className="terminal-subtitle">
                        {t(
                          "ยุติใบงานซ่อมด่วนตามผลพิจารณางบประมาณ (ดูเหตุผลและแนวทางดำเนินการต่อในรายละเอียด)",
                        )}
                      </span>
                    )}
                    <span className="queue-card-location">
                      <EnvironmentOutlined />
                      <span>{r.address || t("ไม่ระบุสถานที่")}</span>
                    </span>
                    <span className="queue-card-footer">
                      <span className="queue-open-hint">
                        {r.id === selected
                          ? t("กำลังเปิด")
                          : history
                            ? t("ดูประวัติ")
                            : t("เปิดงาน")}
                        <RightOutlined />
                      </span>
                    </span>
                    {Number(r.votes) >= 0 && (
                      <span className="queue-card-votes">
                        <LikeOutlined /> {r.votes}
                        {t("โหวต")}
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
              historyOnly={history}
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
              <Title level={3}>
                {history ? t("ประวัติการดำเนินงาน") : t("ทุกเรื่องต้องมีคนดูแล")}
              </Title>
              <p>
                {history
                  ? t("เลือกงานเพื่อดูรายละเอียดและประวัติการดำเนินงาน")
                  : t("เลือกคำร้องจากคิวงานเพื่อดูรายละเอียด")}
                <br />
                {history
                  ? t("ดูเอกสาร หลักฐาน และผลการดำเนินงานย้อนหลัง")
                  : t("ตรวจหลักฐาน และดำเนินการตามขั้นตอน")}
              </p>
              {!history && (
                <div className="welcome-process">
                  <span>{t("รับเรื่อง")}</span>
                  <i>→</i>
                  <span>{t("ประสานทีม")}</span>
                  <i>→</i>
                  <span>{t("ติดตามผล")}</span>
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
