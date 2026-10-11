# Setup

Requisito: [Bun](https://bun.sh) 1.4+. Para Docker: Docker 24+ com Compose.

## Um comando

| Ambiente | Comando | Resultado |
| --- | --- | --- |
| Linux / macOS | `./setups/unix.sh` | Cria `.env`, instala, migra, popula, sobe `bun run dev` |
| Windows (PowerShell) | `.\setups\windows.ps1` | Idem |
| Docker (Unix) | `./setups/docker.sh` | Build de produção + SQLite em volume |
| Docker (Windows) | `.\setups\docker.ps1` | Idem |

App em <http://localhost:3000>. Login padrão: `admin@example.com` e a senha de `ADMIN_PASSWORD` (`.env` local: `change-me-please`; Docker: `admin-local-123`).

Os scripts são idempotentes: rodar de novo não duplica dados.

## Passo a passo manual

```bash
cp .env.example .env        # preencha BETTER_AUTH_SECRET (openssl rand -base64 32)
bun install --frozen-lockfile
bun run db:migrate          # cria as tabelas em ./local.db
bun run db:seed             # admin + projeto "Produtos Tech" a partir de seed.json
bun run dev
```

## Variáveis de ambiente

| Variável | Obrigatória | Uso |
| --- | --- | --- |
| `TURSO_DATABASE_URL` | Não (padrão `file:./local.db`) | `libsql://…` em produção |
| `TURSO_AUTH_TOKEN` | Em produção | Token do Turso |
| `BETTER_AUTH_SECRET` | Sim | Assina sessões. 32+ bytes aleatórios |
| `BETTER_AUTH_URL` | Sim | URL pública do app |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Para `db:seed` | Conta admin (senha com 8+ caracteres) |
| `CRON_SECRET` | Em produção | Protege `/api/cron/health` |
| `TELEGRAM_BOT_HTTP_TOKEN`, `TELEGRAM_BOT_CHANNEL_ID` | Não | Alertas de link morto |

## Docker

`setups/docker-compose.yml` sobe só o app; o banco é um arquivo SQLite no volume `data`. É para teste local, não produção.

```bash
./setups/docker.sh -d                                     # em background
docker compose -f setups/docker-compose.yml logs -f       # logs
docker compose -f setups/docker-compose.yml down          # para (mantém o volume)
docker compose -f setups/docker-compose.yml down -v       # para e APAGA o banco
```

Porta 3000 ocupada: `APP_PORT=3310 ./setups/docker.sh` (PowerShell: `$env:APP_PORT=3310; .\setups\docker.ps1`). Em dev: `bun run dev -- -p 3001`.

Para trocar credenciais, crie `setups/.env` (ignorado pelo git) com `BETTER_AUTH_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `CRON_SECRET`.

## Produção (Vercel + Turso)

1. Defina as variáveis da tabela acima no projeto da Vercel.
2. Aplique as migrations no Turso: `bun run db:migrate` com `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` de produção.
3. Vindo da v4: siga [`migration-v4.md`](migration-v4.md).
4. Crie o admin: `bun run db:seed` (também importa `seed.json`; produtos existentes são ignorados).
5. O cron de saúde está em `vercel.json` (diário, 09:00 UTC).
