# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Rewrite on the vukem framework (Go) with Inertia + React and a shadcn/ui-style interface**, replacing Next.js, Drizzle, Turso and Better Auth. The public contract is unchanged: `GET /link?id=<externalId>[&store=]` (302), `PUT`/`POST /api/v1/links?site=` with the shared `LINKS_API_KEY`, and `GET /health` (CORS `*`) answer exactly as before (`tests/api_test.go` pins it).
- The dashboard has a Vercel-style sidebar (overview, links, projects), light and dark themes, and confirmation dialogs that say what will be erased. Interface texts stay in Portuguese.
- The database is a SQLite file (volume `links-data` in Docker) with integer ids and ISO 8601 UTC dates; `external_id`, the public identifier, is unchanged.
- The hourly health check and the weekly Telegram report run on the vukem scheduler (`links:health`, `links:weekly-report`) instead of Vercel Cron; the `CRON_SECRET` variable and the `/api/cron/*` routes are gone.
- The health check fetches links with the vukem `httpclient.Safe`, which refuses private addresses on every connection, so redirects are now covered too (closes the old "revalidate the host on each redirect" item).
- Login uses the vukem session guard; an administrator is created by `admin:create` (`ADMIN_EMAIL`, `ADMIN_PASSWORD`). Login is throttled per IP and per account. There is still no sign-up.
- Deployment is the Docker image with direct HTTP (`compose.yaml`, `Dockerfile` with pinned base images); the `setups/` scripts, `infra/`, `vercel.json`, Husky and commitlint are removed in favor of `.githooks/`.

### Added

- `import:seed` (loads `seed.json`) and `import:legacy -from <file>` (copies projects, products, links, clicks and checks from a copy of the previous database) commands; see `docs/migration.md`.
- Playwright end-to-end test of the main flow (`bun run e2e`), `scripts/smoke.sh` (Docker build, compose up, public contract, `down -v`) and a frontend job in CI.
- `scripts/integration-smoke.sh` and `docs/integration.md`: boots the dashboard with compose, runs the real eletroradar catalogue sync against it, follows a `/link?id=` click (302) and checks the click in the database. The sites cannot be built against a local dashboard (their dashboard URL is a constant and `?site=` must be public).
- Open source files: MIT `LICENSE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, a complete README with screenshots and the API contract; `SECURITY.md` no longer mentions the removed cron endpoint and `qa.ts`.
- Documentation site (`site/`, Astro 7 + MDX, copied from the vukem-trading shell with the same pinned versions) generated from `README.md` and `docs/`, published to GitHub Pages at `https://alexgalhardo.github.io/vukem-links/` by `.github/workflows/site.yml`. No Docker image.
- `docs/migration.md` and the "Reescrita no vukem" section of `docs/brainstorming.md`.

### Removed

- Next.js, React Server Components, TanStack Query, Base UI, Drizzle, Better Auth, Zod, Bun test runner, `qa.ts`, the v4 migration script and its documentation.

## [6.2.1] - 2026-10-11

### Changed

- Agent guide, project rules and the four `links-*` skills under `.claude/` were checked against the code: each rule now lives in one place (`.claude/rules/project.md`) and the skills hold only the procedure and link to `docs/`.
- `links-release` follows the release flow of `docs/workflows.md` (one commit per version, tag, push and GitHub Release) instead of a separate `chore(release)` commit.
- `docs/qa.md`, `docs/tooling.md`, `docs/conventions.md` and `SECURITY.md` describe the shared `LINKS_API_KEY`, the `PUT` sync, `/health` and the environment check where they still described project tokens.

### Removed

- Third-party skills, agents and checklists vendored in `.claude/` that nothing in the project referred to (290 files, about 6.7 MB): the agent-skills pack with `.claude/agents/` and `.claude/references/`, and the `impeccable`, `ui-ux-pro-max`, `vercel-react-best-practices`, `frontend-design`, `minimalist-ui`, `web-design-guidelines` and `graphify` skills. Only `ponytail` stays, because the code convention uses its `// ponytail:` comment. They can be restored from the tag `v6.2.0`.

### Fixed

- Stale statements in the skills: API tokens stored as SHA-256 (removed in 6.0.0), v4 tables in production, the `_legacy/` folder, and missing entries for `/health`, `proxy.ts`, `lib/env.ts` and the cron guard.

## [6.2.0] - 2026-10-11

### Added

- Environment check at the start of every build (`scripts/check-env.ts`, schema in `lib/env.ts`, zod 4): a malformed value always fails the build, and a production build fails when an essential variable is missing or the database is a local file. Other builds need no variable.

### Changed

- An address that is not a page redirects to the start page (`proxy.ts`), and so does a link or project that does not exist. `/link` and the API keep their 404 answers.

## [6.1.0] - 2026-10-11

### Added

- Setup scripts for Git Bash on Windows: `setups/setup-windows-local.sh` and `setups/setup-windows-with-docker.sh`.
- The setup scripts check the required tools (Bun; Docker, Compose and a running daemon for the Docker ones) and say how to install what is missing.
- The setup scripts generate `BETTER_AUTH_SECRET`, `CRON_SECRET` and `LINKS_API_KEY` in `.env` when they are empty, without replacing existing values or printing them.
- A busy port no longer breaks the setup: the next free port is used and announced, or the script stops with a clear message when the port was chosen with `PORT`/`APP_PORT`.
- `--no-start` (or `SETUP_SKIP_START=1`) prepares everything without starting the app.
- Documentation for AI agents: `docs/agent-setup.md` (setup from zero with a verification per step, including GitHub and Vercel), `docs/tooling.md` and `docs/workflows.md` (commit, release and deploy).

### Changed

- The setup scripts were renamed: `setups/unix.sh` is now `setups/setup-unix-local.sh` and `setups/docker.sh` is now `setups/setup-unix-with-docker.sh`.
- The Docker files moved from `setups/` to `infra/` (`infra/Dockerfile`, `infra/docker-compose.yml`).
- The Docker setup starts the stack in background, waits until the app answers and reads its secrets and the admin account from the root `.env` instead of built-in defaults (the admin password is no longer `admin-local-123`).
- The local setup scripts refuse to migrate or seed when `TURSO_DATABASE_URL` is not a local file.

### Removed

- The PowerShell scripts `setups/windows.ps1` and `setups/docker.ps1`: on Windows the setup runs in Git Bash.

## [6.0.0] - 2026-10-11

### Added

- A site seen for the first time by the API becomes a project on its own, named after its host. Connecting a new site takes one environment variable on the site and nothing in the dashboard.
- `GET /health`, public and readable from any origin, so the sites can link straight to the store while the dashboard is down.

### Changed

- **BREAKING:** `/api/v1/links` is authenticated by one key shared by every site (`LINKS_API_KEY`) and the site names itself with `?site=<origin>`. Requests with a project token are refused.

### Removed

- **BREAKING:** per-project API tokens, the "Gerar token da API" button and the `projects.api_token_hash` column. Generating a token used to revoke the one a site was using and break its builds.

## [5.4.0] - 2026-10-11

### Changed

- The JSON/CSV import of a project now checks every new link before saving: links the project already has and links that answer as dead are skipped, and the result says how many of each.

## [5.3.0] - 2026-10-11

### Added

- Telegram message for every human click that was redirected to a store: project, time (Brasília), product, page and destination.
- Weekly click report on Telegram, every Sunday at 17:00 (Brasília): clicks of the last 7 days per project (`/api/cron/weekly`).

### Changed

- The link health check runs every hour instead of once a day; a link that dies is still reported on Telegram.

## [5.2.0] - 2026-10-11

### Added

- `PUT /api/v1/links`: full sync of a project's catalogue. It updates product fields, replaces each product's link set in the payload order and removes what the project no longer publishes.
- Optional `store` parameter on `/link?id=`, for pages with one button per store.
- A project only receives links while its site is online: the API answers `409 project_offline`, and the dashboard refuses to create a project, save a product or import for a site that does not answer.
- The contract between the sites and this dashboard, in `docs/api.md`.

### Changed

- A product without links is refused everywhere (API, form and import).
- Production runs on `https://links.example.com` (Vercel project `links-example-com`, Turso database from the Vercel Marketplace).

## [5.1.0] - 2026-10-11

### Added

- Integration tests for the data layer, the health check, the cron and project API routes and the v4 migration script, running against a throwaway SQLite file.
- QA checks for table filters, sorting, pagination, bulk actions, click country, mobile width and color scheme.
- Show/hide password eye icon inside the password field on the login form.
- Light/dark theme toggle in the navbar, remembered per browser.
- Hamburger menu for the main navigation on narrow screens.
- "Checar todos os links" button on the overview's dead links panel, running the health check over every registered link.

### Changed

- Repository moved to `AlexGalhardo/links.example.com` with a fresh history; `_legacy/` (v4 code) removed.
- Dark is now the default theme regardless of the OS preference.
- `seed.json` and `bun run db:seed` now load the EletroRadar project (`https://example.com`, 381 products) instead of Produtos Tech.

### Fixed

- Overview page no longer scrolls horizontally on narrow screens.
- `commitlint.config.js` loads under the package's ES module mode.

## [5.0.0] - 2026-10-10

Rewrite around three questions: is the link alive, where is it, and how many clicks did it get on which device.

### Added

- Projects: every product (page) and its affiliate links belong to a project, with a per-project page.
- Per-click events with device, OS, browser, country, source page and a bot flag.
- Link health check (HTTP status and final URL) with daily cron, manual check and Telegram alert when a link dies.
- Several affiliate links per product in a manual priority order; the redirect uses the first one that is not dead and falls back to the product page when all are dead.
- Overview, links table (search, filters, sorting, bulk check and delete), link detail and project screens.
- JSON/CSV import and `POST /api/v1/links`, authenticated by a per-project token.
- `qa.ts` end-to-end QA for this project, unit tests for the link rules, `bun run ci` gate.
- `setups/` scripts for Unix, Windows and Docker.
- Documentation under `docs/`, `PLAN.md`, agent guide, project rules and skills under `.claude/`.
- Commit message linting (Conventional Commits) and a manual-only GitHub Actions workflow.

### Changed

- **BREAKING:** new database schema (`projects`, `products`, `affiliate_links`, `click_events`, `link_checks`). Existing data must be copied with `bun run db:migrate-v4`; see `docs/migration-v4.md`.
- **BREAKING:** authentication moved from next-auth to Better Auth. The admin account is recreated by `bun run db:seed`; v4 passwords are not migrated.
- `/link?id=` is now a server-side 302 and no longer picks a random link. The URL format is unchanged.
- `/link` with a missing or unknown id answers 404 instead of redirecting to the dashboard.
- UI rebuilt on Base UI and Tailwind CSS v4 tokens, following the system light/dark preference.
- Client data fetching and mutations go through TanStack Query.
- All dependencies pinned to exact stable versions; Next.js 16.4, React 19.3, TypeScript 7.0.
- Database migrations are versioned in `drizzle/` instead of `drizzle-kit push`.

### Removed

- shadcn/ui, Radix UI and about 70 unused dependencies.
- Bitly URL field and dialogs.
- Master category / category / subcategory hierarchy (category is now an optional text on the product).
- Public sign-up.

### Security

- Affiliate URLs are restricted to public http(s) hosts; product pages must belong to the project's domain.
- Sign-in rate limiting backed by the database.
- Project API tokens are stored as SHA-256 hashes; the cron endpoint requires `CRON_SECRET`.
- Security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`); `X-Powered-By` removed.
- Type errors no longer ignored at build time (`ignoreBuildErrors` removed).

[Unreleased]: https://github.com/AlexGalhardo/links.example.com/compare/v6.2.1...HEAD
[6.2.1]: https://github.com/AlexGalhardo/links.example.com/compare/v6.2.0...v6.2.1
[6.2.0]: https://github.com/AlexGalhardo/links.example.com/compare/v6.1.0...v6.2.0
[6.1.0]: https://github.com/AlexGalhardo/links.example.com/compare/v6.0.0...v6.1.0
[6.0.0]: https://github.com/AlexGalhardo/links.example.com/compare/v5.4.0...v6.0.0
[5.4.0]: https://github.com/AlexGalhardo/links.example.com/compare/v5.3.0...v5.4.0
[5.3.0]: https://github.com/AlexGalhardo/links.example.com/compare/v5.2.0...v5.3.0
[5.2.0]: https://github.com/AlexGalhardo/links.example.com/compare/v5.1.0...v5.2.0
[5.1.0]: https://github.com/AlexGalhardo/links.example.com/compare/v5.0.0...v5.1.0
[5.0.0]: https://github.com/AlexGalhardo/links.example.com/releases/tag/v5.0.0
