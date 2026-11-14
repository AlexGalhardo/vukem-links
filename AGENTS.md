# vukem-links

Guia para agentes: [`.claude/agents.md`](.claude/agents.md). Regras do projeto: [`.claude/rules/project.md`](.claude/rules/project.md). Estado do trabalho: [`PLAN.md`](PLAN.md).

Dashboard de links de afiliado em Go ([vukem](https://github.com/AlexGalhardo/vukem)) com Inertia + React + shadcn/ui e SQLite. Os sites (eletroradar, tudohardware) registram produtos por `PUT /api/v1/links` e apontam os botões para `GET /link?id=`.

## Comandos

| Comando | O que faz |
| --- | --- |
| `vukem serve` | Servidor de desenvolvimento (Go + Vite) em <http://localhost:3000> |
| `go vet ./... && go test ./...` | Vet e testes (HTTP falso, sem rede) |
| `golangci-lint run` | Lint e formatação Go (gofumpt + goimports) |
| `bun run typecheck && bun run lint:js && bun run build` | Frontend |
| `bun run e2e` | Playwright (build + servidor com banco novo) |
| `bash scripts/smoke.sh` | Imagem Docker + compose + contrato público, derruba tudo no fim |
| `vukem codegen` | Regenera `resources/js/page-props.ts` a partir de `app/pages` |
