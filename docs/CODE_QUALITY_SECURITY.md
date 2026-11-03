# Code quality and security checks

The existing React/TypeScript and Spring Boot architecture is retained. Formatting is automated; behavior changes are limited to reproduced defects and their regression tests. This is not a certification of complete security.

## Routine checks

- `cd backend && mvn spotless:apply` formats Java; `mvn verify` checks formatting and runs backend tests on a configured disposable PostGIS database.
- `cd frontend && npm run format` formats source/tests/configuration; `npm run format:check`, `npm run build` and `npm test` verify them.
- Browser tests require explicit `TT_BOOTSTRAP_PASSWORD` and `TT_DEMO_PASSWORD` values for isolated accounts. They never fall back to saved personal secrets or skip themselves when credentials are missing.
- `python3 scripts/check-source-hygiene.py` checks tracked files for private/generated paths and recognizable credential patterns without echoing matched content. It is a targeted guard, not a complete secret scanner.
- Build the frontend runtime image and run `python3 scripts/test-proxy-security.py --image <image>` to check real proxy behavior with disposable Docker containers.
- CI runs these checks and the full browser suite, including evidence, workflow, mobile, consent/GPS and SSO boundaries. Simulated SSO provider tests are distinct from real provider acceptance.

## Defects covered by regression tests

- A PRE_ASSIGN resource request stays in RESOURCE_APPROVAL until every configured approver approves. Assignment remains blocked after only the first approval.
- Admin role switching changes the current session's effective department; it does not mutate the account's stored department, role or password.
- Automatic GPS requests occur once per active user after privacy acknowledgement, including React StrictMode. Explicit location retries remain available.
- Address-only complaints may omit both coordinates. Partial coordinates and values outside valid ranges remain rejected; private evidence remains required.
- Leaflet programmatic navigation does not leave a zoom callback running against a removed map. Browser error assertions remain enabled.

## Proxy boundary

In cloud Compose, the frontend is configured with `TRUSTED_PROXY_HOST=gateway`. The Nginx entrypoint resolves only that configured Docker service and trusts those resolved addresses for `X-Real-IP`. Caddy overwrites the header with its actual client address. Direct clients' supplied forwarding headers remain untrusted. This prevents one public client from consuming every user's shared rate bucket.

The trusted address is resolved when the frontend starts. If the gateway is replaced and receives another container address, restart/recreate the frontend as well. An unavailable explicitly configured gateway prevents startup rather than silently trusting public headers.

Apply the repository's `deploy/cloud/compose.yml` and `deploy/cloud/Caddyfile` alongside the new runtime image when installing this proxy change. The existing image-only release transfer does not automatically replace host Compose/Caddy files; an operator must install/reload those configuration changes. Do not replace the host `.env`, database or volumes. The default frontend used without a gateway does not trust forwarded client-IP headers.

The CSP allows connections to the intended Gov endpoint `https://auth.govcenter.co` while retaining the existing script/object/frame restrictions. A different provider host requires deliberate CSP configuration.

## Remaining acceptance limits

Live Gov session reuse remains blocked/unverified while the provider endpoint returns404 or fails to return the registered one-use callback. See GOV_SSO.md. Local/backend/browser tests do not prove that external service contract.

Session storage is process-local and deployment is a single test server. Multiple replicas require shared sessions. Real malware scanning, backups/restores, operational monitoring, live LINE/Gov acceptance and load testing still require checks in the target environment. Dependency and source scans cannot prove the absence of vulnerabilities.
