# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **ci:** The secret scan fails on the domains removed from the repository and its history (`removed-domain` rule), so they cannot come back in a commit.
- **test:** The integration smoke takes the site checkout and its public origin from `ELETRORADAR_DIR` and `SITE_URL` (both required) instead of defaults that named the site domain.
- **docs:** Rewrite the README in English in the layout of the other vukem apps (centered header with CI, license, Go and version badges, summary, features, quick start, API contract, stability, contributing); the docs site drops the GitHub-only header when it syncs the README.
- **docs:** Rewrite the released CHANGELOG sections and the GitHub release notes in the vukem format (scope, imperative description and commit link per entry) and point the compare links to this repository.
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

- **ci:** The secret scan fails on the domains removed from the repository and its history (`removed-domain` rule), so they cannot come back in a commit.
- **test:** The integration smoke takes the site checkout and its public origin from `ELETRORADAR_DIR` and `SITE_URL` (both required) instead of defaults that named the site domain.
- **agents:** Check the agent guide, project rules and the four `links-*` skills against the code: each rule now lives once in `.claude/rules/project.md` and the skills hold only the procedure ([e49adec](https://github.com/AlexGalhardo/vukem-links/commit/e49adec956ae53f5c50086d9b7da04fbb6cf4ec4))
- **agents:** Make `links-release` follow the release flow of `docs/workflows.md` (one commit per version, tag, push and GitHub Release) instead of a separate `chore(release)` commit ([e49adec](https://github.com/AlexGalhardo/vukem-links/commit/e49adec956ae53f5c50086d9b7da04fbb6cf4ec4))
- **docs:** Describe the shared `LINKS_API_KEY`, the `PUT` sync, `/health` and the environment check in `docs/qa.md`, `docs/tooling.md`, `docs/conventions.md` and `SECURITY.md` ([e49adec](https://github.com/AlexGalhardo/vukem-links/commit/e49adec956ae53f5c50086d9b7da04fbb6cf4ec4))

### Removed

- **agents:** Remove the unused third-party skills, agents and checklists vendored in `.claude/` (290 files, about 6.7 MB); only `ponytail` stays, for the `// ponytail:` comment convention, and the rest can be restored from `v6.2.0` ([e49adec](https://github.com/AlexGalhardo/vukem-links/commit/e49adec956ae53f5c50086d9b7da04fbb6cf4ec4))

### Fixed

- **agents:** Fix stale statements in the skills (SHA-256 API tokens, v4 tables, `_legacy/`) and add the missing entries for `/health`, `proxy.ts`, `lib/env.ts` and the cron guard ([e49adec](https://github.com/AlexGalhardo/vukem-links/commit/e49adec956ae53f5c50086d9b7da04fbb6cf4ec4))

## [6.2.0] - 2026-10-11

### Added

- **build:** Check the environment at the start of every build (`scripts/check-env.ts`, schema in `lib/env.ts`): a malformed value always fails, and a production build fails without an essential variable or with a local database file ([210195b](https://github.com/AlexGalhardo/vukem-links/commit/210195bf2400bdf8a5908a402eff5cf6f086e634))

### Changed

- **ci:** The secret scan fails on the domains removed from the repository and its history (`removed-domain` rule), so they cannot come back in a commit.
- **test:** The integration smoke takes the site checkout and its public origin from `ELETRORADAR_DIR` and `SITE_URL` (both required) instead of defaults that named the site domain.
- **web:** Redirect an address that is not a page, and a link or project that does not exist, to the start page (`proxy.ts`); `/link` and the API keep their 404 answers ([210195b](https://github.com/AlexGalhardo/vukem-links/commit/210195bf2400bdf8a5908a402eff5cf6f086e634))

## [6.1.0] - 2026-10-11

### Added

- **setup:** Add setup scripts for Git Bash on Windows (`setup-windows-local.sh`, `setup-windows-with-docker.sh`) ([afc0e1d](https://github.com/AlexGalhardo/vukem-links/commit/afc0e1d626dc0b972902b27fb63b69adf29a7d8c))
- **setup:** Check the required tools (Bun; Docker, Compose and a running daemon) and say how to install what is missing ([afc0e1d](https://github.com/AlexGalhardo/vukem-links/commit/afc0e1d626dc0b972902b27fb63b69adf29a7d8c))
- **setup:** Generate `BETTER_AUTH_SECRET`, `CRON_SECRET` and `LINKS_API_KEY` in `.env` when empty, without replacing or printing existing values ([afc0e1d](https://github.com/AlexGalhardo/vukem-links/commit/afc0e1d626dc0b972902b27fb63b69adf29a7d8c))
- **setup:** Use and announce the next free port when the port is busy, or stop with a clear message when `PORT`/`APP_PORT` was set ([afc0e1d](https://github.com/AlexGalhardo/vukem-links/commit/afc0e1d626dc0b972902b27fb63b69adf29a7d8c))
- **setup:** Add `--no-start` (or `SETUP_SKIP_START=1`) to prepare everything without starting the app ([afc0e1d](https://github.com/AlexGalhardo/vukem-links/commit/afc0e1d626dc0b972902b27fb63b69adf29a7d8c))
- **docs:** Add `docs/agent-setup.md`, `docs/tooling.md` and `docs/workflows.md` for AI agents ([afc0e1d](https://github.com/AlexGalhardo/vukem-links/commit/afc0e1d626dc0b972902b27fb63b69adf29a7d8c))

### Changed

- **ci:** The secret scan fails on the domains removed from the repository and its history (`removed-domain` rule), so they cannot come back in a commit.
- **test:** The integration smoke takes the site checkout and its public origin from `ELETRORADAR_DIR` and `SITE_URL` (both required) instead of defaults that named the site domain.
- **BREAKING:** **setup:** Rename the setup scripts (`setups/unix.sh` → `setups/setup-unix-local.sh`, `setups/docker.sh` → `setups/setup-unix-with-docker.sh`) ([afc0e1d](https://github.com/AlexGalhardo/vukem-links/commit/afc0e1d626dc0b972902b27fb63b69adf29a7d8c))
- **docker:** Move the Docker files from `setups/` to `infra/` ([afc0e1d](https://github.com/AlexGalhardo/vukem-links/commit/afc0e1d626dc0b972902b27fb63b69adf29a7d8c))
- **docker:** Start the stack in background, wait until the app answers and read secrets and the admin account from `.env` instead of built-in defaults ([afc0e1d](https://github.com/AlexGalhardo/vukem-links/commit/afc0e1d626dc0b972902b27fb63b69adf29a7d8c))
- **setup:** Refuse to migrate or seed when `TURSO_DATABASE_URL` is not a local file ([afc0e1d](https://github.com/AlexGalhardo/vukem-links/commit/afc0e1d626dc0b972902b27fb63b69adf29a7d8c))

### Removed

- **setup:** Remove the PowerShell scripts `setups/windows.ps1` and `setups/docker.ps1`; on Windows the setup runs in Git Bash ([afc0e1d](https://github.com/AlexGalhardo/vukem-links/commit/afc0e1d626dc0b972902b27fb63b69adf29a7d8c))

## [6.0.0] - 2026-10-11

### Added

- **api:** Turn a site seen for the first time into a project named after its host, so connecting a site takes one environment variable and nothing in the dashboard ([19a2845](https://github.com/AlexGalhardo/vukem-links/commit/19a28451a1da72f595257f1d9eb6ff89afeaa1a1))
- **api:** Add `GET /health`, public and readable from any origin, so the sites link straight to the store while the dashboard is down ([19a2845](https://github.com/AlexGalhardo/vukem-links/commit/19a28451a1da72f595257f1d9eb6ff89afeaa1a1))

### Changed

- **ci:** The secret scan fails on the domains removed from the repository and its history (`removed-domain` rule), so they cannot come back in a commit.
- **test:** The integration smoke takes the site checkout and its public origin from `ELETRORADAR_DIR` and `SITE_URL` (both required) instead of defaults that named the site domain.
- **BREAKING:** **api:** Authenticate `/api/v1/links` with one key shared by every site (`LINKS_API_KEY`), with the site named by `?site=<origin>`; project tokens are refused ([19a2845](https://github.com/AlexGalhardo/vukem-links/commit/19a28451a1da72f595257f1d9eb6ff89afeaa1a1))

### Removed

- **BREAKING:** **api:** Remove per-project API tokens, the "Gerar token da API" button and the `projects.api_token_hash` column ([19a2845](https://github.com/AlexGalhardo/vukem-links/commit/19a28451a1da72f595257f1d9eb6ff89afeaa1a1))

## [5.4.0] - 2026-10-11

### Changed

- **ci:** The secret scan fails on the domains removed from the repository and its history (`removed-domain` rule), so they cannot come back in a commit.
- **test:** The integration smoke takes the site checkout and its public origin from `ELETRORADAR_DIR` and `SITE_URL` (both required) instead of defaults that named the site domain.
- **import:** Check every new link of a JSON/CSV import before saving, skip links the project already has and links that answer as dead, and report how many of each ([5692ace](https://github.com/AlexGalhardo/vukem-links/commit/5692aceb1f8025d873e1c5ca6d8680c6d6c5f407))

## [5.3.0] - 2026-10-11

### Added

- **telegram:** Send a message for every human click redirected to a store: project, time (Brasília), product, page and destination ([c6a5ce0](https://github.com/AlexGalhardo/vukem-links/commit/c6a5ce0177a980083fae72001ff3a1f7f2aa207f))
- **telegram:** Send a weekly click report every Sunday at 17:00 (Brasília) with the clicks of the last 7 days per project ([c6a5ce0](https://github.com/AlexGalhardo/vukem-links/commit/c6a5ce0177a980083fae72001ff3a1f7f2aa207f))

### Changed

- **ci:** The secret scan fails on the domains removed from the repository and its history (`removed-domain` rule), so they cannot come back in a commit.
- **test:** The integration smoke takes the site checkout and its public origin from `ELETRORADAR_DIR` and `SITE_URL` (both required) instead of defaults that named the site domain.
- **health:** Check link health every hour instead of once a day; a link that dies is still reported on Telegram ([c6a5ce0](https://github.com/AlexGalhardo/vukem-links/commit/c6a5ce0177a980083fae72001ff3a1f7f2aa207f))

## [5.2.0] - 2026-10-11

### Added

- **api:** Add `PUT /api/v1/links` to sync a project's whole catalogue: update products, replace each link set in payload order and remove what the project no longer publishes ([e3e7137](https://github.com/AlexGalhardo/vukem-links/commit/e3e7137c3d5dffa6f73479f50bed28d5cc94d007))
- **link:** Add the optional `store` parameter to `/link?id=`, for pages with one button per store ([e3e7137](https://github.com/AlexGalhardo/vukem-links/commit/e3e7137c3d5dffa6f73479f50bed28d5cc94d007))
- **api:** Accept links only while the project's site is online (`409 project_offline`), in the API, forms and import ([e3e7137](https://github.com/AlexGalhardo/vukem-links/commit/e3e7137c3d5dffa6f73479f50bed28d5cc94d007))
- **docs:** Document the contract between the sites and the dashboard in `docs/api.md` ([e3e7137](https://github.com/AlexGalhardo/vukem-links/commit/e3e7137c3d5dffa6f73479f50bed28d5cc94d007))

### Changed

- **ci:** The secret scan fails on the domains removed from the repository and its history (`removed-domain` rule), so they cannot come back in a commit.
- **test:** The integration smoke takes the site checkout and its public origin from `ELETRORADAR_DIR` and `SITE_URL` (both required) instead of defaults that named the site domain.
- **catalog:** Refuse a product without links everywhere (API, form and import) ([e3e7137](https://github.com/AlexGalhardo/vukem-links/commit/e3e7137c3d5dffa6f73479f50bed28d5cc94d007))

## [5.1.0] - 2026-10-11

### Added

- **test:** Add integration tests for the data layer, health check, cron and project API routes and the v4 migration script ([557f5fb](https://github.com/AlexGalhardo/vukem-links/commit/557f5fb0f4579d58c0039cce7db1acd03a43b4f5))
- **test:** Add QA checks for table filters, sorting, pagination, bulk actions, click country, mobile width and color scheme ([557f5fb](https://github.com/AlexGalhardo/vukem-links/commit/557f5fb0f4579d58c0039cce7db1acd03a43b4f5))
- **auth:** Add a show/hide password toggle on the login form ([557f5fb](https://github.com/AlexGalhardo/vukem-links/commit/557f5fb0f4579d58c0039cce7db1acd03a43b4f5))
- **web:** Add a light/dark theme toggle remembered per browser, and a hamburger menu on narrow screens ([557f5fb](https://github.com/AlexGalhardo/vukem-links/commit/557f5fb0f4579d58c0039cce7db1acd03a43b4f5))
- **health:** Add the "Checar todos os links" button to the dead links panel ([557f5fb](https://github.com/AlexGalhardo/vukem-links/commit/557f5fb0f4579d58c0039cce7db1acd03a43b4f5))

### Changed

- **ci:** The secret scan fails on the domains removed from the repository and its history (`removed-domain` rule), so they cannot come back in a commit.
- **test:** The integration smoke takes the site checkout and its public origin from `ELETRORADAR_DIR` and `SITE_URL` (both required) instead of defaults that named the site domain.
- **repo:** Start a fresh history and remove `_legacy/` (v4 code) ([557f5fb](https://github.com/AlexGalhardo/vukem-links/commit/557f5fb0f4579d58c0039cce7db1acd03a43b4f5))
- **web:** Make dark the default theme regardless of the OS preference ([557f5fb](https://github.com/AlexGalhardo/vukem-links/commit/557f5fb0f4579d58c0039cce7db1acd03a43b4f5))
- **seed:** Load the EletroRadar project (381 products) from `seed.json` ([557f5fb](https://github.com/AlexGalhardo/vukem-links/commit/557f5fb0f4579d58c0039cce7db1acd03a43b4f5))

### Fixed

- **web:** Stop the overview page from scrolling horizontally on narrow screens ([557f5fb](https://github.com/AlexGalhardo/vukem-links/commit/557f5fb0f4579d58c0039cce7db1acd03a43b4f5))
- **ci:** Load `commitlint.config.js` under the package's ES module mode ([557f5fb](https://github.com/AlexGalhardo/vukem-links/commit/557f5fb0f4579d58c0039cce7db1acd03a43b4f5))

## [5.0.0] - 2026-10-10

### Added

- **BREAKING:** **repo:** Rebuild around three questions: is the link alive, where is it, and how many clicks did it get on which device ([0e8f76d](https://github.com/AlexGalhardo/vukem-links/commit/0e8f76da5bca871fdfd42575a1eccf29c2a245c6))
- **catalog:** Group every product (page) and its affiliate links under a project, with a per-project page ([0e8f76d](https://github.com/AlexGalhardo/vukem-links/commit/0e8f76da5bca871fdfd42575a1eccf29c2a245c6))
- **clicks:** Record each click with device, OS, browser, country, source page and a bot flag ([0e8f76d](https://github.com/AlexGalhardo/vukem-links/commit/0e8f76da5bca871fdfd42575a1eccf29c2a245c6))
- **health:** Check link health (HTTP status and final URL) daily and on demand, with a Telegram alert when a link dies ([0e8f76d](https://github.com/AlexGalhardo/vukem-links/commit/0e8f76da5bca871fdfd42575a1eccf29c2a245c6))
- **link:** Keep several affiliate links per product in priority order and redirect to the first live one, falling back to the product page ([0e8f76d](https://github.com/AlexGalhardo/vukem-links/commit/0e8f76da5bca871fdfd42575a1eccf29c2a245c6))
- **web:** Add the overview, links table (search, filters, sorting, bulk check and delete), link detail and project screens ([0e8f76d](https://github.com/AlexGalhardo/vukem-links/commit/0e8f76da5bca871fdfd42575a1eccf29c2a245c6))
- **api:** Add JSON/CSV import and `POST /api/v1/links` ([0e8f76d](https://github.com/AlexGalhardo/vukem-links/commit/0e8f76da5bca871fdfd42575a1eccf29c2a245c6))
- **test:** Add the end-to-end QA, unit tests for the link rules and the `bun run ci` gate ([0e8f76d](https://github.com/AlexGalhardo/vukem-links/commit/0e8f76da5bca871fdfd42575a1eccf29c2a245c6))
- **docs:** Add `docs/`, `PLAN.md`, the agent guide, project rules and skills ([0e8f76d](https://github.com/AlexGalhardo/vukem-links/commit/0e8f76da5bca871fdfd42575a1eccf29c2a245c6))

### Changed

- **ci:** The secret scan fails on the domains removed from the repository and its history (`removed-domain` rule), so they cannot come back in a commit.
- **test:** The integration smoke takes the site checkout and its public origin from `ELETRORADAR_DIR` and `SITE_URL` (both required) instead of defaults that named the site domain.
- **BREAKING:** **database:** Use a new schema (`projects`, `products`, `affiliate_links`, `click_events`, `link_checks`); copy existing data with `bun run db:migrate-v4` ([0e8f76d](https://github.com/AlexGalhardo/vukem-links/commit/0e8f76da5bca871fdfd42575a1eccf29c2a245c6))
- **BREAKING:** **auth:** Move from next-auth to Better Auth; the admin account is recreated by the seed ([0e8f76d](https://github.com/AlexGalhardo/vukem-links/commit/0e8f76da5bca871fdfd42575a1eccf29c2a245c6))
- **link:** Answer `/link?id=` with a server-side 302 to the first live link instead of a random one, and 404 for a missing or unknown id ([0e8f76d](https://github.com/AlexGalhardo/vukem-links/commit/0e8f76da5bca871fdfd42575a1eccf29c2a245c6))
- **deps:** Pin every dependency to an exact stable version ([0e8f76d](https://github.com/AlexGalhardo/vukem-links/commit/0e8f76da5bca871fdfd42575a1eccf29c2a245c6))

### Removed

- **deps:** Remove shadcn/ui, Radix UI and about 70 unused dependencies ([0e8f76d](https://github.com/AlexGalhardo/vukem-links/commit/0e8f76da5bca871fdfd42575a1eccf29c2a245c6))
- **web:** Remove the Bitly field, the category hierarchy and public sign-up ([0e8f76d](https://github.com/AlexGalhardo/vukem-links/commit/0e8f76da5bca871fdfd42575a1eccf29c2a245c6))

### Security

- **link:** Restrict affiliate URLs to public http(s) hosts and product pages to the project's domain ([0e8f76d](https://github.com/AlexGalhardo/vukem-links/commit/0e8f76da5bca871fdfd42575a1eccf29c2a245c6))
- **auth:** Rate-limit sign-in, backed by the database ([0e8f76d](https://github.com/AlexGalhardo/vukem-links/commit/0e8f76da5bca871fdfd42575a1eccf29c2a245c6))
- **web:** Add security headers, remove `X-Powered-By` and stop ignoring type errors at build time ([0e8f76d](https://github.com/AlexGalhardo/vukem-links/commit/0e8f76da5bca871fdfd42575a1eccf29c2a245c6))

[Unreleased]: https://github.com/AlexGalhardo/vukem-links/compare/v6.2.1...HEAD
[6.2.1]: https://github.com/AlexGalhardo/vukem-links/compare/v6.2.0...v6.2.1
[6.2.0]: https://github.com/AlexGalhardo/vukem-links/compare/v6.1.0...v6.2.0
[6.1.0]: https://github.com/AlexGalhardo/vukem-links/compare/v6.0.0...v6.1.0
[6.0.0]: https://github.com/AlexGalhardo/vukem-links/compare/v5.4.0...v6.0.0
[5.4.0]: https://github.com/AlexGalhardo/vukem-links/compare/v5.3.0...v5.4.0
[5.3.0]: https://github.com/AlexGalhardo/vukem-links/compare/v5.2.0...v5.3.0
[5.2.0]: https://github.com/AlexGalhardo/vukem-links/compare/v5.1.0...v5.2.0
[5.1.0]: https://github.com/AlexGalhardo/vukem-links/compare/v5.0.0...v5.1.0
[5.0.0]: https://github.com/AlexGalhardo/vukem-links/releases/tag/v5.0.0
