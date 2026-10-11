#!/usr/bin/env bash
# Local setup for Linux/macOS: installs deps, creates .env, migrates and seeds a SQLite file, starts the dev server.
set -euo pipefail
cd "$(dirname "$0")/.."

command -v bun >/dev/null || { echo "Bun is required: https://bun.sh"; exit 1; }

if [ ! -f .env ]; then
	cp .env.example .env
	secret=$(openssl rand -base64 32)
	# `|` as delimiter: base64 contains `/`.
	sed -i.bak "s|^BETTER_AUTH_SECRET=.*|BETTER_AUTH_SECRET=${secret}|" .env && rm -f .env.bak
	echo "Created .env — set ADMIN_EMAIL and ADMIN_PASSWORD there if you want other credentials."
fi

bun install --frozen-lockfile
bun run db:migrate
bun run db:seed
exec bun run dev
