"use client";

import { useEffect, useMemo, useState } from "react";

type Variant = "Base" | "Gold" | "Gummy" | "Galaxy" | "Gem" | "Holofoil" | "Cube" | "Quack";
type SpriteFamily = { name: string; rarity: string; variants: Variant[] };
type Progress = Record<string, { acquired: boolean; mastered: boolean }>;
type Filter = "all" | "missing" | "acquired" | "mastered";

const SPRITES: SpriteFamily[] = [
  { name: "Batman", rarity: "Mythic", variants: ["Base", "Gold", "Gummy", "Galaxy", "Holofoil", "Cube"] },
  { name: "Water", rarity: "Rare", variants: ["Base", "Gold", "Gummy", "Galaxy", "Holofoil", "Quack"] },
  { name: "Earth", rarity: "Rare", variants: ["Base", "Gold", "Gummy", "Galaxy", "Cube", "Quack"] },
  { name: "Fire", rarity: "Rare", variants: ["Base", "Gold", "Gummy", "Galaxy", "Holofoil", "Cube", "Quack"] },
  { name: "Duck", rarity: "Epic", variants: ["Base", "Gold", "Gummy", "Galaxy"] },
  { name: "Ghost", rarity: "Epic", variants: ["Base", "Gold", "Gummy", "Galaxy", "Holofoil"] },
  { name: "Dream", rarity: "Legendary", variants: ["Base", "Gold", "Gummy", "Galaxy", "Cube"] },
  { name: "Demon", rarity: "Epic", variants: ["Base", "Gold", "Gummy", "Galaxy"] },
  { name: "Punk", rarity: "Legendary", variants: ["Base", "Gold", "Gummy", "Galaxy", "Cube"] },
  { name: "King", rarity: "Epic", variants: ["Base", "Gold", "Gummy", "Galaxy", "Holofoil"] },
  { name: "Burnt Peanut", rarity: "Mythic", variants: ["Base"] },
  { name: "Vini Jr.", rarity: "Mythic", variants: ["Base"] },
  { name: "Zero Point", rarity: "Mythic", variants: ["Base", "Gold", "Gummy", "Galaxy", "Holofoil", "Cube", "Quack"] },
  { name: "Fishy", rarity: "Rare", variants: ["Base", "Gold", "Gummy", "Galaxy", "Cube"] },
  { name: "Striker", rarity: "Legendary", variants: ["Base", "Gold", "Gummy", "Galaxy", "Holofoil"] },
  { name: "Aura", rarity: "Legendary", variants: ["Base", "Gold", "Gummy", "Galaxy"] },
  { name: "Boss", rarity: "Legendary", variants: ["Base", "Gold", "Gummy", "Galaxy", "Cube"] },
  { name: "Grim", rarity: "Mythic", variants: ["Base", "Gold", "Gummy", "Galaxy", "Holofoil", "Cube"] },
  { name: "Air", rarity: "Rare", variants: ["Base", "Gold", "Gummy", "Galaxy", "Holofoil"] },
  { name: "Seven", rarity: "Legendary", variants: ["Base", "Gold", "Gummy", "Galaxy", "Holofoil"] },
  { name: "Pollo", rarity: "Mythic", variants: ["Base"] },
  { name: "John Wick", rarity: "Mythic", variants: ["Base"] },
  { name: "Llama", rarity: "Legendary", variants: ["Base", "Gold", "Gummy", "Galaxy", "Gem"] },
  { name: "Peely", rarity: "Legendary", variants: ["Base", "Gold", "Gummy", "Galaxy", "Holofoil"] },
];

const TOTAL = SPRITES.reduce((sum, sprite) => sum + sprite.variants.length, 0);
const keyFor = (name: string, variant: Variant) => `${name}::${variant}`;
const imageFor = (name: string, variant: Variant) => {
  const slug = name.toLowerCase().replace(/\./g, "").replace(/\s+/g, "-");
  return `/sprites/${slug}-${variant.toLowerCase()}-256.webp`;
};

function ProgressRing({ value, label, tone }: { value: number; label: string; tone: "green" | "gold" }) {
  const percent = Math.round((value / TOTAL) * 100);
  return (
    <div className="progress-unit">
      <div className={`ring ${tone}`} style={{ "--progress": `${percent * 3.6}deg` } as React.CSSProperties}>
        <span>{percent}%</span>
      </div>
      <div>
        <strong>{value}<small> / {TOTAL}</small></strong>
        <span>{label}</span>
      </div>
    </div>
  );
}

export default function Home() {
  const [progress, setProgress] = useState<Progress>({});
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("sprite-locker-progress");
      if (saved) {
        const parsed = JSON.parse(saved) as Progress;
        setProgress(Object.fromEntries(
          Object.entries(parsed).map(([key, state]) => [
            key,
            state.mastered ? { ...state, acquired: true } : state,
          ]),
        ));
      }
    } catch {}
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem("sprite-locker-progress", JSON.stringify(progress));
  }, [progress, ready]);

  const counts = useMemo(() => {
    const states = Object.values(progress);
    return {
      acquired: states.filter((item) => item.acquired).length,
      mastered: states.filter((item) => item.mastered).length,
    };
  }, [progress]);

  const visible = useMemo(() => SPRITES.map((sprite) => ({
    ...sprite,
    variants: sprite.variants.filter((variant) => {
      const state = progress[keyFor(sprite.name, variant)] ?? { acquired: false, mastered: false };
      if (filter === "missing") return !state.acquired;
      if (filter === "acquired") return state.acquired;
      if (filter === "mastered") return state.mastered;
      return true;
    }),
  })).filter((sprite) => sprite.variants.length && sprite.name.toLowerCase().includes(query.toLowerCase())), [filter, progress, query]);

  function toggle(name: string, variant: Variant, field: "acquired" | "mastered") {
    const key = keyFor(name, variant);
    setProgress((current) => {
      const old = current[key] ?? { acquired: false, mastered: false };
      const next = { ...old, [field]: !old[field] };
      if (field === "mastered" && next.mastered) next.acquired = true;
      if (field === "acquired" && !next.acquired) next.mastered = false;
      return { ...current, [key]: next };
    });
  }

  return (
    <main>
      <header className="hero">
        <nav>
          <a className="brand" href="#top" aria-label="Fortnite Sprite Locker home">
            <img src="/fortnite-sprite-locker-logo-transparent.png" alt="Fortnite Sprite Locker" width="1983" height="793" />
          </a>
          <a className="source-link" href="https://fortnite.gg/sprites" target="_blank" rel="noreferrer">Live Sprite source ↗</a>
          <div className="header-status" id="top">
            <div className="progress-panel" aria-label="Collection progress">
              <ProgressRing value={counts.acquired} label="Acquired" tone="green" />
              <ProgressRing value={counts.mastered} label="Mastered" tone="gold" />
            </div>
            <p className="update-stamp">UPDATED JULY 31, 2026 · PATCH V41.30</p>
          </div>
        </nav>
      </header>

      <section className="tracker" aria-label="Sprite checklist">
        <div className="filters" role="group" aria-label="Filter checklist">
          {(["all", "missing", "acquired", "mastered"] as Filter[]).map((item) => (
            <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>
              {item[0].toUpperCase() + item.slice(1)}
            </button>
          ))}
          <button className="reset" onClick={() => { if (confirm("Clear every checkmark?")) setProgress({}); }}>Reset</button>
          <label className="search">
            <span>⌕</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a Sprite…" aria-label="Find a Sprite" />
          </label>
        </div>

        <div className="legend" aria-hidden="true">
          <span><i className="dot acquired-dot" /> Acquired</span>
          <span><i className="dot mastered-dot" /> Mastered</span>
          <span className="swipe">Swipe rows to see more →</span>
        </div>

        <div className="sprite-list">
          {visible.map((sprite) => (
            <section className="sprite-row" key={sprite.name}>
              <div className="row-label">
                <span className={`rarity ${sprite.rarity.toLowerCase()}`}>{sprite.rarity}</span>
                <h3>{sprite.name}</h3>
                <a href={`https://fortnite.gg/sprites?search=${encodeURIComponent(sprite.name)}`} target="_blank" rel="noreferrer">details ↗</a>
              </div>
              <div className="variant-strip">
                {sprite.variants.map((variant) => {
                  const key = keyFor(sprite.name, variant);
                  const state = progress[key] ?? { acquired: false, mastered: false };
                  return (
                    <article className={`sprite-card ${state.mastered ? "is-mastered" : state.acquired ? "is-acquired" : ""}`} key={variant}>
                      <div className={`sprite-art ${variant.toLowerCase()}`}>
                        <img
                          src={imageFor(sprite.name, variant)}
                          alt={`${variant === "Base" ? "" : `${variant} `}${sprite.name} Sprite`}
                          width="256"
                          height="256"
                          loading="lazy"
                        />
                      </div>
                      <h4>{variant}</h4>
                      <label className="check acquired-check">
                        <input type="checkbox" checked={state.acquired} onChange={() => toggle(sprite.name, variant, "acquired")} aria-label={`${sprite.name} ${variant} acquired`} />
                        <span><span className="long-label">Acquired</span><span className="short-label">A</span></span>
                      </label>
                      <label className="check mastered-check">
                        <input type="checkbox" checked={state.mastered} onChange={() => toggle(sprite.name, variant, "mastered")} aria-label={`${sprite.name} ${variant} mastered`} />
                        <span><span className="long-label">Mastered</span><span className="short-label">M</span></span>
                      </label>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
          {!visible.length && <div className="empty"><strong>No Sprites here.</strong><span>Try another name or filter.</span></div>}
        </div>
      </section>

      <aside className="sync-note">
        <span className="lock">⌁</span>
        <div><strong>About Fortnite account sync</strong><p>Epic does not currently offer public access to a player’s Sprite collection, so automatic live syncing isn’t available. Your checklist stays private in this browser.</p></div>
      </aside>

      <footer>
        <span>FORTNITE SPRITE LOCKER · FAN-MADE CHECKLIST</span>
        <p>Not affiliated with or endorsed by Epic Games. Fortnite is a trademark of Epic Games, Inc.</p>
      </footer>
    </main>
  );
}
