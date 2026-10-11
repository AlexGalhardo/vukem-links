# links-afiliados

Dashboard pessoal para gerenciar links de afiliado usados em vários projetos.

- **O link ainda existe?** Checagem diária de saúde, com fallback automático para o próximo link vivo.
- **Onde ele está?** Cada link pertence a um produto (página) de um projeto.
- **Quantos cliques?** Cada clique registra device, sistema, navegador, país e página de origem.

Todo clique passa por `GET /link?id=<id do produto>`, que redireciona (302) para o link de afiliado ativo.

## Rodar local

```bash
./setups/unix.sh         # Linux / macOS
.\setups\windows.ps1     # Windows
./setups/docker.sh       # Docker (build de produção)
```

<http://localhost:3000> — login `admin@example.com`, senha em `ADMIN_PASSWORD` do `.env`. Detalhes em [`docs/setup.md`](docs/setup.md).

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind CSS v4 · Base UI · TanStack Query · Drizzle + Turso (libSQL) · Better Auth · Bun.

## Comandos

| Comando | O que faz |
| --- | --- |
| `bun run dev` | Servidor de desenvolvimento |
| `bun run ci` | Typecheck, lint, testes e build |
| `bun qa.ts` | QA end-to-end contra o app rodando |
| `bun run db:migrate` / `db:seed` | Aplica migrations / cria admin e dados de exemplo |

## Documentação

| | |
| --- | --- |
| [`PLAN.md`](PLAN.md) | Estado atual, pendências e próximos passos |
| [`CHANGELOG.md`](CHANGELOG.md) | Histórico de versões |
| [`docs/architecture.md`](docs/architecture.md) | Modelo de dados e fluxos |
| [`docs/health-check.md`](docs/health-check.md) | Como um link é considerado vivo ou morto |
| [`docs/api.md`](docs/api.md) | Redirect, API de cadastro e importação |
| [`docs/auth.md`](docs/auth.md) | Autenticação |
| [`docs/qa.md`](docs/qa.md) | Testes e QA |
| [`docs/migration-v4.md`](docs/migration-v4.md) | Migração da v4 |
| [`docs/conventions.md`](docs/conventions.md) | SemVer, changelog e commits |
| [`docs/brainstorming.md`](docs/brainstorming.md) | Decisões de produto da v5 |
| [`.claude/agents.md`](.claude/agents.md) | Guia para agentes de código |
