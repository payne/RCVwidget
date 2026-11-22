/*!
 * <rcv-election> — embeddable ranked-choice voting widget
 * https://elections.appfarms.org
 *
 * Usage:
 *   <script src="https://elections.appfarms.org/widget.js" defer></script>
 *   <rcv-election election-id="my-org-board-2026" title="Board election"
 *                 candidates="Alice|Bob|Carla" seats="1"></rcv-election>
 */
(() => {
  if (customElements.get('rcv-election')) return;

  const SCRIPT_ORIGIN = (() => {
    try {
      return new URL(document.currentScript.src).origin;
    } catch {
      return 'https://elections.appfarms.org';
    }
  })();

  const STYLE = `
    :host {
      --rcv-accent: #2457d6; --rcv-accent-fg: #fff; --rcv-bg: #fff; --rcv-fg: #1c2230;
      --rcv-muted: #5d6677; --rcv-border: #d9dde5; --rcv-soft: #f3f5f9; --rcv-good: #1f8a4c;
      --rcv-bad: #b4232c; --rcv-radius: 12px;
      --rcv-font: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      display: block; max-width: 560px; font-family: var(--rcv-font); color: var(--rcv-fg);
      line-height: 1.4;
    }
    @media (prefers-color-scheme: dark) {
      :host(:not([theme="light"])) {
        --rcv-accent: #7aa2ff; --rcv-accent-fg: #0b1020; --rcv-bg: #171b24; --rcv-fg: #e8ebf2;
        --rcv-muted: #9aa3b5; --rcv-border: #2e3544; --rcv-soft: #212734; --rcv-good: #4cc282;
        --rcv-bad: #ff7b84;
      }
    }
    :host([theme="dark"]) {
      --rcv-accent: #7aa2ff; --rcv-accent-fg: #0b1020; --rcv-bg: #171b24; --rcv-fg: #e8ebf2;
      --rcv-muted: #9aa3b5; --rcv-border: #2e3544; --rcv-soft: #212734; --rcv-good: #4cc282;
      --rcv-bad: #ff7b84;
    }
    * { box-sizing: border-box; }
    .card { background: var(--rcv-bg); border: 1px solid var(--rcv-border); border-radius: var(--rcv-radius); padding: 18px; }
    h3 { margin: 0 0 4px; font-size: 1.15rem; }
    p { margin: 0 0 10px; }
    .muted { color: var(--rcv-muted); font-size: .88rem; }
    .label { font-size: .78rem; text-transform: uppercase; letter-spacing: .05em; color: var(--rcv-muted); margin: 14px 0 6px; font-weight: 600; }
    ol, ul { list-style: none; margin: 0; padding: 0; }
    .ranked li {
      display: flex; align-items: center; gap: 8px; padding: 8px 8px 8px 6px; margin-bottom: 6px;
      border: 1px solid var(--rcv-border); border-radius: 8px; background: var(--rcv-soft); cursor: grab;
    }
    .ranked li.dragging { opacity: .4; }
    .ranked li.over { border-color: var(--rcv-accent); box-shadow: 0 -3px 0 var(--rcv-accent); }
    .handle { color: var(--rcv-muted); user-select: none; font-size: 1.1rem; width: 14px; text-align: center; }
    .rank { flex: none; width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center;
      background: var(--rcv-accent); color: var(--rcv-accent-fg); font-weight: 700; font-size: .85rem; }
    .name { flex: 1; min-width: 0; overflow-wrap: anywhere; }
    .empty { padding: 12px; border: 1px dashed var(--rcv-border); border-radius: 8px; color: var(--rcv-muted); font-size: .9rem; text-align: center; }
    button { font: inherit; color: inherit; cursor: pointer; }
    .icon { border: 1px solid var(--rcv-border); background: var(--rcv-bg); border-radius: 6px; width: 30px; height: 30px; padding: 0; line-height: 1; }
    .icon:disabled { opacity: .35; cursor: default; }
    .pool { display: flex; flex-wrap: wrap; gap: 6px; }
    .pool button { border: 1px solid var(--rcv-border); background: var(--rcv-bg); border-radius: 999px; padding: 6px 12px; }
    .pool button:hover, .icon:hover:not(:disabled) { border-color: var(--rcv-accent); }
    .actions { display: flex; align-items: center; gap: 12px; margin-top: 16px; flex-wrap: wrap; }
    .primary { background: var(--rcv-accent); color: var(--rcv-accent-fg); border: 0; border-radius: 8px; padding: 10px 18px; font-weight: 600; }
    .primary:disabled { opacity: .5; cursor: default; }
    .link { background: none; border: 0; padding: 0; color: var(--rcv-accent); text-decoration: underline; }
    a { color: var(--rcv-accent); }
    :focus-visible { outline: 2px solid var(--rcv-accent); outline-offset: 2px; }
    .error { color: var(--rcv-bad); font-size: .9rem; margin-top: 10px; }
    .notice { background: var(--rcv-soft); border-radius: 8px; padding: 10px 12px; margin: 10px 0; }
    .bars li { display: grid; grid-template-columns: minmax(70px, 34%) 1fr auto; gap: 8px; align-items: center; margin: 5px 0; font-size: .9rem; }
    .bar { height: 12px; background: var(--rcv-soft); border-radius: 6px; overflow: hidden; }
    .bar span { display: block; height: 100%; background: var(--rcv-muted); border-radius: 6px; }
    .bars li.won .bar span { background: var(--rcv-good); }
    .bars li.won .who { font-weight: 700; }
    .num { font-variant-numeric: tabular-nums; color: var(--rcv-muted); font-size: .85rem; }
    .receipt { counter-reset: r; }
    .receipt li { counter-increment: r; font-size: .9rem; }
    .receipt li::before { content: counter(r) ". "; color: var(--rcv-muted); }
    footer { margin-top: 14px; font-size: .75rem; color: var(--rcv-muted); display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
    .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  `;

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
  const ordinal = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 >> 3) ^ 1 && n % 10] || 'th');

  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }

  const store = {
    get(key) {
      try {
        return JSON.parse(localStorage.getItem(key));
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch {
        return false;
      }
    },
  };

  class RcvElection extends HTMLElement {
    static get observedAttributes() {
      return ['election-id', 'title', 'description', 'candidates', 'seats', 'opens', 'closes', 'live-results', 'unlisted', 'api'];
    }

    constructor() {
      super();
      this.root = this.attachShadow({ mode: 'open' });
      this.ranking = [];
      this.view = 'loading';
      this.error = '';
    }

    connectedCallback() {
      this.scheduleInit();
    }

    attributeChangedCallback() {
      if (this.isConnected) this.scheduleInit();
    }

    scheduleInit() {
      if (this._pending) return;
      this._pending = true;
      queueMicrotask(() => {
        this._pending = false;
        this.init();
      });
    }

    get api() {
      return (this.getAttribute('api') || SCRIPT_ORIGIN).replace(/\/$/, '');
    }

    get electionId() {
      return (this.getAttribute('election-id') || '').trim().toLowerCase();
    }

    get resultsUrl() {
      return `${this.api}/election?id=${encodeURIComponent(this.electionId)}`;
    }

    readConfig() {
      const raw = (this.getAttribute('candidates') || '').trim();
      let candidates;
      if (raw.startsWith('[')) {
        try {
          candidates = JSON.parse(raw);
        } catch {
          candidates = [];
        }
      } else {
        candidates = raw.split('|');
      }
      const bool = (name, dflt) => {
        const v = this.getAttribute(name);
        return v == null ? dflt : v !== 'false';
      };
      return {
        title: this.getAttribute('title') || '',
        description: this.getAttribute('description') || '',
        candidates: candidates.map((c) => String(c).trim()).filter(Boolean),
        seats: Number.parseInt(this.getAttribute('seats') || '1', 10),
        opens: this.getAttribute('opens') || null,
        closes: this.getAttribute('closes') || null,
        liveResults: bool('live-results', true),
        unlisted: bool('unlisted', false),
      };
    }

    async request(path, opts = {}) {
      const res = await fetch(`${this.api}/api/elections/${encodeURIComponent(this.electionId)}${path}`, {
        ...opts,
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), data, { status: res.status });
      return data;
    }

    async init() {
      const id = this.electionId;
      if (!id) return this.fail('Missing election-id attribute.');
      this.storeKey = `rcv:v1:${this.api}:${id}`;
      this.saved = store.get(this.storeKey) || { token: uuid(), voted: false };
      if (!store.get(this.storeKey)) this.storageOk = store.set(this.storeKey, this.saved);
      else this.storageOk = true;

      this.view = 'loading';
      this.render();
      try {
        const info = await this.request('/sync', { method: 'POST', body: JSON.stringify({ config: this.readConfig() }) });
        this.info = info;
        this.election = info.election;
        if (this.ranking.some((c) => !this.election.candidates.includes(c))) this.ranking = [];
        this.order = this.shuffled(this.election.candidates);
        if (this.saved.voted || info.status !== 'open') await this.showResults();
        else this.view = 'ballot';
      } catch (err) {
        if (err.code === 'config_mismatch') {
          return this.fail(
            `The election "${id}" already exists with different settings, so this ballot can't be shown. ` +
              `If you're the site owner, use a new election-id or match the original settings.`
          );
        }
        return this.fail(err.message || 'Could not reach the election server.');
      }
      this.render();
    }

    shuffled(list) {
      // Randomize display order per voter (stable for this browser) to avoid ballot-order bias.
      if (this.getAttribute('shuffle') === 'false') return [...list];
      const seed = [...this.saved.token].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619), 2166136261);
      let s = seed >>> 0;
      const rand = () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) ^ (s + 0x9e3779b9)) >>> 0) / 4294967296;
      const a = [...list];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }

    fail(msg) {
      this.view = 'error';
      this.error = msg;
      this.render();
      this.dispatchEvent(new CustomEvent('rcv-error', { detail: { message: msg }, bubbles: true, composed: true }));
    }

    async showResults() {
      this.view = 'results';
      try {
        this.results = await this.request('/results');
      } catch {
        this.results = null;
      }
    }

    async submit() {
      if (!this.ranking.length || this.busy) return;
      this.busy = true;
      this.error = '';
      this.render();
      try {
        await this.request('/ballots', {
          method: 'POST',
          body: JSON.stringify({ voterToken: this.saved.token, ranking: this.ranking }),
        });
        this.markVoted(this.ranking);
      } catch (err) {
        if (err.code === 'already_voted') this.markVoted(this.saved.ranking || null);
        else {
          this.error = err.message;
          this.busy = false;
          return this.render();
        }
      }
      this.busy = false;
      this.dispatchEvent(
        new CustomEvent('rcv-voted', { detail: { electionId: this.electionId, ranking: this.ranking }, bubbles: true, composed: true })
      );
      await this.showResults();
      this.render();
    }

    markVoted(ranking) {
      this.saved = { ...this.saved, voted: true, ranking, votedAt: new Date().toISOString() };
      store.set(this.storeKey, this.saved);
    }

    // ------------------------------------------------------------ ranking edits
    act(action, name) {
      const r = this.ranking;
      const i = r.indexOf(name);
      if (action === 'add' && i < 0) r.push(name);
      else if (action === 'remove' && i >= 0) r.splice(i, 1);
      else if (action === 'up' && i > 0) [r[i - 1], r[i]] = [r[i], r[i - 1]];
      else if (action === 'down' && i >= 0 && i < r.length - 1) [r[i + 1], r[i]] = [r[i], r[i + 1]];
      else if (action === 'clear') r.length = 0;
      const pos = r.indexOf(name);
      this.announce(
        action === 'remove' ? `${name} removed from your ranking` : pos >= 0 ? `${name} is now your ${ordinal(pos + 1)} choice` : ''
      );
      this.render({ action, name });
    }

    moveTo(name, index) {
      const r = this.ranking.filter((c) => c !== name);
      r.splice(Math.max(0, Math.min(index, r.length)), 0, name);
      this.ranking = r;
      this.announce(`${name} is now your ${ordinal(r.indexOf(name) + 1)} choice`);
      this.render();
    }

    announce(text) {
      this._announce = text;
    }

    // ------------------------------------------------------------ rendering
    render(focus) {
      const e = this.election;
      const header = e
        ? `<h3>${esc(e.title)}</h3>${e.description ? `<p class="muted">${esc(e.description)}</p>` : ''}`
        : `<h3>${esc(this.getAttribute('title') || 'Ranked-choice ballot')}</h3>`;
      let body = '';
      if (this.view === 'loading') body = `<p class="muted">Loading ballot…</p>`;
      else if (this.view === 'error') body = `<p class="error" role="alert">${esc(this.error)}</p>`;
      else if (this.view === 'ballot') body = this.ballotHtml();
      else if (this.view === 'results') body = this.resultsHtml();

      const footer = e
        ? `<footer><a href="${esc(this.resultsUrl)}" target="_blank" rel="noopener">Results &amp; how the count works ↗</a>
           <span>Ranked-choice voting · elections.appfarms.org</span></footer>`
        : '';
      this.root.innerHTML = `<style>${STYLE}</style><div class="card" part="card">${header}${body}${footer}
        <div class="sr" aria-live="polite">${esc(this._announce || '')}</div></div>`;
      this._announce = '';
      if (this.view === 'ballot') this.wireBallot(focus);
      const again = this.root.querySelector('[data-refresh]');
      if (again) again.addEventListener('click', () => this.showResults().then(() => this.render()));
    }

    ballotHtml() {
      const e = this.election;
      const seatsText =
        e.seats > 1
          ? `${e.seats} seats will be filled.`
          : `One winner.`;
      const closes = e.closes ? ` Voting closes ${new Date(e.closes).toLocaleString()}.` : '';
      const ranked = this.ranking.length
        ? `<ol class="ranked">${this.ranking
            .map(
              (c, i) => `<li draggable="true" data-name="${esc(c)}" part="ranked-item">
                <span class="handle" aria-hidden="true">⋮⋮</span>
                <span class="rank">${i + 1}</span><span class="name">${esc(c)}</span>
                <button class="icon" data-action="up" data-name="${esc(c)}" ${i === 0 ? 'disabled' : ''} aria-label="Move ${esc(c)} up">↑</button>
                <button class="icon" data-action="down" data-name="${esc(c)}" ${i === this.ranking.length - 1 ? 'disabled' : ''} aria-label="Move ${esc(c)} down">↓</button>
                <button class="icon" data-action="remove" data-name="${esc(c)}" aria-label="Remove ${esc(c)}">✕</button>
              </li>`
            )
            .join('')}</ol>`
        : `<div class="empty">Tap a candidate below to make them your 1st choice.</div>`;
      const left = this.order.filter((c) => !this.ranking.includes(c));
      const pool = left.length
        ? `<div class="label">${this.ranking.length ? 'Add your next choice (optional)' : 'Candidates'}</div>
           <div class="pool">${left
             .map((c) => `<button data-action="add" data-name="${esc(c)}" part="candidate">+ ${esc(c)}</button>`)
             .join('')}</div>`
        : '';
      return `<p class="muted">Rank the candidates in the order you prefer. Rank as many or as few as you like. ${seatsText}${closes}</p>
        <div class="label">Your ranking</div>${ranked}${pool}
        <div class="actions">
          <button class="primary" data-submit ${this.ranking.length && !this.busy ? '' : 'disabled'} part="submit">
            ${this.busy ? 'Submitting…' : 'Cast my ballot'}</button>
          ${this.ranking.length ? `<button class="link" data-action="clear">Start over</button>` : ''}
        </div>
        ${this.error ? `<p class="error" role="alert">${esc(this.error)}</p>` : ''}
        ${this.storageOk ? '' : `<p class="muted">Your browser is blocking storage, so this widget can't remember that you voted.</p>`}`;
    }

    resultsHtml() {
      const r = this.results;
      const info = r || this.info;
      let intro = '';
      if (this.saved.voted) {
        const mine = this.saved.ranking;
        intro = `<div class="notice"><strong>Thanks, your ballot was counted.</strong>
          ${mine && mine.length ? `<div class="label">Your ranking</div><ol class="receipt">${mine.map((c) => `<li>${esc(c)}</li>`).join('')}</ol>` : ''}</div>`;
      } else if (info.status === 'upcoming') {
        intro = `<div class="notice">Voting opens ${esc(new Date(this.election.opens).toLocaleString())}.</div>`;
      } else if (info.status === 'closed') {
        intro = `<div class="notice">Voting has closed.</div>`;
      }
      if (!r) return intro + `<p class="muted">Results are unavailable right now.</p>`;
      if (!r.resultsVisible) {
        return intro + `<p class="muted">Results will be shown after voting closes${this.election.closes ? ` (${esc(new Date(this.election.closes).toLocaleString())})` : ''}.</p>`;
      }
      const res = r.result;
      if (!res || !res.rounds.length) return intro + `<p class="muted">No ballots have been cast yet.</p>`;
      const last = res.rounds[res.rounds.length - 1];
      const max = Math.max(...Object.values(last.tallies), last.quota || 0, 1);
      const rows = res.candidates
        .map((c) => ({ c, v: last.tallies[c], won: res.winners.includes(c), out: last.status[c] === 'eliminated' }))
        .sort((a, b) => b.won - a.won || b.v - a.v);
      const label = r.status === 'closed' ? (res.winners.length > 1 ? 'Winners' : 'Winner') : 'Leading';
      return `${intro}
        <div class="label">${label}${r.status === 'closed' ? '' : ' so far'}: ${esc(res.winners.join(', ') || '—')}</div>
        <p class="muted">${r.ballotCount} ballot${r.ballotCount === 1 ? '' : 's'} · ${res.rounds.length} round${res.rounds.length === 1 ? '' : 's'} of counting · final round shown</p>
        <ul class="bars">${rows
          .map(
            ({ c, v, won, out }) => `<li class="${won ? 'won' : ''}"><span class="who">${esc(c)}${won ? ' ✓' : ''}</span>
              <span class="bar"><span style="width:${out ? 0 : (v / max) * 100}%"></span></span>
              <span class="num">${out ? 'out' : fmt(v)}</span></li>`
          )
          .join('')}</ul>
        <div class="actions"><a href="${esc(this.resultsUrl)}" target="_blank" rel="noopener">Watch the count round by round ↗</a>
        <button class="link" data-refresh>Refresh</button></div>`;
    }

    wireBallot(focus) {
      const root = this.root;
      root.querySelectorAll('[data-action]').forEach((btn) =>
        btn.addEventListener('click', () => this.act(btn.dataset.action, btn.dataset.name))
      );
      const submit = root.querySelector('[data-submit]');
      if (submit) submit.addEventListener('click', () => this.submit());

      // Drag and drop (mouse). Touch and keyboard users have the arrow buttons.
      let dragged = null;
      root.querySelectorAll('.ranked li').forEach((li) => {
        li.addEventListener('dragstart', (ev) => {
          dragged = li.dataset.name;
          li.classList.add('dragging');
          ev.dataTransfer.effectAllowed = 'move';
          ev.dataTransfer.setData('text/plain', dragged);
        });
        li.addEventListener('dragend', () => li.classList.remove('dragging'));
        li.addEventListener('dragover', (ev) => {
          ev.preventDefault();
          li.classList.add('over');
        });
        li.addEventListener('dragleave', () => li.classList.remove('over'));
        li.addEventListener('drop', (ev) => {
          ev.preventDefault();
          li.classList.remove('over');
          if (dragged && dragged !== li.dataset.name) this.moveTo(dragged, this.ranking.indexOf(li.dataset.name));
        });
      });

      // Keep keyboard focus on the moved item after re-rendering.
      if (focus && focus.name) {
        const sel = (a) => root.querySelector(`[data-action="${a}"][data-name="${CSS.escape(focus.name)}"]:not([disabled])`);
        const target =
          sel(focus.action) ||
          (focus.action === 'add' || focus.action === 'remove' ? root.querySelector('.pool button, [data-submit]') : null) ||
          sel('up') ||
          sel('down');
        if (target) target.focus();
      }
    }
  }

  customElements.define('rcv-election', RcvElection);
})();
