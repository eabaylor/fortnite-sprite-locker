import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createLockerSync, FRIENDS_KEY, LIVE_KEY } from '../public/locker-state.js';
import * as codec from '../public/locker-tools.js';

const season = JSON.parse(await readFile(new URL('../data/catalog.json', import.meta.url), 'utf8'));
const previous = JSON.parse(await readFile(new URL('../archive/chapter-7-season-3.json', import.meta.url), 'utf8'));

test('opt-in only, same live ID updates, pause persists, friends survive refresh by season and offline', async () => {
  const originals = Object.fromEntries(['window', 'document', 'localStorage', 'fetch'].map(k => [k, globalThis[k]]));
  const saved = new Map(); let record, uploads = 0, offline = false, nextId = 0;
  const id = 'AbCdEf0123456789'; const writeKey = 'a'.repeat(43);
  globalThis.window = new EventTarget(); globalThis.document = Object.assign(new EventTarget(), { hidden: false });
  globalThis.localStorage = { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) };
  globalThis.fetch = async (url, init) => {
    if (offline) throw new Error('Offline');
    if (url.endsWith('/ticket')) return Response.json({ ticket: id });
    if (init?.method === 'POST' && url.endsWith('/api/lockers')) {
      const body = JSON.parse(init.body); uploads++;
      record = { token: body.token, live: body.live, liveLink: body.live, revision: 0, updatedAt: Date.now() / 1000, expiresAt: Date.now() / 1000 + 7776000 };
      return Response.json({ ...record, id, writeKey, url: url.replace('/api/lockers', '/s/' + id) });
    }
    if (url.endsWith('/pause') || url.endsWith('/resume')) { record.live = url.endsWith('/resume'); record.revision++; return Response.json({ revision: record.revision }); }
    if (init?.method === 'PUT') { uploads++; const body = JSON.parse(init.body); assert.equal(init.headers['X-Locker-Write-Key'], writeKey); record.token = body.token; record.revision++; record.updatedAt = Date.now() / 1000; return Response.json({ revision: record.revision, updatedAt: record.updatedAt }); }
    return Response.json(record);
  };
  let sync;
  try {
    sync = createLockerSync([season, previous], codec);
    await sync.sync(); assert.equal(uploads, 0, 'No opt-in means no upload');
    assert.equal(sync.owner(season.seasonId), undefined);
    const owner = await sync.enable(season, 'Eric');
    assert.equal(owner.id, id); assert.equal(uploads, 1);
    localStorage.setItem(season.storageKey, JSON.stringify({ 'Honey::Gold': { acquired: true, mastered: true } }));
    await sync.sync(); assert.equal(uploads, 2); assert.equal(sync.owner(season.seasonId).id, id);
    assert.equal(codec.decodeSnapshot(record.token).entries.get('Honey::Gold'), 2);
    await assert.rejects(() => sync.add('', id), /own locker/);
    await sync.add('', 'Friend0000000001');
    assert.equal(sync.friends[0].live, true);
    assert.ok(!saved.get(FRIENDS_KEY).includes(writeKey), 'Friends never receive writer keys');
    await sync.add(codec.encodeSnapshot(codec.makeSnapshot(previous, {}, 'Archived friend')), null);
    assert.equal(sync.friends.length, 2);
    await sync.pause(season.seasonId);
    const before = uploads;
    localStorage.setItem(season.storageKey, '{}'); await sync.sync(); assert.equal(uploads, before);
    assert.equal(record.live, false);
    sync.dispose(); sync = createLockerSync([season, previous], codec);
    assert.equal(sync.friends.length, 2, 'Friends and archived season restore');
    assert.equal(sync.owner(season.seasonId).enabled, false, 'Pause survives page refresh');
    assert.equal(sync.owner(previous.seasonId), undefined, 'New seasons never opt in automatically');
    offline = true; await sync.refresh();
    assert.equal(sync.friends.length, 2); assert.match(sync.friends[0].error, /Last saved snapshot/);
    assert.equal(sync.friends[0].entries.get('Honey::Gold'), 2, 'Offline keeps last known state');
    assert.ok(saved.has(LIVE_KEY));
  } finally { sync?.dispose(); for (const [key, value] of Object.entries(originals)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } }
});
