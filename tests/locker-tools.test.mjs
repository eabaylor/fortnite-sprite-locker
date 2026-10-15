import assert from "node:assert/strict";
import test from "node:test";
import { makeSnapshot, encodeSnapshot, decodeSnapshot, matchesComparison } from "../public/locker-tools.js";

const season = { seasonId: "test-season", families: [{ name: "Honey", variants: ["Base", "Gold"] }, { name: "One Wish Willow", variants: ["Base"] }] };

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
  const snapshot = makeSnapshot(season, {});
  assert.throws(() => decodeSnapshot(encodeSnapshot({ ...snapshot, v: 2 })));
  assert.throws(() => decodeSnapshot(encodeSnapshot({ ...snapshot, states: "9" })));
  assert.throws(() => decodeSnapshot(encodeSnapshot({ ...snapshot, families: [["Honey", ["Base", "Base", "Base"]]] })));
});

test("comparison filters handle missing, acquired, mastered, and older snapshots", () => {
  for (const mine of [0, 1, 2]) for (const theirs of [0, 1, 2, undefined]) {
    assert.equal(matchesComparison("i-need", mine, theirs), mine === 0 && theirs > 0);
    assert.equal(matchesComparison("they-need", mine, theirs), mine > 0 && theirs === 0);
    assert.equal(matchesComparison("both-missing", mine, theirs), mine === 0 && theirs === 0);
    assert.equal(matchesComparison("not-mastered", mine, theirs), theirs !== undefined && (mine < 2 || theirs < 2));
  }
});
