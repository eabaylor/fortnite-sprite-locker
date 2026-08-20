import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const catalog = JSON.parse(await readFile(new URL("data/catalog.json", root), "utf8"));
const total = catalog.families.reduce((sum, family) => sum + family.variants.length, 0);
const staticCatalog = `window.SPRITE_CATALOG = ${JSON.stringify(catalog, null, 2)};\n`;

await mkdir(new URL("docs/", root), { recursive: true });
await writeFile(new URL("docs/catalog.js", root), staticCatalog);
await copyFile(new URL("data/catalog.json", root), new URL("public/catalog.json", root));

const indexUrl = new URL("docs/index.html", root);
let index = await readFile(indexUrl, "utf8");
index = index
  .replace(/all \d+ currently available Fortnite Sprite variants/g, `all ${total} currently available Fortnite Sprite variants`)
  .replace(/Track all \d+ available Sprite variants/g, `Track all ${total} available Sprite variants`)
  .replace(/<span class="total-count">\d+<\/span>/g, `<span class="total-count">${total}</span>`)
  .replace(/UPDATED [^<]+ · PATCH [^<]+/g, `UPDATED ${catalog.updatedDate.toUpperCase()} · PATCH ${catalog.patch.toUpperCase()}`)
  .replace(/data-season-id="[^"]+"/g, `data-season-id="${catalog.seasonId}"`)
  .replace(
    /<div class="season-badge"[\s\S]*?<\/div>/,
    `<div class="season-badge" aria-label="Current Fortnite season: ${catalog.chapter}, ${catalog.season}, ${catalog.seasonTheme}">\n              <span class="season-chapter">${catalog.chapter}</span>\n              <strong>${catalog.season}</strong>\n              <span class="season-theme">${catalog.seasonTheme}</span>\n            </div>`,
  )
  .replace(/styles\.css\?v=[^"]+/g, `styles.css?v=${catalog.assetVersion}`)
  .replace(/catalog\.js\?v=[^"]+/g, `catalog.js?v=${catalog.assetVersion}`)
  .replace(/app\.js\?v=[^"]+/g, `app.js?v=${catalog.assetVersion}`);
await writeFile(indexUrl, index);

for (const path of ["public/sw.js", "docs/sw.js"]) {
  const serviceWorkerUrl = new URL(path, root);
  const serviceWorker = (await readFile(serviceWorkerUrl, "utf8"))
    .replace(/const CACHE = "sprite-locker-[^"]+";/, `const CACHE = "sprite-locker-${catalog.assetVersion}";`);
  await writeFile(serviceWorkerUrl, serviceWorker);
}

console.log(`Synced ${total} Sprite variants for ${catalog.chapter} ${catalog.season}.`);
