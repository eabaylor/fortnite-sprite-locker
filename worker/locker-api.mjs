import { decodeSnapshot, encodeSnapshot } from '../public/locker-tools.js';

export const SHARE_ORIGIN = 'https://sprite-locker-checklist.eabaylor.chatgpt.site';
export const TRACKER_URL = 'https://eabaylor.github.io/fortnite-sprite-locker/';
export const SHARE_TTL = 90 * 86400;
const ID = /^[A-Za-z0-9_-]{16}$/;
const WRITE_KEY = /^[A-Za-z0-9_-]{43}$/;
const allowedOrigins = new Set([new URL(TRACKER_URL).origin, SHARE_ORIGIN]);
const randomToken = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(12)))).replaceAll('+', '-').replaceAll('/', '_');
const hash = async text => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(n => n.toString(16).padStart(2, '0')).join('');

/** Anonymous creation is authorized by a short-lived, single-use capability and bounded quotas. */
export async function handleLockerRequest(request, db, now = Math.floor(Date.now() / 1000)) {
  const url = new URL(request.url);
  const api = url.pathname.startsWith('/api/lockers');
  const shortPath = url.pathname.match(/^\/s\/([A-Za-z0-9_-]{16})$/);
  if (!api && !shortPath) return null;
  const origin = request.headers.get('Origin');
  const trusted = allowedOrigins.has(origin);
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', Vary: 'Origin' };
  if (trusted) headers['Access-Control-Allow-Origin'] = origin;
  const json = (body, status = 200) => Response.json(body, { status, headers });
  if (request.method === 'OPTIONS') {
    if (!trusted) return json({ error: 'Origin not allowed.' }, 403);
    return new Response(null, { status: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-Locker-Share-Token, X-Locker-Write-Key', 'Access-Control-Max-Age': '600' } });
  }
  if (!db) return json({ error: 'Snapshot sharing is temporarily unavailable.' }, 503);
  try {
    if (shortPath && ['GET', 'HEAD'].includes(request.method)) {
      const row = await db.prepare('SELECT id FROM locker_shares WHERE id = ? AND expires_at > ?').bind(shortPath[1], now).first();
      // Redirect even a missing ID, so the tracker can show a useful expired-link message.
      return new Response(null, { status: 302, headers: { ...headers, Location: `${TRACKER_URL}?s=${shortPath[1]}${row ? '' : '&shareExpired=1'}` } });
    }
    const id = url.pathname.slice('/api/lockers/'.length);
    if (request.method === 'GET' && ID.test(id)) {
      const row = await db.prepare('SELECT payload, expires_at, live_enabled, revision, updated_at, created_at, live_season FROM locker_shares WHERE id = ? AND expires_at > ?').bind(id, now).first();
      return row ? json({ token: row.payload, expiresAt: row.expires_at, live: row.live_enabled === 1, liveLink: !!row.live_season, revision: row.revision, updatedAt: row.updated_at ?? row.created_at }) : json({ error: 'This shared locker has expired or is unavailable. Ask your friend for a fresh link.' }, 404);
    }
    if (!trusted || !['POST', 'PUT'].includes(request.method)) return json({ error: 'This request is not allowed.' }, 403);
    const control = url.pathname.match(/^\/api\/lockers\/([A-Za-z0-9_-]{16})\/(pause|resume)$/);
    if (control && request.method === 'POST') {
      const key = request.headers.get('X-Locker-Write-Key');
      if (!WRITE_KEY.test(key || '')) return json({ error: 'The private sharing key is required.' }, 401);
      const row = await db.prepare('UPDATE locker_shares SET live_enabled = ?, revision = revision + 1 WHERE id = ? AND write_key_hash = ? AND expires_at > ? RETURNING revision').bind(control[2] === 'resume' ? 1 : 0, control[1], await hash(key), now).first();
      return row ? json({ revision: row.revision }) : json({ error: 'This browser cannot manage that live locker.' }, 403);
    }
    if (url.pathname === '/api/lockers/ticket') {
      // Hash the edge-provided IP with a daily scope; never store raw addresses.
      const actor = await hash(`${Math.floor(now / 86400)}:${request.headers.get('CF-Connecting-IP') || 'unknown'}`);
      const quotas = await db.batch([
        db.prepare('INSERT INTO share_quotas (bucket, count, expires_at) VALUES (?, 1, ?) ON CONFLICT(bucket) DO UPDATE SET count = count + 1 WHERE count < 30 RETURNING count').bind(`ip:${actor}:${Math.floor(now / 3600)}`, now + 86400),
        db.prepare('INSERT INTO share_quotas (bucket, count, expires_at) VALUES (?, 1, ?) ON CONFLICT(bucket) DO UPDATE SET count = count + 1 WHERE count < 5000 RETURNING count').bind(`day:${Math.floor(now / 86400)}`, now + 172800),
        db.prepare('DELETE FROM share_tickets WHERE expires_at < ?').bind(now),
        db.prepare('DELETE FROM share_quotas WHERE expires_at < ?').bind(now),
        db.prepare('DELETE FROM locker_shares WHERE expires_at < ?').bind(now),
      ]);
      if (quotas.slice(0, 2).some(q => !q.results?.length)) return json({ error: 'Sharing limit reached. Try again later, or use a portable link.' }, 429);
      const ticket = randomToken();
      await db.prepare('INSERT INTO share_tickets (hash, expires_at) VALUES (?, ?)').bind(await hash(ticket), now + 120).run();
      return json({ ticket });
    }
    const updating = request.method === 'PUT' && ID.test(id);
    if (url.pathname !== '/api/lockers' && !updating) return json({ error: 'Unknown endpoint.' }, 404);
    const capability = request.headers.get('X-Locker-Share-Token');
    const writeKey = request.headers.get('X-Locker-Write-Key');
    if (updating ? !WRITE_KEY.test(writeKey || '') : !ID.test(capability || '')) return json({ error: 'A fresh sharing authorization is required.' }, 401);
    if (!request.headers.get('Content-Type')?.startsWith('application/json')) return json({ error: 'Expected JSON.' }, 415);
    // Stream with a byte limit, rather than trusting Content-Length.
    const reader = request.body?.getReader();
    if (!reader) return json({ error: 'Snapshot is required.' }, 400);
    let size = 0; const chunks = [];
    for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 16000) { await reader.cancel(); return json({ error: 'Snapshot is too large.' }, 413); } chunks.push(value); }
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    let canonical, body, snapshot;
    try {
      body = JSON.parse(new TextDecoder().decode(bytes));
      if (typeof body.token !== 'string' || body.token.length > 12000) throw new Error();
      snapshot = decodeSnapshot(body.token);
      if (!snapshot.name.trim()) throw new Error();
      // Canonicalize before storage; discard all unrecognized fields.
      canonical = encodeSnapshot({ v: 1, season: snapshot.season, name: snapshot.name.trim(), date: snapshot.date, families: snapshot.families, states: snapshot.states });
    } catch { return json({ error: 'This locker snapshot is invalid.' }, 400); }
    if (updating) {
      if (!Number.isSafeInteger(body.revision) || body.revision < 0) return json({ error: 'A current revision is required.' }, 400);
      const keyHash = await hash(writeKey);
      const row = await db.prepare('UPDATE locker_shares SET payload = ?, revision = revision + 1, updated_at = ?, expires_at = ? WHERE id = ? AND write_key_hash = ? AND live_season = ? AND live_enabled = 1 AND revision = ? AND expires_at > ? AND COALESCE(updated_at, created_at) <= ? RETURNING revision').bind(canonical, now, now + SHARE_TTL, id, keyHash, snapshot.season, body.revision, now, now - 2).first();
      if (row) return json({ revision: row.revision, updatedAt: now, expiresAt: now + SHARE_TTL });
      const owner = await db.prepare('SELECT revision, live_enabled, live_season, updated_at, created_at FROM locker_shares WHERE id = ? AND write_key_hash = ? AND expires_at > ?').bind(id, keyHash, now).first();
      if (!owner) return json({ error: 'This browser cannot update that live locker.' }, 403);
      if (!owner.live_enabled || owner.live_season !== snapshot.season) return json({ error: 'Live sharing is paused or this snapshot belongs to another season.' }, 409);
      if (owner.revision !== body.revision) return json({ error: 'This locker changed in another tab. Retry with its latest revision.', revision: owner.revision }, 409);
      return json({ error: 'Please wait a moment before syncing again.' }, 429);
    }
    const authorized = await db.prepare('DELETE FROM share_tickets WHERE hash = ? AND expires_at > ? RETURNING hash').bind(await hash(capability), now).first();
    if (!authorized) return json({ error: 'Sharing authorization expired. Please try again.' }, 401);
    const shareId = randomToken();
    const ownerKey = body.live === true ? btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '') : null;
    await db.prepare('INSERT INTO locker_shares (id, payload, created_at, expires_at, write_key_hash, live_season, live_enabled, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(shareId, canonical, now, now + SHARE_TTL, ownerKey ? await hash(ownerKey) : null, ownerKey ? snapshot.season : null, ownerKey ? 1 : 0, now).run();
    return json({ id: shareId, url: `${SHARE_ORIGIN}/s/${shareId}`, expiresAt: now + SHARE_TTL, ...(ownerKey ? { writeKey: ownerKey, revision: 0, updatedAt: now } : {}) }, 201);
  } catch {
    return json({ error: 'Snapshot sharing is temporarily unavailable. Please try again.' }, 503);
  }
}
