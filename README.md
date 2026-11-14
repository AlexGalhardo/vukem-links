# vukem-links

Dashboard pessoal para gerenciar links de afiliado usados em vários projetos.

- **O link ainda existe?** Checagem de saúde de hora em hora, com fallback automático para o próximo link vivo.
- **Onde ele está?** Cada link pertence a um produto (página) de um projeto.
- **Quantos cliques?** Cada clique registra device, sistema, navegador, país e página de origem.

Todo clique passa por `GET /link?id=<id do produto>`, que redireciona (302) para o link de afiliado ativo. Os sites registram o catálogo no build com `PUT /api/v1/links?site=` ([contrato](docs/api.md)).

## Stack

Go 1.27 · [vukem](https://github.com/AlexGalhardo/vukem) 0.43 (rotas, ORM, auth, scheduler) · Inertia 3 + React 19 + Tailwind CSS 4 com componentes no estilo shadcn/ui · SQLite · Bun (só para o frontend) · Playwright.

## Rodar local

```bash
cp .env.example .env && vukem key:generate     # APP_KEY no .env; defina ADMIN_PASSWORD e LINKS_API_KEY
bun install
vukem migrate && vukem admin:create            # banco SQLite em storage/ e a conta de admin
vukem import:seed                              # opcional: os 381 links do seed.json
vukem serve                                    # http://localhost:3000
```

Login com `ADMIN_EMAIL` e `ADMIN_PASSWORD` do `.env`. Detalhes em [`docs/setup.md`](docs/setup.md).

## Docker

```bash
export APP_KEY="$(go run ./cmd/app key:generate)" ADMIN_PASSWORD=... LINKS_API_KEY=...
docker compose up -d --wait        # http://localhost:3000, dados no volume links-data
docker compose down                # -v apaga o volume
```

`bash scripts/smoke.sh` faz o ciclo completo (build, subir, contrato público, derrubar).

## Comandos

| Comando | O que faz |
| --- | --- |
| `vukem serve` | Desenvolvimento (Go + Vite com reload) |
| `go test ./...` | Testes Go: regras, catálogo, saúde, API, redirect, login e páginas |
| `golangci-lint run` | Lint Go |
| `bun run typecheck` / `lint:js` / `build` | Frontend |
| `bun run e2e` | Fluxo principal no navegador (Playwright) |
| `bash scripts/smoke.sh` | Smoke da imagem Docker |
| `app admin:create` | Cria o admin (`ADMIN_EMAIL`/`ADMIN_PASSWORD`), sem alterar senha existente |
| `app import:seed` / `import:legacy -from <arquivo>` | Importa o `seed.json` / o banco da versão anterior ([`docs/migration.md`](docs/migration.md)) |

## Documentação

| | |
| --- | --- |
| [`PLAN.md`](PLAN.md) | Estado atual, pendências e próximos passos |
| [`CHANGELOG.md`](CHANGELOG.md) | Histórico de versões |
| [`docs/setup.md`](docs/setup.md) | Variáveis de ambiente, local e Docker |
| [`docs/architecture.md`](docs/architecture.md) | Estrutura, modelo de dados e fluxos |
| [`docs/api.md`](docs/api.md) | Redirect, API de cadastro (contrato com os sites) e importação |
| [`docs/health-check.md`](docs/health-check.md) | Como um link é considerado vivo ou morto |
| [`docs/auth.md`](docs/auth.md) | Login do administrador |
| [`docs/migration.md`](docs/migration.md) | Migração do Next.js/Turso para o vukem |
| [`docs/tooling.md`](docs/tooling.md) | Ferramentas e configuração |
| [`docs/workflows.md`](docs/workflows.md) | Commit, release e deploy |
| [`docs/conventions.md`](docs/conventions.md) | SemVer, changelog e commits |
| [`docs/brainstorming.md`](docs/brainstorming.md) | Decisões de produto e da reescrita |
| [`.claude/agents.md`](.claude/agents.md) | Guia para agentes de código |
