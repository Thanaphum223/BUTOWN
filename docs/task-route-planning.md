# Task route planning

OFFICER selects 2-10 TRIAGED cases with coordinates, the same department and the same leader. Draw a polygon or select from the list, choose a start and return-to-start or finish-at-last-stop, calculate, then propose the round. LEADER confirms a team. FIELD sees ordered stops; every complaint retains its own acceptance, resources, reports, audit and original deadline.

PROPOSED rounds reserve every stop. Confirmation locks and validates all cases, versions, coordinates, roles and team members before assigning through Workflow in one transaction. Changed or unavailable cases abort the entire round; no silent omissions or partial assignments. Declining or cancelling a proposal requires a reason and releases reservations. Prior rounds and decisions remain in history.

## Routing service

Configure ROUTING_BASE_URL with an OSRM driving endpoint. The approved public test endpoint is https://routing.openstreetmap.de/routed-car; private deployments can provide their own. A blank value disables calculation with a clear error. FOSSGIS public policy and coordinate logging disclosure: https://routing.openstreetmap.de/about.html . Only selected coordinates and the start are transmitted, never names, phone numbers, complaint details or round titles.

Calculation runs only on explicit user action. Map movement, listing and progress polling never call OSRM. The gateway spaces requests at least 1.1 seconds apart and caches validated results for 15 minutes with entry-count and byte limits. The gate assumes a single backend instance; use a shared gate or private routing service before scaling out.

Driving time is an estimate from the road data and profile, excluding work time and live traffic. Directed duration matrices feed an exact bounded optimizer. Users can reorder stops and recalculate before proposing. Provider failures never fabricate a road path or create assignments.

## Verification

RouteOptimizerTest compares small directed matrices to exhaustive permutations. OsrmRoutingTest uses a loopback HTTP server to verify privacy, headers, throttling, caching, limits and failure handling. RoutePlanningIntegrationTest uses isolated PostgreSQL data for role, municipality, team, version, reservation and atomic rollback checks.

BrowserTestServer uses BrowserRoadProvider, a synthetic loopback HTTP fixture; CI never calls the public provider. Both are test-only and excluded from release jars. Playwright covers polygon selection, five-stop proposals, leader confirmation, mobile/list selection, manual order, failure recovery and a real application flow in an isolated database including PDF and valid WebM report evidence.
