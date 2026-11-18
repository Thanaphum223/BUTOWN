import { useI18n } from "./i18n/useI18n";
import { createContext, useContext, useRef, useState } from "react";
type P = [number, number];
type Geo = {
  point?: P;
  busy: boolean;
  error: string;
  /** True when the user declined the privacy notice, so GPS stays off. */
  declined: boolean;
  request: () => Promise<P | undefined>;
  /** Called by PrivacyGate with the user's decision on the privacy notice. */
  setConsent: (consented: boolean) => void;
  /** Reopens the privacy notice so a user who declined can change their mind. */
  reviewConsent: () => void;
  /** PrivacyGate registers how to reopen the notice. */
  onReviewConsent: (open: (() => void) | undefined) => void;
};
const GPS_DECLINED_MESSAGE =
  "คุณไม่ยินยอมตามประกาศคุ้มครองข้อมูลส่วนบุคคล จึงใช้ GPS ไม่ได้ ปักหมุดหรือกรอกที่อยู่เองได้";
const Context = createContext<Geo>({
  busy: false,
  error: "",
  declined: false,
  request: async () => undefined,
  setConsent: () => {},
  reviewConsent: () => {},
  onReviewConsent: () => {},
});
let pending: Promise<P> | undefined;
let cached: P | undefined;
function locate() {
  if (!pending)
    pending = new Promise<P>((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("อุปกรณ์ไม่รองรับ GPS"));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (p) => resolve([p.coords.latitude, p.coords.longitude]),
        (e) =>
          reject(
            new Error(
              e.code === 1
                ? "ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง กรุณาปักหมุดหรือกรอกที่อยู่เอง"
                : "ไม่สามารถระบุตำแหน่งได้ กรุณาลองใหม่หรือปักหมุดเอง",
            ),
          ),
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
      );
    }).finally(() => {
      pending = undefined;
    });
  return pending;
}
export function GeoProvider({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const [point, setPoint] = useState<P | undefined>(cached),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [declined, setDeclined] = useState(false);
  const consented = useRef(true);
  const reopen = useRef<(() => void) | undefined>(undefined);
  function setConsent(value: boolean) {
    consented.current = value;
    setDeclined(!value);
    if (value) {
      setError("");
      return;
    }
    cached = undefined;
    setPoint(undefined);
    setError(GPS_DECLINED_MESSAGE);
  }
  async function request() {
    if (!consented.current) {
      setError(GPS_DECLINED_MESSAGE);
      return undefined;
    }
    setBusy(true);
    setError("");
    try {
      const p = await locate();
      if (!consented.current) return undefined;
      cached = p;
      setPoint(p);
      return p;
    } catch (e) {
      setError((e as Error).message);
      return undefined;
    } finally {
      setBusy(false);
    }
  }
  return (
    <Context.Provider
      value={{
        point,
        busy,
        error: t(error),
        declined,
        request,
        setConsent,
        reviewConsent: () => reopen.current?.(),
        onReviewConsent: (open) => {
          reopen.current = open;
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useGeo = () => useContext(Context);
