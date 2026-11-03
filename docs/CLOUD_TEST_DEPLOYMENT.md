# DigitalOcean test deployment

The $4/month Droplet is a test environment, not a production sizing recommendation. It uses 512 MB RAM and a 2 GB swap file. Build images on CI or a development machine, never on the Droplet. Antivirus startup, large uploads, and concurrent requests can be slow. Paid backups, extra volumes, managed databases, and Spaces are not enabled.

## Pipeline

`Verify TownTrack` runs backend integration tests against isolated PostGIS, builds the frontend, and runs `cloud-smoke.spec.ts` against isolated demo accounts. Older local browser suites remain available separately; they target previous wizard layouts and are not the cloud release gate.

After a successful push verification on `main`, `Build and deploy TownTrack` checks out the exact verified SHA, builds two runtime images, and streams them over pinned-host SSH. No registry token is required. A failed verification never deploys. Pull requests never deploy.

Create a GitHub environment named `cloud-test` with these secrets:

- `DEPLOY_HOST`: Droplet IPv4 address
- `DEPLOY_SSH_KEY`: dedicated deployment-only private key
- `DEPLOY_KNOWN_HOSTS`: verified SSH host key line

Set environment variable `DEPLOY_URL` to the HTTPS site URL. The deployment SSH public key must use a forced command:

```
restrict,command="/opt/towntrack/receive-release.sh" ssh-ed25519 PUBLIC_KEY deployment-only
```

Do not use the human administration key as the CI key. Treat workflow changes as infrastructure changes: anyone who can modify trusted main-branch workflows can deploy application code. Branch protection and required reviews are recommended for shared repositories.

## First installation

1. Create an Ubuntu 24.04 x64 Droplet with your own SSH key.
2. Review and run `deploy/cloud/bootstrap.sh` as root on the new machine.
3. Copy `compose.yml`, `Caddyfile`, `init-db.sh`, and `receive-release.sh` from this directory to `/opt/towntrack`.
4. Create `/opt/towntrack/.env` from `.env.example` with unique generated secrets. Set mode 0600 and executable mode 0700 on the receive script. Keep secrets off Git and out of logs.
5. Set a DNS name that resolves to the machine and set `SITE_ADDRESS`. Caddy manages HTTPS. The gateway alone publishes ports 80/443; PostgreSQL, application, and antivirus are internal.
6. Install a separate forced-command deployment key, then configure the GitHub environment.
7. Push to main. Verify Actions, public `/healthz`, sign-in, file scanning, and restart persistence.

The first cloud database is empty and creates an `admin` account using `BOOTSTRAP_PASSWORD`. There is no automatic copy of local accounts, passwords, reports, uploads, or mock records. Store the generated password in a password manager and change it after first sign-in. Optional Gov-Auth, Mapbox, and object storage need their own settings.

## Data and rollback

Named volumes preserve database, files, antivirus definitions, and TLS certificates across deploys. The receiver backs up an existing database before switching releases, retains the previous runtime images, checks internal backend health, and restores the previous application images if health fails. Database migrations are not automatically reversed; inspect and restore a backup deliberately if required. Backups stored on the same disk do not protect against Droplet loss. Monitor disk usage, especially with large attachments and pre-deploy dumps.

Do not run `docker compose down -v`. To roll back application images, set `RELEASE_SHA` in `/opt/towntrack/release.env` to the previous commit and run:

```
cd /opt/towntrack
docker compose --env-file .env --env-file release.env up -d --no-deps backend frontend
```

Cloud config files are administered over the management SSH key; the CI key can only receive releases. Config changes are copied explicitly after review. Public health checks expose availability only, never database configuration.
