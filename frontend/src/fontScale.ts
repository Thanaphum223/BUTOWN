import { useSyncExternalStore } from "react";

export const fontScales = [1, 1.125, 1.25];
const storageKey = "towntrack.fontScale";
const listeners = new Set<() => void>();
let scale = 1;
try {
  const saved = Number(localStorage.getItem(storageKey));
  if (fontScales.includes(saved)) scale = saved;
} catch {
  // Blocked storage: the choice lasts for this tab only.
}
function apply() {
  document.documentElement.style.setProperty("--tt-font-scale", String(scale));
}
apply();
export function setFontScale(next: number) {
  scale = next;
  try {
    localStorage.setItem(storageKey, String(next));
  } catch {
    // Same as above.
  }
  apply();
  listeners.forEach((listener) => listener());
}
export function useFontScale() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => scale,
  );
}
