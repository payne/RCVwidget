# Session Log: Ranked-Choice Voting Widget

**Date:** 2026-11-21
**Project folder:** `/home/mpayne/git/RCVwidget`
**Live site:** https://elections.appfarms.org

This file records the whole session: the original question, the design answer, the follow-up request, what was built and deployed, how it was tested, and the open caveats. Source code lives in the project files listed in [Files](#files) and is not copied here.

---

## 1. First request

> How would you create a rank choice voting widget that could be embedded in other web pages easily? When embedding the widget one can specifies attributes of the elections. Election data is stored on CloudFlare using services in their free tier. Localstorage may be used to know if that browser has voted before.

### Design answer (summary)

**Embedding.** Use a Web Component loaded by one script tag, with the election defined by attributes:

```html
<script type="module" src="https://rcv.example.workers.dev/widget.js"></script>
<rcv-election election-id="board-2026" title="Board Chair 2026"
  candidates="Alice Chen|Bob Ruiz|Carla Diaz|Dev Patel" seats="1"
  closes="2026-12-31T23:59:00Z" results="after-vote" theme="auto"></rcv-election>
```

- Shadow DOM keeps the widget's styles and the host page's styles apart. Theming goes through CSS custom properties and `::part()`.
- The ballot is a list the voter reorders by dragging, with up/down buttons and keyboard support. Voters can leave candidates unranked.
- An iframe version is a fallback for hosts that block third-party scripts.

**Cloudflare free tier.**

| Need | Service | Why |
|---|---|---|
| Serve the widget and API | Workers with static assets | 100k requests/day free |
| Store elections and ballots | D1 (SQLite) | 100k writes/day and strongly consistent. KV is a poor fit: 1k writes/day and eventually consistent |
| Bot protection | Turnstile | Free (later dropped, see section 3) |
| Cache results | Cache API | Avoids recounting on every view |

**Main design decision: attributes are public, so they can be tampered with.** The first registration of an election id stores its config. Later embeds must match it (compared by hash). Ballots are always checked against the stored config. Optional hardening: signed configs or an origin allowlist.

**localStorage.** Keep a random voter UUID and a "voted" flag per election. The server makes `(election_id, voter_token)` unique. This only stops honest repeat voting: clearing storage or opening a private window gets around it. Storage belongs to the host page's origin, so the same election embedded on two sites allows one vote per site.

**Counting.** Instant runoff for one seat. Single transferable vote (STV) could be added for more seats.

---

## 2. Second request

> yes, build this using my appfarms.org on cloudflare. I prefer the web component embed type. Support elections with seats > 1 or with just one seat. The web component should be able to be used for many different domains -- even those that I do not own. Create a elections.AppFarms.org site where the results of elections can be viewed and the evolutoin of the election can be animated in a way that helps people understand things. Include links to references and explain like I am 5 sections, an explain like I am a teenager, and a explain like I am a college student. These explain sections should be collapsable.

---

## 3. Decisions made while building

| Topic | Decision | Reason |
|---|---|---|
| Hosting | One Worker serves the API (`/api/*`) and static files from `public/`, on the custom domain `elections.appfarms.org` | Single deploy, free tier |
| Storage | D1 database `rcv-elections` | Strong consistency and enough free writes for ballots |
| Widget script | Classic script with no dependencies (`widget.js`), not an ES module | Loading a module from another domain needs extra CORS setup. A classic script works anywhere. `_headers` still sets CORS on it |
| Any-domain support | API sends `Access-Control-Allow-Origin: *` and uses no cookies or credentials | The widget must work on sites you don't own |
| Turnstile | **Not used** | The free tier only works on a short list of approved hostnames, which conflicts with "any domain" |
| Abuse limits | Per-election, per-network rate limit (default 30 ballots/hour) keyed by a salted SHA-256 hash of the IP address. The salt is the `IP_SALT` secret | Works without hostname restrictions. Raw IPs are never stored |
| Config locking | First `sync` stores the normalized config. Others must match its SHA-256 or get a `409 config_mismatch` | Prevents someone from swapping candidates by editing HTML |
| One seat | Instant runoff. The winning target is a majority of **continuing** (non-exhausted) ballots: ⌊C/2⌋+1 | Standard instant-runoff rule |
| More seats | STV with the Droop quota ⌊V/(S+1)⌋+1, fixed at round 1. Surplus transfers use the Gregory method (every ballot moves on at weight × surplus/votes). Surpluses of candidates elected in the same round move together | Common, explainable, and works well in an animation |
| Ties | Backwards tie-break (fewer votes in the most recent earlier round where they differed). If tied in every round, a draw seeded by the election id, so recounts give the same answer | Deterministic |
| Shared counting code | `public/js/tabulate.js` is imported by the Worker and by the browser (for the sample counts) | One source of truth |
| Candidate order | Shuffled per voter by default (stable per browser). `shuffle="false"` turns it off | Reduces bias from ballot position |
| Election directory | Public list on the home page. `unlisted="true"` hides an election | Elections are created by strangers' embeds |
| Sample counts | `/election?demo=irv` and `/election?demo=stv`, counted in the browser | Teach the method without database data |

---

## 4. What was built

### Widget: `<rcv-election>`

```html
<script src="https://elections.appfarms.org/widget.js" defer></script>
<rcv-election
  election-id="example-com-board-2026"
  title="Board of Directors 2026"
  description="Choose three directors."
  candidates="Alice Chen|Bob Ruiz|Carla Diaz|Dev Patel|Erin Wu"
  seats="3"
  closes="2026-12-31T23:59:00Z">
</rcv-election>
```

| Attribute | Meaning |
|---|---|
| `election-id` (required) | Unique, lowercase, 3–80 characters `[a-z0-9._-]`. Ids are global, so prefix them with your domain |
| `title` (required) | Ballot heading |
| `candidates` (required) | Separated by `\|`, or a JSON array. 2–40 candidates |
| `seats` | Number of winners. Default 1 (instant runoff). More than 1 uses STV |
| `description` | Text under the title |
| `opens`, `closes` | ISO 8601 date-times |
| `live-results` | `true` (default) shows results while voting is open. `false` hides them until `closes` |
| `unlisted` | `true` hides the election from the public directory |
| `shuffle` | `false` shows candidates in the given order |
| `theme` | `auto` (default), `light` or `dark` |
| `api` | Override the API origin (defaults to the origin the script was loaded from) |

- **Styling:** `--rcv-accent`, `--rcv-accent-fg`, `--rcv-bg`, `--rcv-fg`, `--rcv-muted`, `--rcv-border`, `--rcv-soft`, `--rcv-good`, `--rcv-bad`, `--rcv-radius`, `--rcv-font`. Parts: `card`, `submit`, `candidate`, `ranked-item`.
- **Events:** `rcv-voted` (`detail.electionId`, `detail.ranking`) and `rcv-error` (`detail.message`).
- **Ballot UI:** tap candidates to add them in order. Drag to reorder with a mouse, or use the ↑ ↓ ✕ buttons (touch and keyboard). Focus stays on the moved item, and screen readers hear position changes through a live region.
- **After voting:** the widget shows a receipt of your ranking, current or final results (final-round bars) and a link to the animated results page.
- **localStorage key:** `rcv:v1:<api origin>:<election id>`, value `{token, voted, ranking, votedAt}`. All access is wrapped in try/catch. If storage is blocked, the widget says it can't remember the vote.

### API (`src/worker.js`)

| Method and path | Purpose |
|---|---|
| `POST /api/elections/:id/sync` | Body `{config}`. Registers the election on first use, otherwise checks the config hash. Returns election, status, ballot count and whether results are visible |
| `GET /api/elections/:id` | Election info |
| `POST /api/elections/:id/ballots` | Body `{voterToken, ranking}`. Checks the election is open, the token is a UUID, and the ranking is non-empty, has no repeats and only known candidates. Applies the rate limit. Errors: `not_open`, `closed`, `already_voted` (409), `rate_limited` (429) |
| `GET /api/elections/:id/results` | Groups identical rankings, runs the count, caches for 15 s. Leaves out the count when results are hidden |
| `GET /api/elections?q=&limit=` | Directory of listed elections, newest first |

Status is `upcoming`, `open` or `closed`, based on `opens` and `closes`. Results are visible when `liveResults` is true or the election is closed.

### Database (`migrations/0001_init.sql`)

- `elections(id PK, config_json, config_hash, home_origin, unlisted, created_at)`
- `ballots(election_id, voter_token, ranking_json, ip_hash, origin, cast_at, PK(election_id, voter_token))`
- Index on `ballots(election_id, ip_hash, cast_at)` for the rate limit.

### Counting engine (`public/js/tabulate.js`)

`tabulate({candidates, seats, ballots, tieSeed})` returns `{method, seats, totalValid, quota, winners, rounds, candidates}`. Each round records:

- `tallies`, `exhausted`, `quota`, and `status` at the start of the round
- `action` (`elected` or `eliminated`) and `reason` (`quota`, `remaining` or `lowest`)
- `elected`, `eliminated`, `surplus` (`{surplus, factor}` per elected candidate) and `tieBreak`
- `transfers`: `{from, to, votes}`, where `to = null` means exhausted. The animation uses these.

Each round runs these steps in order:
1. If the continuing candidates are no more than the seats left, elect them all.
2. Otherwise, elect everyone at or above the quota and transfer their surpluses.
3. Otherwise, eliminate the lowest candidate and transfer their ballots at full weight.

### Results site

- **`/` (home):** introduction, buttons for the sample counts, a searchable election directory, embed instructions, the attribute table, notes, a live demo ballot (`appfarms-demo-lunch`) and the explainers.
- **`/election?id=…` (results):**
  - Header with the method, status, ballot count, dates and winners.
  - **Animated count.** Each candidate has a bar split into 1st-choice votes (solid) and transferred votes (striped). A dashed line marks the quota or majority. An exhausted row appears when needed.
  - **Steps.** Each round has a *Counting* step and a *Decision* step. Elected candidates pulse green and eliminated ones pulse red. Between rounds, dots (each worth a set number of votes) fly from the source bar to their destinations while the bars resize.
  - **Narration** in plain language, including surplus fractions (for example, "9 ÷ 40 ≈ 0.225 of a vote"), tie-break explanations and a list of transfers.
  - **Controls:** restart, back, play/pause/replay, next, speed (0.5×–4×), round buttons and arrow keys. Playback starts when the chart scrolls into view, and motion is skipped if the reader prefers reduced motion.
  - A round-by-round table for readers who can't use the animation.
- **`<rcv-learn>` (`public/js/learn.js`):** collapsible `<details>` sections:
  - **ELI5:** choosing a class snack. Piles of papers, more than half wins, smallest pile is out and papers move. Extra papers slide over when choosing several snacks.
  - **Teenager:** the spoiler effect, instant runoff, exhausted ballots, why the quota works (4 × 31 > 120) and fractional surplus (9/40 = 0.225). Ranking a backup can't hurt your favorite.
  - **College:** formal definitions and quota formulas, the exact algorithm used here (Gregory method, simultaneous surpluses, backwards tie-break, seeded draw), differences from Scottish, Meek and Warren STV, and properties: later-no-harm ✓, majority ✓, Condorcet ✗ (center squeeze), monotonicity ✗, proportionality for solid coalitions, Arrow's theorem. Also a note that online polls are not secure elections.
  - **References:** Wikipedia (Ranked voting, Instant-runoff voting, Single transferable vote, Counting single transferable votes, Droop quota, Spoiler effect, Monotonicity criterion, Later-no-harm criterion, Condorcet winner criterion, Arrow's impossibility theorem), Electowiki (instant runoff, STV), FairVote, the Ranked Choice Voting Resource Center, Ballotpedia and the Electoral Reform Society.
- Light and dark themes, a layout that works on phones, a favicon and a 404 page.

### Sample elections (`public/js/demos.js`)

- **Favorite Ice Cream (1 seat, 100 ballots).** Chocolate leads round 1 with 30 but loses. Strawberry is eliminated and goes to Vanilla (45). Mint is eliminated: 15 go to Chocolate, 6 go to Vanilla and 4 are exhausted. Vanilla wins 51–45, with a majority of 49 out of 96 continuing ballots.
- **Student Council (3 seats, 120 ballots, quota 31).** Ava is elected with 40, and a surplus of 9 moves to Ben. Finn is eliminated and goes to Eve (30). Dan is eliminated and goes to Cara (38, elected). Cara's surplus of 7 moves at 7/38: Eve gets about 3.32, and the rest is exhausted. Eve is elected with 33.32. Winners: Ava, Cara, Eve.

---

## 5. Files

| Path | Purpose |
|---|---|
| `wrangler.jsonc` | Worker `rcv-elections`, custom domain `elections.appfarms.org`, assets, D1 binding (`database_id` `bae67ce2-1e2e-4096-b259-18ef76627bfa`), settings `RATE_LIMIT_PER_HOUR=30` and `RESULTS_CACHE_SECONDS=15` |
| `package.json` | Scripts: `test`, `dev`, `db:migrate:local`, `db:migrate:remote`, `deploy`. Dev dependency: wrangler 4.166.0 |
| `src/worker.js` | API and routing to static assets |
| `migrations/0001_init.sql` | D1 schema |
| `public/widget.js` | The `<rcv-election>` web component |
| `public/js/tabulate.js` | Counting engine (instant runoff and STV) |
| `public/js/demos.js` | Sample elections |
| `public/js/results.js` | Results page, animation, narration and table |
| `public/js/learn.js` | `<rcv-learn>` explainers and references |
| `public/css/site.css` | Site styles and animation styles |
| `public/index.html` | Home, directory and embed docs |
| `public/election.html` | Results page |
| `public/404.html`, `public/favicon.svg` | Not-found page and icon |
| `public/_headers` | CORS and caching for `/widget.js` |
| `test/tabulate.test.js` | 8 counting tests (`node --test`) |
| `docs/index.html` | GitHub Pages page with four sample embedded elections (see section 9) |
| `docs/.nojekyll` | Makes GitHub Pages serve `docs/` as is, without Jekyll |
| `README.md` | Development, deploy and admin notes |
| `.gitignore`, `.dev.vars` | Ignore rules. `.dev.vars` holds a local-only `IP_SALT` and is ignored by git |

---

## 6. Testing

**Unit tests (`npm test`): 8 of 8 pass.** They cover:
- both sample elections, checking winners, rounds, quota, surplus and transfers
- votes adding up to the same total every round
- an outright majority winning in round 1
- the backwards tie-break and the seeded draw (including repeatability)
- the "remaining candidates fill remaining seats" rule
- empty and invalid ballots

One test first failed because the test data itself was wrong (A already had a majority). The data was fixed. The engine was not changed.

**Local API checks (wrangler dev and curl), all as expected:**
- registration
- 409 on a config mismatch
- 7 ballots accepted (201)
- duplicate token rejected (409 `already_voted`)
- unknown candidate rejected (400)
- STV results correct
- directory search and the recorded `home_origin`
- CORS header on `widget.js`
- page status codes: 200, 200, 404

**Browser checks (Chrome):**
- The widget embedded on a page served from another origin (`127.0.0.1:8788`) loaded and registered the election. Voting through the interface worked (add, reorder, submit), localStorage was updated and results appeared. The host page's `--rcv-accent` override applied.
- The STV sample animated correctly: elected and out badges, striped transferred segments, quota line, narration, 18 dots in flight for the Dan → Cara transfer and cleaned up afterwards, and the round table.
- **Bug found and fixed:** `results.js` called `main()` before the `CountPlayer` class was defined. The sample path had no `await`, so it threw "Cannot access 'CountPlayer' before initialization". The call moved to the end of the module.

**Production checks:**
- All pages, `/api/elections` and `widget.js` (with CORS) returned 200, and an unknown path returned 404.
- A full register, vote and results cycle with an unlisted election `zz-smoketest-delete-me`, sent with a third-party `Origin` header. Its rows were then deleted with `wrangler d1 execute`.
- The 1-seat sample animated on the live site.

---

## 7. Deployment (done in this session)

```sh
npx wrangler d1 create rcv-elections                       # region WNAM
# database_id written into wrangler.jsonc
npx wrangler d1 migrations apply rcv-elections --remote
npx wrangler deploy                                         # custom domain elections.appfarms.org
openssl rand -hex 32 | npx wrangler secret put IP_SALT
```

Deployed version ID: `b441af35-f25b-4b96-8ae4-a399c912c3bc`. Local dev and test servers were stopped afterwards, and the browser test tab was closed.

### Everyday commands

```sh
npm install
npm run db:migrate:local
npm run dev                 # http://127.0.0.1:8787
npm test
npm run deploy
npm run db:migrate:remote   # after adding a new migrations/000N_*.sql
```

To delete an election:

```sh
npx wrangler d1 execute rcv-elections --remote --command \
  "DELETE FROM ballots WHERE election_id='ID'; DELETE FROM elections WHERE id='ID';"
```

---

## 8. Caveats and open items

- **Polls, not secure elections.** localStorage plus a per-network rate limit stops casual repeat votes only. Clearing storage, private windows or other browsers get around it. Shared networks such as schools or offices may hit the 30/hour limit; raise `RATE_LIMIT_PER_HOUR` if needed.
- **The vote record is per host site.** The same election embedded on two sites allows one vote per site per browser.
- **Election ids are first come, first served.** Anyone can claim an unused id, so tell embedders to prefix ids with their domain.
- **Settings can't be edited.** Changing any setting, even fixing a typo, needs a new `election-id`.
- **The home page demo ballot** (`appfarms-demo-lunch`) writes real ballots to the production database.
- **No admin UI.** Moderation is done through D1 commands.
- **Minor:** clicking a round button while dots are in flight is ignored until the transfer finishes.
- **Git:** the project is on GitHub at `payne/RCVwidget` (branch `main`).
- **Sample election settings in `docs/` lock on first page load.** Edit them before the page is first opened, or change the `election-id` too.
- **Possible next steps:** signed configs or an origin allowlist per election, an admin page for unlisting or deleting elections, an iframe fallback, sorting or pagination for the directory, and live auto-refresh of results while voting is open.

---

## 9. Third request: GitHub Pages samples

> Create a docs folder with four sample elections. I'll use this with github pages serving from the docs folder on the main branch.

Added `docs/index.html`, a standalone page that loads `https://elections.appfarms.org/widget.js` and embeds four live elections. Each one has a collapsible "Embed code" snippet. Also added `docs/.nojekyll`.

| # | `election-id` | Title | What it shows |
|---|---|---|---|
| 1 | `rcvwidget-sample-pizza-topping` | Best pizza topping | One seat (instant runoff), live results |
| 2 | `rcvwidget-sample-book-club-2027` | Book club: three picks for 2027 | Three seats (STV), 8 candidates |
| 3 | `rcvwidget-sample-team-offsite` | Spring team offsite location | `closes="2027-03-31T23:59:00Z"` and `live-results="false"`: results stay hidden until voting closes |
| 4 | `rcvwidget-sample-community-garden` | Community garden: two new beds | Two seats, `shuffle="false"`, JSON candidates (one name contains `\|`), restyled with `--rcv-*` variables and `::part(submit)` |

- Before publishing, `GET /api/elections/<id>/results` returned 404 for all four ids, so none were taken. The configs pass the `normalizeConfig` checks in `src/worker.js`.
- The page follows the visitor's light or dark setting and works at phone width.
- **To publish:** in the repo go to Settings → Pages → Deploy from a branch → `main` / `/docs`.

