import { Card, List, Tag, Typography } from "antd";
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
  const submitted = resources
    .map((resource): D => ({ ...resource, revisions: JSON.parse(resource.revisions || "[]") }))
    .filter((resource) => resource.revisions.length);
  const latest = submitted.at(-1);
  if (!latest) return null;
  const revision = latest.revisions.at(-1);
  const current = files.filter((file) => file.resource_revision_id === revision.id);
  const legacy = files.filter(
    (file) => file.resource_id === latest.id && !file.resource_revision_id,
  );
  return (
    <Card
      className="resource-review-card"
      title="คำขอทรัพยากรและเอกสารประกอบ"
      extra={<Tag color="green">ฉบับที่ {revision.revision}</Tag>}
    >
      <Typography.Title level={4}>{revision.proposal}</Typography.Title>
      <div className="resource-review-summary">
        <Typography.Text strong>
          งบประมาณ {Number(revision.amount).toLocaleString("th-TH", { minimumFractionDigits: 2 })}{" "}
          บาท
        </Typography.Text>
        <Typography.Text>ระยะเวลา {revision.duration_days} วัน</Typography.Text>
        <Typography.Text type="secondary">ส่งเมื่อ {date(revision.created_at)}</Typography.Text>
      </div>
      {Array.isArray(revision.line_items) && revision.line_items.length > 0 && (
        <List
          size="small"
          dataSource={revision.line_items}
          renderItem={(item: D) => (
            <List.Item>
              <span>{item.name}</span>
              <Typography.Text>
                {Number(item.amount).toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท
              </Typography.Text>
            </List.Item>
          )}
        />
      )}
      <Typography.Title level={5}>เอกสารฉบับที่ {revision.revision}</Typography.Title>
      <AttachmentList
        files={current}
        emptyText="ไม่พบเอกสารที่ผูกกับฉบับนี้ กรุณาตรวจไฟล์เดิมด้านล่างหรือส่งกลับหัวหน้าให้แนบใหม่"
      />
      {legacy.length > 0 && (
        <details className="legacy-resource-files" open>
          <summary>ไฟล์คำขอเดิมที่ไม่ระบุฉบับ</summary>
          <AttachmentList files={legacy} />
        </details>
      )}
      {latest.revisions.length > 1 && (
        <Typography.Paragraph type="secondary">
          ดูเอกสารฉบับก่อนหน้าได้ในแท็บคำขอทรัพยากรด้านล่าง
        </Typography.Paragraph>
      )}
    </Card>
  );
}
