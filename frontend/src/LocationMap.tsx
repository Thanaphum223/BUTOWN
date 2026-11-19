import { useI18n } from "./i18n/useI18n";
import { Alert, Spin } from "antd";
import { api } from "./api";
import { lazy, Suspense, useEffect, useState } from "react";
type Point = {
  id: string;
  latitude: number;
  longitude: number;
  status: string;
  categoryName?: string;
};
export type LocationMapProps = {
  value?: [number, number];
  onChange?: (v: [number, number]) => void;
  points?: Point[];
  radiusMeters?: number;
  fitPoints?: boolean;
};

// Both map engines load on demand so neither weighs down the first page load.
const LeafletMap = lazy(() => import("./LeafletLocationMap"));
const MapboxMap = lazy(() => import("./MapboxLocationMap"));
let configuration: Promise<{ provider: string; publicToken: string }> | undefined;
export default function LocationMap(props: LocationMapProps) {
  const { t } = useI18n();
  const [config, setConfig] = useState<{ provider: string; publicToken: string }>();
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    configuration ??= api("/public/map-config");
    configuration
      .then((c) => {
        if (active) setConfig(c);
      })
      .catch(() => {
        configuration = undefined;
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, []);
  if (error)
    return <Alert type="warning" message={t("โหลดการตั้งค่าแผนที่ไม่สำเร็จ กรุณาลองใหม่")} />;
  if (!config) return <Spin />;
  return (
    <Suspense fallback={<Spin />}>
      {config.provider === "mapbox" ? (
        <MapboxMap {...props} token={config.publicToken} />
      ) : (
        <LeafletMap {...props} />
      )}
    </Suspense>
  );
}
