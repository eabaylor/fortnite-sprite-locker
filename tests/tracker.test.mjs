import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const catalog = JSON.parse(await readFile(new URL("data/catalog.json", root), "utf8"));
const previousCatalog = JSON.parse(await readFile(new URL("archive/chapter-7-season-3.json", root), "utf8"));
const entries = catalog.families.flatMap((family) => family.variants.map((variant) => ({ family, variant })));
const bundle = {
  schemaVersion: 1,
  defaultSeasonId: catalog.seasonId,
  assetVersion: catalog.assetVersion,
  seasons: [catalog, previousCatalog],
};

const slug = (value) => value.toLowerCase().replaceAll(".", "").replaceAll(" ", "-");

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("catalog has unique active entries and matching artwork", async () => {
  assert.equal(catalog.seasonId, "chapter-7-season-4");
  assert.equal(catalog.storageKey, "sprite-locker-progress-chapter-7-season-4");
  assert.equal(entries.length, 33);
  assert.equal(catalog.whatsNew.items.length, 3);

  const keys = entries.map(({ family, variant }) => `${family.name}::${variant}`);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(catalog.unlockCodes.length, 7);
  assert.equal(new Set(catalog.unlockCodes.map(({ code }) => code.toLowerCase())).size, catalog.unlockCodes.length);
  for (const unlock of catalog.unlockCodes) {
    assert.ok(unlock.verifiedDate);
    assert.match(unlock.sourceUrl, /^https:\/\//);
    assert.ok(unlock.rewards.length > 0);
    for (const reward of unlock.rewards) assert.ok(keys.includes(`${reward.name}::${reward.variant}`), `${unlock.code} has an unknown reward`);
  }

  const expected = entries.map(({ family, variant }) => `${slug(family.name)}-${slug(variant)}-256.webp`).sort();
  const [publicFiles, docsFiles] = await Promise.all([
    readdir(new URL("public/sprites/", root)),
    readdir(new URL("docs/sprites/", root)),
  ]);
  assert.ok(expected.every((filename) => publicFiles.includes(filename)));
  assert.ok(expected.every((filename) => docsFiles.includes(filename)));

  for (const filename of expected) {
    const [publicInfo, docsInfo] = await Promise.all([
      stat(new URL(`public/sprites/${filename}`, root)),
      stat(new URL(`docs/sprites/${filename}`, root)),
    ]);
    assert.ok(publicInfo.size > 500, `${filename} is unexpectedly small`);
    assert.equal(publicInfo.size, docsInfo.size, `${filename} differs between builds`);
  }
});

test("previous season has a separate progress key and complete deployable artwork", async () => {
  const previousEntries = previousCatalog.families.flatMap((family) => family.variants.map((variant) => ({ family, variant })));
  assert.equal(previousCatalog.seasonId, "chapter-7-season-3");
  assert.equal(previousCatalog.storageKey, "sprite-locker-progress-chapter-7-season-3");
  assert.deepEqual(previousCatalog.legacyStorageKeys, ["sprite-locker-progress"]);
  assert.notEqual(previousCatalog.storageKey, catalog.storageKey);
  assert.equal(previousEntries.length, 117);

  const expected = previousEntries.map(({ family, variant }) => `${slug(family.name)}-${slug(variant)}-256.webp`).sort();
  const [publicFiles, docsFiles] = await Promise.all([
    readdir(new URL("public/seasons/chapter-7-season-3/sprites/", root)),
    readdir(new URL("docs/seasons/chapter-7-season-3/sprites/", root)),
  ]);
  assert.deepEqual(publicFiles.sort(), expected);
  assert.deepEqual(docsFiles.sort(), expected);
});

test("server renders the real tracker with current season and all cards", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>Fortnite Sprite Locker/);
  assert.match(html, /Chapter 7/);
  assert.match(html, /Season 4/);
  assert.match(html, /Season 3/);
  assert.match(html, /Override/);
  assert.match(html, /Runners/);
  assert.match(html, /Select Fortnite chapter and season/);
  assert.match(html, /Choose season/);
  assert.match(html, /Clear filters/);
  assert.match(html, /Backup/);
  assert.match(html, /Restore/);
  assert.match(html, /What’s New/);
  assert.match(html, /Sprite Codes/);
  assert.equal((html.match(/class="sprite-card /g) ?? []).length, 33);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site/);
});

test("static build is generated from the shared catalog", async () => {
  const [generated, index, app, page, manifest, serviceWorker] = await Promise.all([
    readFile(new URL("docs/catalog.js", root), "utf8"),
    readFile(new URL("docs/index.html", root), "utf8"),
    readFile(new URL("docs/app.js", root), "utf8"),
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("docs/manifest.webmanifest", root), "utf8"),
    readFile(new URL("docs/sw.js", root), "utf8"),
  ]);

  assert.equal(generated, `window.SPRITE_CATALOGS = ${JSON.stringify(bundle, null, 2)};\n`);
  assert.match(index, new RegExp(`catalog\\.js\\?v=${catalog.assetVersion}`));
  assert.match(index, new RegExp(`app\\.js\\?v=${catalog.assetVersion}`));
  assert.match(index, /manifest\.webmanifest/);
  assert.match(app, /const BUNDLE = window\.SPRITE_CATALOGS/);
  assert.doesNotMatch(app, /\["Jackrabbit", "Legendary"/);
  assert.match(page, /import currentCatalog from "@\/data\/catalog\.json"/);
  assert.match(page, /import previousCatalog from "@\/archive\/chapter-7-season-3\.json"/);
  assert.match(app, /legacyStorageKeys/);
  assert.match(page, /legacyStorageKeys/);
  assert.match(app, /seasonId === BUNDLE\.defaultSeasonId/);
  assert.match(page, /const initialSeason = CATALOGS\[0\]/);
  assert.match(app, /sprite-locker-last-seen-release/);
  assert.match(page, /sprite-locker-last-seen-release/);
  assert.match(index, /id="whats-new-backdrop"/);
  assert.match(index, /id="code-guide-backdrop"/);
  assert.match(app, /navigator\.clipboard/);
  assert.match(app, /data-redeem-code/);
  assert.match(page, /Mark redeemed/);
  assert.doesNotMatch(app, /sprite-locker-selected-season/);
  assert.doesNotMatch(page, /sprite-locker-selected-season/);
  assert.match(app, /field === "mastered" && next\.mastered\) next\.acquired = true/);
  assert.match(page, /field === "mastered" && next\.mastered\) next\.acquired = true/);
  assert.equal(JSON.parse(manifest).start_url, "./");
  assert.match(serviceWorker, /caches\.open/);
});

test("mobile layout keeps three variants inside the viewport", async () => {
  const [appCss, staticCss] = await Promise.all([
    readFile(new URL("app/globals.css", root), "utf8"),
    readFile(new URL("docs/styles.css", root), "utf8"),
  ]);
  for (const css of [appCss, staticCss]) {
    assert.match(css, /grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
    assert.match(css, /\.sprite-art img[^}]+object-fit:\s*contain/s);
    assert.match(css, /@media \(max-width: 760px\)/);
    assert.doesNotMatch(css, /\.variant-strip[^}]+overflow-x:\s*(auto|scroll)/s);
    assert.match(css, /\.whats-new-card/);
    assert.match(css, /\.code-guide-card/);
    assert.match(css, /@media \(max-width: 760px\)[\s\S]+\.code-entry \{[^}]+grid-template-columns:\s*minmax\(0, 1fr\)/);
  }
});
