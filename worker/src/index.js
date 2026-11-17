// Focus API: profiles (username + private sync code), synced focus sessions, the lounge (who is focusing,
// their character and status), and cheers between people.

const FRESH_MS = 150_000;       // someone counts as focusing if their browser pinged in the last 2.5 minutes (background tabs ping slowly)
const MAX_NAMES = 40;
const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} _.-]{1,19}$/u; // 2-20 characters
const CHARACTERS = ['fox', 'bear', 'cat', 'owl', 'frog', 'panda', 'penguin', 'raccoon',
  'shiba', 'rabbit', 'avocado', 'mushroom', 'cactus', 'coffee', 'robot', 'astronaut'];
const CHEERS = ['hello', 'luck', 'gotThis']; // the only things anyone can send: no free text
const CHEER_GAP_MS = 10_000;    // same sender to same person: at most one cheer every 10 seconds
const SEND_WINDOW_MS = 600_000;  // one sender: at most SEND_MAX cheers in 10 minutes, across everyone
const SEND_MAX = 30;
const INBOX_MAX = 30;           // unread cheers waiting for one person
const INBOX_AGE_MS = 864e5;     // cheers that wait longer than a day are dropped instead of popping up late
const KEEP_READ_MS = 7 * 864e5; // delivered cheers are removed after a week

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

const newId = () => crypto.randomUUID().replace(/-/g, '');

// Short status line typed when a session starts: one line, 60 characters at most.
function cleanStatus(v) {
  const s = String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  return s || null;
}

async function auth(request, env) {
  const [name, code] = (request.headers.get('authorization') || '').replace(/^Bearer /, '').split('|');
  if (!name || !code) return null;
  const row = await env.DB.prepare('SELECT key, name, code_hash, character FROM profiles WHERE key = ?')
    .bind(decodeURIComponent(name).toLowerCase()).first();
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

async function presenceSnapshot(env, selfClient, viewer) {
  const since = Date.now() - FRESH_MS;
  const { results } = await env.DB.prepare(
    'SELECT client, name, character, status, COALESCE(started, last_seen) AS started FROM presence WHERE last_seen > ? ORDER BY started ASC LIMIT 500'
  ).bind(since).all();

  // one seat per person: if someone focuses from two browsers, keep the row from this browser
  const byName = new Map();
  for (const r of results) {
    if (!r.name) continue;
    const k = r.name.toLowerCase(), prev = byName.get(k);
    if (!prev || r.client === selfClient) byName.set(k, r);
  }
  const people = [...byName.values()]
    .map(r => ({ name: r.name, character: r.character || null, status: viewer ? r.status || null : null, started: r.started, me: r.client === selfClient }))
    .sort((a, b) => a.started - b.started)
    .slice(0, MAX_NAMES);
  const names = [...new Set(results.filter(r => r.name && r.client !== selfClient).map(r => r.name))].slice(0, MAX_NAMES);

  return {
    count: results.length,
    others: results.filter(r => r.client !== selfClient).length,
    names,
    people,                                  // named people focusing now, in seating order (first come, first seated)
    guests: results.filter(r => !r.name).length, // focusing without a profile: shown as anonymous seats
  };
}

async function handle(request, env, ctx) {
  const url = new URL(request.url), path = url.pathname, method = request.method;
  const body = ['POST', 'PATCH'].includes(method) ? await request.json().catch(() => ({})) : {};

  // ----- who is focusing -----
  // statuses are only shared with people who have a profile themselves
  if (path === '/presence' && method === 'GET') return json(await presenceSnapshot(env, url.searchParams.get('client'), await auth(request, env)));

  if (path === '/presence' && method === 'POST') {
    const client = String(body.client || '');
    if (!/^[\w-]{8,64}$/.test(client)) return json({ error: 'bad client' }, 400);
    const who = await auth(request, env); // a name, character and status are only shown for a real profile
    if (body.focusing) {
      const now = Date.now();
      await env.DB.prepare(`INSERT INTO presence (client, name, character, status, started, last_seen) VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(client) DO UPDATE SET
            name = excluded.name, character = excluded.character, status = excluded.status,
            started = CASE WHEN presence.last_seen < ? THEN excluded.started ELSE presence.started END,
            last_seen = excluded.last_seen`)
        .bind(client, who ? who.name : null, who ? who.character || null : null, who ? cleanStatus(body.status) : null,
          now, now, now - FRESH_MS).run();
    } else {
      await env.DB.prepare('DELETE FROM presence WHERE client = ?').bind(client).run();
    }
    if (Math.random() < .02) ctx.waitUntil(env.DB.prepare('DELETE FROM presence WHERE last_seen < ?').bind(Date.now() - 10 * FRESH_MS).run());
    return json(await presenceSnapshot(env, client, who));
  }

  // ----- profiles -----
  if (path === '/profile' && method === 'POST') { // claim a new username
    const name = String(body.name || '').trim().replace(/\s+/g, ' ');
    if (!NAME_RE.test(name)) return json({ error: 'Use 2–20 letters, numbers, spaces, or . _ -' }, 400);
    const code = newCode();
    try {
      await env.DB.prepare('INSERT INTO profiles (key, name, code_hash, created) VALUES (?, ?, ?, ?)').bind(name.toLowerCase(), name, await sha256(code), Date.now()).run();
    } catch { return json({ error: 'That username is taken.' }, 409); }
    return json({ name, code, character: null });
  }

  const who = await auth(request, env);
  if (!who) return json({ error: 'Username or sync code is not right.' }, 401);

  if (path === '/profile' && method === 'GET') return json({ name: who.name, character: who.character || null });

  if (path === '/profile' && method === 'PATCH') { // pick the character shown in the lounge
    if (!CHARACTERS.includes(body.character)) return json({ error: 'Pick one of the characters.' }, 400);
    await env.DB.prepare('UPDATE profiles SET character = ? WHERE key = ?').bind(body.character, who.key).run();
    return json({ name: who.name, character: body.character });
  }

  if (path === '/profile' && method === 'DELETE') {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM sessions WHERE profile = ?').bind(who.key),
      env.DB.prepare('DELETE FROM messages WHERE to_key = ? OR from_key = ?').bind(who.key, who.key),
      env.DB.prepare('DELETE FROM presence WHERE name = ? COLLATE NOCASE').bind(who.name),
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

  // ----- cheers: hello / good luck / you got this, delivered to the other person's inbox -----
  if (path === '/messages' && method === 'POST') {
    if (!CHEERS.includes(body.kind)) return json({ error: 'Choose hello, good luck or you got this.' }, 400);
    const to = String(body.to || '').trim(), key = to.toLowerCase();
    if (!key || key === who.key) return json({ error: 'Pick someone else in the lounge.' }, 400);
    // only people sitting in the lounge right now can be cheered, so nobody gets cheers out of the blue
    const target = await env.DB.prepare('SELECT name FROM presence WHERE name = ? COLLATE NOCASE AND last_seen > ? LIMIT 1')
      .bind(to, Date.now() - FRESH_MS).first();
    if (!target) return json({ error: 'They are not in the lounge right now.' }, 404);
    const sent = await env.DB.prepare('SELECT COUNT(*) AS n FROM messages WHERE from_key = ? AND created > ?').bind(who.key, Date.now() - SEND_WINDOW_MS).first();
    if (sent.n >= SEND_MAX) return json({ error: 'That is a lot of cheers. Take a short break and try again.' }, 429);
    const last = await env.DB.prepare('SELECT MAX(created) AS t FROM messages WHERE from_key = ? AND to_key = ?').bind(who.key, key).first();
    if (last && last.t && Date.now() - last.t < CHEER_GAP_MS) return json({ error: 'Give them a few seconds before the next one.' }, 429);
    const unread = await env.DB.prepare('SELECT COUNT(*) AS n FROM messages WHERE to_key = ? AND delivered = 0').bind(key).first();
    if (unread.n >= INBOX_MAX) return json({ error: 'Their inbox is full for now.' }, 429);

    const at = Date.now();
    await env.DB.prepare('INSERT INTO messages (id, to_key, from_key, from_name, from_character, kind, created) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(newId(), key, who.key, who.name, who.character || null, body.kind, at).run();
    if (Math.random() < .02) ctx.waitUntil(env.DB.prepare('DELETE FROM messages WHERE (delivered = 1 AND created < ?) OR created < ?').bind(at - INBOX_AGE_MS, at - KEEP_READ_MS).run());
    return json({ to: target.name, kind: body.kind, at });
  }

  if (path === '/inbox' && method === 'GET') { // cheers not yet shown to this person
    const { results } = await env.DB.prepare(
      'SELECT id, from_name AS "from", from_character AS character, kind, created AS at FROM messages WHERE to_key = ? AND delivered = 0 AND created > ? ORDER BY created LIMIT 50'
    ).bind(who.key, Date.now() - INBOX_AGE_MS).all();
    return json({ messages: results });
  }

  if (path === '/inbox/ack' && method === 'POST') { // mark cheers as shown
    const ids = (Array.isArray(body.ids) ? body.ids : []).map(String).filter(id => /^[\w-]{1,40}$/.test(id)).slice(0, 50);
    if (ids.length) {
      const stmt = env.DB.prepare('UPDATE messages SET delivered = 1 WHERE to_key = ? AND id = ?');
      await env.DB.batch(ids.map(id => stmt.bind(who.key, id)));
    }
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
      'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
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
