import { GeoProvider } from "./GeoContext";
import React from "react";
import ReactDOM from "react-dom/client";
import { ConfigProvider, App as AntApp } from "antd";
import thTH from "antd/locale/th_TH";
import App from "./App";
import type { GovCallbackReturn } from "./govCallbackReturn";
import "./style.css";
export function mount(govReturn: GovCallbackReturn | null) {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <ConfigProvider
        locale={thTH}
        theme={{
          token: {
            colorPrimary: "#137455",
            borderRadius: 12,
            fontFamily: "system-ui, -apple-system, Tahoma, sans-serif",
            colorText: "#193e33",
            colorTextSecondary: "#61776c",
            colorBorder: "#d6e2db",
            controlHeight: 44,
          },
        }}
      >
        <AntApp>
          <React.Suspense fallback={<div className="loading">กำลังโหลด…</div>}>
            <GeoProvider>
              <App govReturn={govReturn} />
            </GeoProvider>
          </React.Suspense>
        </AntApp>
      </ConfigProvider>
    </React.StrictMode>,
  );
}
