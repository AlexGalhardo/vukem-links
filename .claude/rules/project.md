# Regras do projeto vukem-links

Único lugar das regras. O passo a passo de cada uma está na skill ou no documento indicado.

## Contratos que não mudam

- `/link?id=<externalId>[&store=<loja>]` está publicado nos projetos. Formato, método (GET) e resposta (302) são fixos. Só o destino muda.
- `products.external_id` é o identificador público: nunca reescreva valores existentes.
- O redirect sempre responde: falha de tracking, Telegram ou checagem nunca pode impedir o 302 (o erro do clique é só logado; o alerta roda em goroutine).
- `/health` é público, legível de qualquer origem e só diz `ok` ou `down`: os sites dependem dele para cair no link direto da loja.
- O contrato com os sites (`/link`, `/api/v1/links`, `/health`) está em [`docs/api.md`](../../docs/api.md) e é fixado por `tests/api_test.go`. Mudou o contrato, mudou o documento e o teste.

## Segurança

- Toda página e ação do dashboard fica no grupo de rotas com `auth.Required` (`routes/web.go`). Rota nova do dashboard entra nesse grupo e ganha um caso em `TestEveryDashboardActionRequiresTheSession`.
- URL vinda de fora (formulário, importação, API, `?site=`) passa por `rules.IsPublicHTTPURL`: só http(s), sem host privado. A checagem de saúde usa `httpclient.Safe`, que recusa endereços privados em cada conexão (SSRF, inclusive em redirects).
- `products.page_url` precisa estar no domínio de `projects.base_url` (`rules.SameHost`): é o destino do fallback e não pode virar open redirect.
- A API dos sites usa uma chave única (`LINKS_API_KEY`) comparada em tempo constante; sem a chave configurada toda chamada é 401. Um site só escreve no projeto da própria origem (`?site=`).
- `/link`, `/health` e `/api/v1/` ficam fora de sessão e CSRF (`MiddlewareOptions`); qualquer rota nova pública precisa do mesmo tratamento explícito.
- Nada de IP em `click_events`. Referer é guardado como origem + caminho, sem query string.
- Variável de ambiente nova entra em `.env.example` e em [`docs/setup.md`](../../docs/setup.md#variáveis-de-ambiente); em produção sem ela o comportamento deve ser seguro (chave vazia = 401).
- Segredos só em variável de ambiente. `.env*` é ignorado pelo git, exceto `.env.example`.

Checklist para aplicar estas regras numa rota ou ação: skill `links-secure-endpoint`.

## Dados

- Produto e link só são criados por `catalog.Service.Upsert`: formulário, importação e API passam por ele. `Sync` (PUT da API) cria por ele e só reconcilia o que já existia.
- Todo produto tem ao menos um link, e link só entra para projeto cujo site responde (`Checker.IsSiteLive`): vale para API, formulário, importação e criação de projeto.
- Regra de negócio sem I/O vai em `internal/rules`. I/O fica em `internal/catalog` e `internal/health`.
- Contagens de clique excluem bots (`is_bot = 0`). Total exibido = eventos + `legacy_clicks`.
- Schema muda por migration nova em `database/migrations/` (registrada em `registry.go`). Nunca edite migration já commitada. Passos: skill `links-db-change`.
- Nenhum comando contra o banco de produção, e nenhum deploy, sem pedido explícito do dev.

## UI

- Componentes de `resources/js/components/ui` são o único lugar de estilo base (estilo shadcn/ui). Não adicione Radix, `cva`, `clsx`, `tailwind-merge` ou biblioteca de ícones sem aprovação.
- Cores só pelos tokens de `resources/css/app.css` (`bg-background`, `text-muted-foreground`, ...). Sem cor hex solta em componente.
- Páginas recebem props tipadas de `app/pages`; depois de mudar uma página rode `vukem codegen`.
- Interface em pt-BR. Código, identificadores e commits em inglês.
- Ação destrutiva usa `ConfirmDialog` e diz o que será apagado.
- Campo de formulário usa `Field` (label associada ao controle) e mostra o erro de validação.

## Processo

- Teste primeiro: regra pura em `internal/rules` (tabela), dados em `internal/catalog`/`internal/health` (HTTP falso via `deps.Overrides`, nunca rede), contrato e rotas em `tests/`.
- Dependência nova só com aprovação do dev, em versão estável exata. Go: só vukem e stdlib.
- Concluir tarefa = `go vet ./...`, `go test ./...`, `golangci-lint run`, `bun run typecheck`, `bun run lint:js` e `bun run build` verdes; se tocou fluxo de usuário, `bun run e2e`; se tocou Docker ou o contrato público, `bash scripts/smoke.sh`. Skill `links-local-verification`.
- Atualize `PLAN.md` e `CHANGELOG.md` ao fim de cada conjunto de mudanças.
- Todo commit enviado ao remoto é uma versão: bump, changelog, tag `vX.Y.Z` e GitHub Release no mesmo passo ([`docs/workflows.md`](../../docs/workflows.md#release), skill `links-release`). Nunca `--no-verify`, nunca push forçado em `main`.
