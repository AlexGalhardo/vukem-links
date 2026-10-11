---
name: links-db-change
description: >
  Workflow for changing the links-afiliados database schema (db/schema.ts): generating and reviewing a Drizzle
  migration, applying it locally, and what must never run against production Turso. Use it whenever a table,
  column or index is added, changed or removed.
---

# Schema change workflow

1. Edit `db/schema.ts`.
2. `bun run db:generate -- --name <short_snake_case>` — writes `drizzle/NNNN_<name>.sql`.
3. **Read the generated SQL.** SQLite cannot alter most column properties, so Drizzle may emit "create new table, copy, drop old". Check that the copy keeps every column and that no `DROP` is a surprise.
4. `bun run db:migrate` — applies to the local file (`TURSO_DATABASE_URL=file:./local.db`).
5. Update the code that reads or writes the column, then `bun run ci` and `bun qa.ts`.
6. Record the change in `CHANGELOG.md`; if it needs a manual step in production, add it to `PLAN.md` under Pendências.

## Rules

- Never edit or delete a migration that is already committed. Fix forward with a new one.
- Never `drizzle-kit push`: this project uses versioned migrations.
- Never run a migration, seed or script with production credentials unless the dev asked for it in this session. Check `TURSO_DATABASE_URL` before any `db:*` command.
- Destructive SQL (`DROP`, `DELETE` without `WHERE`, column removal) needs the dev's explicit confirmation.
- New column on a populated table: nullable or with a default, so the migration works on existing rows.
- Add an index for any column used in a `WHERE` or `JOIN` of a list or stats query (`lib/data.ts`).

## Tables you do not shape freely

`user`, `session`, `account`, `verification` and `rate_limit` are dictated by Better Auth. Change them only when upgrading `better-auth`, following its migration notes (see `docs/auth.md`).

## v4 tables

Production may still hold the v4 tables (`master_categories`, `categories`, `subcategories`, `links`, `users`). They are untouched by v5 migrations on purpose. Do not name a new table after any of them. Removal is the dev's call (`docs/migration-v4.md`).
