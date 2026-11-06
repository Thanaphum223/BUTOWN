import { useI18n } from "./i18n/useI18n";
import type { Language } from "./i18n/core";
export default function LanguageSwitcher() {
  const { language, setLanguage } = useI18n();
  return (
    <select
      className="language-switcher"
      aria-label="Language / ภาษา"
      value={language}
      onChange={(event) => setLanguage(event.target.value as Language)}
    >
      <option value="th" lang="th">
        ไทย
      </option>
      <option value="en" lang="en">
        English
      </option>
    </select>
  );
}
