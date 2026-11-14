#!/usr/bin/env bash
# Docker smoke test: builds the image, boots it with compose, loads seed.json
# and checks the public contract. Leaves nothing running (down -v on exit).
set -euo pipefail

cd "$(dirname "$0")/.."
export MSYS_NO_PATHCONV=1 # Git Bash would rewrite /app/app into a Windows path
export PORT="${PORT:-3055}"
export ADMIN_PASSWORD="${ADMIN_PASSWORD:-smoke-password-123}"
export LINKS_API_KEY="${LINKS_API_KEY:-smoke-links-api-key-0123456789abcdef}"
base="http://127.0.0.1:${PORT}"

trap 'docker compose down -v >/dev/null 2>&1' EXIT
# The image generates its own key (compose needs a value just to build).
APP_KEY=build-only docker compose build
APP_KEY="${APP_KEY:-$(docker run --rm --entrypoint /app/app vukem-links:local key:generate)}"
export APP_KEY
docker compose up -d --wait

docker compose cp seed.json app:/tmp/seed.json
docker compose exec -T app /app/app import:seed -file /tmp/seed.json

expect() { # expect <description> <want> <got>
	if [ "$2" != "$3" ]; then
		echo "FAIL $1: want $2, got $3" >&2
		exit 1
	fi
	echo "ok   $1 ($3)"
}

id='https%3A%2F%2Fexample.com%2Fmelhor-airfryer-8-litros%2Farno-dual-afd2-8-3l'
expect "GET /link?id= redirects" 302 "$(curl -s -o /dev/null -w '%{http_code}' "$base/link?id=$id")"
expect "GET /link?id= unknown product" 404 "$(curl -s -o /dev/null -w '%{http_code}' "$base/link?id=nope")"
expect "GET /health" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$base/health")"
expect "GET /login" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$base/login")"
expect "GET / signed out" 302 "$(curl -s -o /dev/null -w '%{http_code}' "$base/")"
expect "PUT /api/v1/links without key" 401 "$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$base/api/v1/links?site=https://example.com" -d '[]')"

jar="$(mktemp)"
trap 'rm -f "$jar"; docker compose down -v >/dev/null 2>&1' EXIT
curl -s -c "$jar" -o /dev/null -X POST "$base/login" -H "Origin: $base" -H 'Content-Type: application/json' \
	-H 'X-Inertia: true' -d "{\"email\":\"admin@example.com\",\"password\":\"$ADMIN_PASSWORD\"}"
expect "GET / signed in" 200 "$(curl -s -b "$jar" -o /dev/null -w '%{http_code}' "$base/")"
