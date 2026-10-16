import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { makeSnapshot, encodeSnapshot, decodeSnapshot } from '../public/locker-tools.js';

const base = process.argv[2] || 'http://127.0.0.1:8787';
const catalog = JSON.parse(await readFile(new URL('../data/catalog.json', import.meta.url), 'utf8'));
const origin = 'https://eabaylor.github.io';
const ticketResponse = await fetch(`${base}/api/lockers/ticket`, { method: 'POST', headers: { Origin: origin } });
assert.equal(ticketResponse.status, 200, await ticketResponse.clone().text());
const { ticket } = await ticketResponse.json();
const token = encodeSnapshot(makeSnapshot(catalog, {}, 'Sharing service test'));
const created = await fetch(`${base}/api/lockers`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Locker-Share-Token': ticket }, body: JSON.stringify({ token }) });
assert.equal(created.status, 201, await created.clone().text());
const share = await created.json();
assert.ok(share.url.length < 80);
const snapshotResponse = await fetch(`${base}/api/lockers/${share.id}?fbclid=test`, { headers: { Origin: origin } });
assert.equal(snapshotResponse.status, 200);
assert.equal(snapshotResponse.headers.get('Access-Control-Allow-Origin'), origin);
const snapshot = decodeSnapshot((await snapshotResponse.json()).token);
assert.equal(snapshot.name, 'Sharing service test');
assert.equal(snapshot.entries.size, catalog.families.reduce((n, f) => n + f.variants.length, 0));
const redirect = await fetch(`${base}/s/${share.id}?fbclid=test`, { redirect: 'manual' });
assert.equal(redirect.status, 302);
assert.equal(redirect.headers.get('location'), `https://eabaylor.github.io/fortnite-sprite-locker/?s=${share.id}`);
const blocked = await fetch(`${base}/api/lockers/ticket`, { method: 'POST', headers: { Origin: 'https://evil.example' } });
assert.equal(blocked.status, 403);
const preflight = await fetch(`${base}/api/lockers`, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,x-locker-share-token' } });
assert.equal(preflight.status, 204);
if (process.argv.includes('--live')) {
  const fresh = await fetch(`${base}/api/lockers/ticket`, { method: 'POST', headers: { Origin: origin } });
  const authorization = await fresh.json();
  const liveResponse = await fetch(`${base}/api/lockers`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Locker-Share-Token': authorization.ticket }, body: JSON.stringify({ token, live: true }) });
  assert.equal(liveResponse.status, 201);
  const owner = await liveResponse.json(); assert.match(owner.writeKey, /^[A-Za-z0-9_-]{43}$/);
  const publicView = await (await fetch(`${base}/api/lockers/${owner.id}`)).json();
  assert.equal(publicView.live, true); assert.ok(!JSON.stringify(publicView).includes(owner.writeKey));
  await new Promise(resolve => setTimeout(resolve, 2500));
  const updatedToken = encodeSnapshot(makeSnapshot(catalog, { 'Honey::Gold': { acquired: true, mastered: true } }, 'Sharing service test'));
  const updated = await fetch(`${base}/api/lockers/${owner.id}`, { method: 'PUT', headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Locker-Write-Key': owner.writeKey }, body: JSON.stringify({ token: updatedToken, revision: owner.revision }) });
  assert.equal(updated.status, 200, await updated.clone().text());
  const after = await (await fetch(`${base}/api/lockers/${owner.id}`)).json();
  assert.equal(decodeSnapshot(after.token).entries.get('Honey::Gold'), 2);
  const paused = await fetch(`${base}/api/lockers/${owner.id}/pause`, { method: 'POST', headers: { Origin: origin, 'X-Locker-Write-Key': owner.writeKey } });
  assert.equal(paused.status, 200);
  assert.equal((await (await fetch(`${base}/api/lockers/${owner.id}`)).json()).live, false);
  if (process.argv.includes('--directory')) {
    const nickname = `QA-${owner.id}`;
    const listingRequest = enabled => fetch(`${base}/api/lockers/${owner.id}/listing`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Locker-Write-Key': owner.writeKey }, body: JSON.stringify({ enabled, name: nickname }) });
    try {
      const listed = await listingRequest(true); assert.equal(listed.status, 200, await listed.clone().text());
      const foundResponse = await fetch(`${base}/api/lockers/players?${new URLSearchParams({ season: catalog.seasonId, q: nickname })}`, { headers: { Origin: origin } });
      assert.equal(foundResponse.status, 200);
      const found = await foundResponse.json(); assert.equal(found.players.length, 1); assert.equal(found.players[0].id, owner.id); assert.equal(found.players[0].name, nickname);
      assert.ok(!JSON.stringify(found).includes(owner.writeKey));
    } finally { const removed = await listingRequest(false); assert.equal(removed.status, 200); }
    const afterRemoval = await (await fetch(`${base}/api/lockers/players?${new URLSearchParams({ season: catalog.seasonId, q: nickname })}`, { headers: { Origin: origin } })).json();
    assert.equal(afterRemoval.players.length, 0);
    console.log('Searchable player listing, nickname lookup, and opt-out: passed. Synthetic player removed.');
  }
  console.log('Live update, private key isolation, and pause: passed. Synthetic test locker left paused.');
}
console.log(JSON.stringify({ status: 'passed', variantCount: snapshot.entries.size, shortLink: share.url, linkLength: share.url.length, redirect: redirect.headers.get('location'), cors: 'passed', originGuard: 'passed' }));
