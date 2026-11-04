import { GeoProvider } from "./GeoContext";
import React from "react";
import ReactDOM from "react-dom/client";
import { ConfigProvider, App as AntApp } from "antd";
import thTH from "antd/locale/th_TH";
import App from "./App";
import type { GovCallbackReturn } from "./govCallbackReturn";
import { govTheme, installGovTokens } from "./govTheme";
import "@fontsource-variable/inter";
import "@fontsource-variable/noto-sans-thai";
import "./style.css";
export function mount(govReturn: GovCallbackReturn | null) {
  installGovTokens();
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <ConfigProvider locale={thTH} theme={govTheme}>
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
