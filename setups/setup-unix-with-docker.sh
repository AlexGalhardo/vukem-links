#!/usr/bin/env bash
# Linux/macOS with Docker: creates .env, builds infra/Dockerfile and starts infra/docker-compose.yml in background.
# Safe to run again. --no-start (or SETUP_SKIP_START=1) only builds the image. APP_PORT=<n> picks the host port.
set -euo pipefail
# shellcheck source=setups/_common.sh
. "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

require_platform unix with-docker
run_docker_setup "$@"
