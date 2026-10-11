# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/AlexGalhardo/links.example.com/compare/v5.4.0...HEAD
[5.4.0]: https://github.com/AlexGalhardo/links.example.com/compare/v5.3.0...v5.4.0
[5.3.0]: https://github.com/AlexGalhardo/links.example.com/compare/v5.2.0...v5.3.0
[5.2.0]: https://github.com/AlexGalhardo/links.example.com/compare/v5.1.0...v5.2.0
[5.1.0]: https://github.com/AlexGalhardo/links.example.com/compare/v5.0.0...v5.1.0
[5.0.0]: https://github.com/AlexGalhardo/links.example.com/releases/tag/v5.0.0
