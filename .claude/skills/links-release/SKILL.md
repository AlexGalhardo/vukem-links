---
name: links-release
description: >
  How to release links-afiliados. Every commit pushed to the remote is a version: SemVer bump, CHANGELOG.md
  section, package.json, one commit, annotated tag, push and GitHub Release. Use it when the dev asks to push,
  release, bump the version, tag, or "fechar a versão".
---

# Release checklist

The commands live in `docs/workflows.md` (Release) and the conventions in `docs/conventions.md`. This is the
order to follow and what goes wrong.

1. **Only when the dev asked for it in this session.** Pushing and releasing are never implied by "implement X".
   Deploying to Vercel is a separate request (`docs/workflows.md`, Deploy).
2. **Choose the bump** with the SemVer table of `docs/conventions.md`. The last released version is the top
   dated section of `CHANGELOG.md`; what changed since:

   ```bash
   git log $(git describe --tags --abbrev=0)..HEAD --oneline
   git status --short
   ```

3. **Update the files**: `CHANGELOG.md` (`[Unreleased]` content becomes `## [X.Y.Z] - YYYY-MM-DD`, an empty
   `[Unreleased]` stays on top, the compare links at the bottom gain the new version), `package.json`
   (`"version"`), `PLAN.md` (**Estado atual**).
4. **One commit** carries the change, the bump and the changelog. Its message describes the change
   (`feat(api): ...`, `docs: ...`), not the release: there is no separate `chore(release)` commit.
   Format and scopes: `docs/conventions.md`; commitlint rejects a header or body line over 100 characters.
5. **Validate, tag, push, release** with the commands of `docs/workflows.md` (Release): `bun run ci`, the
   commit, `git tag -a vX.Y.Z -m "vX.Y.Z"`, `git push origin main vX.Y.Z`, then `gh release create` with that
   version's changelog section as notes.
6. **Verify**: `gh release view vX.Y.Z --repo AlexGalhardo/links.example.com` shows the release and
   `git status -sb` shows nothing ahead of `origin/main`.

## What goes wrong

- The `pre-push` hook runs `bun run ci` again. If it fails, fix the cause; never `--no-verify`, never a forced
  push to `main`.
- A tag that already exists on the remote is never moved. A mistake after the push is fixed by the next version.
- `release-notes.md` is a temporary file: remove it after `gh release create` so it is not committed later.
- A version with a new file in `drizzle/` needs the migration applied in production before the deploy, by the
  dev's request (`docs/workflows.md`, Banco (Turso)). Say so when reporting the release.
- Pushing does not publish anything: the repository is not connected to Vercel.
