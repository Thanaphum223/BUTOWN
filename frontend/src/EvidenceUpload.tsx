import { useState } from "react";
import { Alert, Button, Progress, Space, Typography, Upload } from "antd";
import { CameraOutlined, UploadOutlined } from "@ant-design/icons";
import { uploadFile } from "./api";
import { ATTACHMENT_ACCEPT, attachmentError } from "./attachments";

type Props = {
  complaintId: string;
  stage?: string;
  pdf?: boolean;
  photos?: boolean;
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
  photos = false,
  used,
  disabled = false,
  onUploaded,
  onBusy,
  onFailed,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState("");
  const [lastFile, setLastFile] = useState("");
  const accept = pdf ? ".pdf" : photos ? ".jpg,.jpeg,.png" : ATTACHMENT_ACCEPT;
  const send = async (file: File) => {
    if (busy || disabled) return false;
    const problem =
      attachmentError(file, used) ||
      (pdf && (!/\.pdf$/i.test(file.name) || file.size > 15_000_000)
        ? "ใช้ไฟล์ PDF ขนาดไม่เกิน 15 MB"
        : undefined) ||
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
        {photos && (
          <Upload
            accept="image/jpeg,image/png"
            capture="environment"
            showUploadList={false}
            disabled={busy || disabled}
            beforeUpload={send}
          >
            <Button icon={<CameraOutlined />} loading={busy} disabled={busy || disabled}>
              ถ่ายรูป{stage === "BEFORE" ? "ก่อนทำ" : "หลังทำ"}
            </Button>
          </Upload>
        )}
        <Upload
          accept={accept}
          showUploadList={false}
          disabled={busy || disabled}
          beforeUpload={send}
        >
          <Button icon={<UploadOutlined />} loading={busy} disabled={busy || disabled}>
            {pdf ? "เลือกเอกสาร PDF" : photos ? "เลือกรูปจากเครื่อง" : "แนบภาพ วิดีโอ หรือเอกสาร"}
          </Button>
        </Upload>
      </Space>
      {busy && (
        <div role="status">
          <Typography.Text>{lastFile}</Typography.Text>
          <Progress percent={percent} size="small" />
          <Typography.Text type="secondary">
            {percent === 100
              ? "กำลังตรวจสอบและบันทึกไฟล์ กรุณารอสักครู่"
              : "กำลังอัปโหลด กรุณาเปิดหน้านี้ไว้"}
          </Typography.Text>
        </div>
      )}
      {error && <Alert type="error" showIcon message={error} />}
    </div>
  );
}
