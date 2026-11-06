import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Alert, Button, Switch } from "antd";
import { useI18n } from "./i18n/useI18n";
import { setUatSimulation, uatToolsEnabled, useUatAuth } from "./uatAuth";

export const failClosedMessage =
  "ไม่สามารถเชื่อมต่อระบบยืนยันตัวตนส่วนกลางได้ เพื่อความปลอดภัยระบบจึงระงับการทำงานชั่วคราว (503 Service Unavailable - Fail-Closed)";

export default function UatAuthToolbar({ busy = false }: { busy?: boolean }) {
  const { t } = useI18n();
  const { active, pending } = useUatAuth();
  const [host] = useState(() => document.createElement("div"));
  const tools = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!uatToolsEnabled) return;
    host.className = "uat-auth-host";
    // A manual popover puts the control in the browser top layer, above modal masks.
    // DialogTools provides entry within each modal focus trap; this host owns
    // suspension and focus restoration while workflow portals stay mounted.
    host.setAttribute("popover", "manual");
    document.body.append(host);
    host.showPopover();
    const remember = (event: FocusEvent) => {
      if (event.target instanceof HTMLElement && !host.contains(event.target))
        previousFocus.current = event.target;
    };
    if (document.activeElement instanceof HTMLElement)
      previousFocus.current = document.activeElement;
    document.addEventListener("focusin", remember);
    return () => {
      document.removeEventListener("focusin", remember);
      host.remove();
    };
  }, [host]);
  useLayoutEffect(() => {
    if (!active) return;
    const restoreFocus = previousFocus.current;
    // Suspending the UI is not a user abandoning a field. Prevent synthetic blur
    // handlers from clearing in-progress Select searches or validating draft inputs.
    const preserveDraftFocus = (event: FocusEvent) => {
      if (event.target instanceof Element && !host.contains(event.target)) event.stopPropagation();
    };
    document.addEventListener("focusout", preserveDraftFocus, true);
    const saved = new Map<
      HTMLElement,
      {
        inert: boolean;
        display: string;
        priority: string;
        aria: string | null;
        suspended: string | null;
      }
    >();
    const hide = () => {
      for (const child of document.body.children) {
        if (
          !(child instanceof HTMLElement) ||
          child === host ||
          ["SCRIPT", "STYLE"].includes(child.tagName) ||
          saved.has(child)
        )
          continue;
        saved.set(child, {
          inert: child.inert,
          display: child.style.getPropertyValue("display"),
          priority: child.style.getPropertyPriority("display"),
          aria: child.getAttribute("aria-hidden"),
          suspended: child.getAttribute("data-uat-suspended"),
        });
        child.inert = true;
        child.setAttribute("data-uat-suspended", "");
        child.style.setProperty("display", "none", "important");
        child.setAttribute("aria-hidden", "true");
      }
    };
    hide();
    const observer = new MutationObserver(hide);
    observer.observe(document.body, { childList: true });
    tools.current?.querySelector<HTMLButtonElement>("button.uat-restore")?.focus();
    return () => {
      observer.disconnect();
      saved.forEach((value, child) => {
        child.inert = value.inert;
        if (value.suspended === null) child.removeAttribute("data-uat-suspended");
        else child.setAttribute("data-uat-suspended", value.suspended);
        child.style.setProperty("display", value.display, value.priority);
        if (value.aria === null) child.removeAttribute("aria-hidden");
        else child.setAttribute("aria-hidden", value.aria);
      });
      // Wait one frame for restored visibility before the browser can focus a field.
      requestAnimationFrame(() => {
        if (restoreFocus?.isConnected) restoreFocus.focus({ preventScroll: true });
        document.removeEventListener("focusout", preserveDraftFocus, true);
      });
    };
  }, [active, host]);
  // Restore the page if this control leaves the account screen.
  useEffect(() => () => setUatSimulation(false), []);
  if (!uatToolsEnabled) return null;
  return createPortal(
    <div
      ref={tools}
      onPointerDown={(event) => {
        event.stopPropagation();
        if (
          !active &&
          document.activeElement instanceof HTMLElement &&
          !host.contains(document.activeElement)
        )
          previousFocus.current = document.activeElement;
      }}
      onMouseDown={(event) => {
        event.stopPropagation();
        if (!active) event.preventDefault();
      }}
      className={"uat-auth-tools" + (active ? " is-blocked" : "")}
    >
      <div className="uat-auth-control">
        <strong>{t("จำลอง / UAT")}</strong>
        <label>
          <Switch
            checked={active}
            disabled={!active && (busy || pending > 0)}
            aria-label={t("จำลองสถานะ Gov กลางขัดข้อง (Test Fail-Closed 503)")}
            onChange={setUatSimulation}
          />
          <span>{t("จำลองสถานะ Gov กลางขัดข้อง (Test Fail-Closed 503)")}</span>
        </label>
      </div>
      {(pending > 0 || busy) && <small>{t("รอการบันทึกหรืออัปโหลดให้เสร็จก่อนเริ่มจำลอง")}</small>}
      {active && (
        <>
          <Alert type="error" showIcon message={t(failClosedMessage)} />
          <p>
            {t(
              "เป็นการจำลองฝั่ง UI เท่านั้น ไม่ใช่หลักฐานว่า HTTP response ของ Gov เปลี่ยนเป็น 503 จริง",
            )}
          </p>
          <Button className="uat-restore" type="primary" onClick={() => setUatSimulation(false)}>
            {t("คืนการเชื่อมต่อปกติ")}
          </Button>
        </>
      )}
    </div>,
    host,
  );
}
