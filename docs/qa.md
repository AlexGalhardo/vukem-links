# QA e testes

## Três níveis

| Nível | Comando | Cobre |
| --- | --- | --- |
| Unitário | `bun run test` | Regras puras de `lib/links.ts`: escolha do link, classificação da checagem, estados, validação de URL, importação |
| Gate | `bun run ci` | Typecheck, lint (Biome), testes unitários, build |
| End-to-end | `bun qa.ts` | App rodando de verdade, pelo navegador e por HTTP |

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
2. **Autorização**: toda rota em `app/api/` recusa chamada anônima; segredo e token errados; cadastro público desligado.
3. **CRUD pela UI**: projeto, produto com dois links, XSS armazenado, rejeição de `javascript:`, host privado e página fora do domínio, busca na tabela.
4. **Redirect e saúde**: destino por prioridade, contagem de cliques humanos vs. bot, device, referer sem query string, link morto após 3 falhas, fallback para o próximo link e para a página do produto, "Tornar principal", edição de URL.
5. **API e importação**: token, idempotência, corpo inválido, importação CSV.
6. **Exclusão**: link e projeto, com confirmação.
7. **Auth**: cookie HttpOnly, logout, senha errada, SQL injection, rate limit (429).
8. **Robustez**: 404 e ausência de erros JavaScript no navegador.

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
