# Convenções

## Versionamento — [SemVer 2.0.0](https://semver.org/lang/pt-BR/)

`MAJOR.MINOR.PATCH` em `package.json`, com tag `vX.Y.Z`.

| Parte | Sobe quando |
| --- | --- |
| MAJOR | Quebra o contrato de `/link?id=`, quebra `POST /api/v1/links`, ou a migration exige passo manual nos dados |
| MINOR | Funcionalidade nova compatível (tela, métrica, campo opcional na API) |
| PATCH | Correção, atualização de dependência, documentação, refatoração interna |

## Changelog — [Keep a Changelog 1.1.0](https://keepachangelog.com/pt-BR/1.1.0/)

[`CHANGELOG.md`](../CHANGELOG.md), em inglês, escrito para quem usa o app.

- Mudanças entram em `## [Unreleased]` no mesmo conjunto de commits que as implementa.
- Grupos, nesta ordem: `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`.
- No release, `Unreleased` vira `## [X.Y.Z] - AAAA-MM-DD` e os links de comparação no rodapé são atualizados.

## Commits — [Conventional Commits 1.0.0](https://www.conventionalcommits.org/pt-br/v1.0.0/)

```text
<tipo>(<escopo>): <assunto no imperativo, minúsculo, sem ponto final>
```

Em inglês. Validado pelo hook `commit-msg` (commitlint, `@commitlint/config-conventional`).

| Tipo | Uso | Efeito na versão |
| --- | --- | --- |
| `feat` | Funcionalidade nova | MINOR |
| `fix` | Correção | PATCH |
| `feat!` / rodapé `BREAKING CHANGE:` | Quebra de contrato | MAJOR |
| `docs`, `refactor`, `test`, `chore`, `build`, `ci`, `perf` | Sem mudança de comportamento | PATCH ou nenhum |

Escopos usados: `redirect`, `health`, `links`, `projects`, `auth`, `api`, `ui`, `db`, `qa`, `setup`, `deps`.

```text
feat(health): mark link dead after three consecutive failures
fix(redirect): fall back to product page when every link is dead
feat(api)!: require project token on POST /api/v1/links
```

## Dependências

- Versão estável exata em `package.json` (sem `^`, sem `rc`/`beta`/`canary`).
- Gerenciador: Bun. Lockfile `bun.lock` versionado; instale com `bun install --frozen-lockfile`.
- Imagem Docker com tag fixa (`oven/bun:1.4.2-slim` em `infra/Dockerfile`), nunca `latest`.
- Dependência nova precisa de aprovação do dev.

## Código

- TypeScript `strict` + `noUncheckedIndexedAccess`; sem `any`; retorno explícito em função exportada.
- Formatação e lint: Biome (`bun run format`). Tabs, 120 colunas.
- Comentário só para o *porquê*. Simplificação consciente leva `// ponytail:` com o limite e o caminho de evolução.
- Interface em pt-BR; código, identificadores e commits em inglês.
