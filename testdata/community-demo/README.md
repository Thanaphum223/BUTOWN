# Community demo fixture

Test data only: 12 complaints in three categories, 40 login-disabled fictional
citizens, 203 distinct votes, 57 follows, 12 synthetic photos and 12 MP4 files.
The media uses three reusable scenes. Each five-second MP4 is a still-image test
clip, not footage of a real incident. Images are generated and carry a visible
`MOCK / TEST DATA` label. Names and addresses are fictional.

Generate a reviewed SQL transaction and file bundle for an existing test municipality:

```sh
python3 scripts/seed-community-demo.py --municipality UUID --output work/community-demo
```

Coordinates default to 14.017, 100.416 (Pathum Thani test area). Override with
`--latitude` and `--longitude`. All demo points are within approximately 2 km of
the center. This does not alter the application's 5 km search radius.

Back up the test database. Scan generated files with ClamAV, then copy the
contents of `work/community-demo/files/` into the backend's persistent FILE_ROOT.
Apply `seed.sql` with `psql -v ON_ERROR_STOP=1`. Attachment rows must not be
inserted without their files. Existing active categories with the exact Thai
names for road, drainage and waste are required; otherwise the transaction fails.

IDs are deterministic and scoped to the municipality. Reapplying does not add
duplicate complaints, accounts, votes, follows or audit events, and does not
replace existing complaints. Thumbnail metadata is reconciled only on this
fixture's own matching attachment IDs and hashes. Mock users have no usable
password and are disabled; never enable them as real staff accounts. Nothing
runs at application startup and no migration seeds production automatically.

Refresh the citizen home page around the test center. Top five scores are
38, 31, 27, 23 and 19. Open a complaint to preview its photo and play its MP4.

## All workflow statuses

After the base community fixture, generate an additional set with one complaint
per standard status (18 cases). Specify an existing enabled **test** administrator
with a department; the fixture assigns that account as officer, leader, field
representative and approver, so its existing role switcher can inspect each queue.
It does not grant permissions, change passwords or edit account settings.

```sh
python3 scripts/seed-workflow-demo.py --municipality UUID --actor TEST_ADMIN_UUID --output work/workflow-demo
```

Use the same backup, scan, file-copy and SQL-application steps as above. The
fixture checks every transition against the actual category workflow and fails
if it differs from the expected standard workflow. It is additive and repeatable.
Each complaint has a coherent audit path. Later steps include the corresponding
work order, resource revision and PDF, approval assignment, review records and
field report with separate BEFORE/AFTER images. Resource quantities and prices
are fictional. Existing community cases are preserved.

The statuses are NEW, TRIAGED, ASSIGNED, ACCEPTED, RESOURCE_DRAFT,
RESOURCE_CHECK, RESOURCE_REVISION, RESOURCE_APPROVAL, READY, IN_PROGRESS,
LEADER_REVIEW, FIELD_REVISION, OFFICER_REVIEW, LEADER_REVISION, RESOLVED,
CLOSED, TERMINATED and REJECTED. The latter three belong in completed history;
the other 15 remain active queue cases. Subsequent real test actions can change
these states; reapplying the fixture never resets them.
