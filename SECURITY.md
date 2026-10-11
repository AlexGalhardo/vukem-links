# Security Policy

## Supported versions

Security fixes land on `main` and ship in the next release. Older releases are not patched.

## Reporting a vulnerability

Please do not open a public issue for a security problem.

Report it privately through [GitHub Security Advisories](https://github.com/AlexGalhardo/links-afiliados/security/advisories/new). Include:

- what the problem is and which route, action or file is affected;
- steps to reproduce it, or a proof of concept;
- what an attacker could gain (redirect hijacking, data exposed, account taken over).

You can expect a first reply within 5 business days.

## Scope

In scope: this repository's code, including the public redirect (`/link`), authentication and sessions, the project API tokens, the cron endpoint, the import flow and the server-side health check (SSRF).

Out of scope: denial of service by volume, social engineering, findings that need a compromised device or account, and third-party services (Vercel, Turso, Telegram, the affiliate stores). Report those to the vendor.

## Testing rules

- Test only against your own local instance (see [`docs/setup.md`](docs/setup.md)). Do not test against production.
- `qa.ts` refuses non-local hosts unless `--allow-remote` is passed, because it writes and deletes data.

The security rules the code follows are listed in [`.claude/rules/project.md`](.claude/rules/project.md); known limits are in [`docs/health-check.md`](docs/health-check.md) and [`docs/brainstorming.md`](docs/brainstorming.md).
