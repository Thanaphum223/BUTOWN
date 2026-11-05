# Task Route Planning

Approved by user: OFFICER proposes a round; LEADER confirms one team. The organizer chooses a starting point and return-to-start or finish-at-last-job for every round. Remember prior choices locally. FOSSGIS public OSRM is approved only for the test site, transmitting the selected task/start coordinates, never reporter identity, contact details, or descriptions.

## Operational model

A route groups 2–10 TRIAGED complaints belonging to the same current leader and department, with coordinates and no active field work. Drawing a polygon selects eligible map points; a list provides an accessible alternative and explicit inclusion review. OFFICER creates a proposal; LEADER can prepare their own draft/proposal and confirms a team owned by that leader. Each case retains its ID, SLA/deadline, audit, evidence and independent lifecycle. Route order is guidance, not permission to skip acceptance or reporting.

Capture case versions in each calculated proposal. Lock complaints in stable ID order when confirming; reject the whole round on changed status/version, missing/disabled members, wrong department/team, prior assignment, duplicate route reservation, or changed coordinates. Assign all cases in one transaction through the existing Workflow service and snapshot the team. Return/cancel a proposal with reason releases its reservations. A changed case requires recalculation; never silently omit it or partly dispatch. FIELD sees only rounds containing their own snapshotted work orders, with ordered stops and per-case links. Completed/declined cases remain visible in route progress; no fabricated team-wide completion.

## Road calculation

Use road duration matrix plus an exact bounded 2–10-stop ordering algorithm, followed by OSRM route geometry in that order. Label results as estimated driving time and distance, excluding work time and traffic. Display inability to calculate honestly; straight-line drawings are selection aids only and never labelled road routes. Manual reorder uses the same route endpoint and produces a fresh calculated result.

Server owns provider URL/profile, identifies TownTrack in User-Agent, enforces a shared maximum of one request per second and caches results. Calculate only on explicit action; no provider call for map movement, rendering or polling. Keep provider coordinates in memory/cache rather than application request logs. Timeout, limit, unreachable point and malformed responses produce actionable errors without persisting a dispatch. Include OSM/OSRM/FOSSGIS attribution and provider link. Public free service is configured for testing and replaceable with a private OSRM endpoint.

## Validation

Test optimizer against known directed matrices and exhaustive permutations, open/closed modes, unreachable segments. Stub OSRM at HTTP boundary for rate limits/cache/failure/privacy tests; one permitted provider smoke test with nonpersonal public coordinates. Test municipality, department, roles, stale forms, concurrent route reservations/confirmations and atomic rollback. Real browser covers polygon/list selection, start/end options, proposal, leader confirmation and ordered field progress using isolated data.

Sources: https://project-osrm.org/docs/v5.24.0/api/ and https://routing.openstreetmap.de/about.html (current FOSSGIS usage policy, one request/second and coordinate logging).
