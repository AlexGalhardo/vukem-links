# Checagem de saúde

Responde "o link ainda existe?". Código: `lib/health.ts` (I/O) e `classifyProbe` / `nextHealth` em `lib/links.ts` (regras, com testes).

## Como um link é testado

Um `GET` na URL de afiliado, seguindo redirects, com User-Agent de navegador e timeout de 8 s. Guardamos o status HTTP e a URL final.

| Resposta | Resultado | Efeito |
| --- | --- | --- |
| 2xx/3xx em uma página que não é a home | `ok` | `alive`, zera as falhas |
| 404, 410, outros 4xx, 5xx | `failed` | +1 falha |
| 2xx mas a URL final é a home da loja (`/`) | `failed` | +1 falha (produto removido) |
| Erro de rede (DNS, conexão recusada) | `failed` | +1 falha |
| 401, 403, 429 | `inconclusive` | Nada muda (loja bloqueou o robô) |
| Timeout | `inconclusive` | Nada muda |

## Estados

```text
unknown ──ok──> alive ──3 falhas seguidas──> dead ──ok──> alive
```

- `DEAD_AFTER_FAILURES = 3`: uma falha isolada não mata o link.
- `unknown` e `alive` são elegíveis no redirect; `dead` é pulado.
- Trocar a URL de um link volta o estado para `unknown`.
- Ao virar `dead`, um alerta vai para o Telegram (se configurado).

## Quando roda

| Gatilho | Alcance |
| --- | --- |
| Vercel Cron, de hora em hora (`/api/cron/health`) | Os 400 links há mais tempo sem checagem |
| Botão "Checar próximo lote" (tabela) | Idem |
| Seleção na tabela + "Checar" | Os links selecionados |
| "Checar agora" no detalhe do link | Aquele link |

Como a morte exige 3 falhas seguidas, um link quebrado é marcado em até 3 ciclos do cron, ou na hora com 3 checagens manuais.

## Limitações

- **Produto esgotado ou anúncio pausado devolve 200.** Só link quebrado é detectado.
- **Links curtos do Mercado Livre** (`mercadolivre.com/sec/…`) terminam na página social do afiliado, não no produto: sempre parecem vivos.
- **Bloqueio de robôs** gera `inconclusive` indefinidamente; o link fica no estado anterior.
- Redirects intermediários não são revalidados contra hosts privados (a URL inicial é).
