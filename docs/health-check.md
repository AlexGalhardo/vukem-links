# Checagem de saúde

Responde "o link ainda existe?". Código: `internal/health` (I/O) e `ClassifyProbe` / `NextHealth` em `internal/rules` (regras, com testes de tabela). Os testes de `internal/health` usam um transporte HTTP falso: nenhuma rede.

## Como um link é testado

Um `GET` na URL de afiliado, seguindo até 5 redirects, com User-Agent de navegador e timeout de 8 s, pelo cliente `httpclient.Safe` do vukem (recusa endereços privados em cada conexão). Guardamos o status HTTP e a URL final.

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

- `rules.DeadAfterFailures = 3`: uma falha isolada não mata o link.
- `unknown` e `alive` são elegíveis no redirect; `dead` é pulado.
- Trocar a URL de um link volta o estado para `unknown`.
- Ao virar `dead`, um alerta vai para o Telegram (se configurado).

## Quando roda

| Gatilho | Alcance |
| --- | --- |
| Scheduler do vukem, de hora em hora (`links:health`) | Os 400 links há mais tempo sem checagem |
| "Checar todos os links" (visão geral) | Todos, em lotes, cada link uma vez |
| Seleção na tabela + "Checar" | Os links selecionados |
| "Checar agora" no detalhe do link | Aquele link |

O scheduler roda dentro do `serve` (`SCHEDULE_IN_SERVE=false` o desliga; use então `schedule:work` ou um cron chamando `schedule:run` a cada minuto). `schedule:list` mostra as tarefas.

Como a morte exige 3 falhas seguidas, um link quebrado é marcado em até 3 ciclos, ou na hora com 3 checagens manuais.

## Limitações

- **Produto esgotado ou anúncio pausado devolve 200.** Só link quebrado é detectado.
- **Links curtos do Mercado Livre** (`mercadolivre.com/sec/…`) terminam na página social do afiliado, não no produto: sempre parecem vivos.
- **Bloqueio de robôs** gera `inconclusive` indefinidamente; o link fica no estado anterior.
- Hosts privados são recusados em toda conexão, inclusive em redirects: o cliente do vukem checa o endereço resolvido no dial.
