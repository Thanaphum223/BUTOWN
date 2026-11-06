import { useI18n } from "./i18n/useI18n";

export default function GovAuthBadge({ signedIn = false }: { signedIn?: boolean }) {
  const { t } = useI18n();
  return (
    <div className="gov-auth-badge">
      <strong>
        {t(
          signedIn
            ? "บัญชีที่ยืนยันตัวตนแล้ว · Gov Center · Central Gov Auth RBAC"
            : "แหล่งยืนยันตัวตน: Gov Center · Central Gov Auth RBAC",
        )}
      </strong>
      {signedIn && (
        <small>
          {t(
            "สิทธิ์ใน TownTrack อาจปรับโดยผู้ดูแลระบบ ข้อมูลเซสชันนี้ไม่ได้ยืนยันว่าตรวจสิทธิ์กับ Gov ทุกคำขอ",
          )}
        </small>
      )}
    </div>
  );
}
