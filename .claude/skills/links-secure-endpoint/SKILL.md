---
name: links-secure-endpoint
description: >
  vukem-links checklist for creating or changing a route, a dashboard action, the public redirect
  (controllers/public.go), the sites' API (controllers/api.go) or anything that fetches a stored URL. Use it
  whenever you register a route in routes/web.go, accept a URL from a form/import/API, or touch login or the
  sites' API key.
---

# Secure endpoint checklist

The rules themselves (what must hold, and why) are in `.claude/rules/project.md`, sections Contratos e Segurança.
This is how each one is applied in the code.

## 1. Who may call it

| Surface | Guard |
| --- | --- |
| Dashboard page or action | Register it inside the `r.Group("", ...)` of `routes/web.go`, which has `g.Use(required)` (`auth.Required`). Add a line to `TestEveryDashboardActionRequiresTheSession` |
| `/api/v1/*` | `hasBearer` (constant-time compare of `LINKS_API_KEY`; unset key = 401). The project comes from the origin of `?site=`, never from the body |
| `/link` | Public by design. It must only ever redirect to a stored link or the product's `page_url` |
| `/health` | Public by design, CORS `*` (declared in `MiddlewareOptions.CrossOrigin`). Answers `ok` or `down` and nothing else |

A public route needs an explicit entry in `SessionBypass` (and `CSRFBypass` if it accepts unsafe methods) in `routes/web.go`, so no cookie is read or set.

## 2. Validate at the edge

- Parse form input with a `z` schema from `app/requests` (`web.Parse`); API input with `rules.ProductInput.Validate`.
- URLs go through `rules.IsPublicHTTPURL`. Reuse `ProductInput.Validate` for products with links.
- Create products and links only through `catalog.Service.Upsert`: it enforces `SameHost` for `page_url`.
- Check the site is online before accepting links: `Checker.IsSiteLive`.
- Cap sizes: 20 links per product, 500 products per `POST`, 5000 per `PUT` and per import, 16 MiB per body.

## 3. Fail safely

- Field errors: return `errs.NewValidation().Add(field, message)`; Inertia redirects back with them as `props.errors`.
- API routes answer `401` before parsing the body, `400` with `issues` for bad input. `/api/v1/links` also answers `400 invalid_site` and `409 project_offline`; keep `docs/api.md` (Respostas) and `tests/api_test.go` in step with any new status.
- In the redirect, tracking failures are logged and never block the 302.

## 4. Do not leak

- Never put the password hash, the API key or the Telegram token in a page prop, a log line or an error. `models.User` hides `Password` with `json:"-"`.
- Text from the database is rendered as text by React. Do not use `dangerouslySetInnerHTML`.
- User-supplied URLs rendered as `href` are already http(s)-only because of the write-time check: keep it that way.

## 5. Prove it

- New route: a test in `tests/` for the guard (guest refused) and for the status codes.
- New validation rule: a rejected-input case, and a table test in `internal/rules` if the rule lives there.
- Validate with the `links-local-verification` skill.
