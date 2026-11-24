import { Button } from "antd";
import { fontScales, setFontScale, useFontScale } from "./fontScale";
import { useI18n } from "./i18n/useI18n";

export default function FontSizeControl() {
  const { t } = useI18n();
  const index = fontScales.indexOf(useFontScale());
  return (
    <div className="font-size-control">
      <Button
        aria-label={t("ย่อขนาดตัวอักษร")}
        disabled={index === 0}
        onClick={() => setFontScale(fontScales[index - 1])}
      >
        {t("ก−")}
      </Button>
      <Button
        aria-label={t("ขยายขนาดตัวอักษร")}
        disabled={index === fontScales.length - 1}
        onClick={() => setFontScale(fontScales[index + 1])}
      >
        {t("ก+")}
      </Button>
    </div>
  );
}
