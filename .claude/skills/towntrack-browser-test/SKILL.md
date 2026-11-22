---
name: towntrack-browser-test
description: Run TownTrack's Playwright browser tests against the real backend, either the desktop suite or the emulated iPhone/Android/Huawei tablet matrix. Use when asked to test the UI, check that features work, test on mobile/tablet devices, or reproduce a frontend bug end to end.
---

# TownTrack browser tests

The browser tests drive the real Spring backend (`BrowserTestServer`, test sources only) plus Vite.
Sign-in goes through `/api/test/session` (`signIn` in `frontend/tests/product-flow.ts`).

## Hard rule: use the browser-test database

`BrowserTestServer` runs Flyway and seeds demo accounts. It must never point at `neondb`, because
that database is shared with another machine running different code. Always set
`DB_URL=$BROWSER_DB_URL` (the `towntrack_browser` database) before starting it.

If it ever starts on `neondb` by mistake, stop it at once and tell the user which migrations ran.
Never change neondb's demo accounts.

## 1. Load the environment (PowerShell)

```powershell
. $HOME\.towntrack\test-env.ps1      # JAVA_HOME, DB_*, passwords; kept out of the repo
$env:DB_URL = $env:BROWSER_DB_URL
```

Never print or copy these values into the repo, a commit or a log you share.

## 2. Build and start the backend (run in background)

```powershell
cd backend
mvn -B -q test-compile
mvn -B -q dependency:build-classpath "-Dmdep.outputFile=target/browser-classpath.txt" "-Dmdep.includeScope=test"
$cp = Get-Content target\browser-classpath.txt -Raw
java -cp "target/test-classes;target/classes;$($cp.Trim())" th.go.towntrack.BrowserTestServer
```

Wait until `http://127.0.0.1:8080/actuator/health` answers. Rebuild after backend changes.
Vite is started automatically by the Playwright config (`reuseExistingServer`).

## 3. Run the tests (from `frontend/`)

- Desktop suite: `npx playwright test [file]`
- CI release gate: `npx playwright test tests/cloud-smoke.spec.ts`
- Device matrix: `npx playwright test -c playwright.devices.config.ts`
  - Projects: `ios-iphone-15`, `android-pixel-7`, `huawei-matepad-portrait`, `huawei-matepad-landscape`
  - Pick one with `--project=ios-iphone-15`
  - The full run takes about 45 minutes, so run it in the background
- Screenshots: `work/devices-screens/<project>/`
- HTML report: `work/devices-report/`

## Reading results

- **Emulation only.**
  - WebKit stands in for iOS Safari.
  - Huawei Browser is Chromium with a Huawei user agent and tablet viewport.
  - Say so when reporting; a real-device check is still needed for camera and video.
- **Old specs on phones.** `tests/towntrack.spec.ts` clicks sidebar `menuitem`s directly. On phone or portrait-tablet widths the menu sits in the "เปิดเมนูหลัก" drawer, so those failures are test-side. `tests-devices/new-features.spec.ts` has a `menu()` helper that handles it.
- **Case missing from a queue.** Staff queues show only cases the role must act on (`queues.actionable`). Open a case through its notification or by id instead.
- **Layout check.** `fits()` fails when `scrollWidth > innerWidth`, which means a real horizontal overflow.
- Run `npx tsc --noEmit -p frontend` and `npm run format:check` before calling a change done.
