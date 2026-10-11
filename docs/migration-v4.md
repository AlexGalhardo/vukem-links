# Migração v4 → v5

A v5 usa tabelas novas com nomes diferentes das da v4, então as duas convivem no mesmo banco. Nada da v4 é apagado pelos scripts.

| v4 | v5 |
| --- | --- |
| `subcategories` (`external_id`, `name`) | `products` (`external_id`, `name`, `page_url` = `external_id`) |
| `categories.slug` | `products.category` |
| `links` (`url`, `clicks`) | `affiliate_links` (`url`, `legacy_clicks`, `store` detectada, `priority` por ordem de criação) |
| host de `external_id` | um `projects` por host (`app.produtostech.com.br` → `produtostech`) |
| `master_categories`, `subcategories.bitly_url` | descartados |
| `users` (next-auth, bcrypt) | não migrado: o admin é recriado pelo seed |

## Passos (produção)

Faça um backup antes (`turso db shell <db> .dump > backup-v4.sql`).

```bash
export TURSO_DATABASE_URL=libsql://<db>.turso.io
export TURSO_AUTH_TOKEN=<token>

bun run db:migrate       # cria as tabelas da v5 (não toca nas da v4)
bun run db:migrate-v4    # copia subcategories + links para products + affiliate_links
bun run db:seed          # cria o admin (ADMIN_EMAIL / ADMIN_PASSWORD)
```

`db:migrate-v4` é idempotente: rodar de novo não duplica nada e reaplica os contadores.

## O que conferir

- A saída lista, por projeto, produtos e links criados, e as linhas **puladas**: `external_id` que não é URL ou link de afiliado inválido. Essas precisam ser recadastradas à mão.
- No dashboard: total de links por projeto e a métrica "Cliques" (os herdados aparecem como "herdados da v4").
- Uma URL antiga: `curl -I "https://<app>/link?id=<external_id codificado>"` deve responder `302`.

## Mudança de comportamento

- **Sem sorteio.** A v4 sorteava entre os links da subcategoria; a v5 usa sempre o de menor `priority` que não esteja morto. Após migrar, a ordem é a de criação: ajuste em "Tornar principal" se quiser outra loja na frente.
- **Id inválido.** `/link` sem id ou com id desconhecido responde `404` (a v4 mandava para `/`).

## Limpeza

Depois de validar em produção, as tabelas da v4 podem ser removidas. É destrutivo e manual, por decisão do dev:

```sql
drop table links; drop table subcategories; drop table categories; drop table master_categories; drop table users;
```

O código da v4 está em `_legacy/`, fora do build, até ser apagado.
