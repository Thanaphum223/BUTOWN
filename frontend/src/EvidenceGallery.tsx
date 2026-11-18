import { useI18n } from "./i18n/useI18n";
import { Image, Typography, Tag } from "antd";
import AttachmentList from "./AttachmentList";
type Media = {
  id: string;
  original_name: string;
  content_type: string;
  size_bytes?: number;
  evidence_stage?: string;
  has_thumbnail?: boolean;
};
export default function EvidenceGallery({
  media = [],
  paired = false,
}: {
  media: Media[];
  paired?: boolean;
}) {
  const { t } = useI18n();
  if (!media.length)
    return <Typography.Paragraph type="secondary">{t("ยังไม่มีไฟล์ให้แสดง")}</Typography.Paragraph>;
  const documents = media.filter((file) => file.content_type === "application/pdf");
  const visual = media.filter(
    (file) => file.content_type.startsWith("image/") || file.content_type.startsWith("video/"),
  );
  const before = visual.filter((file) => file.evidence_stage === "BEFORE");
  const after = visual.filter((file) => file.evidence_stage === "AFTER");
  const pair = paired && before.length > 0 && after.length > 0;
  const rest = pair
    ? visual.filter((file) => !["BEFORE", "AFTER"].includes(file.evidence_stage || ""))
    : visual;
  const figure = (file: Media) => (
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
          {t("เบราว์เซอร์นี้ไม่รองรับวิดีโอชนิดนี้")}
        </video>
      )}
      <figcaption>
        {file.evidence_stage && file.evidence_stage !== "GENERAL" && (
          <Tag>{file.evidence_stage === "BEFORE" ? t("ก่อนแก้ไข") : t("หลังแก้ไข")}</Tag>
        )}
        <span>{file.original_name}</span>
      </figcaption>
    </figure>
  );
  return (
    <>
      <Image.PreviewGroup>
        {pair && (
          <div className="evidence-pair" aria-label={t("เทียบภาพก่อนและหลังแก้ไข")}>
            {[
              { label: t("ก่อนแก้ไข"), files: before },
              { label: t("หลังแก้ไข"), files: after },
            ].map((side) => (
              <section key={side.label}>
                <h4>
                  {side.label} ({side.files.length})
                </h4>
                <div className="evidence-gallery">{side.files.map(figure)}</div>
              </section>
            ))}
          </div>
        )}
        {rest.length > 0 && <div className="evidence-gallery">{rest.map(figure)}</div>}
      </Image.PreviewGroup>
      {documents.length > 0 && <AttachmentList files={documents} endpoint="media" />}
    </>
  );
}
