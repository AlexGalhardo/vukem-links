# API e importação

## Contrato com os sites

Este dashboard é o único gerenciador dos links de afiliado de todos os sites (CMS e sites estáticos). O contrato tem quatro regras:

1. **Identidade.** Cada produto de um site tem um `externalId` estável e único entre todos os projetos. Padrão: `<url do site>/<página>/<id do produto>`, por exemplo `https://example.com/melhor-airfryer-8-litros/arno-dual-afd2-8-3l`.
2. **Registro no build.** O site roda um script de sincronização antes do build e envia o catálogo inteiro com `PUT /api/v1/links`. Se a chamada falhar ou recusar algum item, o build falha: nenhuma página vai ao ar com link de afiliado fora do dashboard.
3. **Renderização.** O site nunca aponta direto para a loja. Todo botão usa `GET /link?id=<externalId>&store=<loja>`.
4. **Site no ar.** O dashboard só aceita links de um projeto cuja URL base responde. Projeto fora do ar recebe `409`.

5. **Sem configuração por site.** Todos os sites usam a mesma chave (`LINKS_API_KEY` aqui, `LINKS_DASHBOARD_TOKEN` no site) e se identificam pela própria URL. Um site visto pela primeira vez vira projeto sozinho: conectar um site novo é definir uma variável de ambiente no deploy dele.
6. **Dashboard fora do ar não derruba a venda.** O site consulta `GET /health` ao carregar a página; sem resposta, os botões passam a apontar direto para a loja.

A chave fica só na variável de ambiente do provedor de deploy, nunca no repositório.

## Redirect público

```text
GET /link?id=<externalId>[&store=<loja>]
```

`externalId` é o identificador do produto (URL-encoded). Resposta: `302` para o link de afiliado de maior prioridade que não esteja morto; se todos estiverem mortos, `302` para a página do produto. `404` se o produto não existe.

`store` é opcional e serve às páginas com um botão por loja (`mercadolivre`, `amazon`, `shopee`, ...). O redirect prefere o link vivo dessa loja; se ela não tiver link vivo, ou o valor for desconhecido, vale a ordem de prioridade.

Nos projetos, use como `href` do botão de compra:

```html
<a href="https://links.exemplo.com/link?id=https%3A%2F%2Fapp.meuprojeto.com%2Ffones%2Fmodelo-x&store=amazon" rel="nofollow sponsored">Comprar</a>
```

## Cadastro pelos projetos

```text
PUT /api/v1/links?site=<origem do site>
Authorization: Bearer <LINKS_API_KEY>
Content-Type: application/json
```

- **Chave:** uma só para todos os sites, definida na variável `LINKS_API_KEY` do dashboard. Não existe token por projeto.
- **`site`:** endereço do site que está chamando, por exemplo `https://example.com`. Só a origem é usada. O projeto com essa URL base recebe os dados; se não existir, é criado com o nome do host.
- Um site só escreve nos próprios produtos: `externalId` de outro projeto e `pageUrl` de outro domínio são recusados.

| Método | Uso | Corpo | Remove algo? |
| --- | --- | --- | --- |
| `PUT /api/v1/links` | Sincronização completa (script de build) | Array com o catálogo inteiro, de 1 a 5000 produtos, sem `externalId` repetido | Sim |
| `POST /api/v1/links` | Acréscimo pontual | Um produto ou um array de até 500 | Não |

Produto:

```json
{
  "externalId": "https://app.meuprojeto.com/fones/modelo-x",
  "name": "Fone Modelo X",
  "pageUrl": "https://app.meuprojeto.com/fones/modelo-x",
  "category": "fones",
  "links": [{ "url": "https://amzn.to/abc123" }, { "url": "https://mercadolivre.com/sec/xyz", "store": "mercadolivre" }]
}
```

| Campo | Obrigatório | Observação |
| --- | --- | --- |
| `externalId` | Sim | Único entre todos os projetos |
| `links` | Sim | De 1 a 20. Produto sem link é recusado |
| `links[].url` | Sim | http(s), host público |
| `name` | Não | Padrão: último trecho do `externalId` |
| `pageUrl` | Não | Padrão: `externalId` se for URL, senão a URL base do projeto. Precisa estar no domínio do projeto |
| `category` | Não | Texto livre |
| `links[].store` | Não | Padrão: detectada pelo host |

### PUT: sincronização completa

Depois da chamada, o projeto contém exatamente o corpo enviado:

- Produto novo é criado.
- Produto existente tem `name`, `category` e `pageUrl` atualizados; os links passam a ser os do corpo, na ordem do corpo. Link que continua mantém cliques e estado de saúde; link que saiu é apagado.
- Produto do projeto ausente do corpo é apagado, junto com seus cliques.

Um corpo vazio é `400`, então um script com defeito não apaga o catálogo. A chamada é idempotente.

### POST: acréscimo

Produto existente recebe só os links novos, no fim da ordem de prioridade. Nada é atualizado nem removido. A chamada é idempotente.

### Respostas

| Status | Significado |
| --- | --- |
| `200` | `PUT` aplicado. Corpo: `{ productsCreated, productsUpdated, productsRemoved, linksAdded, linksRemoved, errors: [] }` |
| `201` | `POST` aplicado. Corpo: `{ productsCreated, linksAdded, errors: [] }` |
| `207` | Parte recusada; veja `errors`. O restante foi aplicado |
| `400` | Corpo inválido (`issues` traz o detalhe) |
| `400` | `{ "error": "invalid_site" }`: falta `?site=` ou ele não é um endereço http(s) público |
| `401` | Chave ausente ou errada |
| `409` | `{ "error": "project_offline" }`: a URL base do projeto não respondeu. Nada foi gravado |

Itens recusados em `errors`: `externalId` que pertence a outro projeto, ou `pageUrl` fora do domínio do projeto.

```bash
curl -X PUT "https://links.exemplo.com/api/v1/links?site=https://app.meuprojeto.com" \
  -H "Authorization: Bearer la_xxxxx" -H "Content-Type: application/json" \
  -d '[{"externalId":"https://app.meuprojeto.com/fones/modelo-x","links":[{"url":"https://amzn.to/abc123"}]}]'
```

## Saúde

```text
GET /health
```

Pública e legível de qualquer origem (CORS). `200 { "status": "ok" }` quando o dashboard e o banco respondem; `503` caso contrário. Os sites usam para decidir se o botão passa pelo redirect ou vai direto para a loja.

## Importação pelo dashboard

Página do projeto → "Importar JSON/CSV". Aceita:

- **JSON**: array no formato acima, ou o formato da v4 (`seed.json`): `{ id, category, mercadolivreUrl, amazonUrl, shopeeUrl }`.
- **CSV** com cabeçalho `externalId,url,name,pageUrl,category,store`. Só `externalId` e `url` são obrigatórios. Linhas com o mesmo `externalId` viram um produto com vários links, na ordem do arquivo.

Limite: 5000 produtos por importação. Todo produto precisa de ao menos um link, e o site do projeto precisa estar no ar.

O arquivo exportado pelo painel de um site ("Exportar links" em JSON ou CSV) usa exatamente esse formato e pode ser enviado aqui.

Antes de gravar, a importação confere cada link novo:

- Link que o produto já tem é ignorado.
- Link que responde como morto (erro HTTP, host inexistente, redirect para a home da loja) é ignorado. Bloqueio de robô (`401`, `403`, `429`) e timeout não contam como morto.
- Produto que fica sem nenhum link não é criado.

O resultado informa quantos links entraram e quantos foram ignorados por cada motivo.
