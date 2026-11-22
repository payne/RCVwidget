// elections.appfarms.org — API for the <rcv-election> widget plus the static results site.
//
// Static files in /public are served by Workers Static Assets before this code runs;
// only requests that match no file (i.e. /api/*) reach fetch() below.

import { tabulate } from '../public/js/tabulate.js';

const ID_RE = /^[a-z0-9][a-z0-9._-]{2,79}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_CANDIDATES = 40;

const CORS = {
  // The widget is meant to be embedded on any site, including ones we don't own.
  // No cookies or credentials are used, so a wildcard is safe.
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    try {
      return await route(req, env, ctx, url);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message, ...err.extra }, err.status);
      console.error(err);
      return json({ error: 'Internal error' }, 500);
    }
  },
};

async function route(req, env, ctx, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', 'elections', id, sub]
  if (parts[1] !== 'elections') throw new HttpError(404, 'Not found');
  const id = parts[2] && decodeURIComponent(parts[2]);
  const sub = parts[3];

  if (!id && req.method === 'GET') return listElections(env, url);
  if (!id || !ID_RE.test(id)) throw new HttpError(400, 'Invalid election id');

  if (!sub && req.method === 'GET') return getElection(env, id);
  if (sub === 'sync' && req.method === 'POST') return syncElection(req, env, id);
  if (sub === 'ballots' && req.method === 'POST') return castBallot(req, env, id);
  if (sub === 'results' && req.method === 'GET') return getResults(req, env, ctx, id);
  throw new HttpError(404, 'Not found');
}

// ---------------------------------------------------------------- elections

/** Normalize the config sent by an embed. Throws on invalid input. */
function normalizeConfig(id, raw) {
  if (!raw || typeof raw !== 'object') throw new HttpError(400, 'Missing config');
  const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const title = str(raw.title, 200);
  if (!title) throw new HttpError(400, 'title is required');

  const seen = new Set();
  const candidates = (Array.isArray(raw.candidates) ? raw.candidates : [])
    .map((c) => str(c, 100))
    .filter((c) => c && !seen.has(c.toLowerCase()) && seen.add(c.toLowerCase()));
  if (candidates.length < 2) throw new HttpError(400, 'At least two distinct candidates are required');
  if (candidates.length > MAX_CANDIDATES) throw new HttpError(400, `At most ${MAX_CANDIDATES} candidates`);

  const seats = Number.parseInt(raw.seats ?? 1, 10);
  if (!(seats >= 1 && seats < candidates.length)) {
    throw new HttpError(400, 'seats must be at least 1 and fewer than the number of candidates');
  }
  const date = (v, name) => {
    if (v == null || v === '') return null;
    const t = Date.parse(v);
    if (Number.isNaN(t)) throw new HttpError(400, `${name} is not a valid date`);
    return new Date(t).toISOString();
  };
  const opens = date(raw.opens, 'opens');
  const closes = date(raw.closes, 'closes');
  if (opens && closes && opens >= closes) throw new HttpError(400, 'closes must be after opens');

  // Key order is fixed so the hash is stable.
  return {
    id,
    title,
    description: str(raw.description, 1000),
    candidates,
    seats,
    opens,
    closes,
    liveResults: raw.liveResults !== false,
    unlisted: raw.unlisted === true,
  };
}

async function syncElection(req, env, id) {
  const body = await readJson(req);
  const config = normalizeConfig(id, body.config);
  const configJson = JSON.stringify(config);
  const hash = await sha256(configJson);

  let row = await env.DB.prepare('SELECT config_json, config_hash FROM elections WHERE id = ?').bind(id).first();
  if (!row) {
    await env.DB.prepare(
      `INSERT INTO elections (id, config_json, config_hash, home_origin, unlisted, created_at)
       VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`
    )
      .bind(id, configJson, hash, originOf(req), config.unlisted ? 1 : 0, Date.now())
      .run();
    row = await env.DB.prepare('SELECT config_json, config_hash FROM elections WHERE id = ?').bind(id).first();
  }
  if (row.config_hash !== hash) {
    throw new HttpError(409, 'An election with this id already exists with different settings', {
      code: 'config_mismatch',
      stored: JSON.parse(row.config_json),
    });
  }
  return electionResponse(env, JSON.parse(row.config_json));
}

async function getElection(env, id) {
  return electionResponse(env, await loadConfig(env, id));
}

async function electionResponse(env, config) {
  const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM ballots WHERE election_id = ?').bind(config.id).first();
  const status = statusOf(config);
  return json({ election: config, status, ballotCount: n, resultsVisible: resultsVisible(config, status) });
}

async function listElections(env, url) {
  const limit = Math.min(Number.parseInt(url.searchParams.get('limit') || '50', 10) || 50, 100);
  const q = (url.searchParams.get('q') || '').trim().slice(0, 80);
  const { results } = await env.DB.prepare(
    `SELECT e.config_json, e.home_origin, e.created_at,
            (SELECT COUNT(*) FROM ballots b WHERE b.election_id = e.id) AS ballot_count
       FROM elections e
      WHERE e.unlisted = 0 AND (?1 = '' OR e.id LIKE ?2 OR e.config_json LIKE ?2)
      ORDER BY e.created_at DESC LIMIT ?3`
  )
    .bind(q, `%${q.replace(/[%_]/g, '')}%`, limit)
    .all();
  const elections = results.map((r) => {
    const c = JSON.parse(r.config_json);
    return {
      id: c.id,
      title: c.title,
      seats: c.seats,
      candidates: c.candidates.length,
      closes: c.closes,
      status: statusOf(c),
      ballotCount: r.ballot_count,
      homeOrigin: r.home_origin,
      createdAt: new Date(r.created_at).toISOString(),
    };
  });
  return json({ elections });
}

// ---------------------------------------------------------------- ballots

async function castBallot(req, env, id) {
  const config = await loadConfig(env, id);
  const status = statusOf(config);
  if (status === 'upcoming') throw new HttpError(403, 'Voting has not opened yet', { code: 'not_open' });
  if (status === 'closed') throw new HttpError(403, 'Voting is closed', { code: 'closed' });

  const body = await readJson(req);
  const token = String(body.voterToken || '').toLowerCase();
  if (!UUID_RE.test(token)) throw new HttpError(400, 'Invalid voter token');

  const ranking = Array.isArray(body.ranking) ? body.ranking : [];
  const valid = new Set(config.candidates);
  if (!ranking.length) throw new HttpError(400, 'Rank at least one candidate');
  if (new Set(ranking).size !== ranking.length) throw new HttpError(400, 'A candidate is ranked twice');
  if (!ranking.every((c) => valid.has(c))) throw new HttpError(400, 'Unknown candidate in ranking');

  const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
  const ipHash = await sha256(`${env.IP_SALT || 'rcv-dev-salt'}|${id}|${ip}`);
  const limit = Number.parseInt(env.RATE_LIMIT_PER_HOUR || '30', 10);
  const { n } = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM ballots WHERE election_id = ? AND ip_hash = ? AND cast_at > ?'
  )
    .bind(id, ipHash, Date.now() - 3600_000)
    .first();
  if (n >= limit) throw new HttpError(429, 'Too many ballots from this network. Try again later.', { code: 'rate_limited' });

  const res = await env.DB.prepare(
    `INSERT INTO ballots (election_id, voter_token, ranking_json, ip_hash, origin, cast_at)
     VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`
  )
    .bind(id, token, JSON.stringify(ranking), ipHash, originOf(req), Date.now())
    .run();
  if (!res.meta.changes) throw new HttpError(409, 'This browser has already voted', { code: 'already_voted' });

  return json({ ok: true, resultsVisible: resultsVisible(config, status) }, 201);
}

// ---------------------------------------------------------------- results

async function getResults(req, env, ctx, id) {
  const cache = caches.default;
  const cacheKey = new Request(new URL(req.url).toString(), { method: 'GET' });
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const config = await loadConfig(env, id);
  const status = statusOf(config);
  const visible = resultsVisible(config, status);
  const { results: groups } = await env.DB.prepare(
    'SELECT ranking_json, COUNT(*) AS n FROM ballots WHERE election_id = ? GROUP BY ranking_json'
  )
    .bind(id)
    .all();
  const ballotCount = groups.reduce((s, g) => s + g.n, 0);

  const body = { election: config, status, ballotCount, resultsVisible: visible };
  if (visible) {
    const ballots = groups.map((g) => ({ ranking: JSON.parse(g.ranking_json), count: g.n }));
    body.result = tabulate({ candidates: config.candidates, seats: config.seats, ballots, tieSeed: id });
  }
  const ttl = Number.parseInt(env.RESULTS_CACHE_SECONDS || '15', 10);
  const res = json(body, 200, { 'Cache-Control': `public, max-age=${ttl}` });
  ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

// ---------------------------------------------------------------- helpers

async function loadConfig(env, id) {
  const row = await env.DB.prepare('SELECT config_json FROM elections WHERE id = ?').bind(id).first();
  if (!row) throw new HttpError(404, 'Election not found', { code: 'not_found' });
  return JSON.parse(row.config_json);
}

function statusOf(c, now = Date.now()) {
  if (c.opens && now < Date.parse(c.opens)) return 'upcoming';
  if (c.closes && now >= Date.parse(c.closes)) return 'closed';
  return 'open';
}

const resultsVisible = (c, status) => c.liveResults || status === 'closed';

function originOf(req) {
  const o = req.headers.get('Origin');
  return o && /^https?:\/\/[^\s/]+$/.test(o) ? o.slice(0, 200) : null;
}

async function readJson(req) {
  if (Number(req.headers.get('Content-Length') || 0) > 32_000) throw new HttpError(413, 'Request too large');
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, 'Body must be JSON');
  }
}

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS, ...headers },
  });
}

class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}
