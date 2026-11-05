# Consistent TownTrack green theme

User request: audit the whole application and make it consistently green. Existing user instruction authorizes continued implementation without approval pauses.

Use the established Gov primary green #1E7D55, mint accents, deep green navigation, white cards and pale green page surfaces. Keep the existing Gov-shaped login/signup card and all layout, copy, data, permissions and authentication behavior. Use green-tinted readable neutral text/borders instead of navy/blue neutrals. Use the shared theme for citizens and staff, including mobile menus, modals, drawers, form focus and selected controls.

Approach: update existing govTheme tokens and shared CSS, then remove isolated decorative color overrides. This covers the app and Ant Design popups without per-page color patches. A new visual framework or blanket replacement of status colors would expand scope unnecessarily. The implementation choice is the agent's under the user's continuous-work authorization.

Preserve meaning: errors/destructive actions stay red; warnings and new-report markers remain orange; progress markers may remain blue; rank medals and LINE's official green keep their meanings. All ordinary navigation, primary actions, identity badges, form focus and map selection use the same green. White text on green navigation and normal-size button text must meet 4.5:1 contrast.

Audit surfaces: login/signup, citizen home/report/tracking/notifications/emergency, staff work queue/detail/teams, admin tools, Gov drawer, map selection and document previews. Only application chrome is themed; uploaded documents and external map/provider pages retain their own content.

Verify computed colors and contrast across citizen and staff navigation at mobile/desktop sizes; inspect representative screenshots; run existing auth/navigation tests, formatting, production build and source hygiene. One fresh final review; existing full main CI and cloud deployment gate release. No live registrations or account/data changes are needed.
