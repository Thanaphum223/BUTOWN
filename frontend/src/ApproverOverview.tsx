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
import { FilterOutlined, ReloadOutlined } from "@ant-design/icons";
import { api, date, statusNames } from "./api";
import { useI18n } from "./i18n/useI18n";

type Summary = {
  id: string;
  title: string;
  address: string;
  status: string;
  created_at: string;
  category_name: string;
};
type Overview = {
  items: Summary[];
  total: number;
  stats: { total: number; in_progress: number; closed: number; overdue: number };
};
const { Title, Text } = Typography;

export default function ApproverOverview({ onQueue }: { onQueue: () => void }) {
  const { t } = useI18n();
  const [data, setData] = useState<Overview>();
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("all");
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [category, setCategory] = useState<string>();
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [catalogError, setCatalogError] = useState("");
  const [status, setStatus] = useState<string>();
  const [area, setArea] = useState("");
  const [sort, setSort] = useState("newest");

  useEffect(() => {
    let alive = true;
    setCatalogError("");
    api<{ categories: { id: string; name: string }[] }>("/catalog")
      .then((catalog) => {
        if (alive) setCategories(catalog.categories);
      })
      .catch((failure: Error) => {
        if (alive) setCatalogError(failure.message);
      });
    return () => {
      alive = false;
    };
  }, [refresh]);
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
    setData(undefined);
    const params = new URLSearchParams({
      overview: "true",
      page: String(page - 1),
      size: "10",
      q: query,
      sort,
      area,
    });
    if (scope !== "all") params.set(scope === "active" ? "activeOnly" : "completedOnly", "true");
    if (status) params.set("status", status);
    if (category) params.set("categoryId", category);
    api<Overview>("/complaints?" + params)
      .then((result) => {
        if (!alive) return;
        if (page > 1 && !result.items.length && result.total <= (page - 1) * 10)
          setPage(Math.max(1, Math.ceil(result.total / 10)));
        else setData(result);
      })
      .catch((failure: Error) => {
        if (alive) setError(failure.message);
      });
    return () => {
      alive = false;
    };
  }, [page, query, scope, category, status, area, sort, refresh]);

  return (
    <div className="approver-overview">
      <div className="page-heading">
        <div>
          <Text className="eyebrow">{t("ศูนย์ประสานงาน · TOWNTRACK")}</Text>
          <Title level={2}>{t("ภาพรวมคำร้องทั้งเทศบาล")}</Title>
          <Text type="secondary">
            {t(
              "ติดตามจำนวนและสถานะคำร้องทุกเรื่องในเทศบาล เปิดคิวงานอนุมัติเพื่อตรวจรายละเอียดและเอกสารตามสิทธิ์ของคุณ",
            )}
          </Text>
        </div>
        <div className="overview-actions">
          <Button icon={<ReloadOutlined />} onClick={() => setRefresh((value) => value + 1)}>
            {t("โหลดใหม่")}
          </Button>
          <Button type="primary" onClick={onQueue}>
            {t("เปิดคิวงานอนุมัติ")}
          </Button>
        </div>
      </div>
      <div className="workspace-stats">
        {[
          [t("คำร้องทั้งหมดในเทศบาล"), data?.stats.total ?? "—"],
          [t("กำลังดำเนินการ"), data?.stats.in_progress ?? "—"],
          [t("ปิดเรื่องแล้ว"), data?.stats.closed ?? "—"],
          [t("เกินกำหนด"), data?.stats.overdue ?? "—"],
        ].map(([label, value]) => (
          <Card key={label}>
            <Statistic title={label} value={value} />
          </Card>
        ))}
      </div>
      {error && <Alert type="error" showIcon message={t(error)} />}
      {catalogError && (
        <Alert
          type="warning"
          showIcon
          message={t("โหลดประเภทคำร้องไม่สำเร็จ กรุณากดโหลดใหม่")}
          description={t(catalogError)}
        />
      )}
      <Card
        className="overview-list"
        title={t("สถานะคำร้องทั้งเทศบาล")}
        extra={
          <Text type="secondary">
            {data?.total ?? "—"} {t("เรื่อง")}
          </Text>
        }
      >
        <label className="control-label" htmlFor="overview-query">
          {t("ค้นหาเลขเรื่อง / หัวข้อ")}
        </label>
        <Input.Search
          id="overview-query"
          placeholder={t("ค้นหาเรื่อง…")}
          value={search}
          allowClear
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className="queue-quick-status" aria-label={t("กรองสถานะคำร้อง")}>
          {[
            ["all", "ทั้งหมด"],
            ["active", "กำลังดำเนินการ"],
            ["completed", "เสร็จสิ้น"],
          ].map(([value, label]) => (
            <Button
              key={value}
              type={scope === value ? "primary" : "default"}
              aria-pressed={scope === value}
              onClick={() => {
                setScope(value);
                setPage(1);
              }}
            >
              {t(label)}
            </Button>
          ))}
        </div>
        <details className="queue-filters">
          <summary>
            <FilterOutlined />
            {t("ตัวกรองและการเรียงลำดับ")}
          </summary>
          <Space className="overview-filters" direction="vertical">
            <Select
              aria-label={t("กรองสถานะคำร้อง")}
              placeholder={t("ทุกสถานะ")}
              value={status}
              allowClear
              onChange={(value) => {
                setStatus(value);
                setPage(1);
              }}
              options={Object.entries(statusNames).map(([value, label]) => ({
                value,
                label: t(label),
              }))}
            />
            <Select
              aria-label={t("ประเภทปัญหา")}
              placeholder={t("ทุกประเภท")}
              value={category}
              allowClear
              onChange={(value) => {
                setCategory(value);
                setPage(1);
              }}
              options={categories.map((value) => ({ value: value.id, label: value.name }))}
            />
            <Input.Search
              aria-label={t("พื้นที่")}
              placeholder={t("ค้นหาพื้นที่ / สถานที่")}
              value={area}
              allowClear
              onChange={(event) => {
                setArea(event.target.value);
                setPage(1);
              }}
            />
            <Select
              aria-label={t("เรียงลำดับคำร้อง")}
              value={sort}
              onChange={(value) => {
                setSort(value);
                setPage(1);
              }}
              options={[
                ["newest", "ใหม่ที่สุด"],
                ["oldest", "เก่าที่สุด"],
                ["votes", "คะแนนโหวตสูงสุด"],
              ].map(([value, label]) => ({ value, label: t(label) }))}
            />
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
          </Space>
        </details>
        <Text type="secondary" className="overview-scope-note">
          {t("รายการนี้แสดงข้อมูลสรุปเท่านั้น จำนวนด้านบนรวมทุกสถานะและไม่เปลี่ยนตามตัวกรอง")}
        </Text>
        <div className="overview-summaries" aria-live="polite" aria-busy={!data && !error}>
          {!data && !error ? (
            <Card loading />
          ) : !data?.items.length ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={t(
                error ? "โหลดรายการงานไม่สำเร็จ กรุณากดโหลดใหม่" : "ไม่พบงานตามตัวกรอง",
              )}
            />
          ) : (
            data.items.map((item) => (
              <article className="overview-summary" key={item.id}>
                <div className="overview-summary-status">
                  <Tag
                    color={
                      item.status === "CLOSED"
                        ? "green"
                        : ["REJECTED", "TERMINATED"].includes(item.status)
                          ? "red"
                          : "gold"
                    }
                  >
                    {t(statusNames[item.status] || item.status)}
                  </Tag>
                  <Text type="secondary">#{item.id.slice(0, 8).toUpperCase()}</Text>
                </div>
                <Title level={3}>{item.title}</Title>
                <Text>{item.category_name}</Text>
                <Text type="secondary">{item.address || t("ไม่ระบุสถานที่")}</Text>
                <Text type="secondary">
                  {t("วันที่แจ้ง")} {date(item.created_at)}
                </Text>
              </article>
            ))
          )}
        </div>
        <Pagination
          current={page}
          total={data?.total ?? 0}
          pageSize={10}
          showSizeChanger={false}
          onChange={setPage}
        />
      </Card>
    </div>
  );
}
