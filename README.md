# RCV Widget: elections.appfarms.org

An embeddable ranked-choice voting widget (`<rcv-election>`) and a results site that animates the count round by round.
Runs on Cloudflare's free tier: one Worker (API plus static assets) and one D1 database.

- **Live site:** https://elections.appfarms.org
- **Sample counts:** `/election?demo=irv` (1 seat) and `/election?demo=stv` (3 seats)
- **Results for an election:** `/election?id=<election-id>`

## Embed

```html
<script src="https://elections.appfarms.org/widget.js" defer></script>
<rcv-election election-id="example-com-board-2026" title="Board 2026"
  candidates="Alice|Bob|Carla|Dev" seats="2" closes="2026-12-31T23:59:00Z"></rcv-election>
```

See the home page for the full list of attributes, CSS variables, `::part`s and events.

## Layout

| Path | Purpose |
|---|---|
| `src/worker.js` | API: `POST /api/elections/:id/sync`, `POST …/ballots`, `GET …/results`, `GET /api/elections` |
| `public/js/tabulate.js` | IRV (1 seat) and STV (Droop quota, Gregory surplus transfers). Shared by the Worker and the browser |
| `public/widget.js` | The `<rcv-election>` web component (classic script, Shadow DOM, no dependencies) |
| `public/js/results.js` | Results page: animated bar chart, flying ballot dots, narration, round table |
| `public/js/learn.js` | `<rcv-learn>`: collapsible ELI5, teen and college explainers plus references |
| `migrations/` | D1 schema |
| `test/` | Tabulation tests (`npm test`) |

## How it works

- **Settings lock on first use.** The first `sync` for an id stores the config. Later embeds must send an identical config (compared by SHA-256), or they get a 409 error.
- **One vote per browser.** A random UUID is kept in the host page's localStorage, and `(election_id, voter_token)` is the primary key.
  The widget is a poll, not a secure election. A per-network rate limit (`RATE_LIMIT_PER_HOUR`, default 30) uses a salted IP hash; the salt is the `IP_SALT` secret.
- **CORS is `*`.** The widget works on any domain, and no credentials are used.
- **Results are cached** for `RESULTS_CACHE_SECONDS` (15) with the Cache API.

## Develop and deploy

```sh
npm install
echo 'IP_SALT=dev' > .dev.vars
npm run db:migrate:local
npm run dev            # http://127.0.0.1:8787
npm test
npm run deploy         # → elections.appfarms.org
```

New schema changes go in a new numbered file under `migrations/`. Then run `npm run db:migrate:remote`.

## Admin

There is no admin UI. Use D1 directly, for example to remove an election:

```sh
npx wrangler d1 execute rcv-elections --remote --command \
  "DELETE FROM ballots WHERE election_id='ID'; DELETE FROM elections WHERE id='ID';"
```
