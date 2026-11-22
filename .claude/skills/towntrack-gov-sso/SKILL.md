---
name: towntrack-gov-sso
description: Rules and pitfalls for TownTrack's Gov Center SSO and LINE sign-in (govSso.ts, GovCallback, GovCenterSsoClient). Use before changing anything in the sign-in, callback or Gov account flow, or when a user reports LINE/Gov login landing on the wrong site or failing.
---

# Gov Center SSO / LINE sign-in

The contracts are in `docs/GOV_SSO.md`, `docs/GOV_SSO_CONTRACT.md` and `docs/GOVCENTER_SSO.md`. Read them before changing the flow.

## Settings

The server needs only `E_SERVICE_CODE`, `E_SERVICE_API_KEY` and `GOV_CALLBACK_URL`. The API key stays server-side.

- `GOV_CALLBACK_URL` must be the URL registered with Gov, and its path must be `/auth/callback`.
- On the test site it is `https://towntrack.201.79.98.199.sslip.io/auth/callback`.
- The browser reads it from `GET /api/public/gov-auth`.

## LINE flow: keep the direct return

In `govLineLogin`, the `callback` inside LINE's `state` must be **our** callback, which carries our `state` nonce.

- Never wrap it in Gov's web page `https://auth.govcenter.co/auth/callback?callback=...`.
- That page forwards only to Gov's own domains, so users end up stranded on Gov.
- This broke LINE sign-in once (08b4483) and was fixed in 27bb286.
- `tests/gov-sso.spec.ts` checks that the callback origin is ours. Keep that assertion.

## Do not add domain guards

The app must sign in on any domain whose `GOV_CALLBACK_URL` matches `window.location.origin`. `govTransaction` already enforces that match. A hard-coded allowlist (govcenter.co / gov.co) broke the sslip.io site and was removed in bfaa22a.

## Callback handling

`govCallbackReturn.ts` accepts `/auth/callback`, `/auth/callback/` and `/`. It also accepts a code given in either of these forms:

- appended with a second `?`
- in the URL fragment

The server consumes the pending state once and then verifies the code with Gov. Never replace a missing state with a value taken from browser storage.

## Verifying a change

- Run `npx playwright test tests/gov-sso.spec.ts` from `frontend/`. It mocks Gov and LINE and does not need a backend.
- It cannot prove a real login works. After deploy, ask the user to try "เข้าสู่ระบบด้วย LINE" on the real domain.
