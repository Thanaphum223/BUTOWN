import { useI18n } from "./i18n/useI18n";
import { translate as t } from "./i18n/core";
import { Component, lazy, Suspense, useState, type ReactNode } from "react";
import { Alert, Button, Empty, Modal, Space, Spin, Typography } from "antd";
import {
  DownloadOutlined,
  EyeOutlined,
  FilePdfOutlined,
  PaperClipOutlined,
} from "@ant-design/icons";
const PdfPreview = lazy(() => import("./PdfPreview"));
type D = Record<string, any>;
type FileEndpoint = "files" | "media";
class PdfLoadBoundary extends Component<
  { file: D; endpoint: FileEndpoint; onClose: () => void; children: ReactNode; language: string },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <Modal
        open
        title={t("เปิดเอกสาร")}
        onCancel={this.props.onClose}
        footer={
          <Button
            href={`/api/${this.props.endpoint}/${this.props.file.id}`}
            icon={<DownloadOutlined />}
          >
            {t("ดาวน์โหลดเอกสารต้นฉบับ")}
          </Button>
        }
      >
        <Alert
          type="error"
          message={t("เปิดโปรแกรมอ่านเอกสารไม่ได้ กรุณาดาวน์โหลดต้นฉบับเพื่ออ่านด้วยแอป PDF")}
        />
      </Modal>
    ) : (
      this.props.children
    );
  }
}
export default function AttachmentList({
  files = [],
  emptyText = "ยังไม่มีเอกสารแนบ",
  extraActions,
  endpoint = "files",
}: {
  files?: D[];
  endpoint?: FileEndpoint;
  emptyText?: string;
  extraActions?: (file: D) => ReactNode;
}) {
  const { language, t } = useI18n();
  const [preview, setPreview] = useState<D>();
  return (
    <>
      {!files.length ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t(emptyText)} />
      ) : (
        <div className="attachment-list">
          {files.map((file) => {
            const pdf = file.content_type
              ? file.content_type === "application/pdf"
              : /\.pdf$/i.test(file.original_name);
            return (
              <div className="attachment-row" key={file.id}>
                <div className="attachment-name">
                  {pdf ? <FilePdfOutlined /> : <PaperClipOutlined />}
                  <div>
                    <Typography.Text strong>{file.original_name}</Typography.Text>
                    <br />
                    <Typography.Text type="secondary">
                      {(Number(file.size_bytes) / 1_000_000).toLocaleString(
                        language === "en" ? "en-GB" : "th-TH",
                        {
                          maximumFractionDigits: 2,
                        },
                      )}{" "}
                      MB
                    </Typography.Text>
                  </div>
                </div>
                <Space wrap>
                  {pdf && (
                    <Button icon={<EyeOutlined />} onClick={() => setPreview(file)}>
                      {t("ดูเอกสาร")}
                    </Button>
                  )}
                  <Button icon={<DownloadOutlined />} href={`/api/${endpoint}/${file.id}`}>
                    {t("ดาวน์โหลด")}
                  </Button>
                  {extraActions?.(file)}
                </Space>
              </div>
            );
          })}
        </div>
      )}
      {preview && (
        <PdfLoadBoundary
          key={`${endpoint}:${preview.id}`}
          file={preview}
          language={language}
          endpoint={endpoint}
          onClose={() => setPreview(undefined)}
        >
          <Suspense
            fallback={
              <Modal
                open
                title={t("กำลังเปิดเอกสาร")}
                onCancel={() => setPreview(undefined)}
                footer={null}
              >
                <Spin />
              </Modal>
            }
          >
            <PdfPreview
              key={`${endpoint}:${preview.id}`}
              endpoint={endpoint}
              file={preview as { id: string; original_name: string; size_bytes: number }}
              onClose={() => setPreview(undefined)}
            />
          </Suspense>
        </PdfLoadBoundary>
      )}
    </>
  );
}
