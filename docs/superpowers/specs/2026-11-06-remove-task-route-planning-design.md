# Remove Task Route Planning

The user requested removal of Task Route Planning from TownTrack. Remove the staff navigation, screens, road calculation and route APIs, together with their runtime policy hooks and provider configuration examples. Existing complaint assignment, teams, resource handling, reports, transfers and history continue through the standard workflow.

Keep applied migration V25 and historical route records. A new migration releases every route reservation and cancels only DRAFT/PROPOSED plans. DISPATCHED plans, work orders, complaints, evidence and audit history remain intact. Removing the feature does not authorize deleting business history.

A UI-only hide would leave the feature callable and leave reserved complaints blocked, so remove the feature throughout the application. Reverting the feature's original combined PR would also undo the ten municipal workflow fixes, so make a focused removal instead.

Verify absent menus on desktop/mobile for OFFICER, LEADER, FIELD and ADMIN; retired authenticated APIs return 404; reserved legacy complaints regain normal actions; migration preserves dispatched work; existing municipal workflows pass. Use isolated test data only. Ship through the existing reviewed CI/deployment process, then verify live assets and health.
