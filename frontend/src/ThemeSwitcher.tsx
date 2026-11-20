import { Moon, Sun } from "lucide-react";
import { useI18n } from "./i18n/useI18n";
import { setColorMode, useColorMode } from "./colorMode";
export default function ThemeSwitcher() {
  const { t } = useI18n();
  const dark = useColorMode() === "dark";
  const label = dark ? t("เปลี่ยนเป็นโหมดสว่าง") : t("เปลี่ยนเป็นโหมดมืด");
  return (
    <button
      type="button"
      className="theme-switcher"
      aria-label={label}
      title={label}
      aria-pressed={dark}
      onClick={() => setColorMode(dark ? "light" : "dark")}
    >
      {dark ? <Sun aria-hidden size={22} /> : <Moon aria-hidden size={22} />}
    </button>
  );
}
