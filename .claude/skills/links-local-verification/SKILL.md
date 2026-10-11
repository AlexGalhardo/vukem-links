---
name: links-local-verification
description: >
  How to validate a change in links-afiliados locally the same way the gate does (typecheck, lint, unit and
  integration tests, env check, build, end-to-end QA). Use it before calling any task done, when the pre-push
  hook fails, or when build/QA fail because of the database, env variables, the sign-in rate limit or a stale
  dev server.
---

# Validate the way the gate validates

GitHub Actions is manual-only for now, so `.husky/pre-push` is the real gate. It runs `bun run ci`.

## The gate

```bash
bun run ci        # typecheck && lint && test && build (the build starts with the env check)
```

Run the narrowest step while iterating, the whole gate before finishing:

| Changed | Run |
| --- | --- |
| `lib/links.ts` | `bun test lib/links.test.ts` |
| `lib/data.ts`, `lib/health.ts` | `bun test lib/data.test.ts` / `bun test lib/health.test.ts` |
| `lib/env.ts`, `.env.example` | `bun test lib/env.test.ts`, then `bun run check-env` |
| `app/api/cron`, `app/api/v1`, `app/health` | `bun test app/api/routes.test.ts` |
| `scripts/migrate-v4.ts` | `bun test scripts/migrate-v4.test.ts` |
| types only | `bun run typecheck` |
| formatting / imports | `bun run format` (writes fixes), then `bun run lint` |
| Markdown only (`docs/`, `.claude/`, `*.md`) | nothing lints it (Biome ignores `.claude`, no markdownlint script): check links and commands by hand |
| any page, action, route, schema | `bun run ci`, then the QA below |

How the integration tests get their throwaway database and fake network: `docs/qa.md` (Testes de integração).

## End-to-end QA

`bun qa.ts` drives a **running** app (`bun run dev` in another terminal) and needs the seeded admin and
`LINKS_API_KEY` in `.env`. How to run it, its flags and what each suite checks: `docs/qa.md`. Never point it at
production: it writes and deletes data.

`/link` and `/api/links` have no unit test (they need Next's request scope): a change to them is only proven by
`bun qa.ts`.

## Traps

Common symptoms (403 or 429 on login, `no such table`, push refused by the hook) are in `docs/agent-setup.md`
(Problemas comuns). The ones specific to validating:

- **Build stops at "Variáveis de ambiente com problema".** `scripts/check-env.ts` found a malformed value in `.env` (it names the variable, never the value). Formats are in `lib/env.ts`. A missing variable only fails a production build (`VERCEL_ENV=production`).
- **Type errors in a file you did not touch.** `tsc` covers every `.ts` in the repo, including `qa.ts`, `scripts/` and `test/`.
- **Port 3000 busy.** A previous dev server or the Docker stack (`infra/`) is still up. Use another port for both sides: `PORT=3411 BETTER_AUTH_URL=http://localhost:3411 bun run dev`, then `bun qa.ts http://localhost:3411`.
- **QA fails at "LINKS_API_KEY is set for the run".** `qa.ts` reads the key from `.env`; it must be the value the running server uses.
- **Health-check steps are slow or flaky.** They use `.invalid` hosts, which must fail DNS immediately. A captive portal or a DNS-hijacking resolver breaks that assumption.
- **Starting clean.** Stop the server and remove `local.db*`, then `bun run db:migrate && bun run db:seed`. Ask the dev first if the file has data they care about.

## Reporting

State what ran and the result, with the numbers the commands printed, e.g. "`bun run ci` passed (N tests, build
ok); `bun qa.ts` N passed, 0 failed, N skipped". If a step was skipped, say which and why.
