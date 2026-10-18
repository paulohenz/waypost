# Waypost

Analytics web auto-hospedado para pageviews, eventos e cliques.

[![versão no npm](https://img.shields.io/npm/v/waypost-analytics)](https://www.npmjs.com/package/waypost-analytics)
[![licença MIT](https://img.shields.io/github/license/paulohenz/waypost)](https://github.com/paulohenz/waypost/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/paulohenz/waypost/ci.yml?branch=main&label=CI)](https://github.com/paulohenz/waypost/actions/workflows/ci.yml)

O navegador mede a visita com um SDK pequeno. Um coletor em Node.js guarda os eventos em SQLite e responde contagens por período, página, referenciador e evento. O pacote publicado é [`waypost-analytics@0.1.0`](https://www.npmjs.com/package/waypost-analytics), na conta npm [plsh](https://www.npmjs.com/~plsh). O código está em [github.com/paulohenz/waypost](https://github.com/paulohenz/waypost).

O npm mostra o guia em inglês, em [`app/README.md`](app/README.md).

```
app/        SDK waypost-analytics (ESM, CommonJS, script tag, tipos)
backend/    coletor Hono: POST /collect e GET /stats/*
example/    página de demonstração servida em /
```

A raiz é um workspace npm privado. No npm entra só o diretório `app/`.

## Por quê

- Os eventos ficam no servidor que você hospeda, sem conta em um analytics de terceiro.
- A coleta funciona sem cookies.
- Do Not Track e Global Privacy Control desligam o SDK.
- O script da tag tem cerca de 4 KB com gzip (o arquivo minificado tem cerca de 10 KB) e não traz dependências de runtime.

## Começo rápido

### Instalar

```bash
npm install waypost-analytics
```

O pacote inclui três builds do mesmo SDK:

| Build | Arquivo | Uso |
| --- | --- | --- |
| ESM | `dist/index.js` | `import { init, track } from 'waypost-analytics'` |
| CommonJS | `dist/index.cjs` | `require('waypost-analytics')` |
| Script tag | `dist/waypost.js` | `<script src=".../waypost.js">` |
| Tipos | `dist/index.d.ts` | TypeScript |

### `init`

```ts
import { init, track } from 'waypost-analytics';

init({
  endpoint: 'http://127.0.0.1:3921/collect',
  siteId: 'demo',
  autoClicks: true,
});

track('newsletter', { origem: 'rodape' });
```

`init` registra um pageview na hora. `track` enfileira um evento com o nome que você passar.

### Script tag

O arquivo publicado também está no unpkg e no jsDelivr, nos campos `unpkg` e `jsdelivr` do pacote:

```html
<script
  src="https://unpkg.com/waypost-analytics@0.1.0/dist/waypost.js"
  data-endpoint="https://analytics.example.com/collect"
  data-site="demo"
  data-auto-clicks="true"
  defer
></script>
```

O mesmo arquivo no jsDelivr é `https://cdn.jsdelivr.net/npm/waypost-analytics@0.1.0/dist/waypost.js`. Com `data-endpoint` e `data-site`, o script chama `init` sozinho. Depois do carregamento, `window.waypost` expõe `init`, `track`, `flush` e `shutdown`.

| Atributo | Padrão | Efeito |
| --- | --- | --- |
| `data-endpoint` | — | URL de coleta. Sem ela, o script não inicia sozinho. |
| `data-site` | — | `siteId`. Sem ele, o script não inicia sozinho. |
| `data-token` | — | Segredo enviado no campo `token` do JSON. |
| `data-auto-pageviews` | `true` | `false` pula os pageviews automáticos. |
| `data-auto-clicks` | `false` | `true` captura `[data-track]` e links. |
| `data-respect-dnt` | `true` | `false` ignora Do Not Track e Global Privacy Control. |
| `data-debug` | `false` | Escreve a fila em `console.debug`. |
| `data-batch-size` | `10` | Envia ao chegar nesse número de eventos (1–20). |
| `data-flush-interval` | `5000` | Intervalo de envio, em milissegundos. |

Valores booleanos aceitam `true`/`false`, `1`/`0`, `on`/`off` e `yes`/`no`. A tag não configura `sessionTimeout` nem o objeto de `autoClicks`; isso fica na API do módulo.

## Referência da API

O módulo exporta `init`, `track`, `flush` e `shutdown`, e os tipos `AnalyticsEvent`, `AutoClickOptions`, `EventType`, `InitResult`, `Primitive`, `UtmParams` e `WaypostOptions`.

### `init(options): { enabled: boolean }`

Começa a coleta. Chamar de novo envia a fila anterior, troca os listeners e abre outra fila. O id de visitante e o de sessão continuam no storage. Com pageviews automáticos, a URL atual entra de novo na fila.

`enabled` volta `false` quando Do Not Track ou Global Privacy Control está ativo e `respectDoNotTrack` permanece no padrão. Nesse caso nada é gravado e nada é enviado.

Fora de um navegador, `init` lança um erro. `endpoint` vazio e `siteId` fora do formato também lançam.

| Opção | Padrão | Descrição |
| --- | --- | --- |
| `endpoint` | — | URL absoluta ou relativa do `POST` de coleta. |
| `siteId` | — | 1–64 caracteres. Começa com letra ou dígito; o resto pode ter letra, dígito, `_` e `-`. |
| `token` | — | Segredo opcional, no corpo JSON. `sendBeacon` não define cabeçalhos. |
| `autoPageviews` | `true` | Pageview no `init` e nas navegações de SPA. |
| `autoClicks` | `false` | `true` captura `[data-track]` e `<a href>`. Um objeto troca o atributo ou desliga os links: `{ attribute: 'data-analytics', links: false }`. |
| `respectDoNotTrack` | `true` | Honra `navigator.doNotTrack` e `navigator.globalPrivacyControl`. |
| `batchSize` | `10` | Dispara o envio nesse tamanho. Limitado a 1–20. |
| `flushInterval` | `5000` | Intervalo de envio, em milissegundos. Limitado a 0–120000. |
| `sessionTimeout` | `1800000` | Inatividade até um novo id de sessão, em milissegundos. Mínimo 1 segundo, máximo 24 horas. |
| `debug` | `false` | `console.debug` com o prefixo `[waypost]`. |

### `track(eventName, props?)`

Enfileira um evento do tipo `event`. `props` guarda até 25 primitivos JSON (`string`, número finito, `boolean`, `null`). Strings são cortadas em 200 caracteres e chaves em 40. Objetos aninhados, arrays e números não finitos são descartados. Um nome em branco é ignorado. O nome é aparado e cortado em 120 caracteres.

Chamadas feitas antes do `init` ficam guardadas (até 20) e seguem quando a coleta começa. Se o `init` desligar a coleta por privacidade, essas chamadas são descartadas.

### `flush()`

Envia na hora o que estiver na fila.

### `shutdown()`

Envia a fila, remove os listeners e esquece o estado em memória. `localStorage` e `sessionStorage` ficam como estão.

### O que sai no lote

Os eventos vão num único JSON, em `text/plain;charset=UTF-8`, para o navegador tratar o `POST` como pedido CORS simples. O coletor faz `JSON.parse` no corpo, qualquer que seja o `Content-Type`.

```json
{
  "siteId": "demo",
  "token": "local-token",
  "events": [
    {
      "type": "pageview",
      "name": "pageview",
      "visitorId": "6f1c1a2e-3b4d-4e5f-8a90-1b2c3d4e5f60",
      "sessionId": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
      "timestamp": 1792346400000,
      "url": "https://exemplo.com/cadernos?utm_source=news&utm_medium=email",
      "path": "/cadernos",
      "referrer": "https://news.example/story",
      "title": "Cadernos",
      "screenWidth": 1440,
      "screenHeight": 900,
      "language": "pt-BR",
      "utm": { "source": "news", "medium": "email" }
    }
  ]
}
```

`timestamp` é milissegundos desde a época Unix. No exemplo, `1792346400000` é `2026-10-18T18:00:00.000Z`. O campo `token` só aparece quando `init` recebeu um token.

`type` é `pageview`, `event` ou `click`. Um clique usa o valor de `data-track` como `name`, ou `click` num link sem esse atributo, e manda `tag`, `text`, `href` e `id` em `props`.

Os parâmetros `utm_source`, `utm_medium`, `utm_campaign`, `utm_term` e `utm_content` formam a atribuição da sessão. O primeiro conjunto presente na URL fica gravado e acompanha os eventos seguintes da mesma aba; uma URL posterior com outros `utm_*` não o substitui. Outras query strings, como `gclid`, ficam de fora. Uma sessão nova apaga essa atribuição e lê a URL de novo.

A fila também sai quando a página fica oculta (`visibilitychange`) ou em `pagehide`. O envio usa `navigator.sendBeacon`. Se ele não existir, lançar ou devolver `false`, o SDK cai para `fetch` com `keepalive`, `mode: 'cors'` e `credentials: 'omit'`. Falha de rede não vira exceção para a página.

Limites aplicados pelo SDK antes do envio: URL e referrer até 2048 caracteres, caminho até 1024, título até 300, idioma até 35, cada valor de UTM até 200.

## Rastreamento automático e cliques

Com `autoPageviews` no padrão, o primeiro pageview sai no `init`. Outros saem quando a URL muda por `history.pushState`, `history.replaceState`, `popstate` ou `hashchange`. O `path` é o `pathname` mais o hash; um hash vazio ou só `#` fica de fora. A mesma URL, incluindo busca e hash, não é contada duas vezes se a segunda ocorrer em menos de 50 ms. O `name` desses eventos é `pageview`.

`autoClicks` começa desligado. Ligado (`true` ou um objeto):

- um elemento com `data-track="inscrever"` gera um clique de nome `inscrever` (o nome do atributo muda com `attribute`);
- um `<a href>` sem esse atributo gera um clique de nome `click`, quando `links` não é `false`;
- o clique sobe com `closest`, então um `<span>` dentro do botão marcado conta como o botão;
- se o alvo marcado está dentro de um link, o evento fica no elemento marcado e o `href` vem do link;
- um botão sem `data-track` e sem ser link não entra;
- o listener está na fase de captura, então um `preventDefault` no seu código ainda deixa o registro.

```html
<button id="cta" data-track="inscrever">Criar conta</button>
<a id="out" href="https://example.com/pricing">Externo</a>
```

O botão sai como `type: "click"`, `name: "inscrever"` e `props` com `tag: "button"`, `text: "Criar conta"` e `id: "cta"`. O link sai como `name: "click"`, `tag: "a"` e o `href` absoluto. O texto é o conteúdo do elemento, com espaços colapsados, até 80 caracteres.

O nome do atributo começa com letra, `_` ou `:`, e continua com letras, dígitos, `_`, `.`, `:` ou `-`. Fora disso, `init` lança `TypeError`.

## Privacidade

- O SDK não grava cookies e não lê `document.cookie`.
- O id de visitante é um UUID em `localStorage`, na chave `waypost_vid`. Ele permanece no dispositivo até essa chave ser removida.
- O id de sessão fica em `sessionStorage`, na chave `waypost_sid`, como JSON `{ "id", "ts" }`, um por aba. Cada evento atualiza `ts`. Depois de 30 minutos sem evento (ou o `sessionTimeout` configurado), o próximo evento abre outra sessão.
- `waypost_utm`, também em `sessionStorage`, guarda o UTM da sessão. A rotação da sessão apaga essa chave.
- Com storage bloqueado, os ids existem só em memória, na página atual.
- Do Not Track com valor `1` ou `yes` (em `navigator.doNotTrack`, `navigator.msDoNotTrack` ou `window.doNotTrack`) e Global Privacy Control (`navigator.globalPrivacyControl === true`) desligam a coleta antes de escrever qualquer id. `init` devolve `{ enabled: false }`.
- `respectDoNotTrack: false` mantém a coleta com esses sinais ligados.
- O payload não tem endereço IP. O coletor também não lê nem grava IP.
- O `fetch` de reserva manda `credentials: 'omit'`. O `sendBeacon` pode anexar cookies que o navegador já tenha para a origem do coletor. Um host só do coletor deixa os cookies do site fora desse envio.

## Rodar o coletor

O coletor usa o módulo `node:sqlite` do Node.js 22 ou mais recente. No Node 22 o processo imprime `ExperimentalWarning: SQLite is an experimental feature`. O arquivo gerado é um SQLite comum.

Na raiz do repositório:

```bash
npm ci
npm run dev
```

`npm run dev` compila o SDK e sobe o coletor com reload. O log mostra `http://127.0.0.1:3921` quando `HOST` é `0.0.0.0` ou `::`. A página de exemplo fica em [http://127.0.0.1:3921](http://127.0.0.1:3921): ela carrega `/waypost.js`, mede o site `demo` e lê as estatísticas desse site.

Para subir depois do build, sem o watch:

```bash
npm start
```

Os scripts npm rodam o coletor com o diretório de trabalho em `backend/`. O banco padrão fica em `backend/data/waypost.sqlite`. O coletor relê `app/dist/waypost.js` a cada pedido de `/waypost.js`. Com o processo no ar, `npm run build -w waypost-analytics` atualiza o arquivo e a página passa a receber o script novo.

| Variável | Padrão | Uso |
| --- | --- | --- |
| `PORT` | `3921` | Porta HTTP, de 1 a 65535. Um valor inválido encerra o processo. |
| `HOST` | `0.0.0.0` | Interface de escuta. `0.0.0.0` escuta em todas as interfaces IPv4; o log mostra `127.0.0.1` para abrir na própria máquina. |
| `DATABASE_PATH` | `data/waypost.sqlite` | Arquivo SQLite, relativo ao diretório de trabalho. `:memory:` guarda os dados só enquanto o processo vive. |
| `INGEST_TOKEN` | vazio | Quando definida, o JSON de `POST /collect` precisa trazer o mesmo `token`. |
| `DATABASE_URL` | — | Um valor `postgres://` ou `postgresql://` encerra o processo na subida. Este repositório não traz driver Postgres. |

O diretório do arquivo SQLite é criado na subida. Bancos em arquivo usam `PRAGMA journal_mode = WAL`, então aparecem também `*.sqlite-wal` e `*.sqlite-shm`. A interface de armazenamento é `AnalyticsStore` (`backend/src/types.ts`); a implementação incluída é `createSqliteStore`.

### `POST /collect`

Corpo JSON, em `text/plain` ou `application/json`. No máximo 20 eventos e 64 KB. CORS responde com `Access-Control-Allow-Origin: *`, métodos `GET`, `POST` e `OPTIONS`, e o cabeçalho `Content-Type`.

```bash
curl -i -X POST http://127.0.0.1:3921/collect \
  -H 'Content-Type: text/plain;charset=UTF-8' \
  -d '{"siteId":"demo","events":[{"type":"pageview","name":"pageview","visitorId":"6f1c1a2e-3b4d-4e5f-8a90-1b2c3d4e5f60","sessionId":"a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d","timestamp":1792346400000,"url":"https://exemplo.com/cadernos","path":"/cadernos","referrer":"https://news.example/story","title":"Cadernos","screenWidth":1440,"screenHeight":900,"language":"pt-BR","utm":{"source":"news","medium":"email"}}]}'
```

Sucesso:

```http
HTTP/1.1 204 No Content
access-control-allow-origin: *
```

O corpo do 204 é vazio. Um timestamp fora da janela — dos últimos 30 dias até 15 minutos à frente do relógio do servidor — volta 400. O exemplo acima usa `2026-10-18T18:00:00.000Z`; numa data distante, troque `timestamp` por `Date.now()`.

Lote vazio:

```bash
curl -s -X POST http://127.0.0.1:3921/collect \
  -H 'Content-Type: text/plain' \
  -d '{"siteId":"demo","events":[]}'
```

```json
{ "error": "invalid_payload", "message": "events must be a non-empty array" }
```

| Status | `error` | Quando |
| --- | --- | --- |
| 204 | — | Lote gravado. |
| 400 | `invalid_json` | Corpo que não é JSON. Mensagem: `Body must be JSON.` |
| 400 | `invalid_payload` | `siteId`, eventos ou campos fora do formato. |
| 401 | `unauthorized` | `INGEST_TOKEN` definido e `token` ausente ou diferente. Mensagem: `Invalid ingest token.` |
| 405 | `method_not_allowed` | `GET /collect`. Mensagem: `Use POST /collect.` |
| 413 | `payload_too_large` | Corpo acima de 64 KB. Mensagem: `Request body is too large.` |
| 500 | `store_failed` | Falha ao gravar. A resposta não inclui o erro interno. |

Cada evento precisa de `type` (`pageview`, `event` ou `click`), `name` (1–120 caracteres, sem caracteres de controle), `visitorId` e `sessionId` (8–80 caracteres entre letras, dígitos, `_` e `-`) e `timestamp` numérico. O SDK manda UUIDs. `props` aceita no máximo 25 chaves, cada uma até 40 caracteres, com string, número finito, booleano ou `null` (strings até 200). O coletor recusa o lote inteiro quando um `props` foge disso; o SDK já corta e descarta antes de enviar. Campos desconhecidos no evento são ignorados. O host do referrer só entra nas estatísticas quando é de outro site; a mesma origem e um referrer ilegível ficam de fora do ranking, e o referrer bruto continua gravado.

### `GET /health`

```bash
curl -s http://127.0.0.1:3921/health
```

```json
{ "ok": true }
```

`GET /` serve `example/index.html` quando o arquivo é encontrado. `GET /waypost.js` serve o build do SDK, ou 503 se `app/dist/waypost.js` ainda não existe. Caminhos desconhecidos respondem 404 com `{ "error": "not_found", "message": "Not found." }`.

## API de estatísticas

As rotas abaixo leem um `siteId` e um intervalo. Sem `from` e `to`, o intervalo é os últimos 30 dias, até o instante do pedido. `from` e `to` aceitam `YYYY-MM-DD` ou um timestamp ISO-8601. Uma data sem hora é um dia UTC: `from` começa à meia-noite, e `to` inclui o dia inteiro (o fim exclusivo é a meia-noite seguinte). O intervalo precisa ter `from` anterior a `to` e no máximo 366 dias. `interval` é `hour` ou `day` (padrão `day`). `limit` vai de 1 a 100 (padrão 10).

Na resposta, `from` e `to` são milissegundos. Baldes de dia usam `YYYY-MM-DD`. Baldes de hora usam `YYYY-MM-DDTHH:00:00Z`. Baldes sem pageview ficam de fora da lista.

Consulta `from=2026-10-01&to=2026-10-18` depois de um pageview, um clique `inscrever` e um evento `newsletter` no site `demo`:

`GET /stats/timeseries?siteId=demo&from=2026-10-01&to=2026-10-18&interval=day`

```json
{
  "siteId": "demo",
  "interval": "day",
  "from": 1790812800000,
  "to": 1792368000000,
  "points": [
    { "bucket": "2026-10-18", "pageviews": 1, "visitors": 1 }
  ],
  "totals": { "pageviews": 1, "visitors": 1 }
}
```

`totals.visitors` é a contagem distinta no período inteiro. A soma de `visitors` dos baldes pode ser maior, porque a mesma pessoa entra em mais de um dia ou hora. `pageviews` soma. Com `interval=hour`, o balde desse exemplo é `2026-10-18T18:00:00Z`.

`GET /stats/pages?siteId=demo&from=2026-10-01&to=2026-10-18&limit=10`

```json
{
  "siteId": "demo",
  "pages": [
    { "path": "/cadernos", "pageviews": 1, "visitors": 1 }
  ]
}
```

Só entram eventos `pageview`, ordenados por pageviews e, no empate, pelo path.

`GET /stats/referrers?siteId=demo&from=2026-10-01&to=2026-10-18`

```json
{
  "siteId": "demo",
  "referrers": [
    { "host": "news.example", "visits": 1, "visitors": 1 }
  ]
}
```

`visits` é o número de pageviews com aquele host externo.

`GET /stats/events?siteId=demo&from=2026-10-01&to=2026-10-18`

```json
{
  "siteId": "demo",
  "events": [
    { "name": "inscrever", "type": "click", "count": 1, "visitors": 1 },
    { "name": "newsletter", "type": "event", "count": 1, "visitors": 1 }
  ]
}
```

Pageviews não entram nesta lista. Cada site fica isolado pelo `siteId`.

Uma consulta sem `siteId`:

```json
{
  "error": "invalid_query",
  "message": "siteId is required and must match the collect format"
}
```

## Deploy

`npm ci` na raiz instala as workspaces. `npm start` compila o SDK e o coletor e escuta em `PORT` / `HOST`. O processo fala HTTP. O TLS fica num proxy reverso à frente dele.

As rotas `/stats/*` respondem a qualquer cliente que alcance a porta. `INGEST_TOKEN` vale só para `POST /collect`, e o valor viaja no JSON porque o beacon não envia cabeçalho de autorização. A página de exemplo em `/` também chama `/stats/*` no navegador, para o site `demo`.

O coletor não grava IP. Um proxy na frente pode ter o próprio log de acesso; isso fica fora do SQLite do Waypost.

## Contribuir

Issues e pull requests vão para [paulohenz/waypost](https://github.com/paulohenz/waypost/issues). O guia está em [CONTRIBUTING.md](CONTRIBUTING.md).

O workflow [CI](.github/workflows/ci.yml) roda `npm ci`, `npm run typecheck`, `npm test` e `npm run build` no Node 22 a cada push e pull request.

## Licença

[MIT](LICENSE) © Paulo Henz
