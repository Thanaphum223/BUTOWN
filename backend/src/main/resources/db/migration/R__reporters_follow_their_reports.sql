-- New reports make their reporter a follower (ComplaintController.createRecord). This backfills
-- reports filed before that, so every reporter sees their own report as followed.
-- Repeatable (no version number) so it cannot clash with versioned migrations made elsewhere;
-- Flyway runs it once per database and again only if this file changes. Idempotent by design.
INSERT INTO follower(complaint_id, user_id)
SELECT id, reporter_id FROM complaint
ON CONFLICT DO NOTHING;
