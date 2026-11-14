---
name: links-local-verification
description: >
  How to validate a change in vukem-links locally (go vet, go test, golangci-lint, frontend typecheck/lint/build,
  Playwright e2e, Docker smoke). Use it before calling any task done, or when a test, the build or the e2e fails
  because of the database, env variables, ports or generated files.
---

# Validate the way CI validates

## The gate

```bash
go vet ./... && go test -race ./... && golangci-lint run
bun run typecheck && bun run lint:js && bun run build
```

Run the narrowest step while iterating, the whole gate before finishing:

| Changed | Run |
| --- | --- |
| `internal/rules` | `go test ./internal/rules/` |
| `internal/catalog`, `internal/health`, `internal/legacy` | `go test ./internal/<package>/` |
| a controller, a route, `routes/web.go` | `go test ./tests/` |
| `app/pages/pages.go` | `vukem codegen`, then `go test ./tests/ -run TestEveryPageIsTyped` and `bun run typecheck` |
| a page or component in `resources/js` | `bun run typecheck && bun run lint:js`, then `bun run e2e` |
| Go formatting | `golangci-lint fmt` |
| JS formatting/imports | `bun run format` |
| `Dockerfile`, `compose.yaml`, the public contract | `bash scripts/smoke.sh` |
| Markdown only | `bun run lint:md` |

Tests run without network: the probes and Telegram use the fake transport of `deps.Overrides` (`tests/helpers_test.go`, `internal/health/health_test.go`).

## End-to-end

`bun run e2e` builds the frontend, compiles the app, boots it on port 8765 (`E2E_PORT` changes it) with a fresh SQLite database and the seed, and runs `e2e/main-flow.spec.ts`. The spec fails on any browser console error. Never point it at production.

## Traps

- **`APP_KEY` is not set** (`vukem codegen`, `vukem serve`): `vukem key:generate` writes it to `.env`.
- **`resources/public/build` missing**: run `bun run build` before `go build`/e2e; the assets are embedded in the binary.
- **Page not typed**: `TestEveryPageIsTyped` fails when a file in `resources/js/pages` has no entry in `pages.All()`, or the other way around.
- **Port busy**: another `vukem serve`, an e2e run or the compose stack is up. Stop it (by PID) and retry.
- **Git Bash rewrites `/app/app` paths** in `docker exec`: export `MSYS_NO_PATHCONV=1` (the smoke script does).
- **Starting clean**: stop the server and remove `storage/*.sqlite*`, then `vukem migrate && vukem admin:create`. Ask the dev first if the file has data they care about.

## Reporting

State what ran and the result, with the numbers the commands printed. If a step was skipped, say which and why.
