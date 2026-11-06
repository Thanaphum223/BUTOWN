import { englishMessages } from "./messages";

export type Language = "th" | "en";
const storageKey = "towntrack.language";
const listeners = new Set<() => void>();
let language: Language = "th";
try {
  if (localStorage.getItem(storageKey) === "en") language = "en";
} catch {
  // Some browsers disable storage; the current tab still keeps its preference.
}
function updateDocumentLanguage() {
  if (typeof document !== "undefined") document.documentElement.lang = language;
}
updateDocumentLanguage();
export function getLanguage(): Language {
  return language;
}
export function setLanguage(next: Language): void {
  language = next;
  try {
    localStorage.setItem(storageKey, next);
  } catch {
    // Language changes remain available in memory when persistence is blocked.
  }
  updateDocumentLanguage();
  listeners.forEach((listener) => listener());
}
export function subscribeLanguage(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function translate(message: string, params?: Record<string, string | number>): string {
  const translated =
    language === "en" && Object.prototype.hasOwnProperty.call(englishMessages, message)
      ? englishMessages[message]
      : message;
  return translated.replace(/\{\{(\w+)\}\}/g, (placeholder, name: string) =>
    params && Object.prototype.hasOwnProperty.call(params, name)
      ? String(params[name])
      : placeholder,
  );
}
