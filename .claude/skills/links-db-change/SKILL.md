---
name: links-db-change
description: >
  Workflow for changing the vukem-links database schema (database/migrations, app/models): writing and testing a
  migration, and what must never run against a production database. Use it whenever a table, column or index is
  added, changed or removed.
---

# Schema change workflow

The invariants (new migration only, never edit a committed one, nothing against production without the dev asking)
are in `.claude/rules/project.md`, section Dados. This is the procedure.

1. Create the migration: `vukem make:migration <short_snake_case>` (or copy the shape of `database/migrations/20261114200100_create_links_tables.go`) and register it in `database/migrations/registry.go`, after the existing ones.
2. Write `Up` and `Down` with the schema builder. New column on a populated table: nullable or with a default.
3. Update the model in `app/models` (`db:"..."` tags for non-snake_case names) and every query that reads or writes the column (`internal/catalog`, `internal/health`, the raw SQL in `internal/catalog/queries.go`).
4. Test first: the `vukemtest` apps run every registered migration, so any test in `internal/catalog` or `tests/` exercises it. Add a case for the new behavior. For a data-moving migration, test it against rows created before it.
5. Apply locally: `vukem migrate` (never against production).
6. Validate with the `links-local-verification` skill and record the change in `CHANGELOG.md`. A migration that needs a manual data step in production is a major version; note the step in `PLAN.md` under Pendências.

## Writing a safe migration

- Fix forward: a wrong migration that is already committed gets a new migration on top.
- Destructive SQL (`DROP`, `DELETE` without `WHERE`, column removal) needs the dev's explicit confirmation.
- Add an index for any column used in a `WHERE` or `JOIN` of a list or stats query.
- Foreign keys cascade (`CascadeOnDelete`): deleting a project, product or link removes its dependents. Keep it that way; `TestRemovingAProductDropsItsClicks` depends on it.
- Dates are ISO 8601 UTC text. Stats group by `substr(created_at, 1, 10)`: do not change the format.

## Tables you do not shape freely

`users` and `remember_tokens` follow what `vukem/auth` expects (`auth.NewORMProvider`, `auth.NewRememberStore`). Change them only when upgrading vukem, following its upgrade notes.
