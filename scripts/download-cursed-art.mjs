import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const sharp = createRequire(require.resolve('next/package.json'))('sharp');
const assets = [{"name":"Halfpeel'd","variant":"Cursed","url":"https://fortnite.gg/img/x/sprites/icons/T_Icon_BR_Creature_Sprite_PeelyBones_Cursed_L.webp"},{"name":"Re-Pete","variant":"Cursed","url":"https://fortnite.gg/img/x/sprites/icons/T_Icon_BR_Creature_Sprite_Parrot_Cursed_L.webp"},{"name":"Barry O'Fish","variant":"Cursed","url":"https://fortnite.gg/img/x/sprites/icons/T_Icon_BR_Creature_Sprite_BarrelOfFish_Cursed_L.webp"},{"name":"Wayfinder","variant":"Cursed","url":"https://fortnite.gg/img/x/sprites/icons/T_Icon_BR_Creature_Sprite_Compass_Cursed_L.webp"},{"name":"Chester","variant":"Cursed","url":"https://fortnite.gg/img/x/sprites/icons/T_Icon_BR_Creature_Sprite_TreasureChest_Cursed_L.webp"},{"name":"Kelper","variant":"Cursed","url":"https://fortnite.gg/img/x/sprites/icons/T_Icon_BR_Creature_Sprite_UnbotheredFish_Cursed_L.webp"},{"name":"Exmarks","variant":"Cursed","url":"https://fortnite.gg/img/x/sprites/icons/T_Icon_BR_Creature_Sprite_TreasureMap_Cursed_L.webp"},{"name":"Lil' Squibbly","variant":"Cursed","url":"https://fortnite.gg/img/x/sprites/icons/T_Icon_BR_Creature_Sprite_SquibblySprite_Cursed_L.webp"},{"name":"Lil' Flacko","variant":"Cursed","url":"https://fortnite.gg/img/x/sprites/icons/T_Icon_BR_Creature_Sprite_PlaymakerBrewery_Cursed_L.webp"},{"name":"Lil' Uzi Vert Jr.","variant":"Base","url":"https://fortnite.gg/img/x/sprites/icons/T_Icon_BR_Creature_Sprite_RookGecko_L.webp"},{"name":"Lil' Uzi Vert Jr.","variant":"Fortune","url":"https://fortnite.gg/img/x/sprites/icons/T_Icon_BR_Creature_Sprite_RookGecko_Jeweled_L.webp"},{"name":"Lil' Uzi Vert Jr.","variant":"Cursed","url":"https://fortnite.gg/img/x/sprites/icons/T_Icon_BR_Creature_Sprite_RookGecko_Cursed_L.webp"},{"name":"Plundarrgh","variant":"Cursed","url":"https://fortnite.gg/img/x/sprites/icons/T_Icon_BR_Creature_Sprite_CoinPile_Cursed_L.webp"}];
for (const dir of ['public', 'docs']) await mkdir(`${dir}/seasons/chapter-7-mini-season/sprites`, { recursive: true });
for (const asset of assets) {
  let original;
  if (process.env.SPRITE_ART_SOURCE_DIR) {
    original = await readFile(join(process.env.SPRITE_ART_SOURCE_DIR, new URL(asset.url).pathname.split('/').at(-1)));
  } else {
    const response = await fetch(asset.url);
    if (!response.ok) throw new Error(`${asset.name}: ${response.status}`);
    original = Buffer.from(await response.arrayBuffer());
  }
  const image = await sharp(original).resize(256, 256, { fit: 'contain', background: '#00000000' }).webp().toBuffer();
  const slug = asset.name.toLowerCase().replaceAll('.', '').replaceAll(' ', '-');
  const variant = asset.variant.toLowerCase();
  for (const dir of ['public', 'docs']) await writeFile(`${dir}/seasons/chapter-7-mini-season/sprites/${slug}-${variant}-256.webp`, image);
  console.log(`${asset.name}: ${asset.variant}`);
}
