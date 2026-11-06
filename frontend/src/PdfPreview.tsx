import DialogTools from "./DialogTools";
import { useI18n } from "./i18n/useI18n";
import { useEffect, useRef, useState } from "react";
import { Alert, Button, Modal, Space, Spin, Typography } from "antd";
import {
  DownloadOutlined,
  LeftOutlined,
  RightOutlined,
  MinusOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
  type RenderTask,
} from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
GlobalWorkerOptions.workerSrc = workerUrl;
type FileData = { id: string; original_name: string; size_bytes: number };
export default function PdfPreview({
  file,
  onClose,
  endpoint = "files",
}: {
  file: FileData;
  onClose: () => void;
  endpoint?: "files" | "media";
}) {
  const { t } = useI18n();
  const [pdf, setPdf] = useState<PDFDocumentProxy>();
  const [page, setPage] = useState(1),
    [zoom, setZoom] = useState(1),
    [width, setWidth] = useState(600);
  const [error, setError] = useState(""),
    [retry, setRetry] = useState(0),
    [rendering, setRendering] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null),
    container = useRef<HTMLDivElement>(null),
    renderTask = useRef<RenderTask | undefined>(undefined);
  useEffect(() => {
    if (Number(file.size_bytes) > 25_000_000) {
      setError("เอกสารขนาดใหญ่ กรุณาดาวน์โหลดเพื่อเปิดด้วยแอปอ่าน PDF");
      return;
    }
    let alive = true;
    setPdf(undefined);
    setError("");
    setPage(1);
    setZoom(1);
    const loading = getDocument({
      url: `/api/${endpoint}/${file.id}`,
      withCredentials: true,
      useWasm: false,
      cMapUrl: "/pdfjs/cmaps/",
      cMapPacked: true,
      standardFontDataUrl: "/pdfjs/standard_fonts/",
      wasmUrl: "/pdfjs/wasm/",
      iccUrl: "/pdfjs/iccs/",
      disableFontFace: true,
      useSystemFonts: true,
      disableRange: true,
      disableStream: true,
    });
    loading.promise
      .then((document) => {
        if (alive) setPdf(document);
      })
      .catch((failure: { name?: string; status?: number }) => {
        if (!alive) return;
        const message =
          failure.status === 401
            ? "เซสชันหมดอายุ กรุณาเข้าสู่ระบบแล้วเปิดเอกสารอีกครั้ง"
            : failure.status === 403
              ? "บัญชีนี้ไม่มีสิทธิ์เปิดเอกสาร กรุณาตรวจบทบาทและงานที่ได้รับมอบหมาย"
              : failure.status === 404
                ? "ไม่พบไฟล์เอกสารต้นฉบับ กรุณาให้ผู้แนบตรวจสอบไฟล์"
                : ["InvalidPDFException", "MissingPDFException"].includes(failure.name || "")
                  ? "ข้อมูลเอกสารเสียหายหรือไม่ใช่ PDF กรุณาแนบไฟล์ต้นฉบับใหม่"
                  : failure.name === "PasswordException"
                    ? "เอกสารนี้มีรหัสผ่าน กรุณาดาวน์โหลดเพื่อเปิดด้วยโปรแกรมอ่าน PDF"
                    : "เปิดเอกสารไม่ได้ กรุณาลองใหม่ หรือดาวน์โหลดไฟล์ต้นฉบับ";
        setError(message);
      });
    return () => {
      alive = false;
      renderTask.current?.cancel();
      void loading.destroy().catch(() => {});
    };
  }, [file.id, endpoint, retry]);
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver((entries) =>
      setWidth(Math.max(200, entries[0].contentRect.width - 24)),
    );
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!pdf || !canvas.current) return;
    let cancelled = false;
    setRendering(true);
    const prior = renderTask.current;
    prior?.cancel();
    void (async () => {
      try {
        if (prior) await prior.promise.catch(() => {});
        const current = await pdf.getPage(page);
        if (cancelled || !canvas.current) return;
        const base = current.getViewport({ scale: 1 });
        let scale = (Math.min(width, 900) / base.width) * zoom;
        const density = Math.min(window.devicePixelRatio || 1, 2);
        scale = Math.min(
          scale,
          Math.sqrt(12_000_000 / (base.width * base.height * density * density)),
        );
        const viewport = current.getViewport({ scale });
        const surface = canvas.current;
        surface.width = Math.floor(viewport.width * density);
        surface.height = Math.floor(viewport.height * density);
        surface.style.width = `${viewport.width}px`;
        surface.style.height = `${viewport.height}px`;
        const task = current.render({
          canvas: surface,
          viewport,
          transform: density === 1 ? undefined : [density, 0, 0, density, 0, 0],
        });
        renderTask.current = task;
        await task.promise;
      } catch (e) {
        if (!cancelled && (e as Error).name !== "RenderingCancelledException")
          setError("แสดงหน้านี้ไม่ได้ กรุณาดาวน์โหลดเอกสารต้นฉบับ");
      } finally {
        if (!cancelled) setRendering(false);
      }
    })();
    return () => {
      cancelled = true;
      renderTask.current?.cancel();
    };
  }, [pdf, page, width, zoom]);
  return (
    <Modal
      open
      title={file.original_name}
      onCancel={onClose}
      width={1000}
      className="pdf-preview-modal"
      footer={
        <Button icon={<DownloadOutlined />} href={`/api/${endpoint}/${file.id}`}>
          {t("ดาวน์โหลดเอกสารต้นฉบับ")}
        </Button>
      }
    >
      <DialogTools />
      {error ? (
        <Alert
          type="error"
          showIcon
          message={t(error)}
          action={<Button onClick={() => setRetry((v) => v + 1)}>{t("ลองใหม่")}</Button>}
        />
      ) : !pdf ? (
        <div className="pdf-loading">
          <Spin />
          <p>{t("กำลังเปิดเอกสาร…")}</p>
        </div>
      ) : (
        <>
          <Space wrap className="pdf-toolbar">
            <Button
              aria-label={t("หน้าก่อนของเอกสาร")}
              icon={<LeftOutlined />}
              disabled={page <= 1 || rendering}
              onClick={() => setPage((v) => v - 1)}
            />
            <Typography.Text aria-live="polite">
              {t("หน้า")} {page} / {pdf.numPages}
            </Typography.Text>
            <Button
              aria-label={t("หน้าถัดไปของเอกสาร")}
              icon={<RightOutlined />}
              disabled={page >= pdf.numPages || rendering}
              onClick={() => setPage((v) => v + 1)}
            />
            <Button
              aria-label={t("ย่อเอกสาร")}
              icon={<MinusOutlined />}
              disabled={zoom <= 0.5 || rendering}
              onClick={() => setZoom((v) => v - 0.25)}
            />
            <Button
              aria-label={t("ขยายเอกสาร")}
              icon={<PlusOutlined />}
              disabled={zoom >= 2 || rendering}
              onClick={() => setZoom((v) => v + 0.25)}
            />
            {rendering && <Spin size="small" />}
          </Space>
        </>
      )}
      <div
        className="pdf-canvas-scroll"
        ref={container}
        style={{ display: error || !pdf ? "none" : undefined }}
      >
        <canvas
          ref={canvas}
          aria-label={t("เอกสาร {{name}} หน้า {{page}}", { name: file.original_name, page })}
        />
      </div>
    </Modal>
  );
}
