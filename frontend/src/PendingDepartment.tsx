import { useEffect } from "react";
import { Result } from "antd";
import { api } from "./api";
import { useI18n } from "./i18n/useI18n";

type User = Record<string, any>;

/** Shown to staff who have a role but no department; leaves by itself once one is chosen. */
export default function PendingDepartment({
  role,
  onUser,
}: {
  role: string;
  onUser: (next: User) => void;
}) {
  const { t } = useI18n();
  useEffect(() => {
    let alive = true;
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      api<User>("/auth/me")
        .then((next) => {
          if (alive && !next.pending_department) onUser(next);
        })
        .catch(() => {});
    }, 10_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [onUser]);
  return (
    <Result
      status="info"
      title={t("บัญชีของคุณรอกำหนดกอง")}
      subTitle={t(
        role === "FIELD"
          ? "หัวหน้าผู้ลงพื้นที่จะรับคุณเข้ากอง ระบบแจ้งให้ทราบแล้ว หน้านี้จะเปิดให้ใช้งานเองเมื่อกำหนดเสร็จ"
          : "นายกเทศมนตรีหรือปลัดเทศบาลจะกำหนดกองให้คุณ ระบบแจ้งให้ทราบแล้ว หน้านี้จะเปิดให้ใช้งานเองเมื่อกำหนดเสร็จ",
      )}
    />
  );
}
