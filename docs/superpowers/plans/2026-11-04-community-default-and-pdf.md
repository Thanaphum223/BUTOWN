# Municipal default, plain Thai copy and PDF evidence

> Execute inline with superpowers:executing-plans, followed by one fresh whole-change review.

**Goal:** Open citizen home on the entire municipality, shorten repetitive copy, and show authorized PDF evidence on community cards and detail views.

**Architecture:** Change only the frontend default scope; retain the API's backward-compatible nearby default. Use the existing PDF.js reader with an explicit files/media endpoint union. Include PDF in the community media query/endpoint while preserving ownership, approved-copy and municipality checks. Never publish existing private PDFs automatically.

**Tech stack:** Spring Boot/PostGIS, React/Ant Design/Leaflet, PDF.js, Playwright.

**Spec:** The user requests the entire municipality by default, natural concise labels, and PDF display in the community cards shown in their screenshot.

## Constraints and review focus

- Keep nearby search available at exactly 5 km; do not change backend default, roles, SSO or stored data.
- Page title: เรื่องแจ้งในเทศบาล / เรื่องแจ้งใกล้จุดที่เลือก. Remove the long lead and redundant scope instruction. Scope labels: ทั้งเทศบาล / ใกล้จุดที่เลือก (5 กม.).
- PDF is visible only to its uploader or through the existing approved-copy/mock rules, within the same municipality. Private download authorization remains unchanged.
- PDF.js preview and download must use the same authorized endpoint; no arbitrary URL prop, inline document scripts, or automatic publication.
- Cover/count/gallery must work for a PDF-only record; PDF must not be rendered as a video.
- Default results must load when location is unavailable; scope/category/pagination and repeated map selection must continue working.

## Task 1: Authorized PDF evidence

- [x] Add failing backend regression for own PDF cover/count, peer and cross-tenant denial, existing approved-copy visibility, and PDF response headers.
- [x] Add PDF to media visibility and safe response type handling without widening authorization or publishing rules.
- [x] Use an explicit endpoint union in AttachmentList/PdfPreview, add document rendering in EvidenceGallery and a PDF cover on CitizenHome; rename the detail section to หลักฐานประกอบ.
- [x] Add a real PDF fixture/browser regression that uploads a PDF, finds its cover and opens a rendered PDF canvas from the community view.

## Task 2: Municipal default and concise copy

- [x] Add a failing browser regression: default municipality selected, query has scope=municipality without coordinates, then nearby remains available; update shared sign-in expectations.
- [x] Set default municipality, reorder scope options, remove redundant lead/helper text, and shorten remaining related labels.
- [x] Update existing nearby tests to explicitly choose nearby. Run full backend/browser/proxy checks, fresh review and fixes, then publish and deploy through verified main CI/CD.
- [ ] Verify the live default, PDF-only card and PDF reader using the user's existing authorized account; keep production data and files intact.

## Ledger

- Root cause confirmed: EvidenceMedia and MediaController only admit images/videos; EvidenceGallery also treats every non-image as a video.
- Existing private PDF reader is reusable, but its files endpoint is owner/staff-only. Community PDF previews must use the media endpoint with its existing owner/approved-copy checks.
- User has delegated implementation and deployment decisions. Native worktree service is unavailable for this projectless chat (previous Not a git repository); reuse the established manual worktree location.

## Task 3: Emergency facilities within 50 km

- [x] Accept 50 km at the API while retaining its existing smaller options and rejecting values above 50.
- [x] Request 50 km from the emergency page, use concise copy, retain nearest-first sorting and radius filtering.
- [x] Verify an inside/outside-radius regression and browser request contract. Community nearby stays 5 km.

- Verification before review: 95 backend tests passed; 52 browser tests passed; frontend production build, formatting, source hygiene, and disposable proxy security passed.
- Browser PDF check verifies actual dark text pixels, rather than accepting an empty canvas.
