# Autenticação

[Better Auth](https://www.better-auth.com) com e-mail e senha. Configuração em `lib/auth.ts`.

## Modelo

- Um admin. **Cadastro público desligado** (`disableSignUp: true`): `POST /api/auth/sign-up/email` responde 400.
- A conta nasce por `bun run db:seed`, que lê `ADMIN_EMAIL` / `ADMIN_PASSWORD` e grava pelo adapter interno do Better Auth (hash scrypt). Rodar de novo com o mesmo e-mail não altera a senha.
- Sessão em cookie HttpOnly, SameSite=Lax, assinado com `BETTER_AUTH_SECRET`.
- Rate limit ligado, com contadores em banco (`rate_limit`): memória não sobrevive a cold start em serverless. Login: 3 tentativas a cada 10 s por IP.

## Onde a sessão é exigida

| Superfície | Como |
| --- | --- |
| Páginas `app/(dashboard)/**` | `requireSession()` no layout e em cada página (redireciona para `/login`) |
| Server actions (`app/actions.ts`) | `requireSession()` na primeira linha |
| `GET /api/links` | `getSession()` → 401 |

Rotas que **não** usam sessão, por desenho: `/link` (pública), `/api/v1/links` (token de projeto), `/api/cron/health` e `/api/cron/weekly` (`CRON_SECRET`).

## Operações

- **Trocar a senha do admin:** não há tela. Apague a conta (`delete from user where email = …`, as sessões e contas caem em cascata) e rode `bun run db:seed` com a senha nova.
- **Derrubar todas as sessões:** troque `BETTER_AUTH_SECRET` ou `delete from session`.
- **Atualizar o Better Auth:** as tabelas `user`, `session`, `account`, `verification` e `rate_limit` em `db/schema.ts` seguem o formato da biblioteca. Compare com `bunx @better-auth/cli generate` e gere uma migration nova se mudarem.

## Vindo da v4

A v4 usava next-auth com bcrypt na tabela `users`. As senhas não são migradas: o admin é recriado pelo seed.
