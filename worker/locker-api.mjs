import { decodeSnapshot, encodeSnapshot } from '../public/locker-tools.js';

export const SHARE_ORIGIN = 'https://sprite-locker-checklist.eabaylor.chatgpt.site';
export const TRACKER_URL = 'https://eabaylor.github.io/fortnite-sprite-locker/';
export const SHARE_TTL = 90 * 86400;
const ID = /^[A-Za-z0-9_-]{16}$/;
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
    return new Response(null, { status: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-Locker-Share-Token', 'Access-Control-Max-Age': '600' } });
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
      const row = await db.prepare('SELECT payload, expires_at FROM locker_shares WHERE id = ? AND expires_at > ?').bind(id, now).first();
      return row ? json({ token: row.payload, expiresAt: row.expires_at }) : json({ error: 'This shared locker has expired or is unavailable. Ask your friend for a fresh link.' }, 404);
    }
    if (request.method !== 'POST' || !trusted) return json({ error: 'This request is not allowed.' }, 403);
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
    if (url.pathname !== '/api/lockers') return json({ error: 'Unknown endpoint.' }, 404);
    const capability = request.headers.get('X-Locker-Share-Token');
    if (!ID.test(capability || '')) return json({ error: 'A fresh sharing authorization is required.' }, 401);
    if (!request.headers.get('Content-Type')?.startsWith('application/json')) return json({ error: 'Expected JSON.' }, 415);
    // Stream with a byte limit, rather than trusting Content-Length.
    const reader = request.body?.getReader();
    if (!reader) return json({ error: 'Snapshot is required.' }, 400);
    let size = 0; const chunks = [];
    for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 16000) { await reader.cancel(); return json({ error: 'Snapshot is too large.' }, 413); } chunks.push(value); }
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    let canonical;
    try {
      const body = JSON.parse(new TextDecoder().decode(bytes));
      if (typeof body.token !== 'string' || body.token.length > 12000) throw new Error();
      const snapshot = decodeSnapshot(body.token);
      if (!snapshot.name.trim()) throw new Error();
      // Canonicalize before storage; discard all unrecognized fields.
      canonical = encodeSnapshot({ v: 1, season: snapshot.season, name: snapshot.name.trim(), date: snapshot.date, families: snapshot.families, states: snapshot.states });
    } catch { return json({ error: 'This locker snapshot is invalid.' }, 400); }
    const authorized = await db.prepare('DELETE FROM share_tickets WHERE hash = ? AND expires_at > ? RETURNING hash').bind(await hash(capability), now).first();
    if (!authorized) return json({ error: 'Sharing authorization expired. Please try again.' }, 401);
    const shareId = randomToken();
    await db.prepare('INSERT INTO locker_shares (id, payload, created_at, expires_at) VALUES (?, ?, ?, ?)').bind(shareId, canonical, now, now + SHARE_TTL).run();
    return json({ id: shareId, url: `${SHARE_ORIGIN}/s/${shareId}`, expiresAt: now + SHARE_TTL }, 201);
  } catch {
    return json({ error: 'Snapshot sharing is temporarily unavailable. Please try again.' }, 503);
  }
}
