import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api";

type Snapshot<T> = { key: string; data?: T; error: string; loading: boolean };

/** Serial background reads; changing identity cancels and discards the previous response. */
export function useLiveQuery<T>(url: string, revision = 0, scope = "", enabled = true) {
  const key = scope + ":" + url;
  const [snapshot, setSnapshot] = useState<Snapshot<T>>({ key, error: "", loading: true });
  const reader = useRef<(force?: boolean) => Promise<void>>(async () => {});
  const reload = useCallback(() => reader.current(true), []);

  useEffect(() => {
    let alive = true;
    let controller: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = (retry = false) => {
      clearTimeout(timer);
      if (alive && (enabled || retry)) timer = setTimeout(() => void read(retry), 4000);
    };
    async function read(force = false) {
      clearTimeout(timer);
      if ((!enabled && !force) || document.visibilityState !== "visible" || !navigator.onLine) {
        schedule(force && !enabled);
        return;
      }
      if (controller && !force) return;
      controller?.abort();
      const request = new AbortController();
      controller = request;
      let failed = false;
      try {
        const data = await api<T>(url, { signal: request.signal });
        if (alive && !request.signal.aborted) setSnapshot({ key, data, error: "", loading: false });
      } catch (failure) {
        if (alive && !request.signal.aborted) {
          failed = true;
          const revoked = failure instanceof ApiError && [401, 403].includes(failure.status);
          setSnapshot((previous) => ({
            key,
            data: !revoked && previous.key === key ? previous.data : undefined,
            error: (failure as Error).message,
            loading: false,
          }));
        }
      } finally {
        if (controller === request) {
          controller = undefined;
          schedule(failed && force);
        }
      }
    }
    reader.current = read;
    if (enabled) void read();
    const resume = () => {
      if (enabled && document.visibilityState === "visible") void read();
    };
    window.addEventListener("focus", resume);
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      alive = false;
      clearTimeout(timer);
      controller?.abort();
      window.removeEventListener("focus", resume);
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", resume);
      reader.current = async () => {};
    };
  }, [key, url, revision, enabled]);

  return {
    data: snapshot.key === key ? snapshot.data : undefined,
    error: snapshot.key === key ? snapshot.error : "",
    loading: snapshot.key !== key || snapshot.loading,
    reload,
  };
}
