import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const sharp = createRequire(require.resolve('next/package.json'))('sharp');
const root = new URL('../', import.meta.url);
const background = Buffer.from(`<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#082f27"/><stop offset="1" stop-color="#135c49"/></linearGradient></defs>
<rect width="1200" height="630" fill="url(#bg)"/><rect x="0" y="0" width="1200" height="10" fill="#f4c447"/>
<circle cx="1090" cy="520" r="350" fill="#1a7058" opacity=".4"/>
<text x="62" y="388" font-family="Arial, sans-serif" font-weight="bold" font-size="32" fill="#f5cf65">TRACK. COLLECT. COMPARE.</text>
<text x="62" y="442" font-family="Arial, sans-serif" font-size="25" fill="#e2eee5">Your Sprite checklist, all in one place.</text>
<rect x="62" y="491" width="205" height="48" rx="24" fill="#155c48" stroke="#409f78"/>
<text x="86" y="522" font-family="Arial, sans-serif" font-size="20" fill="#b7f5d2">✓ ACQUIRED</text>
<rect x="281" y="491" width="205" height="48" rx="24" fill="#544c26" stroke="#c2a444"/>
<text x="305" y="522" font-family="Arial, sans-serif" font-size="20" fill="#ffe49a">★ MASTERED</text>
<text x="62" y="593" font-family="Arial, sans-serif" font-size="18" fill="#a1c7b8">Unofficial fan-made collection tracker</text>
</svg>`);
const composite = [{ input: await sharp(await readFile(new URL('public/fortnite-sprite-locker-logo-transparent.png', root))).resize(590, 240, { fit: 'inside' }).png().toBuffer(), left: 43, top: 65 }];
const names = ['jonesy', 'sonic', 'adventure', 'bush', 'jackrabbit', 'klombo'];
for (const [i, name] of names.entries()) {
  const left = 714 + (i % 3) * 153;
  const top = 126 + Math.floor(i / 3) * 202;
  composite.push({ input: Buffer.from('<svg width="140" height="180" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="1" width="138" height="178" rx="18" fill="#e6ede1" fill-opacity=".12" stroke="#57937a"/></svg>'), left, top });
  composite.push({ input: await sharp(await readFile(new URL(`public/sprites/${name}-base-256.webp`, root))).resize(128, 160, { fit: 'contain', background: '#00000000' }).png().toBuffer(), left: left + 6, top: top + 10 });
}
const image = await sharp(background).composite(composite).png().toBuffer();
for (const dir of ['public', 'docs']) await writeFile(new URL(`${dir}/sprite-locker-share-v2.png`, root), image);
