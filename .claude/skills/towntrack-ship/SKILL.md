---
name: towntrack-ship
description: Pre-push checklist and push procedure for TownTrack — secret scan, the checks CI runs, then pushing to both remotes. Use whenever the user asks to commit, push, deploy, or "make sure it won't break" before pushing.
---

# Shipping TownTrack

Only commit or push when the user asks. "ไม่ต้อง push/commit" stays in force until they lift it.

## 1. Secret scan (always, before every commit)

The Neon database password must never enter the repo. Before staging, run:

```bash
git diff HEAD | grep -nE "npg_|neon\.tech|neondb_owner" && echo "STOP: secret found"
git diff --cached --name-only
```

Also check every new untracked file you are about to add. Keep `.env`, `work/` and `.vscode/` out
(the first two are gitignored). Stage files by name, not with `git add -A`.

## 2. Run what CI runs (`.github/workflows/verify.yml`)

CI fails the deploy if any of these fail.

```powershell
python scripts/check-source-hygiene.py
. $HOME\.towntrack\test-env.ps1; mvn -B -f backend/pom.xml verify
cd frontend; npm run format:check; npm run build
```

- If `format:check` fails, run `npm run format`.
- For UI changes, also run the relevant browser tests with the `towntrack-browser-test` skill. CI only runs `tests/cloud-smoke.spec.ts` by default.

## 3. Commit

Use a short message that says why the change was made. In PowerShell, pass it with a `@' ... '@` here-string, or use Git Bash with `git commit -F - <<'EOF'`.

## 4. Push to each remote separately

| Remote | Repo | Purpose |
|---|---|---|
| `origin` | NatthawutOngkhachuen/TownTrack | Main repo; triggers Verify, then Deploy |
| `backup` | Thanaphum223/BUTOWN | Backup copy; it has no deploy secrets, so its Deploy is skipped |

Push each remote with its own command. A combined push can be refused.

```bash
git push origin main
git push backup main
```

## 5. Deploy

- Deploy (`deploy.yml`) runs only after Verify succeeds on a push to `origin/main`.
- The test site is https://towntrack.201.79.98.199.sslip.io/.
- `gh` is not installed on this machine, so ask the user to watch the Actions tab.
- On the server, **never** run `docker system prune --volumes`, because it deletes the database and file volumes.
