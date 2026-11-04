# LINE sign-in after logout

Reported behavior: logout in the current page, then LINE sign-in shows กรุณาเข้าสู่ระบบ before navigating to LINE. Investigate and reproduce the session-bound CSRF lifecycle; fix only the failing flow boundary. Preserve verified Gov-only sign-in, purpose-bound one-use state, CSRF, duplicate-submit locks and profile linking. Do not automatically retry writes or replay one-use codes. Never create another real Gov account.

Separately authorized operations: promote the unique enabled verified Gov account identified by the screenshot to TownTrack ADMIN, without changing central Gov privileges or creating/merging accounts. Record an audit event and verify the exact target. Existing data and passwords stay intact.
