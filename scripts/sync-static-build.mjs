import { mkdir, readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const current = JSON.parse(await readFile(new URL("data/catalog.json", root), "utf8"));
const previous = JSON.parse(await readFile(new URL("archive/chapter-7-season-3.json", root), "utf8"));
const bundle = {
  schemaVersion: 1,
  defaultSeasonId: current.seasonId,
  assetVersion: current.assetVersion,
  seasons: [current, previous],
};
const total = current.families.reduce((sum, family) => sum + family.variants.length, 0);

await mkdir(new URL("docs/", root), { recursive: true });
await writeFile(new URL("docs/catalog.js", root), `window.SPRITE_CATALOGS = ${JSON.stringify(bundle, null, 2)};\n`);
await writeFile(new URL("public/catalog.json", root), `${JSON.stringify(bundle, null, 2)}\n`);
const version = `${JSON.stringify({ assetVersion: current.assetVersion, updatedDate: current.updatedDate }, null, 2)}\n`;
await writeFile(new URL("docs/version.json", root), version);
await writeFile(new URL("public/version.json", root), version);

const appCss = await readFile(new URL("app/globals.css", root), "utf8");
const staticCss = appCss
  .replace(/^@import "tailwindcss";\r?\n\r?\n/, "")
  .replaceAll("var(--font-body), sans-serif", '"Segoe UI", Arial, sans-serif')
  .replaceAll("var(--font-display), Impact, sans-serif", 'Impact, "Arial Black", sans-serif')
  .replaceAll("var(--font-display), sans-serif", 'Impact, "Arial Black", sans-serif');
await writeFile(new URL("docs/styles.css", root), staticCss);

const indexUrl = new URL("docs/index.html", root);
let index = await readFile(indexUrl, "utf8");
index = index
  .replace(/all \d+ currently available Fortnite Sprite variants/g, `all ${total} currently available Fortnite Sprite variants`)
  .replace(/Track all \d+ available Sprite variants/g, `Track all ${total} available Sprite variants`)
  .replace(/<span class="total-count">\d+<\/span>/g, `<span class="total-count">${total}</span>`)
  .replace(/UPDATED [^<]+ · PATCH [^<]+/g, `UPDATED ${current.updatedDate.toUpperCase()} · PATCH ${current.patch.toUpperCase()}`)
  .replace(/data-season-id="[^"]+"/g, `data-season-id="${current.seasonId}"`)
  .replace(/styles\.css\?v=[^"]+/g, `styles.css?v=${current.assetVersion}`)
  .replace(/catalog\.js\?v=[^"]+/g, `catalog.js?v=${current.assetVersion}`)
  .replace(/app\.js\?v=[^"]+/g, `app.js?v=${current.assetVersion}`);
await writeFile(indexUrl, index);

for (const path of ["public/sw.js", "docs/sw.js"]) {
  const serviceWorkerUrl = new URL(path, root);
  const serviceWorker = (await readFile(serviceWorkerUrl, "utf8"))
    .replace(/const CACHE = "sprite-locker-[^"]+";/, `const CACHE = "sprite-locker-${current.assetVersion}";`);
  await writeFile(serviceWorkerUrl, serviceWorker);
}

console.log(`Synced ${bundle.seasons.length} seasons; ${total} current Sprite variants.`);
