import DialogTools from "./DialogTools";
import { useI18n } from "./i18n/useI18n";
import { useEffect, useState } from "react";
import { Alert, Descriptions, Modal, Spin, Tag, Timeline, Typography } from "antd";
import { api, statusNames, progressLabel, date } from "./api";
import EvidenceGallery from "./EvidenceGallery";
import CitizenOutcome from "./CitizenOutcome";
import LocationMap from "./LocationMap";
type D = Record<string, any>;
export default function CommunityDetail({ id, onClose }: { id?: string; onClose: () => void }) {
  const { t } = useI18n();
  const [data, setData] = useState<D>();
  const [error, setError] = useState("");
  useEffect(() => {
    setData(undefined);
    setError("");
    if (!id) return;
    const controller = new AbortController();
    api<D>(`/community/complaints/${id}`, { signal: controller.signal })
      .then(setData)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [id]);
  const c = data?.complaint;
  return (
    <Modal open={!!id} title={t("รายละเอียดปัญหา")} onCancel={onClose} footer={null} width={640}>
      <DialogTools />
      {error ? (
        <Alert type="warning" message={t(error)} />
      ) : !c ? (
        <Spin />
      ) : (
        <>
          <Typography.Title level={4}>{c.category_name}</Typography.Title>
          {c.mock && <Tag>{t("MOCK · ข้อมูลจำลอง")}</Tag>}
          <Descriptions
            column={1}
            size="small"
            items={[
              { key: "id", label: t("เลขอ้างอิง"), children: `#${c.id.slice(0, 8).toUpperCase()}` },
              { key: "status", label: t("สถานะ"), children: progressLabel(c) },
              { key: "created", label: t("วันที่แจ้ง"), children: date(c.created_at) },
              { key: "updated", label: t("อัปเดตล่าสุด"), children: date(c.updated_at) },
            ]}
          />
          <CitizenOutcome status={c.status} history={data?.history || []} />
          <Typography.Title level={5}>{t("หลักฐานประกอบ")}</Typography.Title>
          <EvidenceGallery media={data?.media || []} />
          {c.latitude != null && c.longitude != null && (
            <LocationMap
              points={[
                {
                  id: c.id,
                  latitude: Number(c.latitude),
                  longitude: Number(c.longitude),
                  status: c.status,
                  categoryName: c.category_name,
                },
              ]}
              fitPoints
            />
          )}
          <Typography.Text type="secondary">
            {t("แสดงตำแหน่งโดยประมาณและความคืบหน้า โดยไม่เปิดเผยข้อมูลส่วนตัวของผู้แจ้ง")}
          </Typography.Text>
          <Typography.Title level={5}>{t("ความคืบหน้า")}</Typography.Title>
          <Timeline
            items={
              data!.history.length
                ? data!.history.map((h: D) => ({
                    children: `${date(h.created_at)} · ${t(statusNames[h.to_status] || h.to_status)}`,
                  }))
                : [{ children: `${date(c.created_at)} · ${progressLabel(c)}` }]
            }
          />
        </>
      )}
    </Modal>
  );
}
