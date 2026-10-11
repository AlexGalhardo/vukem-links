# Regras do projeto links-afiliados

Único lugar das regras. O passo a passo de cada uma está na skill ou no documento indicado.

## Contratos que não mudam

- `/link?id=<externalId>[&store=<loja>]` está publicado nos projetos. Formato, método (GET) e resposta (302) são fixos. Só o destino muda.
- `products.external_id` é o identificador público: nunca reescreva valores existentes.
- O redirect sempre responde: falha de tracking, Telegram ou checagem nunca pode impedir o 302 (por isso o evento é gravado em `after()`).
- `/health` é público, legível de qualquer origem e só diz `ok` ou `down`: os sites dependem dele para cair no link direto da loja.
- O contrato com os sites (`/link`, `/api/v1/links`, `/health`) está em [`docs/api.md`](../../docs/api.md). Mudou o contrato, mudou o documento.

## Segurança

- Toda página em `app/(dashboard)/`, toda server action e toda rota de API do dashboard começa com `requireSession()` ou `getSession()`. Layout protegido não protege action nem rota, e o `proxy.ts` só redireciona endereço desconhecido para `/`: não é controle de acesso.
- URL vinda de fora (formulário, importação, API, `?site=`) passa por `isPublicHttpUrl`: só http(s), sem host privado. Ela é buscada pelo servidor na checagem de saúde.
- `products.page_url` precisa estar no domínio de `projects.base_url` (`sameHost`): é o destino do fallback e não pode virar open redirect.
- A API dos sites usa uma chave única (`LINKS_API_KEY`) e as rotas de cron usam `CRON_SECRET`, ambas comparadas em tempo constante (`hasBearer`, `lib/cron.ts`). Um site só escreve no projeto da própria origem (`?site=`).
- Nada de IP em `click_events`. Referer é guardado como origem + caminho, sem query string.
- Variável de ambiente nova entra no schema de `lib/env.ts` (e em `ESSENTIAL` se a produção não roda sem ela), em `.env.example` e em [`docs/setup.md`](../../docs/setup.md#variáveis-de-ambiente).
- Segredos só em variável de ambiente. `.env*` é ignorado pelo git, exceto `.env.example`.

Checklist para aplicar estas regras numa rota ou action: skill `links-secure-endpoint`.

## Dados

- Produto e link só são criados por `upsertProducts` (`lib/data.ts`): formulário, importação e API passam por ele. `syncProducts` (PUT da API) cria por ele e só reconcilia o que já existia.
- Todo produto tem ao menos um link, e link só entra para projeto cujo site responde (`isSiteLive`): vale para API, formulário, importação e criação de projeto.
- Regra de negócio sem I/O vai em `lib/links.ts`. I/O fica em `lib/data.ts` e `lib/health.ts`.
- Contagens de clique excluem bots (`is_bot = false`). Total exibido = eventos + `legacy_clicks`.
- Schema muda por migration nova gerada pelo Drizzle. Nunca `drizzle-kit push`, nunca editar migration já commitada. Passos: skill `links-db-change`.
- Nenhum comando contra o Turso de produção, e nenhum deploy, sem pedido explícito do dev.

## UI

- Componentes interativos vêm de Base UI via `components/ui.tsx`. Não reintroduza shadcn/Radix.
- Server Components por padrão; `"use client"` só com estado, efeito ou evento.
- Dado no cliente e mutações usam TanStack Query: `useQuery` para leitura, `useAction` para server action.
- Cores e fontes são tokens em `@theme` (`app/globals.css`). Sem cor hex solta em componente.
- Interface em pt-BR. Código, identificadores e commits em inglês.
- Ação destrutiva usa `Confirm` (AlertDialog) e diz o que será apagado.

## Processo

- Rota nova em `app/api/` exige entrada em `expectations` no `qa.ts`, senão o QA falha.
- Mudança em `lib/data.ts` ou `lib/health.ts` vem com teste de integração; regra pura em `lib/links.ts` vem com teste unitário em `lib/links.test.ts`.
- Dependência nova só com aprovação do dev, em versão estável exata (sem `^`).
- Concluir tarefa = `bun run ci` verde; se tocou fluxo de usuário, `bun qa.ts` verde também. Como rodar e o que costuma falhar: skill `links-local-verification`.
- Atualize `PLAN.md` e `CHANGELOG.md` ao fim de cada conjunto de mudanças.
- Todo commit enviado ao remoto é uma versão: bump, changelog, tag `vX.Y.Z` e GitHub Release no mesmo passo ([`docs/workflows.md`](../../docs/workflows.md#release), skill `links-release`). Nunca `--no-verify`, nunca push forçado em `main`.
