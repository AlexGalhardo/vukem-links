# PLAN

Planejamento vivo do projeto. Toda sessão de trabalho (humana ou agente) começa lendo este arquivo e termina atualizando-o.
Decisões e motivos: [`docs/brainstorming.md`](docs/brainstorming.md). Mapa do código: [`.claude/agents.md`](.claude/agents.md).

## Como usar

1. Leia **Estado atual** e **Pendências**.
2. Pegue o primeiro item aberto de **Próximos passos** (ou o que o dev pedir).
3. Ao terminar: marque o item, atualize **Estado atual**, registre em [`CHANGELOG.md`](CHANGELOG.md).

## Estado atual

- **Versão:** 5.3.0 em `main`, repositório `AlexGalhardo/links.example.com` (histórico recriado em 2026-10-11). Cada commit enviado ao remoto vira uma release com as notas do `CHANGELOG.md`.
- **Validado localmente (2026-10-10):** `bun run ci` (typecheck, lint, 45 testes unitários e de integração, build), `bun qa.ts` (96 checks em 2026-10-11), `setups/unix.sh` e `setups/windows.ps1` de ponta a ponta em clone limpo, Docker com QA no container.
- **Produção:** `https://links.example.com` (projeto Vercel `links-example-com`, deploy pelo CLI `vercel deploy --prod`). Banco Turso novo criado pelo Vercel Marketplace em 2026-10-11, com as migrations da v5 e a seed (admin + projeto EletroRadar, 381 links). Os dados da v4 não foram migrados.
- **Contrato com os sites:** [`docs/api.md`](docs/api.md). Os sites sincronizam o catálogo no build com `PUT /api/v1/links` e apontam os botões para `/link?id=&store=`.

## Fases da v5

| # | Fase | Status |
| --- | --- | --- |
| 1 | Fundação: dependências fixas, limpeza, `setups/`, docs, changelog, hooks | Feito |
| 2 | Schema novo (`projects`, `products`, `affiliate_links`, `click_events`, `link_checks`) + script de migração v4 | Feito |
| 3 | Redirect server-side em `/link?id=` com evento de clique (device, SO, navegador, país, origem, bot) | Feito |
| 4 | Saúde dos links: checagem, cron diário, botão manual, alerta Telegram, fallback por prioridade | Feito |
| 5 | Better Auth (e-mail e senha, cadastro desligado, rate limit em banco) | Feito |
| 6 | UI em Base UI: visão geral, tabela de links, detalhe do link, projetos | Feito |
| 7 | Importação JSON/CSV e API `POST /api/v1/links` por token de projeto | Feito |
| 8 | `qa.ts` adaptado, testes unitários, CI manual + `pre-push` | Feito |

## Pendências (dependem do dev)

Detalhes e contexto em `questions-to-dev.md` (raiz, fora do git).

- [x] Revisar e apagar `_legacy/` (removido em 5.1.0).
- [x] Variáveis de produção definidas na Vercel e admin criado pela seed (2026-10-11).
- [ ] Conectar o repositório GitHub ao projeto Vercel para deploy automático por push (hoje o deploy é manual pelo CLI).
- [ ] Reativar o gatilho do CI quando o billing do GitHub Actions estiver resolvido ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)).
- [ ] Ajustar `SECURITY.md` (veio de outro projeto; foi adaptado, confirme o canal de contato).

## Próximos passos (sugestões, por valor)

- [ ] Detectar "produto indisponível" por loja (hoje só link quebrado é detectado).
- [ ] Filtro de período (7/30/90 dias) nas estatísticas.
- [ ] Reordenar links de um produto por arrastar (hoje: "Tornar principal" ou editar a ordem).
- [ ] Exportar cliques em CSV.
- [ ] Paginação server-side da tabela quando passar de ~5 mil links.
- [ ] Revalidar o host a cada redirect na checagem de saúde (SSRF em profundidade).

## Comandos

| Comando | O que faz |
| --- | --- |
| `bun run dev` | Servidor de desenvolvimento |
| `bun run ci` | Typecheck + lint + testes + build (mesmo gate do `pre-push`) |
| `bun run test` | Testes unitários e de integração (`**/*.test.ts`, banco SQLite descartável) |
| `bun qa.ts` | QA end-to-end contra o app rodando ([`docs/qa.md`](docs/qa.md)) |
| `bun run db:generate` | Gera migration a partir de `db/schema.ts` |
| `bun run db:migrate` | Aplica migrations |
| `bun run db:seed` | Cria admin + projeto EletroRadar a partir de `seed.json` |
| `setups/unix.sh`, `setups/windows.ps1`, `setups/docker.sh` | Sobe o app do zero ([`docs/setup.md`](docs/setup.md)) |
