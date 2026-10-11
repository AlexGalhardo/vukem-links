---
name: links-release
description: >
  How to cut a release of links-afiliados: choosing the SemVer bump, moving CHANGELOG.md entries from Unreleased
  to a dated version, bumping package.json, committing and tagging. Use it when the dev asks to release, bump the
  version, tag, or "fechar a versão".
---

# Release workflow

## 1. Choose the bump (SemVer)

| Bump | When, in this project |
| --- | --- |
| **major** | `/link?id=` contract changes, `POST /api/v1/links` breaks, or a migration needs a manual data step |
| **minor** | New screen, new field in the API, new check or metric, backwards compatible |
| **patch** | Bug fix, dependency update, docs, internal refactor |

Derive it from the commits since the last tag: any `feat!`/`BREAKING CHANGE` → major, any `feat` → minor, else patch.

```bash
git log $(git describe --tags --abbrev=0)..HEAD --oneline
```

## 2. Update files

- `CHANGELOG.md`: rename `## [Unreleased]` content to `## [X.Y.Z] - YYYY-MM-DD`, leave an empty `## [Unreleased]` on top, update the compare links at the bottom. Keep the Keep a Changelog groups: Added, Changed, Deprecated, Removed, Fixed, Security.
- `package.json`: `"version": "X.Y.Z"`.
- `PLAN.md`: update **Estado atual**.

## 3. Verify, commit, tag

```bash
bun run ci
git add CHANGELOG.md package.json PLAN.md
git commit -m "chore(release): vX.Y.Z"
git tag -a vX.Y.Z -m "vX.Y.Z"
```

Do not push the commit or the tag, and do not deploy, unless the dev asked for it in this session.

When the dev does ask: every pushed commit carries its own version, tag and GitHub Release with that version's
changelog section. The push, the `gh release create` command and the Vercel deploy are in `docs/workflows.md`.

## Commit messages (Conventional Commits, enforced by commitlint)

`<type>(<scope>): <subject>` — imperative, lower case, no trailing period, in English.

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `build`, `ci`, `perf`.
Scopes used here: `redirect`, `health`, `links`, `projects`, `auth`, `api`, `ui`, `db`, `qa`, `setup`, `deps`.

Breaking change: `feat(api)!: …` plus a `BREAKING CHANGE:` footer explaining the migration.
