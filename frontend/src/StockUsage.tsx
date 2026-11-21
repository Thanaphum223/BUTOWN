import { useEffect, useState } from "react";
import { Card, Table } from "antd";
import { api } from "./api";
import { useI18n } from "./i18n/useI18n";

type D = Record<string, any>;
const amount = (value: unknown) =>
  Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

// Issued, returned and used quantities for this report's jobs, from the stock register.
export default function StockUsage({ id, version }: { id: string; version: number }) {
  const { t } = useI18n();
  const [rows, setRows] = useState<D[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    api<D[]>(`/stock/complaints/${id}`, { signal: controller.signal })
      .then(setRows)
      .catch(() => {});
    return () => controller.abort();
  }, [id, version]);
  if (!rows.length) return null;
  return (
    <Card className="stock-usage" style={{ marginTop: 20 }} title={t("การเบิก-คืนวัสดุจากคลัง")}>
      <Table
        size="small"
        pagination={false}
        rowKey={(r) => `${r.stock_item_id}:${r.work_order_id}`}
        dataSource={rows}
        scroll={{ x: true }}
        columns={[
          { title: t("วัสดุ"), dataIndex: "name" },
          {
            title: t("เบิก"),
            render: (_, r) => `${amount(r.issued)} ${r.unit}`,
          },
          {
            title: t("คืนคลัง"),
            render: (_, r) => `${amount(r.returned)} ${r.unit}`,
          },
          {
            title: t("ใช้ไป"),
            render: (_, r) => <strong>{`${amount(r.used)} ${r.unit}`}</strong>,
          },
        ]}
      />
    </Card>
  );
}
