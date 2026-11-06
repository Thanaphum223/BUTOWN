import { useSyncExternalStore } from "react";

export const uatToolsEnabled = import.meta.env.VITE_ENABLE_UAT_TOOLS === "true";
const listeners = new Set<() => void>();
let identity: string | null = null;
let citizen = false;
let state = { active: false, pending: 0 };
function update(next: typeof state) {
  state = next;
  listeners.forEach((listener) => listener());
}
export function setUatAccount(user: { id: string; role: string } | null) {
  const next = user ? `${user.id}:${user.role}` : null;
  citizen = user?.role === "CITIZEN";
  if (identity !== next || !user) {
    identity = next;
    update({ ...state, active: false });
  }
}
export function setUatSimulation(active: boolean) {
  if (active && (!uatToolsEnabled || citizen || state.pending > 0)) return;
  update({ ...state, active });
}
export function assertUatRequestAllowed(url: string) {
  if (
    uatToolsEnabled &&
    state.active &&
    !citizen &&
    !url.startsWith("/public/") &&
    url !== "/auth/logout"
  )
    throw new Error("จำลอง / UAT: ระงับคำขอใหม่ชั่วคราว กรุณาคืนการเชื่อมต่อปกติ");
}
// Begin before CSRF preparation; finally release even when preparation or fetch fails.
export function beginClientMutation() {
  update({ ...state, pending: state.pending + 1 });
  return () => update({ ...state, pending: state.pending - 1 });
}
export function useUatAuth() {
  const snapshot = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => state,
  );
  return { ...snapshot, available: uatToolsEnabled && identity !== null && !citizen };
}
