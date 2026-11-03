# Gov Center SSO

User approved: SSO for citizens and staff, stable IAM identity binding, preserve locally assigned roles, sync residences included by verify-code. User delegated remaining decisions and authorized implementation. Residence search/claim UI is excluded.

Use existing React/Vite and Spring Boot. Replace introspection/manual access-token entry with gov-sso-login's redirect URL and mandatory state validation. Register the library-generated cryptographic state in a CSRF-protected server session before redirect. Expire/consume it once on callback; exchange trimmed code once server-to-server using x-api-key. Do not automatically retry one-use code exchange. Keep HttpOnly session cookies and use SameSite=Lax for cross-site top-level callback navigation.

New IAM identities become CITIZEN in an explicitly configured local municipality, never IAM's system ADMIN role. Existing accounts link only after authenticating locally and choosing Link Gov Center; never match by email/name. Unique database bindings prevent identity/account collisions. Existing role, password, enabled flag and department remain unchanged. Disabled linked accounts cannot log in. First login works with empty residences.

Persist minimal IAM profile and municipality-scoped residence snapshots/membership statuses. Both membership and residence must be VERIFIED before any future official residence-dependent operation. Missing residences remove stale links rather than imply verification. Do not log codes, keys, whole payloads or store them in browser cookies. Return only local user basics from callback.

Public config exposes auth URL, service code and callback URL, never API key. Local mode continues to work without provider configuration. Central enforcement remains opt-in and must be enabled only after credentials and administrator identity links are ready. Cloud stays local while credentials are absent.

Alternatives: changing backend to NestJS is unnecessary; introspection is incompatible with this provider. Use library core for redirect/state and TownTrack's CSRF/session callback transport instead of its default callback hook, which skips missing-state validation, lacks our CSRF header and retries single-use exchanges.

Required config: IAM_API_URL, IAM_GOV_FRONTEND_URL, E_SERVICE_CODE, E_SERVICE_API_KEY, GOV_CALLBACK_URL, GOV_MUNICIPALITY_ID. Config requires HTTPS outside loopback development. External service availability, service registration and live credentials cannot be verified without provider access.
