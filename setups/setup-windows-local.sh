#!/usr/bin/env bash
# Windows (Git Bash), no Docker: creates .env, installs dependencies, migrates and seeds ./local.db, starts `bun run dev`.
# Safe to run again. --no-start (or SETUP_SKIP_START=1) stops before the dev server. PORT=<n> picks the port.
set -euo pipefail
# shellcheck source=setups/_common.sh
. "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

require_platform windows local
run_local_setup "$@"
