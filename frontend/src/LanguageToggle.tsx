import { useI18n } from "./i18n/useI18n";
import type { Language } from "./i18n/core";
export default function LanguageToggle({ className = "" }: { className?: string }) {
  const { language, setLanguage } = useI18n();
  return (
    <div
      className={["language-toggle", className].filter(Boolean).join(" ")}
      role="group"
      aria-label="Language / ภาษา"
    >
      {(["th", "en"] as Language[]).map((value) => (
        <button
          key={value}
          type="button"
          lang={value}
          aria-pressed={language === value}
          aria-label={value === "th" ? "ภาษาไทย" : "English"}
          onClick={() => setLanguage(value)}
        >
          {value.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
