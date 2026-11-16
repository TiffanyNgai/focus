// Focus API: profiles (username + private sync code), synced focus sessions, and "who is focusing now".

const FRESH_MS = 150_000;       // someone counts as focusing if their browser pinged in the last 2.5 minutes (background tabs ping slowly)
const MAX_NAMES = 40;
const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} _.-]{1,19}$/u; // 2-20 characters

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } });

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function newCode() { // e.g. K7QM-2XHD-9RTB-W4NP (80 bits)
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((b, i) => (i && i % 4 === 0 ? '-' : '') + alphabet[b % 32]).join('');
}

async function auth(request, env) {
  const [name, code] = (request.headers.get('authorization') || '').replace(/^Bearer /, '').split('|');
  if (!name || !code) return null;
  const row = await env.DB.prepare('SELECT key, name, code_hash FROM profiles WHERE key = ?').bind(decodeURIComponent(name).toLowerCase()).first();
  if (!row || row.code_hash !== await sha256(code.trim().toUpperCase())) return null;
  return row;
}

function cleanSession(s) {
  if (!s || typeof s.id !== 'string' || !s.id || s.id.length > 40) return null;
  const ms = Math.round(Number(s.ms)), start = Math.round(Number(s.start)), end = Math.round(Number(s.end));
  if (!(ms >= 1000 && ms <= 864e5) || !(start > 1.5e12) || !(end >= start) || end > Date.now() + 6e4) return null; // no future entries
  return {
    id: s.id, ms, start, end,
    task: String(s.task || 'Focus session').slice(0, 120),
    source: s.source === 'stopwatch' ? 'stopwatch' : 'timer',
  };
}

async function presenceSnapshot(env, selfClient) {
  const since = Date.now() - FRESH_MS;
  const { results } = await env.DB.prepare('SELECT client, name FROM presence WHERE last_seen > ? ORDER BY last_seen DESC LIMIT 500').bind(since).all();
  const names = [...new Set(results.filter(r => r.name && r.client !== selfClient).map(r => r.name))].slice(0, MAX_NAMES);
  return { count: results.length, others: results.filter(r => r.client !== selfClient).length, names };
}

async function handle(request, env, ctx) {
  const url = new URL(request.url), path = url.pathname, method = request.method;
  const body = method === 'POST' ? await request.json().catch(() => ({})) : {};

  // ----- who is focusing -----
  if (path === '/presence' && method === 'GET') return json(await presenceSnapshot(env, url.searchParams.get('client')));

  if (path === '/presence' && method === 'POST') {
    const client = String(body.client || '');
    if (!/^[\w-]{8,64}$/.test(client)) return json({ error: 'bad client' }, 400);
    if (body.focusing) {
      const who = await auth(request, env); // a name is only shown for a real profile
      await env.DB.prepare('INSERT INTO presence (client, name, last_seen) VALUES (?, ?, ?) ON CONFLICT(client) DO UPDATE SET name = excluded.name, last_seen = excluded.last_seen')
        .bind(client, who ? who.name : null, Date.now()).run();
    } else {
      await env.DB.prepare('DELETE FROM presence WHERE client = ?').bind(client).run();
    }
    if (Math.random() < .02) ctx.waitUntil(env.DB.prepare('DELETE FROM presence WHERE last_seen < ?').bind(Date.now() - 10 * FRESH_MS).run());
    return json(await presenceSnapshot(env, client));
  }

  // ----- profiles -----
  if (path === '/profile' && method === 'POST') { // claim a new username
    const name = String(body.name || '').trim().replace(/\s+/g, ' ');
    if (!NAME_RE.test(name)) return json({ error: 'Use 2–20 letters, numbers, spaces, or . _ -' }, 400);
    const code = newCode();
    try {
      await env.DB.prepare('INSERT INTO profiles (key, name, code_hash, created) VALUES (?, ?, ?, ?)').bind(name.toLowerCase(), name, await sha256(code), Date.now()).run();
    } catch { return json({ error: 'That username is taken.' }, 409); }
    return json({ name, code });
  }

  const who = await auth(request, env);
  if (!who) return json({ error: 'Username or sync code is not right.' }, 401);

  if (path === '/profile' && method === 'GET') return json({ name: who.name });

  if (path === '/profile' && method === 'DELETE') {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM sessions WHERE profile = ?').bind(who.key),
      env.DB.prepare('DELETE FROM profiles WHERE key = ?').bind(who.key),
    ]);
    return json({ ok: true });
  }

  // ----- sessions -----
  if (path === '/sessions' && method === 'GET') {
    const { results } = await env.DB.prepare('SELECT id, task, ms, start_at AS "start", end_at AS "end", source FROM sessions WHERE profile = ? ORDER BY start_at').bind(who.key).all();
    return json({ sessions: results });
  }

  if (path === '/sessions' && method === 'POST') {
    const list = (Array.isArray(body.sessions) ? body.sessions : []).slice(0, 2000).map(cleanSession).filter(Boolean);
    const stmt = env.DB.prepare('INSERT INTO sessions (profile, id, task, ms, start_at, end_at, source) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(profile, id) DO NOTHING');
    for (let i = 0; i < list.length; i += 50) {
      await env.DB.batch(list.slice(i, i + 50).map(s => stmt.bind(who.key, s.id, s.task, s.ms, s.start, s.end, s.source)));
    }
    return json({ saved: list.length });
  }

  const del = path.match(/^\/sessions\/([\w-]{1,40})$/);
  if (del && method === 'DELETE') {
    await env.DB.prepare('DELETE FROM sessions WHERE profile = ? AND id = ?').bind(who.key, del[1]).run();
    return json({ ok: true });
  }

  return json({ error: 'Not found' }, 404);
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').includes(origin);
    const cors = allowed ? {
      'access-control-allow-origin': origin,
      'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
      'access-control-allow-headers': 'authorization,content-type',
      'access-control-max-age': '86400',
      vary: 'origin',
    } : {};
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    let res;
    try { res = await handle(request, env, ctx); }
    catch (err) { res = json({ error: 'Server error' }, 500); console.error(err); }
    for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
    return res;
  },
};
