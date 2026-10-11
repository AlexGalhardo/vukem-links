# links-afiliados — guia para agentes

Dashboard pessoal de links de afiliado. Responde três perguntas: o link está vivo? onde ele está (projeto e página)? quantos cliques teve, em desktop ou mobile?

**Antes de qualquer tarefa:** leia [`PLAN.md`](../PLAN.md) (estado atual e pendências).

## Stack

Next.js 16 (App Router, Server Components) · React 19 · TypeScript 7 strict · Tailwind CSS v4 · Base UI (`@base-ui/react`) · TanStack Query · Drizzle ORM + libSQL (Turso em produção, arquivo SQLite local) · Better Auth · Zod · Biome · Bun.

## Mapa

| Caminho | Papel |
| --- | --- |
| `app/link/route.ts` | Redirect público `/link?id=<externalId>`: escolhe o link, grava o clique, 302 |
| `app/(dashboard)/` | Telas autenticadas: visão geral, `links`, `links/[id]`, `projects`, `projects/[slug]` |
| `app/actions.ts` | Todas as server actions (mutações do dashboard) |
| `app/api/links` | Lista de links para a tabela (TanStack Query) |
| `app/api/auth/[...all]` | Handler do Better Auth (login, logout, sessão) |
| `app/api/v1/links` | API dos sites (chave única `LINKS_API_KEY` + `?site=`): `PUT` sincroniza o catálogo inteiro, `POST` acrescenta. Site novo vira projeto sozinho |
| `proxy.ts` | Endereço que não é página vai para `/`. Não é controle de acesso |
| `lib/env.ts` | Schema das variáveis de ambiente (zod), conferido no início de todo build (`bun run check-env`) |
| `app/health` | Saúde pública (CORS): os sites caem para o link direto da loja quando ela não responde |
| `app/api/cron/health` | Checagem de saúde de hora em hora (Vercel Cron) |
| `app/api/cron/weekly` | Relatório semanal de cliques por projeto no Telegram (Vercel Cron) |
| `lib/cron.ts` | `hasBearer` (comparação em tempo constante) e `isCronRequest`: guarda das rotas de cron e da API dos sites |
| `lib/telegram.ts` | `notify`: alerta de link morto, log de cada clique redirecionado, relatório semanal |
| `lib/links.ts` | Regras puras: escolha do link, classificação da checagem, validação, importação (pula link morto ou já cadastrado), mensagens do Telegram |
| `lib/data.ts` | Leituras e as escritas de produtos/links: `upsertProducts` (única criação), `syncProducts` (reconcilia o `PUT`), `findOrCreateProject` |
| `lib/health.ts` | Checagem de saúde (I/O): `checkLinks`, `isSiteLive`, `findDeadUrls` |
| `lib/auth.ts`, `lib/session.ts` | Better Auth e `requireSession()` |
| `components/ui.tsx` | Wrappers de Base UI + `useAction` (mutação via server action) |
| `db/schema.ts`, `drizzle/`, `lib/db.ts` | Schema, migrations versionadas e o cliente Drizzle |
| `scripts/` | `migrate.ts` (`db:migrate`), `seed.ts` (`db:seed`), `migrate-v4.ts` (migração única da v4) e `check-env.ts` |
| `**/*.test.ts`, `test/` | Testes unitários e de integração (`bun test`); `test/setup.ts` cria o banco descartável |
| `qa.ts` | QA end-to-end (Playwright) |
| `setups/` | Quatro scripts bash para subir do zero: `setup-{unix,windows}-{local,with-docker}.sh` (+ `_common.sh`) |
| `infra/` | `Dockerfile` e `docker-compose.yml` do ambiente de teste local (o `.dockerignore` fica na raiz, que é o contexto de build) |
| `vercel.json` | Crons de produção |

## Regras do projeto

Contratos, segurança, dados, UI e processo: [`rules/project.md`](rules/project.md), importado junto com este guia pelo `CLAUDE.md`. É o único lugar das regras; as skills trazem só o passo a passo.

## Documentação

| Documento | Conteúdo |
| --- | --- |
| [`docs/agent-setup.md`](../docs/agent-setup.md) | **Setup do zero para agentes**: dependências, `.env`, banco, local, Docker, testes, GitHub e Vercel, com comando e verificação por passo |
| [`docs/setup.md`](../docs/setup.md) | Scripts de `setups/`, variáveis de ambiente, Docker (`infra/`) |
| [`docs/architecture.md`](../docs/architecture.md) | Modelo de dados, fluxos (redirect, clique, saúde) e camadas |
| [`docs/tooling.md`](../docs/tooling.md) | Ferramentas e onde cada uma é configurada: Bun, scripts do `package.json`, Biome, hooks, Drizzle, `gh`, `vercel` |
| [`docs/workflows.md`](../docs/workflows.md) | Fluxo de tarefa, commit, release (tag + GitHub Release) e deploy na Vercel (variáveis, Turso, crons) |
| [`docs/brainstorming.md`](../docs/brainstorming.md) | Decisões da v5 e seus motivos |
| [`docs/health-check.md`](../docs/health-check.md) | Como um link vira vivo, morto ou inconclusivo |
| [`docs/api.md`](../docs/api.md) | Contrato com os sites: redirect `/link`, `PUT`/`POST /api/v1/links`, `/health` e formatos de importação |
| [`docs/auth.md`](../docs/auth.md) | Better Auth, criação do admin, rate limit |
| [`docs/qa.md`](../docs/qa.md) | `qa.ts`, testes unitários, gate de CI |
| [`docs/migration-v4.md`](../docs/migration-v4.md) | Migração dos dados da v4 |
| [`docs/conventions.md`](../docs/conventions.md) | SemVer, Keep a Changelog, Conventional Commits, dependências e estilo de código |
| [`docs/PROMPT SEED.md`](../docs/PROMPT%20SEED.md) | Histórico: prompt original que gerou o seed legado (não descreve o estado atual) |

## Skills

Tudo o que existe em `.claude/` está nesta seção: o guia, as regras e as skills abaixo. Não há agentes nem referências próprios do repositório.

| Skill | Quando usar |
| --- | --- |
| `links-local-verification` | Antes de dar qualquer tarefa como concluída, ou quando o gate (`bun run ci`) ou o `qa.ts` falham |
| `links-secure-endpoint` | Ao criar ou alterar server action, rota de API ou o redirect |
| `links-db-change` | Ao mexer em `db/schema.ts` |
| `links-release` | Ao enviar qualquer commit ao remoto: todo push é uma versão (bump, changelog, tag, GitHub Release) |
| `ponytail` (+ `ponytail-review`, `ponytail-audit`, `ponytail-debt`, `ponytail-gain`, `ponytail-help`) | Terceiros. Ao escrever ou revisar código, para a solução mais simples que funciona. É a origem do comentário `// ponytail:` exigido em [`docs/conventions.md`](../docs/conventions.md#código); `ponytail-debt` lista esses comentários |

Origem e versão das skills de terceiros: [`skills/SOURCES.md`](skills/SOURCES.md). Skills genéricas (revisão, TDD, design, performance) vêm da instalação global de cada dev, não deste repositório.
