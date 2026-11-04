import type { ThemeConfig } from "antd";

// Canonical palette: https://library.govcenter.co/tokens
export const govTokens = {
  "brand-primary": "#1E7D55",
  "brand-secondary": "#80D897",
  "brand-surface": "#FAF9E5",
  "brand-text-dark": "#05010E",
  "semantic-success": "#95C135",
  "semantic-warning": "#F1BE25",
  "semantic-critical": "#F21515",
  "semantic-neutral": "#707993",
  "semantic-verified": "#6982E1",
  "text-primary": "#060D26",
  "text-secondary": "#1E7D55",
  "text-tertiary": "#475272",
  "text-placeholder": "#707993",
  "btn-default": "#FCFCFF",
  "border-neutral": "#C8CEDD",
  "status-warning": "#F8842D",
  "status-danger": "#991D1D",
  "status-default": "#8DF0FF",
  surface: "#FFFFFF",
  "font-body": '"Inter Variable", "Noto Sans Thai Variable", sans-serif',
  "font-heading": '"Noto Sans Thai Variable", "Inter Variable", sans-serif',
  "space-1": "8px",
  "space-2": "16px",
  "space-3": "24px",
  "space-4": "32px",
  "radius-control": "8px",
  "radius-card": "16px",
  "shadow-low": "0 0 4px #0002091a, 0 2px 2px #00020914",
  "shadow-medium": "0 4px 10px #060d261f, 0 2px 2px #060d2614",
  "shadow-high": "0 8px 15px 2px #060d2626, 0 0 4px #060d2614",
} as const;

export function installGovTokens() {
  for (const [name, value] of Object.entries(govTokens)) {
    document.documentElement.style.setProperty(`--gov-${name}`, value);
  }
}

export const govTheme: ThemeConfig = {
  token: {
    colorPrimary: govTokens["brand-primary"],
    // Shared hover affects outlined text and radio labels as well as fills.
    colorPrimaryHover: govTokens["brand-primary"],
    colorSuccess: govTokens["semantic-success"],
    colorWarning: govTokens["semantic-warning"],
    colorError: govTokens["semantic-critical"],
    colorInfo: govTokens["semantic-verified"],
    colorText: govTokens["text-primary"],
    colorTextSecondary: govTokens["text-tertiary"],
    colorTextPlaceholder: govTokens["text-placeholder"],
    colorBorder: govTokens["border-neutral"],
    colorBgContainer: govTokens.surface,
    colorBgLayout: govTokens["brand-surface"],
    fontFamily: govTokens["font-body"],
    fontSize: 16,
    borderRadius: 8,
    borderRadiusLG: 16,
    controlHeight: 48,
    boxShadow: govTokens["shadow-high"],
    boxShadowSecondary: govTokens["shadow-medium"],
  },
};
