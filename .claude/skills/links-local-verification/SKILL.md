---
name: links-local-verification
description: >
  How to validate a change in links-afiliados locally the same way the CI gate does (typecheck, lint, unit tests,
  build, end-to-end QA). Use it before calling any task done, when the pre-push hook fails, or when build/QA fail
  because of the database, env variables, the sign-in rate limit or a stale dev server.
---

# Validate the way the gate validates

GitHub Actions is manual-only for now, so `.husky/pre-push` is the real gate. It runs `bun run ci`.

## The gate

```bash
bun run ci        # typecheck && lint && test && build
```

Run the narrowest step while iterating, the whole gate before finishing:

| Changed | Run |
| --- | --- |
| `lib/links.ts` | `bun test lib/links.test.ts` |
| types only | `bun run typecheck` |
| formatting / imports | `bun run format` (writes fixes), then `bun run lint` |
| any page, action, route, schema | `bun run ci`, then the QA below |

## End-to-end QA

`qa.ts` drives a **running** app. It creates its own project (`qa-<run>`) and deletes it at the end.

```bash
bun run db:migrate && bun run db:seed   # once, or after a schema change
bun run dev                             # terminal 1
bun qa.ts                               # terminal 2 — defaults to http://localhost:3000
```

Admin credentials come from `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env` (Bun loads it), or `--admin-email=` / `--admin-password=`.

## Known traps

- **429 on login right after a QA run.** The last suite trips the sign-in rate limit on purpose. Wait ~15 s before logging in or re-running.
- **`no such table`.** The local database is behind: `bun run db:migrate`. To start clean, stop the server and remove `local.db*` (ask the dev first if the file has data they care about).
- **Port 3000 busy.** A previous dev server or the Docker stack is still up. `qa.ts` accepts another base URL: `bun qa.ts http://localhost:3001`.
- **Build fails on type errors in a file you did not touch.** `next build` type-checks every `.ts` in the repo, including `qa.ts` and `scripts/`. `_legacy/` is excluded in `tsconfig.json`.
- **QA refuses to run.** Non-local hosts need `--allow-remote`. Never point it at production: it writes and deletes data.
- **Health-check steps are slow or flaky.** They use `.invalid` hosts, which must fail DNS immediately. A captive portal or DNS hijacking resolver breaks that assumption.

## Reporting

State what ran and the result, e.g. "`bun run ci` passed (15 tests, build ok); `bun qa.ts` 69 passed, 0 failed". If a step was skipped, say which and why.
