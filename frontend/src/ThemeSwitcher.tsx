import { useI18n } from "./i18n/useI18n";
import { setColorMode, useColorMode, type ColorMode } from "./colorMode";
export default function ThemeSwitcher() {
  const { t } = useI18n();
  const mode = useColorMode();
  return (
    <select
      className="theme-switcher"
      aria-label={t("โหมดสี")}
      value={mode}
      onChange={(event) => setColorMode(event.target.value as ColorMode)}
    >
      <option value="light">{t("โหมดสว่าง")}</option>
      <option value="dark">{t("โหมดมืด")}</option>
    </select>
  );
}
