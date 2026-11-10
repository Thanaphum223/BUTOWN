# Staff workspace screen layout implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan inline.

**Goal:** Fit the staff queue and detail view to laptop screens with readable, reachable controls and usable mobile scrolling.

**Architecture:** Move quick queue filters to the full-width workspace toolbar. Add scoped workspace CSS: compact summaries, wrapped role labels and desktop queue/detail scrolling; retain document scrolling on mobile and short windows. No API, workflow or permission changes.

**Spec:** User screenshot and request of 2026-11-10: queue starts near the bottom, filter buttons are clipped and the role badge overflows the sidebar.

**Tech Stack:** React, CSS, Playwright.

## Constraints and review focus
- Keep role filters and all actions available, including on mobile and translated screens.
- Do not hide authentication information or change role/queue rules.
- Expanded filters, pagination, keyboard navigation and case actions must remain reachable.
- Bound desktop scrolling only where window height permits it; avoid document overflow and trapped content.
- Preserve the existing mobile queue-to-detail navigation.

## Steps
- [x] Reproduce at 1470x780. RED: quick-filter strip scrollWidth exceeds its available width.
- [x] Add a full-width filter toolbar and isolated responsive CSS.
- [x] Verify laptop sizes 1470x780, 1280x720, 1024x768; mobile roles; short windows, expanded filters and languages. Inspect screenshots.
- [x] Run relevant existing layout/workflow regressions and TypeScript/format checks. Get fresh review.
- [ ] Create/attach PR, run release CI, deploy and verify live assets.

## Verification evidence
- 45 Playwright tests passed: 17 screen-layout scenarios plus municipal UI, staff-workflow cleanup and route-planning removal regressions.
- Layout checks include all four operational roles on mobile and desktop; English admin FIELD/LEADER at 992/1024x680; expanded filters, pagination, independently scrolling details and reachable actions.
- TypeScript, Prettier, source hygiene and whitespace checks passed.
- Fresh read-only review reported no material findings. Final 12px grid padding retains readable 12/11px identity text while keeping the first queue card visible at 1280x720.
