import { useI18n } from "./i18n/useI18n";
import { Card, List, Tag, Typography, Empty } from "antd";
import AttachmentList from "./AttachmentList";
import { date } from "./api";
type D = Record<string, any>;
function RequestedItems({ resource }: { resource: D }) {
  const { t, language } = useI18n();
  const items: D[] = JSON.parse(resource.requested_items || "[]");
  if (!items.length) return null;
  return (
    <>
      <Typography.Text strong>{t("รายการที่ผู้ลงพื้นที่ขอ")}</Typography.Text>
      <List
        size="small"
        className="resource-revision-items"
        dataSource={items}
        renderItem={(item: D) => (
          <List.Item>
            <span>{item.name}</span>
            <span>
              {Number(item.quantity).toLocaleString()} {item.unit}
            </span>
          </List.Item>
        )}
      />
      {resource.loan_due_on && (
        <Typography.Paragraph>
          <Typography.Text strong>{t("กำหนดวันส่งคืนครุภัณฑ์")}: </Typography.Text>
          {new Date(resource.loan_due_on).toLocaleDateString(
            language === "en" ? "en-GB" : "th-TH",
            { dateStyle: "medium", timeZone: "UTC" },
          )}
        </Typography.Paragraph>
      )}
      <VehicleUse resource={resource} />
    </>
  );
}
// Form 3, the request to use a municipal vehicle, as the approver reads it.
function VehicleUse({ resource }: { resource: D }) {
  const { t } = useI18n();
  if (!resource.vehicle_form) return null;
  const use: D = JSON.parse(resource.vehicle_form);
  const period = (value?: string) => (value ? date(value + ":00+07:00") : "-");
  return (
    <div className="vehicle-use">
      <Typography.Text strong>{t("ใบขออนุญาตใช้รถส่วนกลาง (แบบ 3)")}</Typography.Text>
      {use.waived ? (
        <Typography.Paragraph type="secondary">
          {t("ใช้รถภายในเขตเทศบาล ได้รับยกเว้นแบบ 3")}
        </Typography.Paragraph>
      ) : (
        <dl>
          <dt>{t("สถานที่ไป")}</dt>
          <dd>
            {use.destination}
            {use.local && ` (${t("ภายในเขตเทศบาล")})`}
          </dd>
          <dt>{t("วัตถุประสงค์การใช้รถ")}</dt>
          <dd>{use.purpose}</dd>
          <dt>{t("ผู้ขับ")}</dt>
          <dd>{use.driverName}</dd>
          <dt>{t("จำนวนผู้โดยสาร (รวมผู้ขับ)")}</dt>
          <dd>{use.passengers}</dd>
          <dt>{t("ช่วงเวลาใช้รถ")}</dt>
          <dd>
            {period(use.startAt)} – {period(use.endAt)}
          </dd>
        </dl>
      )}
    </div>
  );
}
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
  const newestFirst = (a: D, b: D) => String(b.created_at).localeCompare(String(a.created_at));
  const unsubmitted = resources.filter(
    (resource) => !JSON.parse(resource.revisions || "[]").length,
  );
  const cancelled = unsubmitted
    .filter((resource) => resource.status === "WITHDRAWN")
    .sort(newestFirst);
  const drafts = unsubmitted
    .filter((resource) => resource.status !== "WITHDRAWN")
    .sort(newestFirst);
  const requestCard = (resource: D) => (
    <Card
      className="resource-request-draft"
      key={resource.id}
      title={resource.status === "WITHDRAWN" ? t("คำขอที่ยกเลิก") : t("ร่างข้อเสนอ")}
      extra={resource.status === "WITHDRAWN" ? <Tag color="red">{t("ยกเลิกแล้ว")}</Tag> : undefined}
    >
      <Typography.Paragraph>
        <Typography.Text strong>{t("ผู้ขอทรัพยากร")}: </Typography.Text>
        {resource.requester_name || t("ไม่ระบุชื่อผู้ขอ")}
      </Typography.Paragraph>
      <Typography.Paragraph type="secondary">{date(resource.created_at)}</Typography.Paragraph>
      <Typography.Text strong>{t("ความจำเป็นในการขอทรัพยากร")}</Typography.Text>
      <Typography.Paragraph style={{ whiteSpace: "pre-wrap" }}>
        {resource.necessity || t("ไม่พบบันทึกความจำเป็นของคำขอเดิม")}
      </Typography.Paragraph>
      <RequestedItems resource={resource} />
    </Card>
  );
  const draftRequests = drafts.map(requestCard);
  const cancelledRequests =
    cancelled.length > 1 ? (
      <details className="cancelled-resource-requests">
        <summary>{t("คำขอที่ยกเลิกแล้ว ({{count}})", { count: cancelled.length })}</summary>
        {cancelled.map(requestCard)}
      </details>
    ) : (
      cancelled.map(requestCard)
    );
  if (!latest)
    return (
      <>
        {draftRequests}
        {cancelledRequests}
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
          <RequestedItems resource={latest} />
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
                <span>
                  {item.name}
                  {item.quantity != null &&
                    ` ${Number(item.quantity).toLocaleString()} ${item.unit}`}
                </span>
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
      {cancelledRequests}
    </>
  );
}
