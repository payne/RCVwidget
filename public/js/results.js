import { tabulate } from './tabulate.js';
import { DEMOS } from './demos.js';

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const fmt = (n) => (Math.abs(n - Math.round(n)) < 0.005 ? String(Math.round(n)) : n.toFixed(2));
const plural = (n, one, many = one + 's') => `${fmt(n)} ${Math.abs(n - 1) < 0.005 ? one : many}`;
const list = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const params = new URLSearchParams(location.search);
const app = $('#app');

async function main() {
  const demoKey = params.get('demo');
  const id = (params.get('id') || '').trim().toLowerCase();
  let data;
  if (demoKey && DEMOS[demoKey]) {
    const d = DEMOS[demoKey];
    data = {
      demo: true,
      election: { id: d.id, title: d.title, description: d.description, candidates: d.candidates, seats: d.seats },
      status: 'closed',
      ballotCount: d.ballots.reduce((s, b) => s + b.count, 0),
      resultsVisible: true,
      result: tabulate({ ...d, tieSeed: d.id }),
    };
  } else if (id) {
    try {
      const res = await fetch(`/api/elections/${encodeURIComponent(id)}/results`);
      data = await res.json();
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
    } catch (err) {
      app.innerHTML = `<div class="card"><h1>Election not found</h1><p class="muted">${esc(err.message)}</p>
        <p><a href="/">Browse elections</a> or <a href="/election?demo=irv">watch a sample count</a>.</p></div>`;
      return;
    }
  } else {
    location.replace('/');
    return;
  }
  renderPage(data);
}

function renderPage(data) {
  const { election: e, result } = data;
  document.title = `${e.title} · AppFarms Elections`;
  const method = e.seats > 1 ? `Single transferable vote · ${e.seats} seats` : 'Instant runoff · 1 seat';
  const statusChip = data.demo
    ? `<span class="chip">Sample election</span>`
    : `<span class="chip ${data.status}">${{ open: 'Voting open', closed: 'Voting closed', upcoming: 'Not open yet' }[data.status]}</span>`;
  const dates = [
    e.opens && `Opens ${new Date(e.opens).toLocaleString()}`,
    e.closes && `${data.status === 'closed' ? 'Closed' : 'Closes'} ${new Date(e.closes).toLocaleString()}`,
  ].filter(Boolean);

  let winners = '';
  if (result && result.winners.length) {
    const label = data.status === 'closed' ? (result.winners.length > 1 ? 'Winners' : 'Winner') : 'Leading so far';
    winners = `<div class="winners"><strong>${label}:</strong>${result.winners.map((w) => `<span class="winner">${esc(w)}</span>`).join('')}</div>`;
  }

  app.innerHTML = `
    <div class="card">
      <h1>${esc(e.title)}</h1>
      ${e.description ? `<p class="lead">${esc(e.description)}</p>` : ''}
      <div class="chips">${statusChip}<span class="chip">${method}</span>
        <span class="chip">${plural(data.ballotCount, 'ballot')}</span>
        ${dates.map((d) => `<span class="chip">${esc(d)}</span>`).join('')}</div>
      ${winners}
      ${data.demo ? `<p class="muted">Other sample: ${e.seats > 1 ? '<a href="?demo=irv">one seat (instant runoff)</a>' : '<a href="?demo=stv">three seats (single transferable vote)</a>'}</p>` : ''}
    </div>
    <div class="card" id="count"></div>
    <div class="card" id="table"></div>`;

  const count = $('#count');
  if (!data.resultsVisible) {
    count.innerHTML = `<h2>Results are hidden</h2><p class="muted">This election shows results after voting closes${
      e.closes ? ` on ${esc(new Date(e.closes).toLocaleString())}` : ''
    }. ${plural(data.ballotCount, 'ballot has', 'ballots have')} been cast so far.</p>`;
    $('#table').remove();
    return;
  }
  if (!result || !result.rounds.length) {
    count.innerHTML = `<h2>No ballots yet</h2><p class="muted">Once people vote, you'll be able to watch the count here round by round.</p>`;
    $('#table').remove();
    return;
  }
  count.innerHTML = `<h2>Watch the count</h2>`;
  new CountPlayer(count, result);
  renderTable($('#table'), result);
}

// ------------------------------------------------------------------ animation

class CountPlayer {
  constructor(root, result) {
    this.r = result;
    this.rounds = result.rounds;
    this.steps = this.rounds.flatMap((_, i) => [{ i, phase: 'tally' }, { i, phase: 'decide' }]);
    this.idx = 0;
    this.speed = 1;
    this.playing = false;
    this.first = this.rounds[0].tallies;
    this.order = [...result.candidates].sort((a, b) => this.first[b] - this.first[a]);
    this.hasExhausted = this.rounds.some((r) => r.exhausted > 0 || r.transfers.some((t) => t.to == null));
    const peak = Math.max(...this.rounds.flatMap((r) => [...Object.values(r.tallies), r.quota || 0, r.exhausted]));
    this.scale = peak * 1.08 || 1;

    const totalXfer = Math.max(0, ...this.rounds.map((r) => r.transfers.reduce((s, t) => s + t.votes, 0)));
    this.unit = niceUnit(totalXfer / 40);

    root.insertAdjacentHTML(
      'beforeend',
      `<div class="stage">
        <div class="narrative" aria-live="polite"><div class="step-label"></div><div class="text"></div></div>
        <div class="quota-head" aria-hidden="true"><span></span></div>
        <div class="chart">
          ${this.order.map((c) => rowHtml(c)).join('')}
          ${this.hasExhausted ? rowHtml(null) : ''}
        </div>
        <div class="legend">
          <span><i class="l-own"></i>1st-choice votes</span>
          <span><i class="l-xfer"></i>Votes transferred in</span>
          <span><i class="l-quota"></i>${result.seats > 1 ? 'Quota to win a seat' : 'Majority needed to win'}</span>
          <span><i class="l-dot"></i>Moving ballots (each dot ≈ ${plural(this.unit, 'vote')})</span>
        </div>
        <div class="controls">
          <button data-c="restart" aria-label="Back to start" title="Back to start">⏮</button>
          <button data-c="prev" aria-label="Previous step" title="Previous step">◀</button>
          <button data-c="play" class="play">▶ Play</button>
          <button data-c="next" aria-label="Next step" title="Next step">▶|</button>
          <select data-c="speed" aria-label="Speed">
            <option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option><option value="4">4×</option>
          </select>
          <span class="progress"></span>
        </div>
        <div class="timeline" aria-label="Jump to round">
          ${this.rounds.map((r, i) => `<button data-round="${i}">Round ${r.number}</button>`).join('')}
        </div>
      </div>`
    );
    this.root = root;
    this.chart = $('.chart', root);
    this.rows = Object.fromEntries([...root.querySelectorAll('.crow')].map((el) => [el.dataset.c, el]));

    root.querySelector('.controls').addEventListener('click', (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      const c = b.dataset.c;
      if (c === 'play') return this.playing ? this.pause() : this.play();
      this.pause();
      if (c === 'restart') this.go(0);
      if (c === 'prev') this.go(this.idx - 1);
      if (c === 'next') this.go(this.idx + 1, true);
    });
    $('[data-c="speed"]', root).addEventListener('change', (ev) => (this.speed = Number(ev.target.value)));
    $('.timeline', root).addEventListener('click', (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      this.pause();
      this.go(Number(b.dataset.round) * 2);
    });
    root.addEventListener('keydown', (ev) => {
      if (ev.target.tagName === 'SELECT') return;
      if (ev.key === 'ArrowRight') this.go(this.idx + 1, true);
      if (ev.key === 'ArrowLeft') this.go(this.idx - 1);
    });

    this.paint(0, false);
    // Start playing when the chart scrolls into view.
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        io.disconnect();
        if (!reducedMotion()) setTimeout(() => this.play(), 600);
      }
    }, { threshold: 0.5 });
    io.observe(this.chart);
  }

  async go(idx, animate = false) {
    idx = Math.max(0, Math.min(idx, this.steps.length - 1));
    if (idx === this.idx || this.busy) return;
    const step = this.steps[idx];
    if (animate && idx === this.idx + 1 && step.phase === 'tally' && !reducedMotion()) {
      this.busy = true;
      await this.animateTransfers(step.i - 1, idx);
      this.busy = false;
    } else {
      this.paint(idx, animate);
    }
  }

  async play() {
    if (this.idx >= this.steps.length - 1) this.paint(0, false);
    this.playing = true;
    this.updateControls();
    await sleep(500 / this.speed);
    while (this.playing && this.idx < this.steps.length - 1) {
      await this.go(this.idx + 1, true);
      const hold = this.steps[this.idx].phase === 'decide' ? 3200 : 2000;
      await sleep(hold / this.speed);
    }
    this.playing = false;
    this.updateControls();
  }

  pause() {
    this.playing = false;
    this.updateControls();
  }

  updateControls() {
    const root = this.root;
    $('[data-c="play"]', root).textContent = this.playing ? '⏸ Pause' : this.idx >= this.steps.length - 1 ? '↻ Replay' : '▶ Play';
    $('[data-c="prev"]', root).disabled = this.idx === 0;
    $('[data-c="restart"]', root).disabled = this.idx === 0;
    $('[data-c="next"]', root).disabled = this.idx >= this.steps.length - 1;
    const s = this.steps[this.idx];
    $('.progress', root).textContent = `Round ${s.i + 1} of ${this.rounds.length} · step ${this.idx + 1} of ${this.steps.length}`;
    root.querySelectorAll('.timeline button').forEach((b) => b.classList.toggle('current', Number(b.dataset.round) === s.i));
  }

  /** Draw the chart for a step. */
  paint(idx, animate = true) {
    this.idx = idx;
    const { i, phase } = this.steps[idx];
    const round = this.rounds[i];
    const dur = animate && !reducedMotion() ? 0.8 / this.speed : 0;
    this.root.style.setProperty('--dur', `${dur}s`);

    const status = { ...round.status };
    if (phase === 'decide') {
      for (const c of round.elected) status[c] = 'elected';
      for (const c of round.eliminated) status[c] = 'eliminated';
    }
    const pct = (v) => `${Math.max(0, (v / this.scale) * 100)}%`;

    for (const c of this.order) {
      const row = this.rows[c];
      const v = round.tallies[c];
      const own = Math.min(this.first[c], v);
      const st = status[c];
      row.className = `crow ${st}`;
      if (phase === 'decide' && round.elected.includes(c)) row.classList.add('focus-elected');
      if (phase === 'decide' && round.eliminated.includes(c)) row.classList.add('focus-eliminated');
      $('.bar', row).style.width = pct(v);
      $('.seg-own', row).style.flexBasis = v > 0 ? `${(own / v) * 100}%` : '0%';
      $('.seg-xfer', row).style.flexBasis = v > 0 ? `${((v - own) / v) * 100}%` : '0%';
      const val = $('.val', row);
      val.style.left = pct(v);
      const gone = st === 'eliminated' && v === 0;
      val.textContent = gone ? '' : fmt(v);
      $('.badge', row).outerHTML =
        st === 'elected' ? `<span class="badge elected">Elected</span>` : st === 'eliminated' ? `<span class="badge eliminated">Out</span>` : `<span class="badge"></span>`;
      $('.quota-line', row).style.left = pct(round.quota);
    }
    if (this.hasExhausted) {
      const row = this.rows[''];
      $('.bar', row).style.width = pct(round.exhausted);
      $('.seg-own', row).style.flexBasis = '100%';
      $('.val', row).style.left = pct(round.exhausted);
      $('.val', row).textContent = round.exhausted > 0 ? fmt(round.exhausted) : '0';
      $('.quota-line', row).style.display = 'none';
    }
    const head = $('.quota-head span', this.root);
    head.style.left = pct(round.quota);
    head.textContent = `${this.r.seats > 1 ? 'Quota' : 'Majority'}: ${fmt(round.quota)}`;

    const n = narrate(this.r, i, phase, this.steps.length - 1 === idx);
    $('.step-label', this.root).textContent = n.label;
    $('.text', this.root).innerHTML = n.html;
    this.updateControls();
  }

  /** Fly dots from the candidate who was elected/eliminated to where the votes land. */
  async animateTransfers(roundIdx, nextIdx) {
    const prev = this.rounds[roundIdx];
    const next = this.rounds[roundIdx + 1];
    const flows = prev.transfers;
    if (!flows.length) return this.paint(nextIdx, true);

    const base = this.chart.getBoundingClientRect();
    const endOf = (key, value) => {
      const row = this.rows[key ?? ''];
      const track = $('.track', row).getBoundingClientRect();
      return {
        x: track.left - base.left + Math.max(6, (value / this.scale) * track.width - 8),
        y: track.top - base.top + track.height / 2 - 5,
      };
    };
    const D = 1300 / this.speed;
    const dots = [];
    const total = flows.reduce((s, f) => s + Math.max(1, Math.round(f.votes / this.unit)), 0);
    const stagger = Math.min(40, 700 / total) / this.speed;
    let k = 0;
    for (const f of flows) {
      const from = endOf(f.from, prev.tallies[f.from]);
      const to = endOf(f.to, f.to == null ? next.exhausted : next.tallies[f.to]);
      const n = Math.max(1, Math.round(f.votes / this.unit));
      for (let j = 0; j < n; j++) {
        const dot = document.createElement('div');
        dot.className = `dot ${prev.action === 'elected' ? 'from-elected' : ''}`;
        this.chart.appendChild(dot);
        const jitter = () => (Math.random() - 0.5) * 10;
        const sx = from.x + jitter(), sy = from.y + jitter();
        const tx = to.x + jitter(), ty = to.y + jitter() / 2;
        const mx = (sx + tx) / 2 + 40, my = (sy + ty) / 2;
        const anim = dot.animate(
          [
            { transform: `translate(${sx}px, ${sy}px) scale(.4)`, opacity: 0 },
            { transform: `translate(${sx}px, ${sy}px) scale(1)`, opacity: 1, offset: 0.12 },
            { transform: `translate(${mx}px, ${my}px) scale(1.1)`, offset: 0.55 },
            { transform: `translate(${tx}px, ${ty}px) scale(.9)`, opacity: 1, offset: 0.92 },
            { transform: `translate(${tx}px, ${ty}px) scale(.3)`, opacity: 0 },
          ],
          { duration: D, delay: k++ * stagger, easing: 'cubic-bezier(.45,0,.25,1)', fill: 'both' }
        );
        dots.push({ dot, anim });
      }
    }
    // Bars update while the dots are in the air.
    setTimeout(() => this.paint(nextIdx, true), D * 0.45 + (k * stagger) / 2);
    await Promise.all(dots.map((d) => d.anim.finished.catch(() => {})));
    dots.forEach((d) => d.dot.remove());
    if (this.idx !== nextIdx) this.paint(nextIdx, true);
  }
}

function rowHtml(c) {
  const isEx = c == null;
  return `<div class="crow ${isEx ? 'exhausted-row' : ''}" data-c="${isEx ? '' : esc(c)}">
    <div class="cname">${isEx ? '<span class="n">Exhausted</span>' : `<span class="n">${esc(c)}</span>`}<span class="badge"></span></div>
    <div class="track"><div class="bar"><div class="seg-own"></div><div class="seg-xfer"></div></div>
      <span class="val"></span><span class="quota-line"></span></div>
  </div>`;
}

function niceUnit(x) {
  if (x <= 1) return 1;
  const p = 10 ** Math.floor(Math.log10(x));
  for (const m of [1, 2, 5, 10]) if (m * p >= x) return m * p;
  return 10 * p;
}

// ------------------------------------------------------------------ narration

function narrate(result, i, phase, isLast) {
  const r = result.rounds[i];
  const N = result.rounds.length;
  const stv = result.seats > 1;
  const continuingVotes = Object.entries(r.tallies)
    .filter(([c]) => r.status[c] === 'continuing')
    .reduce((s, [, v]) => s + v, 0);
  const label = `Round ${r.number} of ${N} · ${phase === 'tally' ? 'Counting' : 'Decision'}`;
  const b = (s) => `<strong>${esc(s)}</strong>`;

  if (phase === 'tally') {
    let html;
    if (i === 0) {
      html = `<p>Every ballot counts for its voter's <strong>1st choice</strong>. `;
      html += stv
        ? `There are ${result.seats} seats to fill. To win one, a candidate needs the <strong>quota</strong>: ${b(fmt(r.quota))} votes. Only ${result.seats} people can reach that at once.</p>`
        : `To win, a candidate needs a <strong>majority</strong>, more than half of the ${fmt(continuingVotes)} ballots: ${b(fmt(r.quota))}.</p>`;
    } else {
      const p = result.rounds[i - 1];
      html = `<p>The moved ballots are now counted for their next choice. `;
      if (!stv) html += `Majority needed now: ${b(fmt(r.quota))} of ${fmt(continuingVotes)} ballots still in play.`;
      html += `</p>`;
      if (r.exhausted > p.exhausted) {
        html += `<p class="muted">${plural(r.exhausted, 'ballot is', 'ballots are')} <em>exhausted</em>: every candidate those voters ranked is already out, so they sit out the rest of the count.</p>`;
      }
    }
    return { label, html };
  }

  let html = '';
  if (r.action === 'elected' && r.reason === 'quota') {
    if (!stv) {
      const w = r.elected[0];
      html = `<p>🎉 ${b(w)} has ${b(fmt(r.tallies[w]))} votes. That is a majority (${fmt(r.quota)} needed), so ${b(w)} wins!</p>`;
    } else {
      html = `<p>🎉 ${r.elected.map((c) => `${b(c)} (${fmt(r.tallies[c])})`).join(', ')} reached the quota of ${b(fmt(r.quota))} and ${r.elected.length > 1 ? 'are' : 'is'} elected.</p>`;
      for (const c of r.elected) {
        const s = r.surplus[c];
        if (s && s.surplus > 0 && r.transfers.length) {
          html += `<p>${b(c)} only needed ${fmt(r.quota)}, so the extra ${b(fmt(s.surplus))} (the <em>surplus</em>) shouldn't go to waste.
            Every one of ${esc(c)}'s ballots moves to its next choice, but each now counts as ${fmt(s.surplus)} ÷ ${fmt(r.tallies[c])} ≈ ${b(s.factor.toFixed(3))} of a vote.</p>`;
        }
      }
    }
  } else if (r.action === 'elected' && r.reason === 'remaining') {
    html = stv
      ? `<p>Only ${r.elected.length} candidate${r.elected.length > 1 ? 's are' : ' is'} left for ${r.elected.length} open seat${r.elected.length > 1 ? 's' : ''}, so ${list(r.elected.map(b))} ${r.elected.length > 1 ? 'are' : 'is'} elected.</p>`
      : `<p>${b(r.elected[0])} is the last candidate standing and wins.</p>`;
  } else if (r.action === 'eliminated') {
    const c = r.eliminated[0];
    html = `<p>Nobody reached ${stv ? 'the quota' : 'a majority'}. ${b(c)} has the fewest votes (${fmt(r.tallies[c])}) and is <strong>eliminated</strong>.</p>`;
    if (r.tieBreak === 'previous-round') html += `<p class="muted">${esc(c)} was tied for last; the tie was broken by who had fewer votes in an earlier round.</p>`;
    if (r.tieBreak === 'lot') html += `<p class="muted">${esc(c)} was tied for last in every round; the tie was broken by a repeatable random draw.</p>`;
    if (r.tallies[c] > 0) html += `<p>Those voters still count: each ballot moves to its next choice that is still in the race.</p>`;
  }

  if (r.transfers.length) {
    html += `<ul>${r.transfers
      .map((t) => `<li>${t.to == null ? 'No more choices (exhausted)' : `→ ${b(t.to)}`}: +${fmt(t.votes)}</li>`)
      .join('')}</ul>`;
  }
  if (isLast) {
    html += `<p><strong>Final result:</strong> ${list(result.winners.map(b))} ${result.winners.length > 1 ? 'fill the seats' : 'wins'}.</p>`;
  }
  return { label, html };
}

// ------------------------------------------------------------------ table

function renderTable(el, result) {
  const rounds = result.rounds;
  const cell = (r, c) => {
    const st = r.status[c];
    if (st === 'eliminated') return '<td class="num muted">—</td>';
    let mark = '';
    if (r.elected.includes(c)) mark = ' ✓';
    if (r.eliminated.includes(c)) mark = ' ✗';
    return `<td class="num">${fmt(r.tallies[c])}${mark}</td>`;
  };
  const order = [...result.candidates].sort((a, b) => rounds[0].tallies[b] - rounds[0].tallies[a]);
  el.innerHTML = `<h2>Round-by-round table</h2>
    <p class="muted">✓ elected that round · ✗ eliminated that round · — already out.</p>
    <div class="table-wrap"><table>
      <thead><tr><th>Candidate</th>${rounds.map((r) => `<th class="num">Round ${r.number}</th>`).join('')}</tr></thead>
      <tbody>
        ${order.map((c) => `<tr><td>${esc(c)}${result.winners.includes(c) ? ' <strong>(winner)</strong>' : ''}</td>${rounds.map((r) => cell(r, c)).join('')}</tr>`).join('')}
        <tr><td class="muted">Exhausted</td>${rounds.map((r) => `<td class="num muted">${fmt(r.exhausted)}</td>`).join('')}</tr>
        <tr><td class="muted">${result.seats > 1 ? 'Quota' : 'Majority needed'}</td>${rounds.map((r) => `<td class="num muted">${fmt(r.quota)}</td>`).join('')}</tr>
      </tbody>
    </table></div>`;
}

main();
