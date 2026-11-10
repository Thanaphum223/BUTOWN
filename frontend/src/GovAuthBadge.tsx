import { useI18n } from "./i18n/useI18n";

export default function GovAuthBadge() {
  const { t } = useI18n();
  return (
    <div className="gov-auth-badge">
      <strong>{t("แหล่งยืนยันตัวตน: Gov Center · Central Gov Auth RBAC")}</strong>
    </div>
  );
}
