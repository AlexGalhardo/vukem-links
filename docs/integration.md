# Integração com os sites

Como o dashboard conversa com o eletroradar e o tudohardware, e como testar esse contrato de ponta a ponta na máquina local.

## O que é testado

`scripts/integration-smoke.sh` sobe o dashboard com o `compose.yaml` (projeto `vukem-links-integration`, porta 3056) e percorre o caminho real de um site:

1. `docker compose build` e `up --wait` (o entrypoint migra o banco e cria o admin com `ADMIN_EMAIL`/`ADMIN_PASSWORD`).
2. Login do admin e `GET /` autenticado (`200`).
3. `PUT /api/v1/links` com a chave errada (`401`).
4. **Sync real:** `scripts/integration-sync.ts` roda dentro do checkout do eletroradar e chama o `syncCatalogue` do próprio site (`src/lib/affiliate-links.ts`) com o catálogo montado dos posts publicados (cerca de 380 produtos), usando `LINKS_API_KEY` como `LINKS_DASHBOARD_TOKEN`. Falha se nenhum produto for criado.
5. `GET /link?id=<primeiro produto>` devolve `302` para uma loja; um produto desconhecido devolve `404`.
6. O clique aparece em `click_events` (lido de uma cópia do volume `/app/storage` com `bun:sqlite`).
7. `docker compose down -v` ao sair, mesmo em falha (`trap`).

```bash
# precisa de Docker, Bun, internet e do checkout do eletroradar
ELETRORADAR_DIR=../example.com bash scripts/integration-smoke.sh
```

| Variável | Padrão | Uso |
| --- | --- | --- |
| `ELETRORADAR_DIR` | `../example.com` | Checkout do eletroradar com `bun install` feito |
| `SITE_URL` | `https://example.com` | Origem enviada em `?site=` (ver abaixo) |
| `PORT` | `3056` | Porta do dashboard no host |
| `ADMIN_PASSWORD`, `LINKS_API_KEY` | valores de teste | Credenciais descartáveis do compose |

## Por que os sites não são buildados no compose

Os sites são estáticos e sincronizam no build, então o ideal seria um compose que builda cada site apontando para o dashboard local. Isso não é possível sem alterar os repositórios dos sites:

- **O endereço do dashboard está no código.** `site.linksDashboardUrl` (eletroradar, `src/lib/site.config.ts`) e `LINKS_DASHBOARD_URL` (tudohardware, `lib/affiliate-catalogue.ts`) são constantes, sem variável de ambiente. O build sempre sincroniza com o dashboard de produção, e os botões saem com o `href` dele.
- **O dashboard só aceita um site público e no ar.** `?site=` passa por `rules.IsPublicHTTPURL` (sem localhost, IP privado ou link-local) e o dashboard faz uma sonda HTTP com o cliente seguro (`httpclient.Safe`, que recusa endereços privados). Um container `eletro` na rede do compose seria recusado (`400 invalid_site` ou `409 project_offline`). Afrouxar isso só para teste seria enfraquecer a proteção contra SSRF.
- **O tudohardware** fixa também `SITE_URL` (GitHub Pages), então o catálogo dele só pode ser registrado com a origem pública.

Por isso o smoke usa o código de sync do site, mas informa a origem pública do eletroradar (`SITE_URL`), que o dashboard sonda pela internet. O catálogo sincronizado fica só no banco descartável do compose.

## Rodar um site contra o dashboard local (manual)

Para ver os botões de um site apontando para o dashboard local, altere a constante do dashboard no clone do site (não commite) e rode o build com a chave:

```bash
LINKS_DASHBOARD_TOKEN=<LINKS_API_KEY do dashboard> bun run build
```

O sync continua exigindo que a origem do site seja pública e responda.

## Imagens publicadas dos sites

`ghcr.io/alexgalhardo/eletro:0.12.0` e `ghcr.io/alexgalhardo/tudohardware:0.2.0` servem o `dist` estático com Caddy e foram construídas sem `LINKS_DASHBOARD_TOKEN` (o build só valida o catálogo). Servem para olhar o site, não para testar o sync: os botões já apontam para o dashboard de produção.
