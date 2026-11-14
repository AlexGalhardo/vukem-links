#!/usr/bin/env bash
# Integration smoke: boots the dashboard with compose, runs the REAL catalogue sync of the eletroradar site
# against it, follows a /link?id= click (302) and checks the click landed in the database. Leaves nothing
# running (down -v on exit). See docs/integration.md for why the sites themselves are not built here.
#
#   ELETRORADAR_DIR=../eletroradar.com.br bash scripts/integration-smoke.sh
set -euo pipefail

cd "$(dirname "$0")/.."
root="$(cygpath -m "$PWD" 2>/dev/null || echo "$PWD")"
export MSYS_NO_PATHCONV=1
export PORT="${PORT:-3056}"
export ADMIN_PASSWORD="${ADMIN_PASSWORD:-integration-password-123}"
export LINKS_API_KEY="${LINKS_API_KEY:-integration-links-api-key-0123456789abcdef}"
export COMPOSE_PROJECT_NAME=vukem-links-integration
eletro="${ELETRORADAR_DIR:-../eletroradar.com.br}"
# The dashboard only accepts a public, live site and probes it itself, so the sync names the real origin.
site_url="${SITE_URL:-https://eletroradar.com.br}"
base="http://127.0.0.1:${PORT}"
export APP_URL="$base"

if [ ! -f "$eletro/src/lib/affiliate-links.ts" ]; then
	echo "eletroradar checkout not found at $eletro (set ELETRORADAR_DIR)" >&2
	exit 2
fi

work="$(mktemp -d)"
# Native Windows tools (curl, docker, bun) cannot read MSYS paths such as /tmp/...
work="$(cygpath -m "$work" 2>/dev/null || echo "$work")"
trap 'rm -rf "$work"; docker compose down -v >/dev/null 2>&1' EXIT

expect() { # expect <description> <want> <got>
	if [ "$2" != "$3" ]; then
		echo "FAIL $1: want $2, got $3" >&2
		exit 1
	fi
	echo "ok   $1 ($3)"
}

APP_KEY=build-only docker compose build
APP_KEY="${APP_KEY:-$(docker run --rm --entrypoint /app/app vukem-links:local key:generate)}"
export APP_KEY
docker compose up -d --wait

# Admin (created by the entrypoint from ADMIN_EMAIL/ADMIN_PASSWORD) can log in.
jar="$work/jar"
curl -s -c "$jar" -o /dev/null -X POST "$base/login" -H "Origin: $base" -H 'Content-Type: application/json' \
	-H 'X-Inertia: true' -d "{\"email\":\"admin@example.com\",\"password\":\"$ADMIN_PASSWORD\"}"
expect "admin login, GET / signed in" 200 "$(curl -s -b "$jar" -o /dev/null -w '%{http_code}' "$base/")"

expect "PUT /api/v1/links with a wrong key" 401 "$(curl -s -o /dev/null -w '%{http_code}' -X PUT \
	"$base/api/v1/links?site=$site_url" -H 'Authorization: Bearer wrong' -d '[]')"

out="$(cd "$eletro" && SITE_URL="$site_url" DASHBOARD_URL="$base" LINKS_DASHBOARD_TOKEN="$LINKS_API_KEY" \
	bun "$root/scripts/integration-sync.ts")"
echo "sync: $out"
first="$(printf '%s' "$out" | sed -n 's/.*"firstExternalId":"\([^"]*\)".*/\1/p')"
created="$(printf '%s' "$out" | sed -n 's/.*"productsCreated":\([0-9]*\).*/\1/p')"
[ -n "$first" ] && [ "${created:-0}" -gt 0 ] || { echo "FAIL sync created no products" >&2; exit 1; }
echo "ok   sync created $created products"

id="$(bun -e 'console.log(encodeURIComponent(process.argv[1]))' "$first")"
ua='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
headers="$work/headers"
expect "GET /link?id= redirects" 302 "$(curl -s -o /dev/null -D "$headers" -w '%{http_code}' -A "$ua" "$base/link?id=$id")"
grep -qi '^location: https\?://' "$headers" || { echo "FAIL no Location header" >&2; exit 1; }
echo "ok   $(grep -i '^location:' "$headers" | tr -d '\r')"
expect "GET /link?id= unknown product" 404 "$(curl -s -o /dev/null -w '%{http_code}' "$base/link?id=nope")"

# The click is recorded in the database (read from a copy of the storage volume).
clicks=0
for _ in 1 2 3 4 5; do
	rm -rf "$work/storage" && docker compose cp app:/app/storage "$work/storage" >/dev/null
	clicks="$(bun -e '
		import { Database } from "bun:sqlite";
		const db = new Database(process.argv[1], { readonly: true });
		const row = db.query("SELECT COUNT(*) AS n FROM click_events e JOIN products p ON p.id = e.product_id WHERE p.external_id = ?").get(process.argv[2]);
		console.log(row.n);
	' "$work/storage/database.sqlite" "$first")"
	[ "$clicks" -ge 1 ] && break
	sleep 1
done
expect "click recorded in click_events" 1 "$clicks"
echo "integration smoke passed"
