# Gov Center user UI implementation plan

> Implement inline with superpowers:executing-plans. User delegates implementation details; one review of the expanded whole branch before merge.

**Goal:** Align TownTrack colors, fonts, spacing and citizen shell with the supplied Gov Center tokens/user layout; remove the duplicate content home button and show the mobile menu while reporting.

**Architecture:** A local canonical token module drives Ant Design and CSS variables. Retain existing React workflows and navigation, and self-host the reference Inter/Noto Sans Thai variable fonts. Adapt the reference green user header, white desktop navigation and neutral cards to existing TownTrack content; retain mobile bottom navigation on both report steps.

**Tech Stack:** React, Ant Design, CSS variables, Fontsource (OFL-1.1), existing Playwright.

**Spec:** User requests and screenshots in this chat; https://library.govcenter.co/tokens and https://library.govcenter.co/layout/user inspected live2026-11-04. Exact tokens: primary#1E7D55, secondary#80D897, brand surface#FAF9E5, ink#060D26, tertiary#475272, placeholder#707993, border#C8CEDD; spacing8/16/24/32px, control radius8px/card16px. User layout uses Inter/Noto Sans Thai and a green identity header. The demo's optional theme/settings panel is not part of this visual adoption.

## Constraints / review focus

- Preserve reports, GPS/address, PDF/media, SSO, roles, tenant boundaries and workflow controls.
- Keep contextual previous/confirmation/detail and anonymous emergency return controls; remove only duplicate global home button.
- Desktop left main menu; mobile fixed bottom main menu visible while reporting, with safe-area and scroll clearance.
- No new remote font/asset hosts or weakened CSP. Local fonts are pinned; no external avatar requests.
- Long Thai names,320–440px mobile widths, keyboard focus, font enlargement, sticky-header/form-action overlap and PDF rendering remain usable.

## Task: Shared theme and citizen navigation

- [ ] Create frontend/src/govTheme.ts for canonical tokens, AntD configuration and CSS-variable installation before mount.
- [ ] Import locally packaged reference fonts in bootstrap.tsx; map existing style.css foundations to canonical tokens,8px controls,16px cards, document shadows/spacing.
- [ ] Adapt App.tsx citizen identity header and desktop/mobile menu. Restore mobile report-menu clearance; do not copy demo-only routes/settings.
- [ ] Strengthen the existing mobile flow's meaningful menu navigation/clearance checks, inspect a failing baseline if required, then verify. No tests duplicating color values.
- [ ] Build, format/source hygiene/diff checks; existing full suite via CI and live local layout inspection before merge.
- [ ] Expanded whole-branch review, one fixes pass as needed; PR8 title/body refreshed; main CI/CD and actual Cloud desktop/mobile screenshots without submitting production reports.
