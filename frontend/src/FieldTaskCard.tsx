import { Alert, Button, Card, Space, Spin, Tag, Typography } from "antd";
import { useI18n } from "./i18n/useI18n";
import { statusNames } from "./api";
import LocationMap from "./LocationMap";
type D = Record<string, any>;
export type CardMetadata = { complaint?: D; error?: string };
export default function FieldTaskCard({
  item,
  metadata,
  selected,
  mapOpen,
  onOpen,
  onMap,
  onRetry,
}: {
  item: D;
  metadata?: CardMetadata;
  selected: boolean;
  mapOpen: boolean;
  onOpen: () => void;
  onMap: () => void;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  const detail = metadata?.complaint;
  const assignment =
    typeof detail?.assignment_details === "string"
      ? JSON.parse(detail.assignment_details || "{}")
      : detail?.assignment_details;
  return (
    <Card className={"field-task-card" + (selected ? " selected" : "")}>
      <Space wrap>
        <Tag>{t(statusNames[item.status] || item.status)}</Tag>
        <Typography.Text type="secondary">#{item.id.slice(0, 8).toUpperCase()}</Typography.Text>
      </Space>
      <Typography.Title level={4}>{item.title}</Typography.Title>
      {item.status === "TERMINATED" && (
        <p className="terminal-subtitle">
          {t("ยุติใบงานซ่อมด่วนตามผลพิจารณางบประมาณ (ดูเหตุผลและแนวทางดำเนินการต่อในรายละเอียด)")}
        </p>
      )}
      <p>
        {t("ประเภทปัญหา")}: {item.category_name}
      </p>
      <p>
        {t("สถานที่")}: {item.address || t("ไม่ระบุสถานที่")}
      </p>
      <p>
        {item.votes ?? 0} {t("โหวต")}
      </p>
      {!metadata ? (
        <Spin size="small" aria-label={t("กำลังโหลดวันนัดหมายและตำแหน่ง")} />
      ) : metadata.error ? (
        <Alert
          type="error"
          showIcon
          message={t(metadata.error)}
          action={<Button onClick={onRetry}>{t("ลองใหม่")}</Button>}
        />
      ) : (
        <p>
          {t("วันนัดหมาย")}: {assignment?.appointment || t("ยังไม่ระบุวันนัดหมาย")}
        </p>
      )}
      <Space wrap>
        <Button
          type="primary"
          aria-label={t("เปิดงาน {{title}} เลขเรื่อง {{reference}}", {
            title: item.title,
            reference: item.id.slice(0, 8).toUpperCase(),
          })}
          onClick={onOpen}
        >
          {t("ดูรายละเอียด")}
        </Button>
        <Button
          aria-expanded={mapOpen}
          disabled={!detail || detail.latitude == null || detail.longitude == null}
          onClick={onMap}
        >
          {t(mapOpen ? "ปิดตำแหน่ง" : "เปิดตำแหน่ง")}
        </Button>
      </Space>
      {detail && detail.latitude == null && <p>{t("ไม่ระบุพิกัด")}</p>}
      {mapOpen && detail?.latitude != null && detail.longitude != null && (
        <>
          <Typography.Paragraph type="secondary">
            {t("พิกัด")}: {Number(detail.latitude).toFixed(5)},{" "}
            {Number(detail.longitude).toFixed(5)}
          </Typography.Paragraph>
          <LocationMap value={[Number(detail.latitude), Number(detail.longitude)]} />
        </>
      )}
    </Card>
  );
}
