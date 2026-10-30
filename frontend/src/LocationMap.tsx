import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
type Point = {
  id: string;
  latitude: number;
  longitude: number;
  status: string;
  categoryName?: string;
};
type Props = {
  value?: [number, number];
  onChange?: (v: [number, number]) => void;
  points?: Point[];
  radiusMeters?: number;
  fitPoints?: boolean;
};
export default function LocationMap({ value, onChange, points, radiusMeters, fitPoints }: Props) {
  const el = useRef<HTMLDivElement>(null),
    map = useRef<L.Map | null>(null),
    radius = useRef<L.Circle | null>(null),
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
    const resize = new ResizeObserver(() => {
      m.invalidateSize();
      if (radius.current) m.fitBounds(radius.current.getBounds(), { padding: [20, 20], animate: false });
    });
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
    radius.current?.remove();
    if (radiusMeters) {
      radius.current = L.circle(value, {
        radius: radiusMeters,
        color: "#137455",
        weight: 2,
        fillColor: "#137455",
        fillOpacity: 0.1,
        interactive: false,
        className: "nearby-radius",
      }).addTo(map.current);
    }
    marker.current = L.circleMarker(value, {
      radius: 9,
      color: "#137455",
      fillOpacity: 0.8,
      className: "selected-location",
      interactive: false,
    }).addTo(map.current);
    if (radiusMeters && radius.current) map.current.fitBounds(radius.current.getBounds());
    else map.current.setView(value, 16);
  }, [value?.[0], value?.[1], radiusMeters]);
  useEffect(() => {
    if (!map.current) return;
    const layer = L.layerGroup().addTo(map.current);
    for (const item of points || []) {
      const name = item.categoryName || "";
      const symbol = /ขยะ/.test(name) ? "♻" : /ไฟ|ส่องสว่าง/.test(name) ? "ϟ" : /ถนน|ทางเท้า/.test(name) ? "▧" : /น้ำ|ประปา|คลอง/.test(name) ? "≈" : /ต้นไม้|สวน/.test(name) ? "♧" : /อาคาร/.test(name) ? "⌂" : /เสียง|ฝุ่น/.test(name) ? "≋" : "⚑";
      const icon = document.createElement("span");
      icon.className = "complaint-map-symbol";
      icon.textContent = symbol;
      icon.style.background = item.status === "CLOSED" ? "#137455" : item.status === "NEW" ? "#b76a0a" : "#2874a6";
      icon.setAttribute("aria-label", name || "ปัญหาที่แจ้ง");
      const dot = item.categoryName ? L.marker([Number(item.latitude), Number(item.longitude)], { icon: L.divIcon({ html: icon, className: "complaint-map-icon", iconSize: [34, 34], iconAnchor: [17, 17] }), title: name }) : L.circleMarker(
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
      label.textContent = (name ? name + " · " : "") + "#" + item.id.slice(0, 8).toUpperCase();
      dot.bindTooltip(label).addTo(layer);
    }
    if (fitPoints && points?.length) {
      map.current.fitBounds(L.latLngBounds(points.map(p => [Number(p.latitude), Number(p.longitude)] as [number, number])), { padding: [28, 28], maxZoom: 15 });
    }
    return () => {
      layer.remove();
    };
  }, [points, fitPoints]);
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
