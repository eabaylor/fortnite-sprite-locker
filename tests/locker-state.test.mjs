import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createLockerSync, FRIENDS_KEY, LIVE_KEY, PROFILE_KEY, HIDDEN_KEY } from '../public/locker-state.js';
import * as codec from '../public/locker-tools.js';

const season = JSON.parse(await readFile(new URL('../data/catalog.json', import.meta.url), 'utf8'));
const previous = JSON.parse(await readFile(new URL('../archive/chapter-7-season-3.json', import.meta.url), 'utf8'));

test('cached tester comparisons stay hidden without deleting saved data or owner access', async () => {
  const originals = Object.fromEntries(['window', 'document', 'localStorage', 'fetch'].map(k => [k, globalThis[k]]));
  const saved = new Map();
  const token = codec.encodeSnapshot(codec.makeSnapshot(season, {}, 'Toby CHAT GPT Tester'));
  saved.set(FRIENDS_KEY, JSON.stringify([{ token, shareId: 'nk_eJM74lyrRyLH_', live: true, liveLink: true }]));
  saved.set(LIVE_KEY, JSON.stringify({ [season.seasonId]: { id: 'nk_eJM74lyrRyLH_', name: 'Toby CHAT GPT Tester' } }));
  globalThis.window = new EventTarget(); globalThis.document = Object.assign(new EventTarget(), { hidden: false });
  globalThis.localStorage = { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) };
  globalThis.fetch = async () => { throw new Error('Suppressed comparisons should not need a network request'); };
  let sync;
  try {
    // Another player has only the cached comparison, not the tester's owner key.
    const owner = saved.get(LIVE_KEY); saved.delete(LIVE_KEY);
    sync = createLockerSync([season], codec);
    assert.equal(sync.friends.length, 0);
    assert.equal(JSON.parse(saved.get(FRIENDS_KEY)).length, 1, 'Stored snapshot remains intact');
    await assert.rejects(() => sync.add(token), /test locker is hidden/);
    sync.dispose(); saved.set(LIVE_KEY, owner); sync = createLockerSync([season], codec);
    assert.equal(sync.owner(season.seasonId).name, 'Toby CHAT GPT Tester', 'Tester retains own locker access');
  } finally { sync?.dispose(); for (const [key, value] of Object.entries(originals)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } }
});

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
    localStorage.setItem(season.storageKey, JSON.stringify({ 'Chester::Fortune': { acquired: true, mastered: true } }));
    await sync.sync(); assert.equal(uploads, 2); assert.equal(sync.owner(season.seasonId).id, id);
    assert.equal(codec.decodeSnapshot(record.token).entries.get('Chester::Fortune'), 2);
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
    assert.equal(sync.friends[0].entries.get('Chester::Fortune'), 2, 'Offline keeps last known state');
    assert.ok(saved.has(LIVE_KEY));
    for (const name of ['Carl', 'Sharon', 'MamaPjama', 'Tester']) await sync.add(codec.encodeSnapshot(codec.makeSnapshot(season, {}, name)), null);
    assert.equal(sync.friends.filter(f => f.season === season.seasonId).length, 5);
    await assert.rejects(() => sync.add(codec.encodeSnapshot(codec.makeSnapshot(season, {}, 'Too many')), null), /five friends/);
    sync.dispose(); sync = createLockerSync([season, previous], codec);
    assert.equal(sync.friends.filter(f => f.season === season.seasonId).length, 5, 'All five friends survive refresh');
  } finally { sync?.dispose(); for (const [key, value] of Object.entries(originals)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } }
});

test('one player name joins seasons, discovers everyone, and remembers hidden players without changing progress', async () => {
  const originals = Object.fromEntries(['window', 'document', 'localStorage', 'fetch'].map(k => [k, globalThis[k]]));
  const saved = new Map(), records = new Map(); let serial = 0, uploads = 0;
  globalThis.window = new EventTarget(); globalThis.document = Object.assign(new EventTarget(), { hidden: false });
  globalThis.localStorage = { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) };
  globalThis.fetch = async (url, init = {}) => {
    if (url.endsWith('/ticket')) return Response.json({ ticket: 'ticket' });
    if (url.endsWith('/api/lockers') && init.method === 'POST') {
      uploads++; const body = JSON.parse(init.body), id = `Owner${String(++serial).padStart(11, '0')}`;
      records.set(id, { token: body.token, live: true, liveLink: true });
      return Response.json({ id, writeKey: 'x'.repeat(43), expiresAt: Date.now() / 1000 + 7776000, revision: 0 });
    }
    if (url.endsWith('/listing')) return Response.json({ listed: true, nickname: JSON.parse(init.body).name });
    if (url.endsWith('/resume')) return Response.json({ revision: 1 });
    const id = url.split('/').pop();
    if (init.method === 'PUT') {
      const { token } = JSON.parse(init.body);
      assert.equal(JSON.parse(Buffer.from(token, 'base64url')).v, 1, 'An older service can read updates without the current dictionary');
      uploads++; records.get(id).token = token;
      return Response.json({ revision: 2 });
    }
    return Response.json(records.get(id));
  };
  let sync;
  try {
    const progress = JSON.stringify({ 'Chester::Fortune': { acquired: true, mastered: true } });
    saved.set(season.storageKey, progress);
    sync = createLockerSync([season, previous], codec);
    await sync.sync(); assert.equal(uploads, 0, 'No data uploaded before Save & join');
    await sync.join(season, '  Eric  ');
    assert.equal(sync.profile.name, 'Eric'); assert.ok(sync.owner(season.seasonId).listed);
    assert.equal(JSON.parse(Buffer.from(records.get(sync.owner(season.seasonId).id).token, 'base64url')).v, 1);
    assert.equal(codec.decodeSnapshot(records.get(sync.owner(season.seasonId).id).token).entries.get('Chester::Fortune'), 2);
    const roster = [];
    for (let i = 0; i < 8; i++) {
      const id = `Player${String(i).padStart(10, '0')}`, name = `Player ${i}`;
      records.set(id, { token: codec.encodeSnapshot(codec.makeSnapshot(season, {}, name)), nickname: name, live: true, liveLink: true });
      roster.push({ id, name, season: season.seasonId });
    }
    await sync.discover(season, roster);
    assert.equal(sync.friends.length, 8, 'Automatic roster is not limited to five friends');
    sync.hide('PLAYER 0'); assert.equal(sync.isHidden('Player 0'), true);
    await sync.discover(season, roster); assert.equal(sync.isHidden('Player 0'), true, 'Directory refresh does not unhide players');
    assert.equal(saved.get(season.storageKey), progress);
    sync.dispose(); sync = createLockerSync([season, previous], codec);
    assert.equal(sync.profile.name, 'Eric'); assert.equal(sync.friends.length, 8); assert.equal(sync.isHidden('Player 0'), true);
    await sync.join(previous, sync.profile.name);
    assert.notEqual(sync.owner(previous.seasonId).id, sync.owner(season.seasonId).id);
    assert.equal(sync.owner(previous.seasonId).name, 'Eric');
    assert.equal(sync.isHidden('Player 0'), true, 'Hide preferences carry across seasons');
    sync.hide('Player 0', false); assert.equal(sync.isHidden('Player 0'), false);
    assert.ok(saved.has(PROFILE_KEY) && saved.has(HIDDEN_KEY));
    assert.ok(!saved.get(FRIENDS_KEY).includes('x'.repeat(43)), 'Directory snapshots never contain writer credentials');
  } finally { sync?.dispose(); for (const [key, value] of Object.entries(originals)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } }
});
