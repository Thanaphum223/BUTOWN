#!/bin/sh
set -eu
# Trust only the explicitly configured gateway, never public forwarding headers.
config=/etc/nginx/conf.d/trusted-proxy.conf
if [ -z "${TRUSTED_PROXY_HOST:-}" ]; then
  rm -f "$config"
  exit 0
fi
case "$TRUSTED_PROXY_HOST" in *[!a-zA-Z0-9.-]*|'') echo 'Invalid trusted proxy hostname' >&2; exit 1;; esac
addresses=$(getent hosts "$TRUSTED_PROXY_HOST" | awk '{print $1}' | sort -u)
[ -n "$addresses" ] || { echo 'Trusted proxy did not resolve' >&2; exit 1; }
{
  echo 'real_ip_header X-Real-IP;'
  for address in $addresses; do
    case "$address" in *[!0-9a-fA-F.:]*|'') echo 'Invalid proxy address' >&2; exit 1;; esac
    printf 'set_real_ip_from %s;\n' "$address"
  done
} > "$config"
