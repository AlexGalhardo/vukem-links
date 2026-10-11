# API e importação

## Redirect público

```text
GET /link?id=<externalId>
```

`externalId` é o identificador do produto (URL-encoded). Resposta: `302` para o link de afiliado de maior prioridade que não esteja morto; se todos estiverem mortos, `302` para a página do produto. `404` se o produto não existe.

Nos projetos, use como `href` do botão de compra:

```html
<a href="https://links.exemplo.com/link?id=https%3A%2F%2Fapp.meuprojeto.com%2Ffones%2Fmodelo-x" rel="nofollow sponsored">Comprar</a>
```

## Cadastro pelos projetos

```text
POST /api/v1/links
Authorization: Bearer <token do projeto>
Content-Type: application/json
```

O token é gerado na página do projeto ("Gerar token da API"), aparece uma única vez e gerar outro invalida o anterior.

Corpo: um produto ou um array de até 500.

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
| `links[].url` | Sim | http(s), host público |
| `name` | Não | Padrão: último trecho do `externalId` |
| `pageUrl` | Não | Padrão: `externalId` se for URL, senão a URL base do projeto. Precisa estar no domínio do projeto |
| `category` | Não | Texto livre |
| `links[].store` | Não | Padrão: detectada pelo host |

A chamada é idempotente: produto existente recebe só os links novos, no fim da ordem de prioridade.

| Status | Significado |
| --- | --- |
| `201` | Tudo aplicado. Corpo: `{ productsCreated, linksAdded, errors: [] }` |
| `207` | Parte recusada; veja `errors` |
| `400` | Corpo inválido (`issues` traz o detalhe) |
| `401` | Token ausente ou inválido |

```bash
curl -X POST https://links.exemplo.com/api/v1/links \
  -H "Authorization: Bearer la_xxxxx" -H "Content-Type: application/json" \
  -d '{"externalId":"https://app.meuprojeto.com/fones/modelo-x","links":[{"url":"https://amzn.to/abc123"}]}'
```

## Importação pelo dashboard

Página do projeto → "Importar JSON/CSV". Aceita:

- **JSON**: array no formato acima, ou o formato da v4 (`seed.json`): `{ id, category, mercadolivreUrl, amazonUrl, shopeeUrl }`.
- **CSV** com cabeçalho `externalId,url,name,pageUrl,category,store`. Só `externalId` e `url` são obrigatórios. Linhas com o mesmo `externalId` viram um produto com vários links, na ordem do arquivo.

Limite: 5000 produtos por importação.
