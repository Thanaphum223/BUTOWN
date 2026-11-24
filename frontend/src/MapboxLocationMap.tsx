import { useI18n } from "./i18n/useI18n";
import { govTokens } from "./govTheme";
import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { Alert, Button, Table } from "antd";
import { statusNames } from "./api";
import type { LocationMapProps } from "./LocationMap";
export default function MapboxLocationMap({
  token,
  ...props
}: LocationMapProps & { token: string }) {
  const { language, t } = useI18n();
  const el = useRef<HTMLDivElement>(null),
    map = useRef<mapboxgl.Map | undefined>(undefined);
  const marker = useRef<mapboxgl.Marker | undefined>(undefined);
  const current = useRef(props);
  current.current = props;
  const [failed, setFailed] = useState(false),
    [retry, setRetry] = useState(0),
    [ready, setReady] = useState(false);
  useEffect(() => {
    if (!el.current) return;
    setFailed(false);
    setReady(false);
    const p = current.current;
    let m: mapboxgl.Map;
    try {
      m = new mapboxgl.Map({
        container: el.current,
        accessToken: token,
        style: "mapbox://styles/mapbox/streets-v12",
        center: p.value ? [p.value[1], p.value[0]] : [100.5018, 13.7563],
        zoom: p.value ? 15 : 6,
      });
    } catch {
      setFailed(true);
      return;
    }
    map.current = m;
    m.addControl(new mapboxgl.NavigationControl());
    const timer = setTimeout(() => {
      if (!m.loaded()) setFailed(true);
    }, 10000);
    m.on("load", () => {
      clearTimeout(timer);
      setReady(true);
    });
    m.on("error", () => {
      clearTimeout(timer);
      setFailed(true);
    });
    m.on("click", (e) => {
      const features = m.getLayer("clusters")
        ? m.queryRenderedFeatures(e.point, { layers: ["clusters"] })
        : [];
      if (features.length) {
        m.easeTo({ center: e.lngLat, zoom: m.getZoom() + 2 });
        return;
      }
      current.current.onChange?.([e.lngLat.lat, e.lngLat.lng]);
    });
    const resize = new ResizeObserver(() => m.resize());
    resize.observe(el.current);
    return () => {
      clearTimeout(timer);
      resize.disconnect();
      marker.current?.remove();
      marker.current = undefined;
      m.remove();
      map.current = undefined;
    };
  }, [token, retry]);
  useEffect(() => {
    const container = map.current?.getContainer();
    for (const [selector, label] of [
      [".mapboxgl-ctrl-zoom-in", t("ซูมเข้า")],
      [".mapboxgl-ctrl-zoom-out", t("ซูมออก")],
      [".mapboxgl-ctrl-compass", t("หมุนแผนที่ไปทิศเหนือ")],
      [".mapboxgl-ctrl-attrib-button", t("ข้อมูลผู้จัดทำแผนที่")],
    ]) {
      const control = container?.querySelector(selector);
      control?.setAttribute("title", label);
      control?.setAttribute("aria-label", label);
    }
  }, [language, ready, retry]);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const features = (props.points || []).map((p) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [p.longitude, p.latitude] },
      properties: { id: p.id, name: p.categoryName || t("ปัญหาที่แจ้ง"), status: p.status },
    }));
    if (m.getSource("issues"))
      (m.getSource("issues") as mapboxgl.GeoJSONSource).setData({
        type: "FeatureCollection",
        features,
      });
    else {
      m.addSource("issues", {
        type: "geojson",
        data: { type: "FeatureCollection", features },
        cluster: true,
        clusterRadius: 35,
      });
      m.addLayer({
        id: "clusters",
        type: "circle",
        source: "issues",
        filter: ["has", "point_count"],
        paint: { "circle-color": govTokens["brand-primary"], "circle-radius": 20 },
      });
      m.addLayer({
        id: "cluster-label",
        type: "symbol",
        source: "issues",
        filter: ["has", "point_count"],
        layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 13 },
        paint: { "text-color": "#fff" },
      });
      m.addLayer({
        id: "issue-pins",
        type: "circle",
        source: "issues",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-radius": 9,
          "circle-stroke-color": "#fff",
          "circle-stroke-width": 2,
          "circle-color": [
            "match",
            ["get", "status"],
            "CLOSED",
            govTokens["brand-primary"],
            "NEW",
            govTokens["status-warning"],
            govTokens["semantic-verified"],
          ],
        },
      });
      m.on("mouseenter", "issue-pins", () => {
        m.getCanvas().style.cursor = "pointer";
      });
      m.on("mouseleave", "issue-pins", () => {
        m.getCanvas().style.cursor = "";
      });
      m.on("click", "issue-pins", (e) => {
        const p = e.features?.[0]?.properties;
        if (p) {
          const text = document.createElement("span");
          text.textContent = p.name;
          new mapboxgl.Popup().setLngLat(e.lngLat).setDOMContent(text).addTo(m);
        }
      });
    }
    const selected = props.value;
    marker.current?.remove();
    marker.current = undefined;
    if (!selected && m.getSource("radius"))
      (m.getSource("radius") as mapboxgl.GeoJSONSource).setData({
        type: "FeatureCollection",
        features: [],
      });
    if (selected) {
      const [lat, lng] = selected,
        r = props.radiusMeters || 0;
      marker.current = new mapboxgl.Marker({ color: govTokens["brand-primary"] })
        .setLngLat([lng, lat])
        .addTo(m);
      const ring = Array.from({ length: 65 }, (_, i) => {
        const a = (i * 2 * Math.PI) / 64;
        return [
          lng + (r / 111320 / Math.cos((lat * Math.PI) / 180)) * Math.cos(a),
          lat + (r / 111320) * Math.sin(a),
        ];
      });
      const data: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: r
          ? [
              {
                type: "Feature",
                geometry: { type: "Polygon", coordinates: [ring] },
                properties: {},
              },
            ]
          : [],
      };
      if (m.getSource("radius")) (m.getSource("radius") as mapboxgl.GeoJSONSource).setData(data);
      else {
        m.addSource("radius", { type: "geojson", data });
        m.addLayer({
          id: "radius-fill",
          type: "fill",
          source: "radius",
          paint: { "fill-color": govTokens["brand-primary"], "fill-opacity": 0.08 },
        });
        m.addLayer({
          id: "radius-line",
          type: "line",
          source: "radius",
          paint: { "line-color": govTokens["brand-primary"], "line-width": 2 },
        });
      }
      if (r)
        m.fitBounds(
          [
            [lng - r / 111320 / Math.cos((lat * Math.PI) / 180), lat - r / 111320],
            [lng + r / 111320 / Math.cos((lat * Math.PI) / 180), lat + r / 111320],
          ],
          { padding: 24, duration: 0 },
        );
      else m.jumpTo({ center: [lng, lat], zoom: 16 });
    } else if (props.fitPoints && features.length) {
      const bounds = new mapboxgl.LngLatBounds();
      features.forEach((f) => bounds.extend(f.geometry.coordinates as [number, number]));
      m.fitBounds(bounds, { padding: 30, maxZoom: 15, duration: 0 });
    }
  }, [ready, props.value?.[0], props.value?.[1], props.points, props.radiusMeters, language]);
  return (
    <>
      <div
        className="location-map"
        role="region"
        aria-label={t("แผนที่ตำแหน่งปัญหา")}
        ref={el}
        style={{ height: 280, display: failed ? "none" : undefined }}
      />
      {failed && (
        <>
          <Alert
            type="warning"
            message={t("แผนที่ไม่พร้อมใช้งาน แสดงข้อมูลจากฐานข้อมูลเป็นรายการแทน")}
            action={
              <Button onClick={() => setRetry((v) => v + 1)}>{t("ลองโหลดแผนที่ใหม่")}</Button>
            }
          />
          <Table
            size="small"
            rowKey="id"
            dataSource={props.points || []}
            pagination={{ pageSize: 5 }}
            columns={[
              { title: t("ประเภทปัญหา"), dataIndex: "categoryName" },
              {
                title: t("สถานะ"),
                dataIndex: "status",
                render: (status: string) => t(statusNames[status] || status),
              },
            ]}
          />
        </>
      )}
    </>
  );
}
