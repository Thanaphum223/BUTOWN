import { useI18n } from "./i18n/useI18n";
import { useState } from "react";
import { Alert, Button, Progress, Space, Typography, Upload } from "antd";
import { CameraOutlined, UploadOutlined } from "@ant-design/icons";
import { uploadFile } from "./api";
import { ATTACHMENT_ACCEPT, attachmentError } from "./attachments";

type Props = {
  complaintId: string;
  stage?: string;
  pdf?: boolean;
  proposalDocument?: boolean;
  photos?: boolean;
  cameraOnly?: boolean;
  used: number;
  disabled?: boolean;
  onUploaded: () => Promise<void>;
  onBusy: (busy: boolean) => void;
  onFailed?: (file: File, stage: string) => Promise<void>;
};
export default function EvidenceUpload({
  complaintId,
  stage = "GENERAL",
  pdf = false,
  proposalDocument = false,
  photos = false,
  cameraOnly = false,
  used,
  disabled = false,
  onUploaded,
  onBusy,
  onFailed,
}: Props) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState("");
  const [lastFile, setLastFile] = useState("");
  const [success, setSuccess] = useState("");
  const accept = proposalDocument
    ? ".jpg,.jpeg,.png,.pdf"
    : pdf
      ? ".pdf"
      : photos
        ? ".jpg,.jpeg,.png"
        : ATTACHMENT_ACCEPT;
  const send = async (file: File) => {
    if (busy || disabled) return false;
    setSuccess("");
    const problem =
      ((proposalDocument || pdf) &&
      !(proposalDocument ? /\.(pdf|png|jpe?g)$/i : /\.pdf$/i).test(file.name)
        ? proposalDocument
          ? "รองรับเอกสาร PDF หรือรูปภาพ PNG/JPEG"
          : "ใช้ไฟล์ PDF เท่านั้น"
        : undefined) ||
      ((proposalDocument || pdf) && file.size > 15_000_000
        ? "ไฟล์เอกสารแต่ละไฟล์ต้องไม่เกิน 15 MB"
        : undefined) ||
      attachmentError(file, used) ||
      (photos && !/\.(jpe?g|png)$/i.test(file.name)
        ? "ใช้ภาพถ่าย PNG หรือ JPEG สำหรับหลักฐานก่อนและหลังทำ"
        : undefined);
    if (problem) {
      setError(problem);
      return false;
    }
    setBusy(true);
    onBusy(true);
    setPercent(0);
    setError("");
    setLastFile(file.name);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("evidenceStage", stage);
      await uploadFile(`/complaints/${complaintId}/files`, body, setPercent);
      await onUploaded();
      setSuccess(file.name);
    } catch (e) {
      setError((e as Error).message);
      if (onFailed) await onFailed(file, stage);
    } finally {
      setBusy(false);
      onBusy(false);
    }
    return false;
  };
  return (
    <div className="evidence-upload">
      <Space wrap>
        {(photos || proposalDocument) && (
          <Upload
            accept="image/jpeg,image/png"
            capture="environment"
            showUploadList={false}
            disabled={busy || disabled}
            beforeUpload={send}
          >
            <Button icon={<CameraOutlined />} loading={busy} disabled={busy || disabled}>
              {proposalDocument ? (
                t("ถ่ายรูปเอกสาร")
              ) : (
                <>
                  {t("ถ่ายรูป")}
                  {stage === "BEFORE" ? t("ก่อนทำ") : t("หลังทำ")}
                </>
              )}
            </Button>
          </Upload>
        )}
        {!(photos && cameraOnly) && (
          <Upload
            accept={accept}
            showUploadList={false}
            disabled={busy || disabled}
            beforeUpload={send}
          >
            <Button icon={<UploadOutlined />} loading={busy} disabled={busy || disabled}>
              {proposalDocument
                ? t("เลือกรูปหรือเอกสาร PDF")
                : pdf
                  ? t("เลือกเอกสาร PDF")
                  : photos
                    ? t("เลือกรูปจากเครื่อง")
                    : t("แนบภาพ วิดีโอ หรือเอกสาร")}
            </Button>
          </Upload>
        )}
      </Space>
      {busy && (
        <div role="status">
          <Typography.Text>{lastFile}</Typography.Text>
          <Progress percent={percent} size="small" />
          <Typography.Text type="secondary">
            {percent === 100
              ? t("กำลังตรวจสอบและบันทึกไฟล์ กรุณารอสักครู่")
              : t("กำลังอัปโหลด กรุณาเปิดหน้านี้ไว้")}
          </Typography.Text>
        </div>
      )}
      {success && (
        <div role="status">
          <Alert type="success" showIcon message={t("แนบไฟล์แล้ว: {{name}}", { name: success })} />
        </div>
      )}
      {error && <Alert type="error" showIcon message={t(error)} />}
    </div>
  );
}
