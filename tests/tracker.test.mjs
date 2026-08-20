import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const catalog = JSON.parse(await readFile(new URL("data/catalog.json", root), "utf8"));
const entries = catalog.families.flatMap((family) => family.variants.map((variant) => ({ family, variant })));

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
  assert.equal(entries.length, 36);

  const keys = entries.map(({ family, variant }) => `${family.name}::${variant}`);
  assert.equal(new Set(keys).size, keys.length);

  const expected = entries.map(({ family, variant }) => `${slug(family.name)}-${slug(variant)}-256.webp`).sort();
  const [publicFiles, docsFiles] = await Promise.all([
    readdir(new URL("public/sprites/", root)),
    readdir(new URL("docs/sprites/", root)),
  ]);
  assert.deepEqual(publicFiles.sort(), expected);
  assert.deepEqual(docsFiles.sort(), expected);

  for (const filename of expected) {
    const [publicInfo, docsInfo] = await Promise.all([
      stat(new URL(`public/sprites/${filename}`, root)),
      stat(new URL(`docs/sprites/${filename}`, root)),
    ]);
    assert.ok(publicInfo.size > 500, `${filename} is unexpectedly small`);
    assert.equal(publicInfo.size, docsInfo.size, `${filename} differs between builds`);
  }
});

test("server renders the real tracker with current season and all cards", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>Fortnite Sprite Locker/);
  assert.match(html, /Chapter 7/);
  assert.match(html, /Season 4/);
  assert.match(html, /Override/);
  assert.match(html, /Clear filters/);
  assert.match(html, /Backup/);
  assert.match(html, /Restore/);
  assert.equal((html.match(/class="sprite-card /g) ?? []).length, 36);
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

  assert.equal(generated, `window.SPRITE_CATALOG = ${JSON.stringify(catalog, null, 2)};\n`);
  assert.match(index, new RegExp(`catalog\\.js\\?v=${catalog.assetVersion}`));
  assert.match(index, new RegExp(`app\\.js\\?v=${catalog.assetVersion}`));
  assert.match(index, /manifest\.webmanifest/);
  assert.match(app, /const CATALOG = window\.SPRITE_CATALOG/);
  assert.doesNotMatch(app, /\["Jackrabbit", "Legendary"/);
  assert.match(page, /import catalog from "@\/data\/catalog\.json"/);
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
  }
});
