import { createContext, useContext, useEffect, useRef, useState } from "react";
type P = [number, number];
type Geo = {
  point?: P;
  busy: boolean;
  error: string;
  request: () => Promise<P | undefined>;
};
const Context = createContext<Geo>({
  busy: false,
  error: "",
  request: async () => undefined,
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
  const initialized = useRef(false);
  const [point, setPoint] = useState<P | undefined>(cached),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function request() {
    setBusy(true);
    setError("");
    try {
      const p = await locate();
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
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    void request();
  }, []);
  return (
    <Context.Provider value={{ point, busy, error, request }}>
      {children}
    </Context.Provider>
  );
}
export const useGeo = () => useContext(Context);
