import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { handleLockerRequest, SHARE_ORIGIN, TRACKER_URL, SHARE_TTL } from '../worker/locker-api.mjs';
import { makeSnapshot, encodeSnapshot, decodeSnapshot } from '../public/locker-tools.js';
import { sharedLockerId } from '../public/locker-sharing.js';

const schema = await readFile(new URL('../drizzle/0000_closed_doomsday.sql', import.meta.url), 'utf8') + await readFile(new URL('../drizzle/0001_concerned_gorilla_man.sql', import.meta.url), 'utf8');
const catalog = JSON.parse(await readFile(new URL('../data/catalog.json', import.meta.url), 'utf8'));
function database() {
  const sql = new DatabaseSync(':memory:'); sql.exec(schema);
  return {
    sql,
    prepare(query) { let args = []; const stmt = sql.prepare(query); return {
      bind(...values) { args = values; return this; },
      async first() { return stmt.get(...args) ?? null; },
      async run() { return stmt.run(...args); },
      all() { return stmt.all(...args); },
    }; },
    async batch(statements) { sql.exec('BEGIN'); try { const results = statements.map(s => ({ results: s.all() })); sql.exec('COMMIT'); return results; } catch (e) { sql.exec('ROLLBACK'); throw e; } },
  };
}
const now = 1792080000;
const origin = new URL(TRACKER_URL).origin;
function req(path, options = {}) { return new Request(`${SHARE_ORIGIN}${path}`, { ...options, headers: { Origin: origin, 'CF-Connecting-IP': '192.0.2.5', ...options.headers } }); }
async function ticket(db) { const response = await handleLockerRequest(req('/api/lockers/ticket', { method: 'POST' }), db, now); assert.equal(response.status, 200); return (await response.json()).ticket; }
const token = encodeSnapshot(makeSnapshot(catalog, { 'Honey::Gold': { acquired: true, mastered: true } }, 'Eric'));

test('anonymous short link stores exact snapshot, redirects to GitHub, tolerates tracking, expires', async () => {
  const db = database();
  try {
    const capability = await ticket(db);
    const createRequest = () => req('/api/lockers', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Locker-Share-Token': capability }, body: JSON.stringify({ token }) });
    const response = await handleLockerRequest(createRequest(), db, now);
    assert.equal(response.status, 201);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
    const share = await response.json();
    assert.ok(share.url.length < 80);
    assert.equal(sharedLockerId(share.url + '?fbclid=added-by-messenger'), share.id);
    const get = await handleLockerRequest(req(`/api/lockers/${share.id}`), db, now + 1);
    assert.equal(decodeSnapshot((await get.json()).token).entries.get('Honey::Gold'), 2);
    const redirect = await handleLockerRequest(req(`/s/${share.id}?fbclid=extra`), db, now + 1);
    assert.equal(redirect.status, 302);
    assert.equal(redirect.headers.get('Location'), `${TRACKER_URL}?s=${share.id}`);
    assert.equal(sharedLockerId(redirect.headers.get('Location') + '&fbclid=extra'), share.id);
    assert.equal((await handleLockerRequest(createRequest(), db, now)).status, 401, 'Creation tickets are single-use');
    assert.equal((await handleLockerRequest(req(`/api/lockers/${share.id}`), db, now + SHARE_TTL + 1)).status, 404);
  } finally { db.sql.close(); }
});

test('writes require trusted origin, capability, valid payload, and obey rate limits', async () => {
  const db = database();
  try {
    assert.equal((await handleLockerRequest(req('/api/lockers/ticket', { method: 'POST', headers: { Origin: 'https://evil.example' } }), db, now)).status, 403);
    assert.equal((await handleLockerRequest(req('/api/lockers', { method: 'POST' }), db, now)).status, 401);
    const capability = await ticket(db);
    const post = body => req('/api/lockers', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Locker-Share-Token': capability }, body });
    assert.equal((await handleLockerRequest(post(JSON.stringify({ token: 'invalid' })), db, now)).status, 400);
    assert.equal((await handleLockerRequest(post('a'.repeat(16001)), db, now)).status, 413);
    assert.equal((await handleLockerRequest(post(JSON.stringify({ token })), db, now + 121)).status, 401);
    for (let i = 1; i < 30; i++) await ticket(db);
    assert.equal((await handleLockerRequest(req('/api/lockers/ticket', { method: 'POST' }), db, now)).status, 429);
    assert.equal(db.sql.prepare('SELECT COUNT(*) AS n FROM locker_shares').get().n, 0);
    assert.equal(sharedLockerId('https://evil.example/s/AbCdEf0123456789'), null);
  } finally { db.sql.close(); }
});

test('live sharing requires its private key, rejects stale revisions, preserves season, and pauses', async () => {
  const db = database();
  try {
    const capability = await ticket(db);
    const created = await handleLockerRequest(req('/api/lockers', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Locker-Share-Token': capability }, body: JSON.stringify({ token, live: true }) }), db, now);
    const owner = await created.json();
    assert.match(owner.writeKey, /^[A-Za-z0-9_-]{43}$/);
    const get = () => handleLockerRequest(req(`/api/lockers/${owner.id}`), db, now + 10);
    assert.ok(!(await (await get()).clone().text()).includes(owner.writeKey));
    const updatedToken = encodeSnapshot(makeSnapshot(catalog, {}, 'Eric'));
    const put = (key, revision, bodyToken = updatedToken, at = now + 3) => handleLockerRequest(req(`/api/lockers/${owner.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Locker-Write-Key': key }, body: JSON.stringify({ token: bodyToken, revision }) }), db, at);
    assert.equal((await put('a'.repeat(43), 0)).status, 403);
    assert.equal((await put(owner.writeKey, 0)).status, 200);
    assert.equal((await put(owner.writeKey, 0, updatedToken, now + 6)).status, 409);
    assert.equal(decodeSnapshot((await (await get()).json()).token).entries.get('Honey::Gold'), 0);
    const control = enabled => handleLockerRequest(req(`/api/lockers/${owner.id}/${enabled ? 'resume' : 'pause'}`, { method: 'POST', headers: { 'X-Locker-Write-Key': owner.writeKey } }), db, now + 7);
    assert.equal((await control(false)).status, 200);
    assert.equal((await (await get()).json()).live, false);
    assert.equal((await put(owner.writeKey, 2, updatedToken, now + 8)).status, 409);
    assert.equal((await control(true)).status, 200);
    assert.equal((await put(owner.writeKey, 3, encodeSnapshot(makeSnapshot({ ...catalog, seasonId: 'other-season' }, {}, 'Eric')), now + 9)).status, 409);
    assert.equal((await put(owner.writeKey, 3, updatedToken, now + 10)).status, 200);
  } finally { db.sql.close(); }
});
