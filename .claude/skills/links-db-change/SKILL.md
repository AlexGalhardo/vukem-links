---
name: links-db-change
description: >
  Workflow for changing the links-afiliados database schema (db/schema.ts): generating and reviewing a Drizzle
  migration, applying it locally, and what must never run against production Turso. Use it whenever a table,
  column or index is added, changed or removed.
---

# Schema change workflow

The invariants (versioned migrations only, never `drizzle-kit push`, never edit a committed migration, nothing
against production without the dev asking) are in `.claude/rules/project.md`, section Dados. This is the procedure.

1. Edit `db/schema.ts`.
2. `bun run db:generate -- --name <short_snake_case>` writes `drizzle/NNNN_<name>.sql` and its snapshot in `drizzle/meta/`. With no schema change it prints "No schema changes, nothing to migrate" and writes nothing.
3. **Read the generated SQL.** SQLite cannot alter most column properties, so Drizzle may emit "create new table, copy, drop old". Check that the copy keeps every column and that no `DROP` is a surprise.
4. Check where `TURSO_DATABASE_URL` points (`.env`; it must be `file:./local.db`), then `bun run db:migrate`. It prints "Migrations applied.".
5. Update the code that reads or writes the column, then validate with the `links-local-verification` skill (`bun run ci`, and `bun qa.ts`).
6. Record the change in `CHANGELOG.md`. A migration that needs a manual data step in production is a major version; note the step in `PLAN.md` under Pendências.

Production: the deploy does not apply migrations. The dev applies them before the deploy, following
`docs/workflows.md` (Banco (Turso)).

## Writing a safe migration

- Fix forward: a wrong migration that is already committed gets a new migration on top.
- Destructive SQL (`DROP`, `DELETE` without `WHERE`, column removal) needs the dev's explicit confirmation.
- New column on a populated table: nullable or with a default, so the migration works on existing rows.
- Add an index for any column used in a `WHERE` or `JOIN` of a list or stats query (`lib/data.ts`).
- The schema must stay compatible with the previous version of the code: `vercel rollback` does not undo a migration.

## Tables you do not shape freely

`user`, `session`, `account`, `verification` and `rate_limit` are dictated by Better Auth. Change them only when upgrading `better-auth`, following its migration notes (see `docs/auth.md`).

## v4 tables

The production database was created new for v5 and has no v4 tables. `bun run db:migrate-v4` and `docs/migration-v4.md` only matter for a database that still holds the v4 tables (`master_categories`, `categories`, `subcategories`, `links`, `users`); do not name a new table after any of them.
