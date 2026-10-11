# Setup

Guia curto para subir o app. O passo a passo completo, com a verificação de cada etapa (incluindo GitHub e Vercel), está em [`agent-setup.md`](agent-setup.md).

Requisito: [Bun](https://bun.sh) 1.4+. Para Docker: Docker 24+ com Compose v2. No Windows, os scripts rodam no **Git Bash**.

## Um comando

| Ambiente | Comando | Resultado |
| --- | --- | --- |
| Linux / macOS | `bash setups/setup-unix-local.sh` | Cria `.env`, instala, migra, popula, sobe `bun run dev` |
| Windows (Git Bash) | `bash setups/setup-windows-local.sh` | Idem |
| Linux / macOS + Docker | `bash setups/setup-unix-with-docker.sh` | Build de produção em container, SQLite em volume, em background |
| Windows (Git Bash) + Docker | `bash setups/setup-windows-with-docker.sh` | Idem |

App em <http://localhost:3000> (ou na porta que o script anunciar). Login: `ADMIN_EMAIL` / `ADMIN_PASSWORD` do `.env` (padrão do `.env.example`: `admin@example.com` / `change-me-please`).

O que os quatro scripts fazem (lógica comum em `setups/_common.sh`):

- Conferem as ferramentas (Bun; Docker, Compose e daemon rodando nos de Docker) e dizem como instalar o que falta.
- Criam `.env` a partir de `.env.example` se não existir e geram `BETTER_AUTH_SECRET`, `CRON_SECRET` e `LINKS_API_KEY` quando estão vazios ou com o placeholder `change-me…`. Valor já preenchido nunca é sobrescrito e nenhum segredo é impresso.
- Porta ocupada: sem `PORT`/`APP_PORT` definido, usam a próxima livre a partir da 3000 e avisam; com a variável definida e a porta ocupada, param com erro.
- Rodam migrations e seed. Os scripts locais se recusam a rodar se `TURSO_DATABASE_URL` não for `file:`: nunca tocam banco remoto.
- São idempotentes e saem com código diferente de zero, com a etapa que falhou, em qualquer erro.

| Opção | Efeito |
| --- | --- |
| `--no-start` ou `SETUP_SKIP_START=1` | Prepara tudo sem subir o servidor (nos de Docker: só faz o build da imagem) |
| `PORT=3411` | Porta do `bun run dev` (scripts locais) |
| `APP_PORT=3310` | Porta do host para o container (scripts de Docker) |

## Variáveis de ambiente

| Variável | Obrigatória | Uso |
| --- | --- | --- |
| `TURSO_DATABASE_URL` | Não (padrão `file:./local.db`) | `libsql://…` em produção |
| `TURSO_AUTH_TOKEN` | Em produção | Token do Turso |
| `BETTER_AUTH_SECRET` | Sim | Assina sessões. 32+ bytes aleatórios |
| `BETTER_AUTH_URL` | Sim | URL pública do app. Precisa bater com a porta, senão o login é recusado |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Para `db:seed` | Conta admin (senha com 8+ caracteres) |
| `LINKS_API_KEY` | Em produção | Chave que os sites enviam para registrar links (`/api/v1/links`). Sem ela a API recusa tudo. O `qa.ts` também precisa dela |
| `CRON_SECRET` | Em produção | Protege `/api/cron/health` e `/api/cron/weekly` |
| `TELEGRAM_BOT_HTTP_TOKEN`, `TELEGRAM_BOT_CHANNEL_ID` | Não | Bot do Telegram: alerta de link morto, log de cada clique redirecionado e relatório semanal de cliques. Vazias = nada é enviado |

## Docker

Os arquivos ficam em [`infra/`](../infra): `Dockerfile` (imagem `oven/bun` com tag fixa, multi-stage, usuário não-root) e `docker-compose.yml`. O contexto de build é a raiz do repositório, por isso o `.dockerignore` fica na raiz. O compose sobe só o app; o banco é um arquivo SQLite no volume `data` e o container nunca usa banco remoto. É para teste local, não produção.

Os segredos vêm do `.env` da raiz (`--env-file .env`). As variáveis do Telegram não são repassadas ao container, para o ambiente de teste não escrever no canal real.

```bash
docker compose -f infra/docker-compose.yml --env-file .env logs -f app   # logs
docker compose -f infra/docker-compose.yml --env-file .env down          # para (mantém o volume)
docker compose -f infra/docker-compose.yml --env-file .env down -v       # para e APAGA o banco
```

A conta admin é criada na primeira subida do volume. Trocar `ADMIN_PASSWORD` depois exige `down -v` (ou o procedimento de [`auth.md`](auth.md)).

## Produção

Deploy na Vercel, banco Turso e crons: [`workflows.md`](workflows.md#deploy-vercel).
