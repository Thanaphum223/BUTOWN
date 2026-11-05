import type { ThemeConfig } from "antd";

// Gov brand palette with TownTrack green surfaces and readable neutral colors.
// Reference: https://library.govcenter.co/tokens
export const govTokens = {
  "brand-primary": "#1E7D55",
  "brand-secondary": "#80D897",
  "brand-dark": "#14543B",
  "brand-surface": "#F3F8F5",
  "brand-text-dark": "#123D2D",
  "semantic-success": "#95C135",
  "semantic-warning": "#F1BE25",
  "semantic-critical": "#F21515",
  "semantic-neutral": "#707993",
  "semantic-verified": "#6982E1",
  "text-primary": "#183F32",
  "text-secondary": "#1E7D55",
  "text-tertiary": "#526A60",
  "text-placeholder": "#61776C",
  "btn-default": "#FCFEFD",
  "border-neutral": "#D5E4DC",
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
  "shadow-low": "0 0 4px #123d2d14, 0 2px 2px #123d2d0d",
  "shadow-medium": "0 4px 10px #123d2d1f, 0 2px 2px #123d2d14",
  "shadow-high": "0 8px 15px 2px #123d2d26, 0 0 4px #123d2d14",
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
    colorPrimaryHover: govTokens["brand-dark"],
    colorPrimaryActive: govTokens["brand-dark"],
    colorLink: govTokens["brand-primary"],
    colorLinkHover: govTokens["brand-dark"],
    colorSuccess: govTokens["semantic-success"],
    colorWarning: govTokens["semantic-warning"],
    colorError: govTokens["semantic-critical"],
    colorInfo: govTokens["brand-primary"],
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
