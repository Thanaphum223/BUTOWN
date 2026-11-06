import { useEffect } from "react";
import type { FormInstance } from "antd";
import { useI18n } from "./useI18n";

/** Refresh existing validation messages without touching values or untouched fields. */
export function useLocalizedFormErrors(form: FormInstance): void {
  const { language } = useI18n();
  useEffect(() => {
    const invalid = form.getFieldsError().filter((field) => field.errors.length);
    if (invalid.length)
      void form.validateFields(invalid.map((field) => field.name)).catch(() => {});
  }, [form, language]);
}
