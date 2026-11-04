# Gov-only authentication cards

User request: match Gov Center's compact centered login and registration cards, keep the established green theme, and remove TownTrack account login completely.

Use the existing React/Ant Design form and the working Gov API registration/password login and Gov LINE SSO. Default to email/password login. Registration has four fields: ชื่อ-นามสกุล, อีเมล, รหัสผ่าน, ยืนยันรหัสผ่าน. Keep validation, one-use state, CSRF, duplicate-submit lock, error handling, password clearing and verified identity/session behavior. Signup/login mode switches clear credentials and remain disabled during requests. No actual signup is allowed during verification.

A pale gray background surrounds one white card, max-width 400px, 16px corners, subtle border/shadow and 24px padding. Center headings, compact 36px controls, green LINE button and green primary submit. Login has LINE above an หรือ divider; signup has only its four fields. Footer switches modes and offers emergency contacts. Mobile fits 320px with no horizontal overflow. No split hero or legacy form remains.

Remove production form-login processing and deny /api/auth/login, /api/auth/register and direct legacy /api/auth/line for anonymous and authenticated callers. Preserve all stored accounts, credentials, links, roles and complaints. Existing sessions are not revoked. Gov login/logout/profile linking remain available. Do not auto-link by email or migrate roles.

Chosen approach: restyle/reuse existing Gov credential form and SSO button, remove local UI, and close old endpoints in Spring Security. Redirecting to Gov's website was rejected earlier because its registration helper drops this deployment's callback context. Keeping hidden local login would violate the latest instruction.

CI browser business-flow tests may establish seeded local sessions using a separate test-source-only launcher/configuration. That fixture is absent from the packaged application; no production test flag or bypass is introduced.

Ship through review, CI and normal cloud deployment; verify live release and data preservation. Do not log passwords or central tokens.
