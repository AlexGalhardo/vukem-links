---
name: links-secure-endpoint
description: >
  links-afiliados checklist for creating or changing a Server Action (app/actions.ts), an API route (app/api/),
  the public redirect (app/link/route.ts) or anything that fetches a stored URL. Use it whenever you write
  "use server", a route.ts, accept a URL from a form/import/API, or touch login, the sites' API key or a cron
  endpoint.
---

# Secure endpoint checklist

The rules themselves (what must hold, and why) are in `.claude/rules/project.md`, sections Contratos and
Segurança. This is how each one is applied in the code.

## 1. Who may call it

| Surface | Guard |
| --- | --- |
| Page in `app/(dashboard)/` | `await requireSession()` at the top of the page, even though the layout also checks |
| Server action | `await requireSession()` as the first line inside `try` |
| Dashboard API route (`app/api/links`) | `if (!(await getSession())) return 401` |
| `app/api/v1/*` | `hasBearer(request, process.env.LINKS_API_KEY)`; the project comes from the origin of `?site=`, never from the body |
| `app/api/cron/*` | `isCronRequest(request)` (`CRON_SECRET`, `lib/cron.ts`) |
| `app/link/route.ts` | Public by design. It must only ever redirect to a stored link or the product's `pageUrl` |
| `app/health/route.ts` | Public by design, CORS `*`. It answers `ok` or `down` and nothing else |

A server action is a public POST endpoint. Neither the layout redirect nor `proxy.ts` protects it.

A new first path segment (a new top-level page or route) must be added to `KNOWN` in `proxy.ts`, or every
request to it is redirected to `/`.

## 2. Validate at the edge

- Parse every input with Zod before touching the database. Server actions take `unknown`, not a typed object.
- Reuse the schemas that already carry the URL rules: `productInput` (`lib/links.ts`) for a product with its links, the `url` schema in `app/actions.ts` for a single link.
- Create products and links only through `upsertProducts`: it enforces the `sameHost` rule for `pageUrl`.
- Check the site is online before accepting links for it: `requireLive()` in actions, `isSiteLive()` in routes.
- Cap sizes with `.max()`: 500 ids per bulk action, 500 products per `POST`, 5000 per `PUT` and per import.

## 3. Fail safely

- Actions return `Result` (`{ ok: false, error }`), never throw to the client. Use the shared `fail()` helper: it maps Zod errors to messages and hides everything else.
- Do not swallow Next's redirect error (`"digest" in error`): `fail()` rethrows it.
- API routes answer `401` before parsing the body, `400` with Zod issues for bad input. `/api/v1/links` also answers `400 invalid_site` and `409 project_offline`; keep `docs/api.md` (Respostas) in step with any new status.
- In the redirect, side effects (click event, Telegram) go in `after()`.

## 4. Do not leak

- Never return session rows or better-auth tables from a route or action.
- Error messages and logs name a variable or a field, never a secret's value (see `envProblems` in `lib/env.ts`).
- Text from the database is rendered as text. The only `dangerouslySetInnerHTML` is the static theme script in `app/layout.tsx`.
- User-supplied URLs rendered as `href` are already http(s)-only because of the write-time check: keep it that way.

## 5. Prove it

- New route in `app/api/`: add it to `expectations` in `qa.ts` (suite 2). The QA fails on unlisted routes.
- Route that does not need Next's request scope: cover the guard and the status codes in `app/api/routes.test.ts`.
- New validation rule: add a rejected-input step to suite 3 or 5 of `qa.ts`, and a unit test if the rule lives in `lib/links.ts`.
- Validate with the `links-local-verification` skill.
