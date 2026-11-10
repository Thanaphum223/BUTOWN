import { useLiveQuery } from "./useLiveQuery";
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
import { FilterOutlined } from "@ant-design/icons";
import { date, statusNames } from "./api";
import { useI18n } from "./i18n/useI18n";

type Summary = {
  id: string;
  title: string;
  address: string;
  status: string;
  created_at: string;
  category_name: string;
  can_open: boolean;
};
type Overview = {
  items: Summary[];
  total: number;
  stats: { total: number; in_progress: number; closed: number; overdue: number };
};
const { Title, Text } = Typography;

export default function ApproverOverview({
  onQueue,
  onOpen,
}: {
  onQueue: () => void;
  onOpen: (id: string) => void;
}) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("all");
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState<string>();
  const [status, setStatus] = useState<string>();
  const [area, setArea] = useState("");
  const [sort, setSort] = useState("newest");

  const { data: catalog, error: catalogError } = useLiveQuery<{
    categories: { id: string; name: string }[];
  }>("/catalog");
  const categories = catalog?.categories || [];
  useEffect(() => {
    if (search === query) return;
    const timer = setTimeout(() => {
      setQuery(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
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
  const { data, error } = useLiveQuery<Overview>("/complaints?" + params);
  useEffect(() => {
    if (data && page > 1 && !data.items.length && data.total <= (page - 1) * 10)
      setPage(Math.max(1, Math.ceil(data.total / 10)));
  }, [data, page]);

  return (
    <div className="approver-overview">
      <div className="page-heading">
        <div>
          <Title level={2}>{t("ภาพรวมคำร้องทั้งเทศบาล")}</Title>
        </div>
        <div className="overview-actions">
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
          message={t("โหลดประเภทคำร้องไม่สำเร็จ ระบบจะลองใหม่อัตโนมัติ")}
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
        <div className="overview-summaries" aria-live="polite" aria-busy={!data && !error}>
          {!data && !error ? (
            <Card loading />
          ) : !data?.items.length ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={t(
                error ? "โหลดรายการงานไม่สำเร็จ ระบบจะลองใหม่อัตโนมัติ" : "ไม่พบงานตามตัวกรอง",
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
                {item.can_open && (
                  <Button onClick={() => onOpen(item.id)}>{t("ดูรายละเอียด")}</Button>
                )}
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
