import { useSyncExternalStore } from "react";
import { installGovTokens } from "./govTheme";

export type ColorMode = "light" | "dark";
const storageKey = "towntrack.colorMode";
const listeners = new Set<() => void>();
let mode: ColorMode = "light";
try {
  if (localStorage.getItem(storageKey) === "dark") mode = "dark";
} catch {
  // Some browsers disable storage; the current tab still keeps its preference.
}

export function applyColorMode() {
  document.documentElement.dataset.theme = mode;
  document.documentElement.style.colorScheme = mode;
  installGovTokens(mode);
}

export function setColorMode(next: ColorMode) {
  mode = next;
  try {
    localStorage.setItem(storageKey, next);
  } catch {
    // The choice still applies to this tab when persistence is blocked.
  }
  applyColorMode();
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useColorMode() {
  return useSyncExternalStore(
    subscribe,
    () => mode,
    () => mode,
  );
}
