# Setup do zero para agentes

Roteiro para um agente de código levar o projeto de um clone limpo até rodando, testado e publicável. Cada passo tem o comando exato e uma verificação: só avance quando a verificação passar.

Regras que valem o tempo todo:

- Nunca imprima, cole em resposta ou commite o conteúdo de `.env*`. Para conferir uma variável, cheque se existe ou o tamanho, nunca o valor.
- Nenhum comando contra o banco ou as variáveis de produção sem pedido explícito do dono. Deploy também só a pedido.
- No Windows, rode tudo no **Git Bash** (os scripts são bash).
- Todos os comandos partem da raiz do repositório.

Atalho: os passos 1 a 4 (ou 1, 2 e 5, com Docker) são feitos por um script de [`setups/`](../setups). Veja [`setup.md`](setup.md). O roteiro abaixo é o caminho manual e serve também para diagnosticar um script que falhou.

## 0. Pré-requisitos

| Ferramenta | Para quê | Verificação | Instalação |
| --- | --- | --- | --- |
| Bun 1.4+ | Tudo | `bun --version` | Unix: `curl -fsSL https://bun.sh/install \| bash`. Windows: `powershell -c "irm bun.sh/install.ps1 \| iex"` |
| Git | Versionamento, hooks | `git --version` | <https://git-scm.com/downloads> |
| Docker 24+ e Compose v2 | Só o passo 5 | `docker info` e `docker compose version` | <https://docs.docker.com/get-started/get-docker/> |
| GitHub CLI | Só o passo 7 | `gh --version` | <https://cli.github.com> |
| Vercel CLI | Só o passo 8 | `vercel --version` | `bun add -g vercel` |

`docker info` com erro e `docker --version` funcionando significa daemon parado: abra o Docker Desktop (Windows/macOS) ou `sudo systemctl start docker` (Linux).

## 1. Dependências

```bash
bun install --frozen-lockfile
```

Verificação: termina com código 0 e `git status --short bun.lock` não mostra nada (o lockfile não mudou). O `prepare` instala os hooks do Husky.

## 2. Variáveis de ambiente

```bash
[ -f .env ] || cp .env.example .env
```

Preencha no `.env` (tabela completa em [`setup.md`](setup.md#variáveis-de-ambiente)):

| Variável | Valor local |
| --- | --- |
| `BETTER_AUTH_SECRET` | `openssl rand -hex 32` |
| `CRON_SECRET` | `openssl rand -hex 32` |
| `LINKS_API_KEY` | `openssl rand -hex 32` (16+ caracteres; o `qa.ts` falha sem ela) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Conta criada pelo seed; senha com 8+ caracteres |
| `TURSO_DATABASE_URL` | Mantenha `file:./local.db` |
| `TURSO_AUTH_TOKEN` | Vazio em desenvolvimento |
| `BETTER_AUTH_URL` | `http://localhost:3000` (mesma porta do servidor) |
| `TELEGRAM_BOT_HTTP_TOKEN`, `TELEGRAM_BOT_CHANNEL_ID` | Vazias, a menos que o dono peça para testar o bot: preenchidas, cada clique local vira mensagem no canal |

Os scripts de `setups/` geram os três segredos sozinhos quando estão vazios, sem sobrescrever o que já existe.

Verificação (imprime só o nome das variáveis que faltam; saída vazia = certo):

```bash
for k in BETTER_AUTH_SECRET CRON_SECRET LINKS_API_KEY ADMIN_EMAIL ADMIN_PASSWORD; do
	grep -Eq "^$k=.{8,}" .env || echo "faltando: $k"
done
grep -q '^TURSO_DATABASE_URL=file:' .env || echo "TURSO_DATABASE_URL não é local"
```

## 3. Banco de dados

```bash
bun run db:migrate     # cria/atualiza as tabelas em ./local.db
bun run db:seed        # admin + projeto EletroRadar a partir de seed.json
```

Verificação: o primeiro imprime `Migrations applied.`; o segundo imprime `Admin <e-mail> created.` (ou `already exists.`) e `Seed: N products, N links, 0 errors.`. Os dois são idempotentes. O seed só grava links se `https://example.com` responder (regra do site no ar): sem rede, ele cria o admin e reporta erros nos links.

Mudança de schema segue a skill `links-db-change` (`bun run db:generate`, nunca `drizzle-kit push`).

## 4. Rodar local

```bash
bun run dev
```

Verificação, em outro terminal:

```bash
curl -s http://localhost:3000/health                                  # {"status":"ok"}
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/login  # 200
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/       # 307 (redireciona para /login)
```

Porta 3000 ocupada: `PORT=3411 BETTER_AUTH_URL=http://localhost:3411 bun run dev`. As duas variáveis juntas, senão o Better Auth recusa o login por origem diferente.

Ao terminar uma tarefa, pare o servidor que você subiu.

## 5. Rodar com Docker

```bash
bash setups/setup-unix-with-docker.sh       # Linux / macOS
bash setups/setup-windows-with-docker.sh    # Windows (Git Bash)
```

O script confere Docker, Compose e daemon, prepara o `.env`, escolhe a porta, faz o build de [`infra/Dockerfile`](../infra/Dockerfile) e sobe [`infra/docker-compose.yml`](../infra/docker-compose.yml) em background. Migrations e seed rodam na subida do container, contra um SQLite no volume `data`.

Verificação:

```bash
docker compose -f infra/docker-compose.yml --env-file .env ps        # app com status "running"
curl -s http://localhost:3000/health                                 # {"status":"ok"} (use a porta anunciada)
docker compose -f infra/docker-compose.yml --env-file .env logs app  # "Migrations applied." e "Seed: ..."
```

Parar: `docker compose -f infra/docker-compose.yml --env-file .env down` (com `-v` apaga o banco do volume). Só o build, sem subir: `--no-start`.

## 6. Testes

| Comando | Precisa de | Verificação |
| --- | --- | --- |
| `bun run ci` | Passo 1 | Código 0: typecheck, lint, testes (banco SQLite descartável) e build. É o mesmo gate do hook `pre-push` |
| `bun qa.ts` | Passos 1 a 4, app no ar, `LINKS_API_KEY` no `.env`, Chromium do Playwright | Última linha com `0 failed` |

Primeira vez do QA: `bunx playwright install chromium`. Em outra porta: `bun qa.ts http://localhost:3411`. O QA cria e apaga dados e dispara o rate limit de login no fim (espere ~15 s para rodar de novo); nunca aponte para produção. Detalhes e flags em [`qa.md`](qa.md).

## 7. GitHub

Repositório: `https://github.com/AlexGalhardo/links.example.com`, branch `main`, remoto por HTTPS.

```bash
gh auth status                 # precisa mostrar "Logged in to github.com"
gh auth login --web --git-protocol https    # só se não estiver logado (interativo: peça ao dono)
gh auth setup-git              # git usa a credencial do gh nos remotos HTTPS
git remote set-url origin https://github.com/AlexGalhardo/links.example.com.git
```

Verificação:

```bash
git remote get-url origin              # a URL HTTPS acima
git ls-remote --heads origin main      # imprime o hash de main, sem pedir senha
```

Fluxo de release: cada commit enviado ao remoto ganha uma tag anotada `vX.Y.Z` e uma GitHub Release com a seção daquela versão do `CHANGELOG.md`. Comandos em [`workflows.md`](workflows.md#release).

## 8. Vercel

Produção: <https://links.example.com>, projeto `links-example-com`. O repositório não está conectado à Vercel: o deploy é manual, pelo CLI, a partir desta pasta, e **só quando o dono pedir**.

```bash
vercel whoami                                    # logado? senão: vercel login (interativo)
vercel link --yes --project links-example-com    # cria .vercel/ (ignorado pelo git)
```

Verificação: `.vercel/project.json` existe e `vercel env ls production` lista os nomes `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `CRON_SECRET`, `LINKS_API_KEY`, `TELEGRAM_BOT_HTTP_TOKEN` e `TELEGRAM_BOT_CHANNEL_ID` (o comando mostra nomes, não valores).

| Assunto | Como é |
| --- | --- |
| Deploy | `vercel deploy --prod`, da raiz do projeto |
| Variável nova | `vercel env add NOME production` (o valor é pedido no terminal; não passe por argumento). Vale a partir do próximo deploy |
| Banco | Turso criado pelo Vercel Marketplace (aba Storage do projeto): a integração define `TURSO_DATABASE_URL` e `TURSO_AUTH_TOKEN` em produção |
| Migration em produção | `bun scripts/migrate.ts` com as variáveis `TURSO_*` de produção. **Só a pedido do dono** |
| Crons | [`vercel.json`](../vercel.json): `/api/cron/health` de hora em hora e `/api/cron/weekly` no domingo às 20:00 UTC. A Vercel envia `CRON_SECRET` como Bearer |

Passo a passo de deploy e de migration em produção: [`workflows.md`](workflows.md#deploy-vercel).

## Problemas comuns

| Sintoma | Causa e saída |
| --- | --- |
| `bun: command not found` no Git Bash após instalar | Reabra o terminal: o `PATH` só é lido na abertura |
| Script de setup para em "TURSO_DATABASE_URL is not a local file" | O `.env` aponta para banco remoto. Os scripts locais só aceitam `file:` |
| Login responde 403 em outra porta | `BETTER_AUTH_URL` diferente da origem. Suba com `PORT` e `BETTER_AUTH_URL` iguais |
| Login responde 429 | Rate limit, comum logo após o `qa.ts`. Espere ~15 s |
| `no such table` | Banco atrasado: `bun run db:migrate` |
| `git push` recusado pelo hook | O `pre-push` roda `bun run ci`. Corrija a causa; não use `--no-verify` |
| Build do Docker falha em `bun install --frozen-lockfile` | `package.json` e `bun.lock` fora de sincronia: rode `bun install` e commite o lockfile |
