import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
type Point = {
  id: string;
  latitude: number;
  longitude: number;
  status: string;
};
type Props = {
  value?: [number, number];
  onChange?: (v: [number, number]) => void;
  points?: Point[];
};
export default function LocationMap({ value, onChange, points }: Props) {
  const el = useRef<HTMLDivElement>(null),
    map = useRef<L.Map | null>(null),
    marker = useRef<L.CircleMarker | null>(null),
    cb = useRef(onChange);
  cb.current = onChange;
  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current).setView(
      value || [13.7563, 100.5018],
      value ? 16 : 6,
    );
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(m);
    m.on("click", (e) => cb.current?.([e.latlng.lat, e.latlng.lng]));
    map.current = m;
    const timer = setTimeout(() => m.invalidateSize(), 100);
    const resize = new ResizeObserver(() => m.invalidateSize());
    resize.observe(el.current);
    return () => {
      clearTimeout(timer);
      resize.disconnect();
      m.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    if (!map.current || !value) return;
    marker.current?.remove();
    marker.current = L.circleMarker(value, {
      radius: 9,
      color: "#137455",
      fillOpacity: 0.8,
    }).addTo(map.current);
    map.current.setView(value, 16);
  }, [value?.[0], value?.[1]]);
  useEffect(() => {
    if (!map.current) return;
    const layer = L.layerGroup().addTo(map.current);
    for (const item of points || []) {
      const dot = L.circleMarker(
        [Number(item.latitude), Number(item.longitude)],
        {
          radius: 8,
          color: "#fff",
          weight: 2,
          fillColor: item.status === "NEW" ? "#dd932c" : "#397cb8",
          fillOpacity: 1,
        },
      );
      const label = document.createElement("span");
      label.textContent = "#" + item.id.slice(0, 8).toUpperCase();
      dot.bindTooltip(label).addTo(layer);
    }
    return () => {
      layer.remove();
    };
  }, [points]);
  return (
    <div
      role="region"
      aria-label="แผนที่ตำแหน่งปัญหา"
      ref={el}
      className="location-map"
      style={{ height: 280, borderRadius: 12, margin: "12px 0" }}
    />
  );
}
