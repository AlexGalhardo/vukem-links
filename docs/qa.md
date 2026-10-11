# QA e testes

## Níveis

| Nível | Comando | Cobre |
| --- | --- | --- |
| Unitário | `bun test lib/links.test.ts` | Regras puras de `lib/links.ts`: escolha do link, classificação da checagem, estados, validação de URL, importação |
| Integração | `bun run test` (roda também os unitários) | Queries reais em SQLite descartável, rede simulada |
| Gate | `bun run ci` | Typecheck, lint (Biome), unitários + integração, build |
| End-to-end | `bun qa.ts` | App rodando de verdade, pelo navegador e por HTTP |

## Testes de integração

`bunfig.toml` pré-carrega `test/setup.ts`, que aponta `TURSO_DATABASE_URL` para um arquivo SQLite novo em diretório temporário e aplica as migrations **antes** de qualquer módulo abrir o banco. Os testes nunca tocam `local.db` nem o Turso.

| Arquivo | Cobre |
| --- | --- |
| `lib/data.test.ts` | `upsertProducts` (idempotência, outro projeto, página fora do domínio, lotes), contagens de `listLinks`, `getStats` por projeto e por link, cascata de exclusão, `syncProducts`, `findOrCreateProject` |
| `lib/health.test.ts` | `checkLinks` com `fetch` simulado: vivo, morto na 3ª falha, alerta Telegram único, 403/429, timeout, redirect para a home, lote sem ids |
| `lib/env.test.ts` | `envProblems`: valor mal formado, essenciais em produção, banco em arquivo local |
| `app/api/routes.test.ts` | `/api/cron/health` e `/api/cron/weekly` (segredo certo, errado, ausente), `POST` e `PUT /api/v1/links` (401, 201, 400, 207, site fora do ar, identificação por `?site=`) e `/health` |
| `scripts/migrate-v4.test.ts` | Script de migração real sobre tabelas no formato da v4: cópia, contadores, idempotência, v4 intacta |

Cada teste cria o próprio projeto (`test/helpers.ts`), então não há limpeza entre testes. `mockFetch` substitui o `fetch` global: respostas de loja são definidas pelo teste e chamadas ao Telegram são capturadas.

`/link` e `/api/links` dependem do escopo de requisição do Next (`after()`, `headers()`) e por isso são cobertos só pelo `qa.ts`.

## qa.ts

Precisa do app no ar e do admin criado (`bun run db:seed`).

```bash
bun run dev                  # terminal 1
bun qa.ts                    # terminal 2 (ou: bun run qa)
bun qa.ts http://localhost:3001 --report=qa-report.json --headed
```

| Flag | Efeito |
| --- | --- |
| `--report=<arquivo>` | Grava o resultado em JSON |
| `--admin-email=`, `--admin-password=` | Credenciais (padrão: `ADMIN_EMAIL` / `ADMIN_PASSWORD` do `.env`) |
| `--headed` | Navegador visível |
| `--allow-remote` | Permite host não local. **Nunca produção**: o QA cria e apaga dados |

Primeira vez: `bunx playwright install chromium`.

### O que ele verifica

1. **Superfície pública**: headers de segurança, páginas do dashboard fechadas, `/link` com id inválido.
2. **Autorização**: toda rota em `app/api/` recusa chamada anônima; segredo e chave errados; cadastro público desligado.
3. **CRUD pela UI**: projeto, produto com dois links, XSS armazenado, rejeição de `javascript:`, host privado e página fora do domínio, busca na tabela.
4. **Redirect e saúde**: destino por prioridade, contagem de cliques humanos vs. bot, device, referer sem query string, link morto após 3 falhas, fallback para o próximo link e para a página do produto, "Tornar principal", edição de URL.
5. **API e importação**: chave `LINKS_API_KEY`, idempotência, corpo inválido, importação CSV.
6. **Tabela**: filtros de status e loja, ordenação, selecionar página, checagem e exclusão em lote, paginação.
7. **Layout**: nenhuma página com scroll horizontal em 390 px; menu hambúrguer abre a navegação e a navbar fica no topo ao rolar; tema escuro é o padrão, o botão de tema troca para claro e a escolha sobrevive ao reload.
8. **Exclusão**: link e projeto, com confirmação.
9. **Robustez**: 404 e ausência de erros JavaScript no navegador.
10. **Auth**: cookie HttpOnly, logout, senha errada, SQL injection, rate limit (429).

A suíte 4 também confere país (o QA envia `x-vercel-ip-country: BR`, papel que a Vercel faz em produção), sistema e navegador. A paginação precisa de mais de 50 links no banco (o seed tem 381); com menos, vira SKIP.

Em outra porta, `BETTER_AUTH_URL` precisa bater com ela, senão o login é recusado pela checagem de origem: `PORT=3411 BETTER_AUTH_URL=http://localhost:3411 bun run dev`.

O QA cria um projeto `qa-<run>` e o apaga no fim. Os links usam hosts `.invalid`, que nunca resolvem: a checagem de saúde falha de forma determinística, sem depender de loja real.

A última suíte dispara o rate limit de login de propósito. Espere ~15 s antes de logar ou rodar de novo.

### Rota nova

A suíte 2 lista as rotas de `app/api/` no disco e falha se alguma não tiver expectativa declarada em `expectations` (`qa.ts`). Rota nova = entrada nova ali.

## CI

`.github/workflows/ci.yml` roda `bun run ci`, mas só por disparo manual (`workflow_dispatch`) enquanto o billing do GitHub Actions não é resolvido. Até lá, o gate real é `.husky/pre-push`, que roda o mesmo comando.

| Hook | Faz |
| --- | --- |
| `pre-commit` | `biome check --staged` |
| `commit-msg` | `commitlint` (Conventional Commits) |
| `pre-push` | `bun run ci` |
