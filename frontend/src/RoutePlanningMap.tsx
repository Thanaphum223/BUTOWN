import { useEffect, useRef } from "react";
import { govTokens } from "./govTheme";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
type Point = { id: string; latitude: number; longitude: number; title: string };
type Props = {
  points: Point[];
  selected: string[];
  start?: [number, number];
  geometry?: any;
  mode: "view" | "draw" | "start";
  onSelect: (ids: string[]) => void;
  onStart: (point: [number, number]) => void;
  onToggle?: (id: string) => void;
};
function inside(point: Point, polygon: L.LatLng[]) {
  let yes = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (
      a.lat > point.latitude !== b.lat > point.latitude &&
      point.longitude < ((b.lng - a.lng) * (point.latitude - a.lat)) / (b.lat - a.lat) + a.lng
    )
      yes = !yes;
  }
  return yes;
}
export default function RoutePlanningMap(props: Props) {
  const element = useRef<HTMLDivElement>(null),
    map = useRef<L.Map | null>(null),
    layer = useRef<L.LayerGroup | null>(null),
    drawing = useRef<L.Polyline | L.Polygon | null>(null),
    current = useRef(props);
  current.current = props;
  useEffect(() => {
    if (!element.current) return;
    const root = element.current;
    const m = L.map(root, { zoomAnimation: false }).setView([13.7563, 100.5018], 12);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      referrerPolicy: "origin",
      maxZoom: 19,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(m);
    map.current = m;
    layer.current = L.layerGroup().addTo(m);
    let points: L.LatLng[] = [],
      pointer: number | undefined;
    const down = (e: PointerEvent) => {
      if (
        current.current.mode !== "draw" ||
        e.button !== 0 ||
        (e.target as HTMLElement).closest(".leaflet-control")
      )
        return;
      e.preventDefault();
      pointer = e.pointerId;
      root.setPointerCapture(e.pointerId);
      points = [m.mouseEventToLatLng(e)];
      drawing.current?.remove();
      drawing.current = L.polyline(points, { color: govTokens["brand-primary"], weight: 2 }).addTo(
        m,
      );
    };
    const move = (e: PointerEvent) => {
      if (pointer !== e.pointerId) return;
      e.preventDefault();
      points.push(m.mouseEventToLatLng(e));
      drawing.current?.setLatLngs(points);
    };
    const up = (e: PointerEvent) => {
      if (pointer !== e.pointerId) return;
      pointer = undefined;
      if (root.hasPointerCapture(e.pointerId)) root.releasePointerCapture(e.pointerId);
      if (points.length < 3) return;
      drawing.current?.remove();
      drawing.current = L.polygon(points, {
        color: govTokens["brand-primary"],
        weight: 2,
        fillOpacity: 0.06,
      }).addTo(m);
      current.current.onSelect(
        current.current.points.filter((p) => inside(p, points)).map((p) => p.id),
      );
    };
    root.addEventListener("pointerdown", down);
    root.addEventListener("pointermove", move);
    root.addEventListener("pointerup", up);
    root.addEventListener("pointercancel", up);
    m.on("click", (e) => {
      if (current.current.mode === "start") current.current.onStart([e.latlng.lat, e.latlng.lng]);
    });
    const resize = new ResizeObserver(() => m.invalidateSize());
    resize.observe(root);
    return () => {
      resize.disconnect();
      root.removeEventListener("pointerdown", down);
      root.removeEventListener("pointermove", move);
      root.removeEventListener("pointerup", up);
      root.removeEventListener("pointercancel", up);
      m.remove();
      map.current = null;
      layer.current = null;
      drawing.current = null;
    };
  }, []);
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (props.mode === "draw") m.dragging.disable();
    else m.dragging.enable();
  }, [props.mode]);
  const pointsKey = props.points.map((p) => `${p.id}:${p.latitude}:${p.longitude}`).join("|"),
    chosenKey = props.selected.join("|"),
    startKey = props.start?.join(","),
    geometryKey = JSON.stringify(props.geometry || null);
  useEffect(() => {
    const m = map.current,
      group = layer.current;
    if (!m || !group) return;
    group.clearLayers();
    for (const p of props.points) {
      const selected = props.selected.indexOf(p.id),
        label = document.createElement("span");
      label.textContent = p.title;
      const marker = L.marker([p.latitude, p.longitude], {
        icon: L.divIcon({
          className: `route-marker ${selected >= 0 ? "selected" : ""}`,
          html: `<span>${selected >= 0 ? selected + 1 : "•"}</span>`,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        }),
      })
        .bindTooltip(label)
        .addTo(group);
      marker.on("click", (e) => {
        if (current.current.mode === "view") current.current.onToggle?.(p.id);
        if (current.current.mode === "start") current.current.onStart([p.latitude, p.longitude]);
        L.DomEvent.stopPropagation(e.originalEvent);
      });
    }
    if (props.start)
      L.circleMarker(props.start, {
        radius: 10,
        color: govTokens["brand-dark"],
        weight: 3,
        fillColor: "#fff",
        fillOpacity: 1,
      })
        .bindTooltip("จุดเริ่มเส้นทาง")
        .addTo(group);
    if (props.geometry)
      L.geoJSON(props.geometry, {
        style: { color: govTokens["brand-primary"], weight: 5, opacity: 0.8 },
      }).addTo(group);
  }, [pointsKey, chosenKey, startKey, geometryKey]);
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    let positions: L.LatLngExpression[] =
      props.geometry?.coordinates?.map((p: number[]) => [p[1], p[0]]) ||
      props.points.map((p) => [p.latitude, p.longitude]);
    if (props.start) positions = [...positions, props.start];
    if (positions.length)
      m.fitBounds(L.latLngBounds(positions), { padding: [70, 70], maxZoom: 16, animate: false });
  }, [pointsKey, geometryKey, startKey]);
  return (
    <div
      ref={element}
      className="route-map"
      data-mode={props.mode}
      role="region"
      aria-label="แผนที่วางแผนเส้นทาง"
      style={{ touchAction: props.mode === "draw" ? "none" : undefined }}
    />
  );
}
