import { Button } from "antd";
import LanguageSwitcher from "./LanguageSwitcher";
import { useI18n } from "./i18n/useI18n";
import { setUatSimulation, useUatAuth } from "./uatAuth";

// Keep these controls inside the active dialog's focus scope; changing language
// or suspending the UI never closes the dialog or creates a new form instance.
export default function DialogTools() {
  const { t } = useI18n();
  const { available, pending } = useUatAuth();
  return (
    <div className="dialog-tools">
      <LanguageSwitcher />
      {available && (
        <Button disabled={pending > 0} onClick={() => setUatSimulation(true)}>
          {t("จำลอง / UAT")}
        </Button>
      )}
    </div>
  );
}
