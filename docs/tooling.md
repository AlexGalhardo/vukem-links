# Ferramentas

O que cada ferramenta faz neste projeto, onde está configurada e como é chamada. Versões exatas ficam em [`package.json`](../package.json); as regras de dependência, em [`conventions.md`](conventions.md#dependências).

## Runtime e gerenciador

| Ferramenta | Papel | Configuração |
| --- | --- | --- |
| Bun 1.4 | Gerenciador de pacotes, executor de scripts (`bun run`, `bun <arquivo>.ts`), test runner | `bunfig.toml` (pré-carrega `test/setup.ts` nos testes), `bun.lock` |
| Next.js 16 | App (App Router), build e servidor | `next.config.ts`. A API mudou em relação a versões antigas: consulte `node_modules/next/dist/docs/` antes de escrever código ([`AGENTS.md`](../AGENTS.md)) |
| TypeScript 7 | Typecheck `strict` + `noUncheckedIndexedAccess` | `tsconfig.json` |

Bun carrega o `.env` sozinho em `bun run` e `bun <arquivo>`: scripts e testes não precisam de `dotenv`.

## Scripts do `package.json`

| Script | Comando | Uso |
| --- | --- | --- |
| `dev` | `next dev` | Servidor de desenvolvimento |
| `build` / `start` | `next build` / `next start` | Build e servidor de produção |
| `typecheck` | `tsc --noEmit` | Tipos |
| `lint` | `biome check .` | Lint e formatação, sem escrever |
| `format` | `biome check --write .` | Aplica as correções |
| `test` | `bun test` | Unitários e de integração |
| `ci` | typecheck, lint, test, build | Gate único: local, `pre-push` e CI |
| `qa` | `bun qa.ts` | End-to-end contra o app rodando |
| `db:generate` | `drizzle-kit generate` | Gera migration a partir de `db/schema.ts` |
| `db:migrate` | `bun scripts/migrate.ts` | Aplica as migrations de `drizzle/` no banco de `TURSO_DATABASE_URL` |
| `db:seed` | `bun scripts/seed.ts` | Admin + projeto EletroRadar (`seed.json`) |
| `db:migrate-v4` | `bun scripts/migrate-v4.ts` | Migração única dos dados da v4 ([`migration-v4.md`](migration-v4.md)) |

## Qualidade

| Ferramenta | Papel | Configuração |
| --- | --- | --- |
| Biome | Lint, formatação e ordenação de imports (substitui ESLint e Prettier) | `biome.json`, `.editorconfig` (tabs, LF, 120 colunas) |
| `bun test` | Testes `**/*.test.ts` em SQLite descartável | `bunfig.toml`, `test/setup.ts`, `test/helpers.ts` |
| Playwright | Navegador do `qa.ts` (não há suíte `playwright test`) | Flags do próprio `qa.ts` |
| Husky | Hooks do git | `.husky/pre-commit` (`biome check --staged`), `.husky/commit-msg` (commitlint), `.husky/pre-push` (`bun run ci`) |
| commitlint | Conventional Commits | `commitlint.config.js` (`@commitlint/config-conventional`: cabeçalho e linhas do corpo com no máximo 100 caracteres) |
| markdownlint | Estilo dos `.md` (pela extensão do editor; não está no gate) | `.markdownlint-cli2.jsonc` |

O que cada nível de teste cobre: [`qa.md`](qa.md).

## Banco

| Ferramenta | Papel | Configuração |
| --- | --- | --- |
| Drizzle ORM + `@libsql/client` | Queries e cliente (`lib/db.ts`) | `db/schema.ts` |
| drizzle-kit | Só para **gerar** migrations. `push` é proibido | `drizzle.config.ts`, saída em `drizzle/` |
| SQLite em arquivo | Banco local (`./local.db`, ignorado pelo git) | `TURSO_DATABASE_URL=file:./local.db` |
| Turso | Banco de produção, criado pelo Vercel Marketplace | Variáveis `TURSO_*` na Vercel |

## Setup e infraestrutura

| Caminho | Conteúdo |
| --- | --- |
| [`setups/`](../setups) | Quatro scripts bash (`setup-{unix,windows}-{local,with-docker}.sh`) e a lógica comum em `_common.sh`. Uso em [`setup.md`](setup.md) |
| [`infra/`](../infra) | `Dockerfile` (multi-stage, `oven/bun` com tag fixa, usuário `bun`) e `docker-compose.yml` do ambiente de teste local |
| `.dockerignore` | Na raiz, porque o contexto de build é a raiz do repositório |
| [`vercel.json`](../vercel.json) | Crons de produção |
| `.github/workflows/ci.yml` | `bun run ci` no GitHub Actions, por enquanto só por disparo manual |

Ao trocar a versão do Bun, atualize os três lugares que a fixam: a tag em `infra/Dockerfile`, `bun-version` em `.github/workflows/ci.yml` e `@types/bun` em `package.json`.

## CLIs externos

| CLI | Uso aqui | Referência |
| --- | --- | --- |
| `gh` | Autenticação do git por HTTPS, criação das GitHub Releases, logs do CI (`gh run view <id> --log-failed`) | [`workflows.md`](workflows.md#release) |
| `vercel` | Link do projeto, variáveis de ambiente, deploy de produção | [`workflows.md`](workflows.md#deploy-vercel) |
| `docker` | Ambiente de teste em container | [`setup.md`](setup.md#docker) |

## Para agentes

| Caminho | Conteúdo |
| --- | --- |
| [`.claude/agents.md`](../.claude/agents.md) | Mapa do código e índice da documentação (importado por `CLAUDE.md`; `AGENTS.md` aponta para ele) |
| [`.claude/rules/project.md`](../.claude/rules/project.md) | Regras do projeto |
| `.claude/skills/links-*` | Skills do projeto: verificação local, endpoint seguro, mudança de banco, release |
| [`PLAN.md`](../PLAN.md) | Estado atual e pendências: leia antes, atualize depois |
