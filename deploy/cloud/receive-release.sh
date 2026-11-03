#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
cd /opt/towntrack
exec 9>/opt/towntrack/deploy.lock
flock -n 9 || { echo 'Another deployment is running' >&2; exit 1; }
release=${SSH_ORIGINAL_COMMAND:-${1:-}}
[[ "$release" =~ ^[a-f0-9]{40}$ ]] || { echo 'Expected a full commit SHA' >&2; exit 2; }
archive=$(mktemp /opt/towntrack/images.XXXXXX.tar.gz)
trap 'rm -f "$archive"' EXIT
cat > "$archive"
gzip -dc "$archive" | docker image load
for service in backend frontend; do
  docker image inspect "towntrack-${service}:${release}" >/dev/null
done
previous=$(cat current-release 2>/dev/null || true)
if [[ "$previous" =~ ^[a-f0-9]{40}$ ]] && RELEASE_SHA="$previous" docker compose --env-file .env ps --status running --services | grep -qx db; then
  mkdir -p backups
  RELEASE_SHA="$previous" docker compose --env-file .env exec -T db pg_dump -U postgres -d towntrack -Fc > "backups/pre-${release}.dump"
fi
printf 'RELEASE_SHA=%s\n' "$release" > release.env
run_compose() { docker compose --env-file .env --env-file release.env "$@"; }
run_compose up -d --remove-orphans
healthy=false
for attempt in $(seq 1 120); do
  if run_compose exec -T gateway wget -q -O /dev/null http://backend:8080/actuator/health; then
    healthy=true
    break
  fi
  sleep 3
done
if [[ "$healthy" != true ]]; then
  echo 'New release failed health check; database backup retained, no automatic schema rollback.' >&2
  if [[ "$previous" =~ ^[a-f0-9]{40}$ ]]; then
    printf 'RELEASE_SHA=%s\n' "$previous" > release.env
    run_compose up -d --no-deps backend frontend
  fi
  exit 1
fi
printf '%s\n' "$release" > current-release
# Keep the immediately preceding release available for manual rollback.
for service in backend frontend; do
  while read -r tag; do
    [[ "$tag" == "$release" || "$tag" == "$previous" || "$tag" == '<none>' ]] && continue
    docker image rm "towntrack-${service}:${tag}" >/dev/null || true
  done < <(docker image ls "towntrack-${service}" --format '{{.Tag}}')
done
echo "Deployed ${release}"
