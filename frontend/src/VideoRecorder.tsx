import { useEffect, useRef, useState } from "react";
import { Alert, Button, Modal, Progress, Space, Typography } from "antd";
import { useI18n } from "./i18n/useI18n";

export const MAX_RECORDING_SECONDS = 60;
// About 2 Mbps keeps a full minute near 15 MB, well under the 100 MB per-file cap.
const VIDEO_BITS_PER_SECOND = 2_000_000;
const AUDIO_BITS_PER_SECOND = 64_000;

function recorderType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return ["video/mp4", "video/webm;codecs=vp8,opus", "video/webm"].find((type) =>
    MediaRecorder.isTypeSupported(type),
  );
}

export function canRecordVideo(): boolean {
  return !!navigator.mediaDevices?.getUserMedia && !!recorderType();
}

type Phase = "starting" | "ready" | "recording" | "done" | "error";

export default function VideoRecorder({
  open,
  onClose,
  onRecorded,
}: {
  open: boolean;
  onClose: () => void;
  onRecorded: (file: File) => void;
}) {
  const { t } = useI18n();
  const preview = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | undefined>(undefined);
  const recorder = useRef<MediaRecorder | undefined>(undefined);
  const [camera, setCamera] = useState(0);
  const chunks = useRef<Blob[]>([]);
  const [phase, setPhase] = useState<Phase>("starting");
  const [elapsed, setElapsed] = useState(0);
  const [clip, setClip] = useState<File>();
  const [clipUrl, setClipUrl] = useState<string>();

  const stopTracks = () => {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = undefined;
  };

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPhase("starting");
    setElapsed(0);
    setClip(undefined);
    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      })
      .then((media) => {
        if (cancelled) return media.getTracks().forEach((track) => track.stop());
        stream.current = media;
        setPhase("ready");
      })
      .catch(() => !cancelled && setPhase("error"));
    return () => {
      cancelled = true;
      if (recorder.current?.state === "recording") recorder.current.stop();
      stopTracks();
    };
  }, [open, camera]);

  useEffect(() => {
    const view = preview.current;
    if (!view || !stream.current || view.srcObject === stream.current) return;
    view.srcObject = stream.current;
    void view.play().catch(() => {});
  }, [phase]);

  useEffect(() => {
    if (phase !== "recording") return;
    const started = Date.now();
    const timer = setInterval(() => {
      const seconds = Math.min(MAX_RECORDING_SECONDS, Math.floor((Date.now() - started) / 1000));
      setElapsed(seconds);
      if (seconds >= MAX_RECORDING_SECONDS) recorder.current?.stop();
    }, 250);
    return () => clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (!clip) return setClipUrl(undefined);
    const url = URL.createObjectURL(clip);
    setClipUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [clip]);

  function start() {
    const type = recorderType();
    if (!stream.current || !type) return setPhase("error");
    chunks.current = [];
    const media = new MediaRecorder(stream.current, {
      mimeType: type,
      videoBitsPerSecond: VIDEO_BITS_PER_SECOND,
      audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
    });
    media.ondataavailable = (event) => event.data.size && chunks.current.push(event.data);
    media.onstop = () => {
      const base = type.split(";")[0];
      const blob = new Blob(chunks.current, { type: base });
      const extension = base === "video/mp4" ? "mp4" : "webm";
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      setClip(new File([blob], `video-${stamp}.${extension}`, { type: base }));
      setPhase("done");
      stopTracks();
    };
    recorder.current = media;
    media.start(1000);
    setElapsed(0);
    setPhase("recording");
  }

  function close() {
    if (recorder.current?.state === "recording") {
      recorder.current.onstop = null;
      recorder.current.stop();
    }
    stopTracks();
    onClose();
  }

  const remaining = MAX_RECORDING_SECONDS - elapsed;
  return (
    <Modal
      open={open}
      title={t("ถ่ายวิดีโอ (ไม่เกิน {{seconds}} วินาที)", { seconds: MAX_RECORDING_SECONDS })}
      onCancel={close}
      maskClosable={false}
      destroyOnHidden
      footer={null}
      className="video-recorder"
    >
      {phase === "error" ? (
        <Alert
          type="warning"
          showIcon
          message={t("เปิดกล้องไม่สำเร็จ")}
          description={t(
            "กรุณาอนุญาตให้เว็บไซต์ใช้กล้องและไมโครโฟน หรือใช้ปุ่มแนบไฟล์จากเครื่องแทน",
          )}
        />
      ) : (
        <>
          {phase === "done" && clipUrl ? (
            <video className="video-recorder-view" src={clipUrl} controls playsInline />
          ) : (
            <video className="video-recorder-view" ref={preview} muted playsInline />
          )}
          <div className="video-recorder-status" role="status" aria-live="polite">
            {phase === "recording" ? (
              <>
                <Typography.Text strong className="video-recorder-time">
                  {t("กำลังบันทึก · เหลืออีก {{seconds}} วินาที", { seconds: remaining })}
                </Typography.Text>
                <Progress
                  percent={(elapsed / MAX_RECORDING_SECONDS) * 100}
                  showInfo={false}
                  status={remaining <= 10 ? "exception" : "active"}
                />
              </>
            ) : phase === "done" && clip ? (
              <Typography.Text>
                {t("ความยาว {{seconds}} วินาที · ขนาด {{size}} MB", {
                  seconds: elapsed,
                  size: (clip.size / 1_000_000).toFixed(1),
                })}
              </Typography.Text>
            ) : (
              <Typography.Text type="secondary">
                {t("ระบบจะหยุดบันทึกเองเมื่อครบ {{seconds}} วินาที", {
                  seconds: MAX_RECORDING_SECONDS,
                })}
              </Typography.Text>
            )}
          </div>
          <Space wrap className="video-recorder-actions">
            {phase === "ready" && (
              <Button type="primary" danger onClick={start}>
                {t("เริ่มบันทึก")}
              </Button>
            )}
            {phase === "recording" && (
              <Button type="primary" onClick={() => recorder.current?.stop()}>
                {t("หยุดบันทึก")}
              </Button>
            )}
            {phase === "done" && clip && (
              <>
                <Button
                  type="primary"
                  onClick={() => {
                    onRecorded(clip);
                    close();
                  }}
                >
                  {t("ใช้วิดีโอนี้")}
                </Button>
                <Button onClick={() => setCamera((value) => value + 1)}>{t("ถ่ายใหม่")}</Button>
              </>
            )}
          </Space>
        </>
      )}
    </Modal>
  );
}
