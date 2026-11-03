import { Image, Typography, Tag } from "antd";
type Media = {
  id: string;
  original_name: string;
  content_type: string;
  evidence_stage?: string;
  has_thumbnail?: boolean;
};
export default function EvidenceGallery({ media = [] }: { media: Media[] }) {
  if (!media.length)
    return (
      <Typography.Paragraph type="secondary">ยังไม่มีหลักฐานที่อนุญาตให้แสดง</Typography.Paragraph>
    );
  return (
    <div className="evidence-gallery">
      <Image.PreviewGroup>
        {media.map((file) => (
          <figure key={file.id}>
            {file.content_type.startsWith("image/") ? (
              <Image
                loading="lazy"
                src={`/api/media/${file.id}${file.has_thumbnail ? "?thumbnail=true" : ""}`}
                alt={file.original_name}
                preview={{ src: `/api/media/${file.id}` }}
              />
            ) : (
              <video controls playsInline preload="none" aria-label={file.original_name}>
                <source src={`/api/media/${file.id}`} type={file.content_type} />
                เบราว์เซอร์นี้ไม่รองรับวิดีโอชนิดนี้
              </video>
            )}
            <figcaption>
              {file.evidence_stage && file.evidence_stage !== "GENERAL" && (
                <Tag>{file.evidence_stage === "BEFORE" ? "ก่อนแก้ไข" : "หลังแก้ไข"}</Tag>
              )}
              <span>{file.original_name}</span>
            </figcaption>
          </figure>
        ))}
      </Image.PreviewGroup>
    </div>
  );
}
