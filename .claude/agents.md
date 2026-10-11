# links-afiliados — guia para agentes

Dashboard pessoal de links de afiliado. Responde três perguntas: o link está vivo? onde ele está (projeto e página)? quantos cliques teve, em desktop ou mobile?

**Antes de qualquer tarefa:** leia [`PLAN.md`](../PLAN.md) (estado atual e pendências). Ao terminar, atualize `PLAN.md` e [`CHANGELOG.md`](../CHANGELOG.md).

## Stack

Next.js 16 (App Router, Server Components) · React 19 · TypeScript 7 strict · Tailwind CSS v4 · Base UI (`@base-ui/react`) · TanStack Query · Drizzle ORM + libSQL (Turso em produção, arquivo SQLite local) · Better Auth · Zod · Biome · Bun.

## Mapa

| Caminho | Papel |
| --- | --- |
| `app/link/route.ts` | Redirect público `/link?id=<externalId>`: escolhe o link, grava o clique, 302 |
| `app/(dashboard)/` | Telas autenticadas: visão geral, `links`, `links/[id]`, `projects`, `projects/[slug]` |
| `app/actions.ts` | Todas as server actions (mutações do dashboard) |
| `app/api/links` | Lista de links para a tabela (TanStack Query) |
| `app/api/v1/links` | API por token de projeto: `PUT` sincroniza o catálogo inteiro (script de build dos sites), `POST` acrescenta |
| `app/api/cron/health` | Checagem de saúde de hora em hora (Vercel Cron) |
| `app/api/cron/weekly` | Relatório semanal de cliques por projeto no Telegram (Vercel Cron) |
| `lib/telegram.ts` | `notify`: alerta de link morto, log de cada clique redirecionado, relatório semanal |
| `lib/links.ts` | Regras puras: escolha do link, classificação da checagem, validação, importação |
| `lib/data.ts` | Leituras e a única escrita de produtos/links (`upsertProducts`) |
| `lib/health.ts` | Checagem de saúde (I/O) |
| `lib/auth.ts`, `lib/session.ts` | Better Auth e `requireSession()` |
| `components/ui.tsx` | Wrappers de Base UI + `useAction` (mutação via server action) |
| `db/schema.ts`, `drizzle/` | Schema e migrations versionadas |
| `**/*.test.ts`, `test/` | Testes unitários e de integração (`bun test`); `test/setup.ts` cria o banco descartável |
| `qa.ts` | QA end-to-end (Playwright) |
| `setups/` | Scripts para subir local (Unix, Windows, Docker) |

## Regras do projeto

Detalhadas em [`rules/project.md`](rules/project.md). As que mais quebram coisas:

- A URL `/link?id=<externalId>` é contrato público: não mude formato nem semântica.
- Toda página, server action e rota de API do dashboard chama `requireSession()`/`getSession()`.
- Produto e link só nascem por `upsertProducts`; URL só entra validada por `isPublicHttpUrl`.
- Rota nova em `app/api/` exige entrada em `expectations` no `qa.ts`.
- Schema muda por migration nova (`bun run db:generate`), nunca por `push` nem editando migration aplicada.

## Documentação

| Documento | Conteúdo |
| --- | --- |
| [`docs/brainstorming.md`](../docs/brainstorming.md) | Decisões da v5 e seus motivos |
| [`docs/architecture.md`](../docs/architecture.md) | Modelo de dados e fluxos (redirect, clique, saúde) |
| [`docs/setup.md`](../docs/setup.md) | Subir local (Unix, Windows, Docker), variáveis de ambiente, deploy |
| [`docs/health-check.md`](../docs/health-check.md) | Como um link vira vivo, morto ou inconclusivo |
| [`docs/api.md`](../docs/api.md) | `POST /api/v1/links` e formatos de importação |
| [`docs/auth.md`](../docs/auth.md) | Better Auth, criação do admin, rate limit |
| [`docs/qa.md`](../docs/qa.md) | `qa.ts`, testes unitários, gate de CI |
| [`docs/migration-v4.md`](../docs/migration-v4.md) | Migração dos dados da v4 |
| [`docs/conventions.md`](../docs/conventions.md) | SemVer, Keep a Changelog, Conventional Commits |

## Skills do projeto

| Skill | Quando usar |
| --- | --- |
| `links-local-verification` | Antes de dar qualquer tarefa como concluída |
| `links-secure-endpoint` | Ao criar ou alterar server action, rota de API ou o redirect |
| `links-db-change` | Ao mexer em `db/schema.ts` |
| `links-release` | Ao fechar uma versão (bump, changelog, tag) |
