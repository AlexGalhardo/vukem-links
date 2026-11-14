# vukem-links — guia para agentes

Dashboard pessoal de links de afiliado. Responde três perguntas: o link está vivo? onde ele está (projeto e página)? quantos cliques teve, em desktop ou mobile?

**Antes de qualquer tarefa:** leia [`PLAN.md`](../PLAN.md) (estado atual e pendências).

## Stack

Go 1.27 · vukem 0.43 (rotas, ORM, auth, scheduler, Inertia) · SQLite · Inertia 3 + React 19 · Tailwind CSS 4 · componentes estilo shadcn/ui escritos no repositório · TypeScript 7 strict · Biome · Bun (só frontend) · Playwright · Docker.

## Mapa

| Caminho | Papel |
| --- | --- |
| `routes/web.go` | Todas as rotas: públicas (`/link`, `/health`, `/api/v1/links`), login e dashboard (grupo com `auth.Required`) |
| `routes/schedule.go` | Tarefas agendadas: `links:health` (hora em hora) e `links:weekly-report` (domingo 17h BRT) |
| `app/controllers/public.go` | `/link?id=` (escolhe o link, grava o clique, 302) e `/health` |
| `app/controllers/api.go` | API dos sites (chave única `LINKS_API_KEY` + `?site=`): `PUT` sincroniza o catálogo, `POST` acrescenta; site novo vira projeto |
| `app/controllers/dashboard.go`, `auth.go` | Páginas e ações do dashboard; login e logout |
| `app/accounts/` | Guard de sessão e `CreateAdmin` |
| `app/pages/pages.go` | Props tipadas das páginas Inertia (gera `resources/js/page-props.ts` com `vukem codegen`) |
| `app/requests/` | Schemas de validação dos formulários |
| `internal/rules/` | Regras puras: loja, escolha do link, classificação da saúde, validação, importação, mensagens do Telegram |
| `internal/catalog/` | `Upsert` (única criação de produto/link), `Sync` (reconcilia o `PUT`), estatísticas e mutações de links |
| `internal/health/` | Checagem de saúde por HTTP (`Checker`): `Check`, `CheckAll`, `IsSiteLive`, `FindDeadURLs` |
| `internal/telegram/`, `internal/useragent/` | Alertas; device/SO/navegador/bot |
| `internal/legacy/` | Importação do `seed.json` e do banco da versão Next.js |
| `internal/deps/` | Serviços compartilhados e `Overrides` (HTTP e Telegram falsos nos testes) |
| `database/migrations/` | Schema (migrations em Go) |
| `bootstrap/` | `app.go` registra tudo; `commands.go` tem `admin:create`, `import:seed`, `import:legacy` |
| `resources/js/` | Páginas, layouts, `components/ui` (shadcn-style), `LinksTable`, `stats` |
| `tests/` | Testes HTTP do servidor com `vukemtest` (redirect, API, login, dashboard) |
| `e2e/`, `scripts/e2e-server.ts` | Playwright com banco novo por execução |
| `Dockerfile`, `compose.yaml`, `scripts/smoke.sh` | Imagem, compose e smoke |

## Regras do projeto

Contratos, segurança, dados, UI e processo: [`rules/project.md`](rules/project.md), importado junto com este guia pelo `CLAUDE.md`. É o único lugar das regras; as skills trazem só o passo a passo.

## Documentação

| Documento | Conteúdo |
| --- | --- |
| [`docs/setup.md`](../docs/setup.md) | Requisitos, variáveis de ambiente, local, Docker, testes |
| [`docs/architecture.md`](../docs/architecture.md) | Estrutura, modelo de dados, fluxos (redirect, clique, saúde) e camadas |
| [`docs/tooling.md`](../docs/tooling.md) | Ferramentas e onde cada uma é configurada |
| [`docs/workflows.md`](../docs/workflows.md) | Fluxo de tarefa, commit, release e deploy |
| [`docs/brainstorming.md`](../docs/brainstorming.md) | Decisões da v5 e da reescrita no vukem |
| [`docs/health-check.md`](../docs/health-check.md) | Como um link vira vivo, morto ou inconclusivo |
| [`docs/api.md`](../docs/api.md) | Contrato com os sites: `/link`, `PUT`/`POST /api/v1/links`, `/health` e formatos de importação |
| [`docs/auth.md`](../docs/auth.md) | Login do administrador |
| [`docs/migration.md`](../docs/migration.md) | Migração do Next.js/Turso para o vukem |
| [`docs/conventions.md`](../docs/conventions.md) | SemVer, Keep a Changelog, Conventional Commits, dependências e estilo de código |
| [`docs/PROMPT SEED.md`](../docs/PROMPT%20SEED.md) | Histórico: prompt original que gerou o seed legado (não descreve o estado atual) |

## Skills

Tudo o que existe em `.claude/` está nesta seção: o guia, as regras e as skills abaixo.

| Skill | Quando usar |
| --- | --- |
| `links-local-verification` | Antes de dar qualquer tarefa como concluída, ou quando o gate (`go test`, lint, build) ou o e2e falham |
| `links-secure-endpoint` | Ao criar ou alterar rota, ação do dashboard ou o redirect |
| `links-db-change` | Ao mexer em `database/migrations/` ou nos modelos |
| `links-release` | Ao enviar qualquer commit ao remoto: todo push é uma versão (bump, changelog, tag, GitHub Release) |
| `ponytail` (+ `ponytail-review`, `ponytail-audit`, `ponytail-debt`, `ponytail-gain`, `ponytail-help`) | Terceiros. Solução mais simples que funciona; origem do comentário `// ponytail:` ([`docs/conventions.md`](../docs/conventions.md#código)) |

Origem e versão das skills de terceiros: [`skills/SOURCES.md`](skills/SOURCES.md).
