#!/usr/bin/env bash
# Shared logic of the four setup scripts. Sourced by them, never executed directly.
# Secret values are generated and written to .env without ever being echoed.

set -E
CURRENT_STEP="starting"
trap 'printf "ERROR: setup failed while %s.\n" "$CURRENT_STEP" >&2' ERR

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="infra/docker-compose.yml"
DEFAULT_PORT=3000
PORT_SCAN=20
SECRET_KEYS="BETTER_AUTH_SECRET CRON_SECRET LINKS_API_KEY"
SKIP_START="${SETUP_SKIP_START:-0}"
CHOSEN_PORT=""

log() { printf '==> %s\n' "$*"; }

fail() {
	trap - ERR
	printf 'ERROR: %s\n' "$*" >&2
	exit 1
}

step() {
	CURRENT_STEP="$1"
	log "$1"
}

usage() {
	cat <<EOF
Usage: $(basename "$0") [--no-start]

  --no-start   Prepare everything but do not start the app (same as SETUP_SKIP_START=1).

Environment:
  PORT         Local scripts: port of the dev server (default: first free port from $DEFAULT_PORT).
  APP_PORT     Docker scripts: host port of the container (default: first free port from $DEFAULT_PORT).
EOF
}

parse_args() {
	local arg
	for arg in "$@"; do
		case "$arg" in
			--no-start) SKIP_START=1 ;;
			-h | --help)
				usage
				exit 0
				;;
			*) fail "Unknown option: $arg (see --help)" ;;
		esac
	done
}

# $1 = unix | windows, $2 = local | with-docker
require_platform() {
	local kernel on_windows=0
	kernel="$(uname -s)"
	case "$kernel" in MINGW* | MSYS* | CYGWIN*) on_windows=1 ;; esac
	if [ "$1" = "windows" ] && [ "$on_windows" = 0 ]; then
		fail "This script is for Git Bash on Windows. On $kernel run: bash setups/setup-unix-$2.sh"
	fi
	if [ "$1" = "unix" ] && [ "$on_windows" = 1 ]; then
		fail "This script is for Linux/macOS. On Windows (Git Bash) run: bash setups/setup-windows-$2.sh"
	fi
	PLATFORM="$1"
}

require_bun() {
	local hint='curl -fsSL https://bun.sh/install | bash'
	[ "$PLATFORM" = "windows" ] && hint='powershell -c "irm bun.sh/install.ps1 | iex"  (then reopen Git Bash)'
	command -v bun >/dev/null 2>&1 || fail "bun not found. Install it with: $hint"
	log "bun $(bun --version)"
}

require_docker() {
	local install='https://docs.docker.com/engine/install/'
	local start='sudo systemctl start docker  (macOS: open -a Docker)'
	if [ "$PLATFORM" = "windows" ]; then
		install='winget install Docker.DockerDesktop  (https://docs.docker.com/desktop/setup/install/windows-install/)'
		start='open Docker Desktop and wait until it reports "Engine running"'
	fi
	command -v docker >/dev/null 2>&1 || fail "docker not found. Install it: $install"
	docker compose version >/dev/null 2>&1 ||
		fail "Docker Compose v2 not found (docker compose). Install the compose plugin: https://docs.docker.com/compose/install/"
	docker info >/dev/null 2>&1 || fail "The Docker daemon is not running. Start it: $start"
	log "docker $(docker version --format '{{.Server.Version}}'), compose $(docker compose version --short)"
}

env_get() {
	local line
	line="$(grep -E "^$1=" .env | tail -n 1 || true)"
	line="${line#*=}"
	line="${line%$'\r'}"
	case "$line" in
		\"*\") line="${line#\"}" && line="${line%\"}" ;;
		\'*\') line="${line#\'}" && line="${line%\'}" ;;
	esac
	printf '%s' "$line"
}

# The value travels through the environment, not argv, so it never shows up in a process listing.
env_set() {
	local tmp=".env.tmp.$$"
	ENV_KEY="$1" ENV_VALUE="$2" awk '
		BEGIN { key = ENVIRON["ENV_KEY"]; value = ENVIRON["ENV_VALUE"]; done = 0 }
		{ line = $0; sub(/\r$/, "", line) }
		index(line, key "=") == 1 { print key "=" value; done = 1; next }
		{ print line }
		END { if (!done) print key "=" value }
	' .env >"$tmp"
	mv "$tmp" .env
}

random_hex() {
	if command -v openssl >/dev/null 2>&1; then
		openssl rand -hex 32
	else
		od -An -tx1 -N32 /dev/urandom | tr -d ' \n'
	fi
}

# Empty or still the placeholder shipped in .env.example.
needs_secret() {
	case "$1" in "" | change-me*) return 0 ;; *) return 1 ;; esac
}

ensure_env() {
	local key value
	step "preparing .env"
	if [ -f .env ]; then
		log ".env already exists: existing values are kept"
	else
		[ -f .env.example ] || fail ".env.example not found in $ROOT"
		cp .env.example .env
		log "Created .env from .env.example"
	fi
	chmod 600 .env 2>/dev/null || true
	for key in $SECRET_KEYS; do
		if needs_secret "$(env_get "$key")"; then
			value="$(random_hex)"
			[ "${#value}" -eq 64 ] || fail "Could not generate a random value for $key (openssl or /dev/urandom required)"
			env_set "$key" "$value"
			log "Generated $key in .env (value not shown)"
		fi
	done
	value="$(env_get ADMIN_PASSWORD)"
	if [ -z "$(env_get ADMIN_EMAIL)" ] || [ "${#value}" -lt 8 ]; then
		fail "Set ADMIN_EMAIL and ADMIN_PASSWORD (8+ characters) in .env: the seed creates the admin account from them"
	fi
}

# The local scripts migrate and seed whatever TURSO_DATABASE_URL points to, so anything but a file is refused.
require_local_database() {
	local url="${TURSO_DATABASE_URL:-$(env_get TURSO_DATABASE_URL)}"
	case "${url:-file:./local.db}" in
		file:*) ;;
		*) fail "TURSO_DATABASE_URL is not a local file (file:./local.db). This script never migrates or seeds a remote database: fix .env or unset the variable" ;;
	esac
}

port_busy() {
	(exec 3<>"/dev/tcp/127.0.0.1/$1") >/dev/null 2>&1 || (exec 3<>"/dev/tcp/localhost/$1") >/dev/null 2>&1
}

# $1 = port asked for by the user (may be empty), $2 = name of the variable that sets it.
# A requested port that is busy is an error; without a request the first free port is used and announced.
choose_port() {
	local port
	if [ -n "$1" ]; then
		case "$1" in *[!0-9]*) fail "$2 must be a number, got: $1" ;; esac
		if port_busy "$1"; then
			fail "Port $1 is already in use. Stop what is listening there or choose another one: $2=<port> bash setups/$(basename "$0")"
		fi
		CHOSEN_PORT="$1"
		return 0
	fi
	for ((port = DEFAULT_PORT; port <= DEFAULT_PORT + PORT_SCAN; port++)); do
		if ! port_busy "$port"; then
			if [ "$port" != "$DEFAULT_PORT" ]; then log "Port $DEFAULT_PORT is busy: using $port instead"; fi
			CHOSEN_PORT="$port"
			return 0
		fi
	done
	fail "No free port between $DEFAULT_PORT and $((DEFAULT_PORT + PORT_SCAN)). Choose one: $2=<port> bash setups/$(basename "$0")"
}

run_local_setup() {
	parse_args "$@"
	cd "$ROOT"
	step "checking tools"
	require_bun
	ensure_env
	require_local_database
	if [ "$SKIP_START" != 1 ]; then
		step "choosing a port"
		choose_port "${PORT:-}" PORT
	fi

	step "installing dependencies (bun install --frozen-lockfile)"
	bun install --frozen-lockfile
	step "applying migrations (bun run db:migrate)"
	bun run db:migrate
	step "seeding the database (bun run db:seed)"
	bun run db:seed

	if [ "$SKIP_START" = 1 ]; then
		log "Setup finished. Start the app with: bun run dev"
		return 0
	fi
	step "starting the dev server"
	log "App: http://localhost:$CHOSEN_PORT  (login: ADMIN_EMAIL / ADMIN_PASSWORD from .env)"
	export PORT="$CHOSEN_PORT"
	# Better Auth rejects sign-in from an origin that differs from BETTER_AUTH_URL.
	case "$(env_get BETTER_AUTH_URL)" in
		*":$CHOSEN_PORT") ;;
		*) export BETTER_AUTH_URL="http://localhost:$CHOSEN_PORT" ;;
	esac
	trap - ERR
	exec bun run dev
}

compose() {
	docker compose -f "$COMPOSE_FILE" --env-file .env "$@"
}

wait_for_app() {
	local url="http://localhost:$1/health" tries=0
	while [ "$tries" -lt 90 ]; do
		if [ -z "$(compose ps --status running -q app 2>/dev/null)" ] && [ "$tries" -gt 2 ]; then
			fail "The container stopped during startup (migrations, seed or server). See: docker compose -f $COMPOSE_FILE --env-file .env logs app"
		fi
		if command -v curl >/dev/null 2>&1; then
			if curl -fsS -o /dev/null --max-time 3 "$url" 2>/dev/null; then return 0; fi
		elif port_busy "$1"; then
			return 0
		fi
		tries=$((tries + 1))
		sleep 2
	done
	fail "The app did not answer on $url within 3 minutes. See: docker compose -f $COMPOSE_FILE --env-file .env logs app"
}

run_docker_setup() {
	local published
	parse_args "$@"
	cd "$ROOT"
	step "checking tools"
	require_docker
	ensure_env

	step "choosing a port"
	# A stack left running by a previous run already holds its port: reuse it instead of treating it as busy.
	published="$(compose port app 3000 2>/dev/null | sed 's/.*://' || true)"
	if [ -n "$published" ] && { [ -z "${APP_PORT:-}" ] || [ "${APP_PORT:-}" = "$published" ]; }; then
		CHOSEN_PORT="$published"
		log "The stack is already running on port $published: reusing it"
	else
		choose_port "${APP_PORT:-}" APP_PORT
	fi
	export APP_PORT="$CHOSEN_PORT"

	step "building the image (infra/Dockerfile)"
	compose build
	if [ "$SKIP_START" = 1 ]; then
		log "Image built. Start the stack with: bash setups/$(basename "$0")"
		return 0
	fi

	step "starting the container (migrations and seed run on start)"
	compose up -d
	step "waiting for the app to answer"
	wait_for_app "$APP_PORT"
	log "App: http://localhost:$APP_PORT  (login: ADMIN_EMAIL / ADMIN_PASSWORD from .env)"
	log "Logs: docker compose -f $COMPOSE_FILE --env-file .env logs -f app"
	log "Stop: docker compose -f $COMPOSE_FILE --env-file .env down  (add -v to also delete the database)"
}
