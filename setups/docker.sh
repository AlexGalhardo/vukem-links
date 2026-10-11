#!/usr/bin/env bash
# Builds and starts the local Docker stack on http://localhost:3000 (admin@example.com / admin-local-123).
set -euo pipefail
cd "$(dirname "$0")"
exec docker compose up --build "$@"
