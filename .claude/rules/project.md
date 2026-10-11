# Regras do projeto links-afiliados

## Contratos que não mudam

- `/link?id=<externalId>` está publicado nos projetos. Formato, método (GET) e resposta (302) são fixos. Só o destino muda.
- `products.external_id` é o identificador público: nunca reescreva valores existentes.
- O redirect sempre responde: falha de tracking, Telegram ou checagem nunca pode impedir o 302 (por isso o evento é gravado em `after()`).

## Segurança

- Toda página em `app/(dashboard)/`, toda server action e toda rota de API do dashboard começa com `requireSession()` ou `getSession()`. Layout protegido não protege action nem rota.
- URL vinda de fora (formulário, importação, API) passa por `isPublicHttpUrl`: só http(s), sem host privado. Ela é buscada pelo servidor na checagem de saúde.
- `products.page_url` precisa estar no domínio de `projects.base_url` (`sameHost`): é o destino do fallback e não pode virar open redirect.
- Token de API de projeto: só o SHA-256 é guardado; o valor em claro aparece uma vez.
- Nada de IP em `click_events`. Referer é guardado sem query string.
- Segredos só em variável de ambiente. `.env*` é ignorado pelo git, exceto `.env.example`.

## Dados

- Produto e link só são criados por `upsertProducts` (`lib/data.ts`): formulário, importação e API passam por ele. `syncProducts` (PUT da API) cria por ele e só reconcilia o que já existia.
- Todo produto tem ao menos um link, e link só entra para projeto cujo site responde (`isSiteLive`): vale para API, formulário, importação e criação de projeto.
- Regra de negócio sem I/O vai em `lib/links.ts` com teste em `lib/links.test.ts`. I/O fica em `lib/data.ts` e `lib/health.ts`.
- Contagens de clique excluem bots (`is_bot = false`). Total exibido = eventos + `legacy_clicks`.
- Mudança de schema: edite `db/schema.ts`, rode `bun run db:generate`, revise o SQL, rode `bun run db:migrate` no banco local. Nunca `drizzle-kit push`, nunca editar migration já commitada.
- Nenhum comando contra o Turso de produção sem pedido explícito do dev.

## UI

- Componentes interativos vêm de Base UI via `components/ui.tsx`. Não reintroduza shadcn/Radix.
- Server Components por padrão; `"use client"` só com estado, efeito ou evento.
- Dado no cliente e mutações usam TanStack Query: `useQuery` para leitura, `useAction` para server action.
- Cores e fontes são tokens em `@theme` (`app/globals.css`). Sem cor hex solta em componente.
- Interface em pt-BR. Código, identificadores e commits em inglês.
- Ação destrutiva usa `Confirm` (AlertDialog) e diz o que será apagado.

## Processo

- Rota nova em `app/api/` exige entrada em `expectations` no `qa.ts`, senão o QA falha.
- Mudança em `lib/data.ts` ou `lib/health.ts` vem com teste de integração; regra pura em `lib/links.ts` vem com teste unitário.
- Dependência nova só com aprovação do dev, em versão estável exata (sem `^`).
- Concluir tarefa = `bun run ci` verde; se tocou fluxo de usuário, `bun qa.ts` verde também.
- Atualize `PLAN.md` e `CHANGELOG.md` ao fim de cada conjunto de mudanças.
