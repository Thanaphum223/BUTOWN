# Category-specific report examples and Gov email

The report description placeholder must follow the selected problem category without changing anything the citizen has typed. Use concise examples for the built-in municipal categories, and a category-named general prompt for administrator-created categories.

Add a read-only email field to the reporter contact section, populated from the same authenticated Gov profile used by the existing account drawer. Do not guess email from username. If the profile has no email, leave it empty and explain that Gov has not provided one; keep reporting available. Fetch failure must be visible and retryable.

Store a private email snapshot with new complaints, derived exclusively from the authenticated reporter's Gov profile by the backend. Ignore client-supplied email. Show the snapshot alongside existing contact details to authorized staff; public community, nearby and tracking projections must not expose it. Existing complaints remain unchanged.

Keep the current green form, wizard navigation, evidence requirements and workflow unchanged. No real registration or complaint submissions during verification.
