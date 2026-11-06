import { useSyncExternalStore } from "react";
import { getLanguage, setLanguage, subscribeLanguage, translate } from "./core";
export function useI18n() {
  const language = useSyncExternalStore(subscribeLanguage, getLanguage, getLanguage);
  return { language, setLanguage, t: translate };
}
