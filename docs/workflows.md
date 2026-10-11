# Fluxos de trabalho

Como uma mudança vai do editor até produção: tarefa, commit, release e deploy. As convenções (SemVer, formato do changelog e dos commits) estão em [`conventions.md`](conventions.md); aqui ficam os passos e os comandos.

## Tarefa

1. Leia [`PLAN.md`](../PLAN.md) e as regras em [`.claude/rules/project.md`](../.claude/rules/project.md).
2. Implemente com o teste correspondente (unitário para `lib/links.ts`, integração para `lib/data.ts` e `lib/health.ts`).
3. Valide com o passo mais estreito enquanto itera e com o gate no fim: `bun run ci`. Se tocou fluxo de usuário, `bun qa.ts` também ([`qa.md`](qa.md)).
4. Registre a mudança em `## [Unreleased]` do [`CHANGELOG.md`](../CHANGELOG.md) e atualize o `PLAN.md`. Se mudou como o projeto é operado, atualize a documentação e o índice em [`.claude/agents.md`](../.claude/agents.md).

Trabalha-se direto em `main` (um dev, sem pull request).

## Commit

```bash
git add <arquivos>
git commit -m "feat(health): mark link dead after three consecutive failures"
```

| Hook | Roda | Se falhar |
| --- | --- | --- |
| `pre-commit` | `biome check --staged` | `bun run format` e adicione de novo |
| `commit-msg` | commitlint | Ajuste a mensagem: tipo e escopo de [`conventions.md`](conventions.md#commits--conventional-commits-100), cabeçalho e linhas do corpo com até 100 caracteres |
| `pre-push` | `bun run ci` | Corrija a causa |

Nunca pule um hook com `--no-verify` e nunca force o push em `main`.

## Release

Regra do repositório: **todo commit enviado ao remoto vira uma versão**, com tag anotada `vX.Y.Z` e GitHub Release contendo a seção daquela versão do `CHANGELOG.md`. Por isso bump, changelog e código vão no mesmo commit.

1. Escolha o bump pelo conteúdo ([`conventions.md`](conventions.md#versionamento--semver-200)): quebra de contrato = major, funcionalidade = minor, o resto = patch.
2. Atualize os arquivos:
   - `CHANGELOG.md`: o conteúdo de `[Unreleased]` vira `## [X.Y.Z] - AAAA-MM-DD`, fica um `[Unreleased]` vazio no topo e os links de comparação do rodapé são atualizados.
   - `package.json`: `"version": "X.Y.Z"`.
   - `PLAN.md`: **Estado atual**.
3. Valide, commite, crie a tag e envie:

   ```bash
   bun run ci
   git add -A
   git commit -m "feat(escopo): assunto"
   git tag -a vX.Y.Z -m "vX.Y.Z"
   git push origin main vX.Y.Z
   ```

4. Crie a release com as notas daquela versão (o `awk` extrai a seção `## [X.Y.Z]` do changelog):

   ```bash
   awk -v v="X.Y.Z" 'index($0, "## [" v "]") == 1 { on = 1; next } /^## \[/ { on = 0 } on' CHANGELOG.md > release-notes.md
   gh release create vX.Y.Z --repo AlexGalhardo/links.example.com --title vX.Y.Z --notes-file release-notes.md
   rm release-notes.md
   ```

Verificação: `gh release view vX.Y.Z --repo AlexGalhardo/links.example.com` mostra a release e `git status -sb` não mostra commits à frente de `origin/main`.

A skill `links-release` cobre a parte local (bump, changelog, tag). Push e release só quando o dono pedir na sessão.

## Deploy (Vercel)

Produção é <https://links.example.com>, projeto `links-example-com`. O repositório não está conectado à Vercel: push não publica nada. **Deploy, variáveis e banco de produção só a pedido explícito do dono.**

Pré-requisito: pasta ligada ao projeto ([`agent-setup.md`](agent-setup.md#8-vercel)).

```bash
vercel deploy --prod          # da raiz do projeto, com a árvore limpa e a versão já enviada ao GitHub
```

Verificação:

```bash
curl -s https://links.example.com/health                                   # {"status":"ok"}
curl -s -o /dev/null -w '%{http_code}\n' https://links.example.com/login   # 200
```

Nunca rode `qa.ts` contra produção: ele cria e apaga dados.

### Variáveis de ambiente

```bash
vercel env ls production               # nomes (sem valores)
vercel env add NOME production         # o valor é digitado no prompt, não vai para o histórico do shell
```

A lista e o significado de cada uma estão em [`setup.md`](setup.md#variáveis-de-ambiente). Variável nova ou alterada só vale depois de um novo deploy. `BETTER_AUTH_URL` em produção é `https://links.example.com`.

### Banco (Turso)

O banco foi criado pelo Vercel Marketplace (aba Storage do projeto), que define `TURSO_DATABASE_URL` e `TURSO_AUTH_TOKEN` em produção. O deploy **não** aplica migrations.

Quando uma versão traz migration nova em `drizzle/`, aplique-a **antes** do deploy, e só quando o dono pedir:

```bash
vercel env pull .env.production.local --environment=production   # arquivo ignorado pelo git
set -a && . ./.env.production.local && set +a
bun scripts/migrate.ts                                           # imprime "Migrations applied."
rm .env.production.local
```

Feche o terminal depois: as variáveis de produção ficam exportadas na sessão. Migration destrutiva (remover coluna ou tabela) pede backup antes: `turso db shell <db> .dump > backup.sql`.

`bun scripts/seed.ts` em produção só na criação de um banco novo (cria o admin e importa `seed.json`).

### Crons

Definidos em [`vercel.json`](../vercel.json) e registrados a cada deploy de produção:

| Rota | Agenda (UTC) | Faz |
| --- | --- | --- |
| `/api/cron/health` | `0 * * * *` (toda hora) | Checa um lote de links ([`health-check.md`](health-check.md)) |
| `/api/cron/weekly` | `0 20 * * 0` (domingo, 17h de Brasília) | Relatório semanal de cliques no Telegram |

A Vercel chama as rotas com `Authorization: Bearer $CRON_SECRET`. Frequência maior que diária exige o plano Pro.

### Rollback

`vercel rollback` volta o domínio para o deploy anterior. Não desfaz migration: mudança de schema precisa ser compatível com a versão anterior do código.
