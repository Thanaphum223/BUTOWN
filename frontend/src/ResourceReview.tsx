import { useI18n } from "./i18n/useI18n";
import { Card, List, Tag, Typography, Empty } from "antd";
import AttachmentList from "./AttachmentList";
import { date } from "./api";
type D = Record<string, any>;
export default function ResourceReview({
  resources = [],
  files = [],
}: {
  resources?: D[];
  files?: D[];
}) {
  const { t, language } = useI18n();
  const submitted = resources
    .map((resource): D => ({ ...resource, revisions: JSON.parse(resource.revisions || "[]") }))
    .filter((resource) => resource.revisions.length);
  const latest = submitted.at(-1);
  const drafts = resources.filter((resource) => !JSON.parse(resource.revisions || "[]").length);
  const draftRequests = drafts.map((resource) => (
    <Card className="resource-request-draft" key={resource.id} title={t("ร่างข้อเสนอ")}>
      <Typography.Paragraph>
        <Typography.Text strong>{t("ผู้ขอทรัพยากร")}: </Typography.Text>
        {resource.requester_name || t("ไม่ระบุชื่อผู้ขอ")}
      </Typography.Paragraph>
      <Typography.Paragraph type="secondary">{date(resource.created_at)}</Typography.Paragraph>
      <Typography.Text strong>{t("ความจำเป็นในการขอทรัพยากร")}</Typography.Text>
      <Typography.Paragraph style={{ whiteSpace: "pre-wrap" }}>
        {resource.necessity || t("ไม่พบบันทึกความจำเป็นของคำขอเดิม")}
      </Typography.Paragraph>
    </Card>
  ));
  if (!latest)
    return (
      <>
        {draftRequests}
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={t(
            "ยังไม่มีข้อเสนอทรัพยากร หัวหน้าสามารถจัดทำและแนบเอกสารจากปุ่มส่งข้อเสนอทรัพยากร",
          )}
        />
      </>
    );
  const revision = latest.revisions.at(-1);
  const current = files.filter((file) => file.resource_revision_id === revision.id);
  const legacy = files.filter(
    (file) => file.resource_id === latest.id && !file.resource_revision_id,
  );
  return (
    <>
      {draftRequests}
      <Card
        className="resource-review-card"
        title={t("คำขอทรัพยากรและเอกสารประกอบ")}
        extra={
          <Tag color="green">
            {t("ฉบับที่")} {revision.revision}
          </Tag>
        }
      >
        <div className="resource-request-context">
          <Typography.Paragraph>
            <Typography.Text strong>{t("ผู้ขอทรัพยากร")}: </Typography.Text>
            {latest.requester_name || t("ไม่ระบุชื่อผู้ขอ")}
          </Typography.Paragraph>
          <Typography.Paragraph type="secondary">{date(latest.created_at)}</Typography.Paragraph>
          <Typography.Text strong>{t("ความจำเป็นในการขอทรัพยากร")}</Typography.Text>
          <Typography.Paragraph style={{ whiteSpace: "pre-wrap" }}>
            {latest.necessity || t("ไม่พบบันทึกความจำเป็นของคำขอเดิม")}
          </Typography.Paragraph>
        </div>
        <Typography.Title level={4}>{revision.proposal}</Typography.Title>
        <div className="resource-review-summary">
          <Typography.Text strong>
            {t("งบประมาณ")}{" "}
            {Number(revision.amount).toLocaleString(language === "en" ? "en-GB" : "th-TH", {
              minimumFractionDigits: 2,
            })}{" "}
            {t("บาท")}{" "}
          </Typography.Text>
          <Typography.Text>
            {t("ระยะเวลา")} {revision.duration_days} {t("วัน")}{" "}
          </Typography.Text>
          <Typography.Text type="secondary">
            {t("ส่งเมื่อ")} {date(revision.created_at)}
          </Typography.Text>
        </div>
        {Array.isArray(revision.line_items) && revision.line_items.length > 0 && (
          <List
            size="small"
            dataSource={revision.line_items}
            renderItem={(item: D) => (
              <List.Item>
                <span>{item.name}</span>
                <Typography.Text>
                  {Number(item.amount).toLocaleString(language === "en" ? "en-GB" : "th-TH", {
                    minimumFractionDigits: 2,
                  })}{" "}
                  {t("บาท")}{" "}
                </Typography.Text>
              </List.Item>
            )}
          />
        )}
        <Typography.Title level={5}>
          {t("เอกสารฉบับที่")} {revision.revision}
        </Typography.Title>
        <AttachmentList
          files={current}
          emptyText={t(
            "ไม่พบเอกสารที่ผูกกับฉบับนี้ กรุณาตรวจไฟล์เดิมด้านล่างหรือส่งกลับหัวหน้าให้แนบใหม่",
          )}
        />
        {legacy.length > 0 && (
          <details className="legacy-resource-files" open>
            <summary>{t("ไฟล์คำขอเดิมที่ไม่ระบุฉบับ")}</summary>
            <AttachmentList files={legacy} />
          </details>
        )}
        {latest.revisions.length > 1 && (
          <Typography.Paragraph type="secondary">
            {t("ดูเอกสารฉบับก่อนหน้าได้ในแท็บคำขอทรัพยากรด้านล่าง")}
          </Typography.Paragraph>
        )}
      </Card>
    </>
  );
}
