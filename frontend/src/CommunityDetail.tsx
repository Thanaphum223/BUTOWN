import { useEffect, useState } from "react";
import { Alert, Descriptions, Modal, Spin, Tag, Timeline, Typography } from "antd";
import { api, statusNames, date } from "./api";
import EvidenceGallery from "./EvidenceGallery";
import LocationMap from "./LocationMap";
type D = Record<string, any>;
export default function CommunityDetail({ id, onClose }: { id?: string; onClose: () => void }) {
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
    <Modal open={!!id} title="รายละเอียดปัญหา" onCancel={onClose} footer={null} width={640}>
      {error ? (
        <Alert type="warning" message={error} />
      ) : !c ? (
        <Spin />
      ) : (
        <>
          <Typography.Title level={4}>{c.category_name}</Typography.Title>
          {c.mock && <Tag>MOCK · ข้อมูลจำลอง</Tag>}
          <Descriptions
            column={1}
            size="small"
            items={[
              { key: "id", label: "เลขอ้างอิง", children: `#${c.id.slice(0, 8).toUpperCase()}` },
              { key: "status", label: "สถานะ", children: statusNames[c.status] || c.status },
              { key: "created", label: "วันที่แจ้ง", children: date(c.created_at) },
              { key: "updated", label: "อัปเดตล่าสุด", children: date(c.updated_at) },
            ]}
          />
          <Typography.Title level={5}>รูปภาพและวิดีโอหลักฐาน</Typography.Title>
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
            แสดงตำแหน่งโดยประมาณและความคืบหน้า โดยไม่เปิดเผยข้อมูลส่วนตัวของผู้แจ้ง
          </Typography.Text>
          <Typography.Title level={5}>ความคืบหน้า</Typography.Title>
          <Timeline
            items={
              data!.history.length
                ? data!.history.map((h: D) => ({
                    children: `${date(h.created_at)} · ${statusNames[h.to_status] || h.to_status}`,
                  }))
                : [{ children: `${date(c.created_at)} · ${statusNames[c.status] || c.status}` }]
            }
          />
        </>
      )}
    </Modal>
  );
}
