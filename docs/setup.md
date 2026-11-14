# Setup

## Requisitos

- Go 1.27 e o CLI do vukem: `go install github.com/AlexGalhardo/vukem/cmd/vukem@v0.43.0`.
- Bun 1.4 (só para o frontend: Vite, Tailwind, Inertia).
- Docker (opcional, para a imagem e o `compose.yaml`).
- `golangci-lint` 2.x para o lint.

## Local

```bash
cp .env.example .env
vukem key:generate            # escreve APP_KEY no .env
# edite .env: ADMIN_PASSWORD (8+ caracteres) e LINKS_API_KEY (openssl rand -hex 32)
bun install
vukem migrate                 # cria storage/database.sqlite
vukem admin:create            # a conta de admin (idempotente)
vukem import:seed             # opcional: seed.json (381 produtos do EletroRadar)
vukem serve                   # http://localhost:3000
```

`vukem serve` recompila o Go a cada mudança e roda o Vite com reload. Depois de mudar `app/pages/pages.go`, `vukem codegen` regenera `resources/js/page-props.ts` (o teste `TestEveryPageIsTyped` confere que nenhuma página ficou sem tipo).

## Variáveis de ambiente

| Variável | Obrigatória | Para quê |
| --- | --- | --- |
| `APP_KEY` | Sim | Chave do app (sessões, cookies). `vukem key:generate` |
| `APP_ENV` | Não | `development` (padrão) ou `production` (a imagem já define) |
| `APP_URL` | Em produção | URL pública. Com `https://` o cookie de sessão é `Secure` |
| `PORT` | Não | Porta HTTP (padrão 3000) |
| `DATABASE_URL` | Não | `file:storage/database.sqlite` (padrão). A imagem monta `/app/storage` como volume |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Para `admin:create` | Conta do administrador; a senha tem 8+ caracteres |
| `LINKS_API_KEY` | Sim (sem ela a API dos sites responde 401) | Chave única dos sites. Vai em `LINKS_DASHBOARD_TOKEN` de cada site |
| `TELEGRAM_BOT_HTTP_TOKEN` / `TELEGRAM_BOT_CHANNEL_ID` | Não | Alertas de link morto, log de cada clique e relatório semanal. Vazio = nada é enviado |
| `SCHEDULE_IN_SERVE` | Não | `false` desliga o scheduler dentro do `serve` (use `schedule:work` ou cron) |

Segredos só em variável de ambiente; `.env*` é ignorado pelo git, exceto `.env.example`.

## Docker

O `Dockerfile` tem três estágios com imagens de tag fixa (Bun para os assets, Go para o binário estático, Alpine para rodar como usuário `app`). O app serve HTTP direto na porta 3000; não há proxy no compose. Para HTTPS use o roteador da plataforma ou um Caddy na frente (nunca nginx).

```bash
export APP_KEY="$(go run ./cmd/app key:generate)" ADMIN_PASSWORD=... LINKS_API_KEY=...
docker compose up -d --wait
docker compose exec app /app/app import:seed -file /tmp/seed.json   # depois de `docker compose cp seed.json app:/tmp/seed.json`
docker compose down -v
```

O entrypoint do compose roda `migrate`, `admin:create` e `serve` (as duas primeiras são seguras de repetir). `bash scripts/smoke.sh` automatiza build, subida, checagem do contrato público e `down -v`.

## Testes

```bash
go vet ./... && go test ./...        # sem rede: o HTTP das checagens e o Telegram são falsos
golangci-lint run
bun run typecheck && bun run lint:js && bun run build
bun run e2e                          # Playwright: constrói tudo e sobe o app com banco novo
```

Os testes Go usam `vukemtest` (SQLite em memória, migrations aplicadas) e `bootstrap.NewWith(deps.Overrides{...})` para trocar o cliente HTTP e o Telegram por fakes.
