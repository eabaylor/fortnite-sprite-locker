import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from 'node:fs/promises';
import { isSuppressedPlayer } from '../public/locker-sharing.js';
import snapshotCatalogs from '../public/locker-catalogs.js';
import { makeSnapshot, encodeSnapshot, decodeSnapshot, matchesComparison, matchesGroupComparison, addFriendSnapshot, friendCollectionCounts, nextLockerAction, requirePlayerName } from "../public/locker-tools.js";

const season = { seasonId: "test-season", families: [{ name: "Honey", variants: ["Base", "Gold"] }, { name: "One Wish Willow", variants: ["Base"] }] };

test('older 33-entry shared lockers remain readable after the release-only correction', async () => {
  const current = JSON.parse(await readFile(new URL('../data/catalog.json', import.meta.url), 'utf8'));
  const old = Object.values(snapshotCatalogs).find(c => c.season === current.seasonId && c.families.reduce((n, f) => n + f[1].length, 0) === 33);
  assert.ok(old, 'The old snapshot dictionary must remain immutable');
  const historical = { seasonId: old.season, families: old.families.map(([name, variants]) => ({ name, variants })) };
  const progress = { "Halfpeel'd::Cursed": { acquired: true, mastered: true }, "Halfpeel'd::Base": { acquired: true, mastered: false } };
  const friend = decodeSnapshot(encodeSnapshot(makeSnapshot(historical, progress, 'Eric')));
  assert.equal(friend.entries.get("Halfpeel'd::Cursed"), 2);
  assert.deepEqual(friendCollectionCounts(friend, current), { acquired: 1, mastered: 0, total: 24, unknown: 2 });
});

test('only the specified tester identities are suppressed, even after a rename', () => {
  assert.equal(isSuppressedPlayer({ name: '  Toby CHAT GPT Tester  ' }), true);
  assert.equal(isSuppressedPlayer({ name: 'Toby Tester account' }), true);
  assert.equal(isSuppressedPlayer({ shareId: 'nk_eJM74lyrRyLH_', name: 'Renamed test locker' }), true);
  assert.equal(isSuppressedPlayer({ id: 'EsGZ4L67AFZ3BrT-', name: 'Another name' }), true);
  for (const name of ['MamaPjama', 'Toby', 'Tester', 'Eric']) assert.equal(isSuppressedPlayer({ name }), false);
});

test('Sprite edits require a saved valid Player Name, including while offline', () => {
  const oldWindow = globalThis.window, oldStorage = globalThis.localStorage;
  let stored = null, prompts = 0;
  globalThis.window = new EventTarget(); window.addEventListener('sprite-locker-player-required', () => prompts++);
  globalThis.localStorage = { getItem: () => stored };
  try {
    for (const value of [null, 'broken JSON', '{}', '{"name":"  "}', '{"name":"x"}']) {
      stored = value; assert.equal(requirePlayerName(), false);
    }
    assert.equal(prompts, 5);
    stored = JSON.stringify({ name: 'Eric', joined: true });
    assert.equal(requirePlayerName(), true); assert.equal(prompts, 5);
    globalThis.localStorage.getItem = () => { throw new Error('Storage unavailable'); };
    assert.equal(requirePlayerName(), false);
  } finally {
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
    if (oldStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = oldStorage;
  }
});

test('own comparison status cycles without breaking mastery implies acquired', () => {
  let state = { acquired: false, mastered: false };
  const expected = [1, 2, 0];
  for (const wanted of expected) {
    const current = state.mastered ? 2 : state.acquired ? 1 : 0;
    const field = nextLockerAction(current); state[field] = !state[field];
    if (field === 'mastered' && state.mastered) state.acquired = true;
    if (field === 'acquired' && !state.acquired) state.mastered = false;
    assert.equal(state.mastered ? 2 : state.acquired ? 1 : 0, wanted);
  }
});

test('friend counts include mastery in acquired, ignore extra cards, and distinguish unknown variants', () => {
  const friend = { entries: new Map([['Honey::Base', 1], ['Honey::Gold', 2], ['Extra::Base', 2]]) };
  assert.deepEqual(friendCollectionCounts(friend, season), { acquired: 2, mastered: 1, total: 3, unknown: 1 });
  friend.entries.set('One Wish Willow::Base', 0);
  assert.deepEqual(friendCollectionCounts(friend, season), { acquired: 2, mastered: 1, total: 3, unknown: 0 });
});

test('real catalog uses a short stable link and preserves every progress state', async () => {
  const current = JSON.parse(await readFile(new URL('../data/catalog.json', import.meta.url), 'utf8'));
  const progress = {};
  let i = 0;
  for (const f of current.families) for (const v of f.variants) { progress[`${f.name}::${v}`] = { acquired: i % 3 > 0, mastered: i++ % 3 === 2 }; }
  const snapshot = makeSnapshot(current, progress, 'Eric');
  const encoded = encodeSnapshot(snapshot);
  assert.ok(encoded.length < 200, `Token too long: ${encoded.length}`);
  const decoded = decodeSnapshot(encoded);
  assert.equal([...decoded.entries.values()].join(''), snapshot.states);
  assert.deepEqual(decoded.families, snapshot.families);
});

test("share links round-trip Unicode names and explicit statuses without catalog indexes", () => {
  const progress = { "Honey::Gold": { acquired: true, mastered: true }, "One Wish Willow::Base": { acquired: true, mastered: false } };
  const snapshot = makeSnapshot(season, progress, "Zoë 🎮 ::");
  const link = `https://example.com/tracker/#locker=${encodeSnapshot(snapshot)}`;
  const decoded = decodeSnapshot(link);
  assert.equal(decoded.name, "Zoë 🎮 ::");
  assert.equal(decoded.season, season.seasonId);
  assert.equal(decoded.entries.get("Honey::Base"), 0);
  assert.equal(decoded.entries.get("Honey::Gold"), 2);
  assert.equal(decoded.entries.get("One Wish Willow::Base"), 1);
  assert.equal(decoded.entries.get("New Sprite::Base"), undefined);
  assert.deepEqual(progress, { "Honey::Gold": { acquired: true, mastered: true }, "One Wish Willow::Base": { acquired: true, mastered: false } });
  assert.ok(link.length < 2000);
});

test("invalid or oversized snapshots are rejected before use", () => {
  assert.throws(() => decodeSnapshot("not a link"));
  assert.throws(() => decodeSnapshot("a".repeat(40001)));
  const snapshot = makeSnapshot(season, {}, 'Eric');
  assert.throws(() => decodeSnapshot(encodeSnapshot({ ...snapshot, v: 2 })));
  assert.throws(() => decodeSnapshot(encodeSnapshot({ ...snapshot, states: "9" })));
  assert.throws(() => decodeSnapshot(encodeSnapshot({ ...snapshot, families: [["Honey", ["Base", "Base", "Base"]]] })));
});

test('new shares require a real nickname; old unnamed links remain decodable', () => {
  assert.throws(() => makeSnapshot(season, {}, '  '), /nickname/);
  assert.equal(decodeSnapshot(encodeSnapshot({ ...makeSnapshot(season, {}, 'Eric'), name: 'Friend' })).name, 'Friend');
});

test('five friends maximum, named reimports replace snapshots without consuming a slot', () => {
  let friends = [];
  for (const name of ['Eric', 'Laura', 'Chris', 'Alex', 'Sharon']) friends = addFriendSnapshot(friends, makeSnapshot(season, {}, name));
  assert.equal(friends.length, 5);
  assert.throws(() => addFriendSnapshot(friends, makeSnapshot(season, {}, 'Sixth')), /five friends/);
  friends = addFriendSnapshot(friends, makeSnapshot(season, { 'Honey::Gold': { mastered: true } }, 'LAURA'));
  assert.equal(friends.length, 5);
  assert.equal(friends[1].states, '020');
});

test('group comparisons distinguish any friend from everyone missing and ignore unknowns', () => {
  for (const statuses of [[], [0], [1], [2], [undefined], [0, 2, undefined]]) {
    for (const mine of [0, 1, 2]) assert.equal(matchesGroupComparison('im-missing', mine, statuses), mine === 0);
  }
  assert.equal(matchesGroupComparison('i-need', 0, [0, 2]), true);
  assert.equal(matchesGroupComparison('they-need', 1, [2, 0]), true);
  assert.equal(matchesGroupComparison('both-missing', 0, [0, 0]), true);
  assert.equal(matchesGroupComparison('both-missing', 0, [0, undefined]), false);
  assert.equal(matchesGroupComparison('not-mastered', 2, [2, 1]), true);
  assert.equal(matchesGroupComparison('not-mastered', 0, [undefined]), false);
});

test("comparison filters handle missing, acquired, mastered, and older snapshots", () => {
  for (const mine of [0, 1, 2]) for (const theirs of [0, 1, 2, undefined]) {
    assert.equal(matchesComparison("i-need", mine, theirs), mine === 0 && theirs > 0);
    assert.equal(matchesComparison("they-need", mine, theirs), mine > 0 && theirs === 0);
    assert.equal(matchesComparison("both-missing", mine, theirs), mine === 0 && theirs === 0);
    assert.equal(matchesComparison("not-mastered", mine, theirs), theirs !== undefined && (mine < 2 || theirs < 2));
  }
});
