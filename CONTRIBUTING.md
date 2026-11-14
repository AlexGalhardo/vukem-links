# Contributing to vukem-links

Thanks for helping. This guide covers setup, workflow and the rules every change follows.

## Setup

1. Install Go (see `go.mod`), [Bun](https://bun.sh), Docker (optional) and the Vukem CLI (`go install github.com/AlexGalhardo/vukem/cmd/vukem@v0.43.0`).
2. Clone, enable the git hooks and prepare the app:

   ```sh
   git clone https://github.com/AlexGalhardo/vukem-links.git
   cd vukem-links
   git config core.hooksPath .githooks
   cp -n .env.example .env
   vukem key:generate
   bun install --frozen-lockfile
   vukem migrate && vukem admin:create
   vukem serve
   ```

   Set `ADMIN_PASSWORD` and `LINKS_API_KEY` in `.env` first. All variables are in [docs/setup.md](docs/setup.md).

## Workflow

1. Open an issue first for anything that changes the public contract (`/link`, `/api/v1/links`, `/health`, see [docs/api.md](docs/api.md)).
2. Branch from `main`: `feat/<short-name>`, `fix/<short-name>`, `docs/<short-name>`.
3. Write the test first, then the code. Keep changes small and focused; one commit per problem.
4. Run the checks below, then open a pull request against `main`.
5. The commit and PR title must be a [Conventional Commit](https://www.conventionalcommits.org). Record user-visible changes under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md).

## Checks

```sh
go vet ./... && go test ./...
golangci-lint run
bun run typecheck && bun run lint:js && bun run build
bun run lint:md
bun run e2e                       # when you touch a user flow
bash scripts/smoke.sh             # when you touch Docker or the public contract
```

## Rules

The project rules (contracts that never change, security, data, UI) live in [.claude/rules/project.md](.claude/rules/project.md). The short version:

- Dashboard routes sit behind `auth.Required`; any URL from outside goes through `rules.IsPublicHTTPURL`.
- Products and links are created only by `catalog.Service.Upsert`.
- No new dependency without discussing it in an issue first. Versions are pinned.
- The UI is in Brazilian Portuguese; code, identifiers and commits are in English.

By contributing you agree that your work is released under the [MIT License](LICENSE) and that you follow the [Code of Conduct](CODE_OF_CONDUCT.md).
