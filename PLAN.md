# PLAN

Planejamento vivo do projeto. Toda sessão de trabalho (humana ou agente) começa lendo este arquivo e termina atualizando-o.
Decisões e motivos: [`docs/brainstorming.md`](docs/brainstorming.md). Mapa do código: [`.claude/agents.md`](.claude/agents.md).

## Como usar

1. Leia **Estado atual** e **Pendências**.
2. Pegue o primeiro item aberto de **Próximos passos** (ou o que o dev pedir).
3. Ao terminar: marque o item, atualize **Estado atual**, registre em [`CHANGELOG.md`](CHANGELOG.md).

## Estado atual

- **Branch `feat/vukem-rewrite` (não enviada):** reescrita completa de Next.js/Turso para **vukem 0.43.0 (Go) + Inertia + React + componentes estilo shadcn/ui + SQLite** (ROADMAP 12.a). Entra como 7.0.0 quando o dono mandar publicar; `main` e a produção na Vercel seguem na 6.2.1.
- **Features mantidas:** CRUD de projetos, produtos e links; fallback automático; checagem de saúde de hora em hora (scheduler do vukem); clique com device, SO, navegador, país e origem; API de sync com chave única (mesmos paths, payload e respostas); `/link?id=`; `/health`; alertas e relatório semanal no Telegram; importação JSON/CSV; login do admin.
- **Validado em 2026-11-14 (Windows/Git Bash):** `go vet ./...`, `go test -race ./...` (regras, catálogo, saúde com HTTP falso, API, redirect, login, dashboard, importação), `golangci-lint run` (0 issues), `bun run typecheck`, `bun run lint:js`, `bun run build`, `bun run e2e` (4 testes Playwright), `bash scripts/smoke.sh` (build da imagem, compose `up --wait`, `/link` 302, `/login` 200, login e `down -v`).
- **Contrato com os sites:** [`docs/api.md`](docs/api.md), idêntico ao da 6.2.1 e fixado por `tests/api_test.go` (os sites sincronizam com `PUT /api/v1/links?site=` e `LINKS_DASHBOARD_TOKEN`, apontam os botões para `/link?id=&store=` e caem para a loja quando `/health` não responde).
- **Produção atual:** `https://links.example.com` (Vercel + Turso, versão 6.2.1). **Não foi tocada.** A troca pelo app novo está em [`docs/migration.md`](docs/migration.md).

## Fases da reescrita

| # | Fase | Status |
| --- | --- | --- |
| 1 | Scaffold vukem (Inertia + React), remoção do Next.js | Feito |
| 2 | Schema (`projects`, `products`, `affiliate_links`, `click_events`, `link_checks`, `users`) | Feito |
| 3 | Regras puras, catálogo (`Upsert`/`Sync`), saúde, Telegram, user agent | Feito |
| 4 | Rotas públicas (`/link`, `/health`, `/api/v1/links`), login e dashboard | Feito |
| 5 | UI: sidebar, visão geral, links, projetos, diálogos | Feito |
| 6 | Importação do `seed.json` e do banco da versão anterior | Feito |
| 7 | e2e Playwright, Docker, smoke, CI, documentação | Feito |

## Pendências (dependem do dev)

- [ ] Rodar `import:legacy` com um export real do banco Turso de produção (só testado com um banco no schema do Drizzle) e conferir as contagens.
- [ ] Decidir onde hospedar a imagem (Railway, Fly, VPS) e trocar o `LINKS_DASHBOARD_TOKEN`/URL dos sites só se o endereço mudar (o contrato não muda).
- [ ] Publicar a 7.0.0 (bump, changelog, tag, GitHub Release) e então apontar o domínio para o app novo.
- [ ] Revisar `SECURITY.md` (canal de contato).
- [ ] Autorizar a adição de `@playwright/test` 1.63.0 (já usada no vukem-trello) e dizer se os componentes shadcn devem passar a usar Radix/`cva`/`lucide` (hoje não: são escritos no repositório sobre React + Tailwind).
- [ ] Rodar o smoke e o e2e em Linux/macOS (validados só no Windows/Git Bash).

## Próximos passos (sugestões, por valor)

- [ ] Detectar "produto indisponível" por loja (hoje só link quebrado é detectado).
- [ ] Filtro de período (7/30/90 dias) nas estatísticas.
- [ ] Reordenar links de um produto por arrastar (hoje: "Tornar principal" ou editar a ordem).
- [ ] Exportar cliques em CSV.
- [ ] Paginação server-side da tabela quando passar de ~5 mil links.
- [ ] Driver Turso do vukem (`drivers/turso`) quando deixar de ser experimental, para manter o banco remoto.

## Comandos

| Comando | O que faz |
| --- | --- |
| `vukem serve` | Desenvolvimento (Go + Vite) |
| `go vet ./... && go test ./...` | Vet e testes |
| `golangci-lint run` | Lint Go |
| `bun run typecheck && bun run lint:js && bun run build` | Frontend |
| `bun run e2e` | Playwright |
| `bash scripts/smoke.sh` | Smoke da imagem Docker |
| `vukem codegen` | Regenera `resources/js/page-props.ts` |
| `app admin:create` / `import:seed` / `import:legacy -from <arquivo>` | Admin e importações |
