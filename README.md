# Waypost

Waypost é um analytics web auto-hospedado para pageviews, eventos e cliques. O navegador mede a visita com um SDK pequeno, sem cookies e sem serviço de terceiro. Um coletor em Node.js guarda os eventos em SQLite e responde estatísticas simples.

O código é aberto em [paulohenz/waypost](https://github.com/paulohenz/waypost). O pacote npm se chama `waypost-analytics` e o autor é Paulo Henz. Esse nome estava livre no npm quando o repositório foi escrito (`npm view waypost-analytics` não retornava versão). Se ele já estiver ocupado na hora do `npm publish`, alternativas que também estavam livres: `waypost-js`, `waypost-beacon`, `cairn-analytics` e `quietbeacon`.

## Estrutura

```
app/        SDK TypeScript publicável (ESM, CommonJS, script tag, tipos)
backend/    API Node.js: POST /collect e GET /stats/*
example/    Página HTML que usa o SDK contra o coletor local
```

A raiz é um workspace npm privado. Só a pasta `app/` vai para o npm.

## Requisitos

- Node.js 22 ou mais recente. O coletor usa o SQLite embutido em `node:sqlite`.
- npm 10.

`node:sqlite` ainda é experimental. Ao subir o backend, o Node pode imprimir um `ExperimentalWarning`. O arquivo gerado é um SQLite comum.

## Rodar o backend localmente

```bash
npm install
npm run dev
```

Isso compila o SDK e sobe o coletor em [http://127.0.0.1:3921](http://127.0.0.1:3921). A raiz `/` é a página de exemplo: ela carrega `/waypost.js`, envia pageviews, cliques e um evento personalizado para `POST /collect`, e lê as estatísticas do site `demo`.

Para deixar o processo no ar depois do build, sem o modo watch:

```bash
npm start
```

Variáveis de ambiente (todas opcionais):

| Variável | Padrão | Uso |
| --- | --- | --- |
| `PORT` | `3921` | Porta HTTP |
| `HOST` | `0.0.0.0` | Interface |
| `DATABASE_PATH` | `data/waypost.sqlite` | Arquivo SQLite, relativo à pasta `backend/` |
| `INGEST_TOKEN` | vazio | Se definida, o JSON do `POST /collect` precisa trazer o mesmo `token` |

O coletor não grava endereço IP. Não há autenticação nas rotas de estatística: em produção, deixe a API atrás da rede que você controla. O token de ingestão, quando usado, viaja no corpo do JSON porque `sendBeacon` não consegue definir cabeçalhos.

### Endpoints

`POST /collect` aceita um lote:

```json
{
  "siteId": "demo",
  "events": [
    {
      "type": "pageview",
      "name": "pageview",
      "visitorId": "6f1c1a2e-3b4d-4e5f-8a90-1b2c3d4e5f60",
      "sessionId": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
      "timestamp": 1760810400000,
      "url": "https://exemplo.com/cadernos",
      "path": "/cadernos",
      "referrer": "https://news.example/story",
      "title": "Cadernos",
      "screenWidth": 1440,
      "screenHeight": 900,
      "language": "pt-BR",
      "utm": { "source": "news" }
    }
  ]
}
```

O corpo pode ser `text/plain` ou `application/json`. O SDK envia `text/plain` de propósito, para o navegador não fazer preflight. A resposta de sucesso é `204`. Lote inválido volta `400`. Corpo acima de 64 KB volta `413`.

CORS está aberto (`Access-Control-Allow-Origin: *`) para o site medido poder ficar em outra origem.

Estatísticas (intervalo padrão: últimos 30 dias; `from` e `to` em `YYYY-MM-DD` ou ISO-8601; data sem hora é um dia UTC, e `to` inclui o dia inteiro):

| Rota | O que devolve |
| --- | --- |
| `GET /stats/timeseries?siteId=demo&interval=day` | Pageviews e visitantes únicos por hora ou dia, mais o total do período (visitantes únicos no período, não a soma dos baldes) |
| `GET /stats/pages?siteId=demo&limit=10` | Páginas mais vistas |
| `GET /stats/referrers?siteId=demo` | Hosts de referência externos (pageviews) |
| `GET /stats/events?siteId=demo` | Eventos personalizados e cliques |
| `GET /health` | `{ "ok": true }` |

`interval` aceita `hour` ou `day`. `limit` vai de 1 a 100.

## Usar o SDK

O guia completo da API, em inglês, está em [`app/README.md`](app/README.md). Resumo:

### npm

```bash
npm install waypost-analytics
```

```ts
import { init, track } from 'waypost-analytics';

init({
  endpoint: 'http://127.0.0.1:3921/collect',
  siteId: 'meu-site',
  autoClicks: true,
});

track('newsletter', { origem: 'rodape' });
```

`autoClicks: true` registra elementos com `data-track="nome-do-evento"` e também cliques em links. Pageviews de SPA (`pushState`, `replaceState`, `popstate`, `hashchange`) saem sozinhos. O id de visitante fica em `localStorage` (`waypost_vid`); o de sessão, em `sessionStorage`, e expira depois de 30 minutos sem atividade. Do Not Track e Global Privacy Control desligam a coleta, a menos que você passe `respectDoNotTrack: false`.

### Script tag

Publique o arquivo `app/dist/waypost.js` (cerca de 4 KB gzipados) e aponte a página para ele:

```html
<script
  src="https://analytics.example.com/waypost.js"
  data-endpoint="https://analytics.example.com/collect"
  data-site="meu-site"
  data-auto-clicks="true"
  defer
></script>
```

No exemplo local o backend já serve esse arquivo em `/waypost.js`. Depois do carregamento, `waypost.track(nome, props)` e `waypost.flush()` ficam no `window`.

## Scripts

| Comando | Efeito |
| --- | --- |
| `npm test` | Testes do SDK e dos endpoints |
| `npm run typecheck` | `tsc --noEmit` nos dois pacotes |
| `npm run build` | SDK (ESM, CJS, IIFE, tipos) e backend |
| `npm run dev` | Compila o SDK e sobe a API em modo watch |
| `npm start` | Compila tudo e sobe a API com `node` |

Se você alterar o SDK com o servidor já no ar, rode `npm run build -w waypost-analytics` e recarregue a página. O coletor lê `app/dist/waypost.js` a cada request.

## Testes

```bash
npm test
```

O SDK cobre fila, `sendBeacon` com fallback de `fetch`, ids, UTM, Do Not Track, pageviews de SPA e cliques. O backend cobre validação, CORS, token opcional e as agregações (incluindo visitante único no período, que não é a soma dos dias).

O workflow em `.github/workflows/ci.yml` roda `npm ci`, `npm run typecheck`, `npm test` e `npm run build` no Node 22 a cada push e pull request. Como contribuir está em [CONTRIBUTING.md](CONTRIBUTING.md).

## Publicar o pacote no npm

Não publique a raiz: o `package.json` da raiz é `private`. Entre em `app/` e confira o tarball antes:

```bash
cd app
npm pack --dry-run
```

O pacote deve listar só `package.json`, `README.md`, `LICENSE`, `CHANGELOG.md` e `dist/` (JavaScript, tipos e o script tag). Código-fonte e testes ficam de fora por causa do campo `files`.

`prepublishOnly` executa `npm run build && npm run test`, então `npm publish` recompila e testa antes de enviar.

```bash
cd app
npm login
npm publish --access public
```

O pacote não tem dependências de runtime. `author`, `repository`, `homepage` e `bugs` já apontam para Paulo Henz e para `https://github.com/paulohenz/waypost`. Este repositório não publica sozinho.

## Trocar SQLite por Postgres

O HTTP depende da interface `AnalyticsStore` (`backend/src/types.ts`): `insertEvents`, `timeseries`, `topPages`, `topReferrers`, `topEvents` e `close`. A implementação atual é `createSqliteStore` (`backend/src/sqlite-store.ts`), escolhida em `openStore()`.

Se `DATABASE_URL` começar com `postgres://` ou `postgresql://`, o processo recusa subir e aponta para essa interface. Para usar Postgres, implemente `AnalyticsStore` com o driver que preferir e construa esse objeto em `openStore()`. O formato da tabela `events` está no `CREATE TABLE` do store SQLite e pode ser traduzido para o outro banco sem mudar as rotas.

## Privacidade

O SDK não grava cookies. Com Do Not Track ou Global Privacy Control, `init` não cria id e não envia nada. O backend não persiste IP. Detalhes do que vai no lote, e o aviso de que o navegador pode anexar cookies já existentes da origem do coletor ao `sendBeacon`, estão no README do pacote.

## Licença

[MIT](LICENSE)
