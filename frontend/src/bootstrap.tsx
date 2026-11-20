import { GeoProvider } from "./GeoContext";
import React from "react";
import ReactDOM from "react-dom/client";
import { ConfigProvider, App as AntApp } from "antd";
import thTH from "antd/locale/th_TH";
import enUS from "antd/locale/en_US";
import { useI18n } from "./i18n/useI18n";
import App from "./App";
import type { GovCallbackReturn } from "./govCallbackReturn";
import { govDarkTheme, govTheme } from "./govTheme";
import { applyColorMode, useColorMode } from "./colorMode";
import "@fontsource-variable/inter";
import "@fontsource-variable/noto-sans-thai";
import "./style.css";
export function mount(govReturn: GovCallbackReturn | null) {
  applyColorMode();
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <LocalizedApp govReturn={govReturn} />
    </React.StrictMode>,
  );
}
function LocalizedApp({ govReturn }: { govReturn: GovCallbackReturn | null }) {
  const { language, t } = useI18n();
  const mode = useColorMode();
  return (
    <ConfigProvider
      locale={language === "en" ? enUS : thTH}
      theme={mode === "dark" ? govDarkTheme : govTheme}
    >
      <AntApp>
        <React.Suspense fallback={<div className="loading">{t("กำลังโหลด…")}</div>}>
          <GeoProvider>
            <App govReturn={govReturn} />
          </GeoProvider>
        </React.Suspense>
      </AntApp>
    </ConfigProvider>
  );
}
