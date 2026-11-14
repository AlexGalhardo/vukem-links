# Origin of the skills

## The project's own skills

`links-secure-endpoint`, `links-local-verification`, `links-db-change` and `links-release` were written in this repository for vukem-links. When to use each: [`.claude/agents.md`](../agents.md#skills).

## Third-party skills

Copied (vendored) from the upstream repository. To update, clone the repo at the desired commit and replace the corresponding folders. Do not edit the files by hand, so they do not drift from upstream.

| Skill(s) | Repository | Commit | License |
| --- | --- | --- | --- |
| `ponytail`, `ponytail-audit`, `ponytail-debt`, `ponytail-gain`, `ponytail-help`, `ponytail-review` | [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) | `e3ba2aa6f1e6f0bc4d69eb09c9f0d0a93af56156` | MIT |

It is vendored because the code convention depends on it: [`docs/conventions.md`](../../docs/conventions.md) requires a `// ponytail:` comment on every deliberate simplification.

Nothing else is vendored. Generic skills, agents and checklists (code review, TDD, security, performance, UI design) are not kept in this repository: each developer installs them globally. The packs that used to live here were removed in 6.2.1 (see [`CHANGELOG.md`](../../CHANGELOG.md)) and can be restored from the tag `v6.2.0`.
