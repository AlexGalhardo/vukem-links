---
name: links-secure-endpoint
description: >
  links-afiliados checklist for creating or changing a Server Action (app/actions.ts), an API route (app/api/),
  the public redirect (app/link/route.ts) or anything that fetches a stored URL. Use it whenever you write
  "use server", a route.ts, accept a URL from a form/import/API, or touch login, tokens or the cron endpoint.
---

# Secure endpoint checklist

## 1. Who may call it

| Surface | Guard |
| --- | --- |
| Page in `app/(dashboard)/` | `await requireSession()` at the top of the page, even though the layout also checks |
| Server action | `await requireSession()` as the first line inside `try` |
| Dashboard API route | `if (!(await getSession())) return 401` |
| `app/api/v1/*` | Project token: `Authorization: Bearer la_…`, looked up by `hashToken()` |
| `app/api/cron/*` | `CRON_SECRET` compared with `timingSafeEqual` |
| `app/link/route.ts` | Public by design. It must only ever redirect to a stored link or the product's `pageUrl` |

A server action is a public POST endpoint. The layout redirect does not protect it.

## 2. Validate at the edge

- Parse every input with Zod before touching the database. Server actions take `unknown`, not a typed object.
- URLs go through `isPublicHttpUrl` (http/https only, no loopback or private ranges). They are fetched server-side by the health check.
- `pageUrl` must satisfy `sameHost(pageUrl, project.baseUrl)`. It is the redirect fallback: without the check it is an open redirect.
- Cap sizes: arrays (`.max()`), strings (`.max()`), import rows (5000).
- Create products and links only through `upsertProducts`, which enforces the two rules above.

## 3. Fail safely

- Actions return `Result` (`{ ok: false, error }`), never throw to the client. Use the shared `fail()` helper: it maps Zod errors to messages and hides everything else.
- Do not swallow Next's redirect error (`"digest" in error`): `fail()` rethrows it.
- API routes answer `401` before parsing the body, `400` with Zod issues for bad input.
- The redirect must respond even when tracking fails: side effects go in `after()`.

## 4. Do not leak

- Never return `apiTokenHash`, session rows or better-auth tables from a route or action.
- A new token is shown once; only its SHA-256 is stored.
- `click_events` holds no IP. Referer is stored as origin + path.
- Text from the database is rendered as text. No `dangerouslySetInnerHTML`.
- User-supplied URLs rendered as `href` are already http(s)-only because of the write-time check: keep it that way.

## 5. Prove it

- New route in `app/api/`: add it to `expectations` in `qa.ts` (suite 2). The QA fails on unlisted routes.
- New validation rule: add a rejected-input step to suite 3 or 5 of `qa.ts`, and a unit test if the rule lives in `lib/links.ts`.
- Run `bun run ci` and `bun qa.ts` (see the `links-local-verification` skill).
