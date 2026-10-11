# Arquitetura

## Modelo de dados

```text
projects 1 ── N products 1 ── N affiliate_links 1 ── N link_checks
                   │                  │
                   └────── N click_events N ──┘   (link_id nulo = clique sem link vivo)
```

| Tabela | Papel | Campos-chave |
| --- | --- | --- |
| `projects` | Aplicação onde os links aparecem | `slug`, `base_url` |
| `products` | Página de produto dentro do projeto | `external_id` (id público do redirect), `page_url`, `category` |
| `affiliate_links` | Um link de afiliado de um produto | `store`, `url`, `priority`, `status`, `consecutive_failures`, `legacy_clicks` |
| `click_events` | Um clique | `device`, `os`, `browser`, `country`, `referer`, `is_bot` |
| `link_checks` | Uma checagem de saúde | `status_code`, `final_url`, `result` |
| `user`, `session`, `account`, `verification`, `rate_limit` | Better Auth | ver [`auth.md`](auth.md) |

A tabela se chama `affiliate_links` (e não `links`) para conviver com a `links` da v4 durante a migração.

## Fluxo do clique

```text
visitante ── GET /link?id=<externalId> ──> app/link/route.ts
   1. produto por external_id            (404 se não existe)
   2. pickLink: primeiro link não morto, por priority crescente
   3. 302 para link.url                  (ou products.page_url se todos estão mortos)
   4. after(): grava click_events; se não havia link vivo, alerta no Telegram
```

- `unknown` (nunca checado) é elegível: link novo redireciona antes da primeira checagem.
- Device, SO, navegador e bot vêm de `userAgent()` do Next. País vem de `x-vercel-ip-country`.
- O evento é gravado depois da resposta: tracking nunca atrasa nem derruba o redirect.

## Fluxo da saúde

Ver [`health-check.md`](health-check.md). Resumo: `lib/health.ts` faz o fetch, `classifyProbe` e `nextHealth` (`lib/links.ts`) decidem o estado.

## Camadas

| Camada | Arquivos | Regra |
| --- | --- | --- |
| Regras puras | `lib/links.ts` | Sem I/O; coberto por `lib/links.test.ts` |
| Dados | `lib/data.ts`, `lib/health.ts` | Único lugar com queries de negócio |
| Borda | `app/actions.ts`, `app/api/**`, `app/link/route.ts` | Autentica, valida com Zod, chama a camada de dados |
| UI | `app/(dashboard)/**`, `components/**` | Server Components leem direto de `lib/data.ts`; cliente usa TanStack Query |

## Dados no cliente

- A tabela de links (`components/links-table.tsx`) busca `/api/links` com `useQuery(["links"])` e filtra, ordena e pagina em memória.
- Mutações usam `useAction` (`components/ui.tsx`): server action dentro de `useMutation`; no sucesso invalida `["links"]` e chama `router.refresh()` para os Server Components.

## Limites conhecidos

- `/api/links` devolve todos os links. Passar a paginar no servidor acima de ~5 mil.
- Um cron de hora em hora checa 400 links (`BATCH` em `lib/health.ts`).
- Cada clique humano redirecionado para uma loja gera uma mensagem no Telegram; um cron semanal (domingo, 17h de Brasília) envia o total de cliques por projeto dos últimos 7 dias (`/api/cron/weekly`).
- Estatísticas cobrem os últimos 30 dias; o total de cliques é de todo o período.
