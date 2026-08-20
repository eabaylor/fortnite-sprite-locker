"use client";

import { useEffect, useMemo, useState } from "react";

type Variant = "Base" | "Gold" | "Cheat Master";
type SpriteFamily = { name: string; rarity: string; variants: Variant[] };
type Progress = Record<string, { acquired: boolean; mastered: boolean }>;
type Filter = "all" | "missing" | "not-mastered" | "acquired" | "acquired-unmastered" | "mastered";

const CURRENT_SEASON_ID = "chapter-7-season-4";
const CURRENT_SEASON_LABEL = "Chapter 7 · Season 4";
const STORAGE_KEY = "sprite-locker-progress-chapter-7-season-4";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "missing", label: "Missing" },
  { value: "not-mastered", label: "Not Mastered" },
  { value: "acquired", label: "Acquired" },
  { value: "acquired-unmastered", label: "Acquired / Not Mastered" },
  { value: "mastered", label: "Mastered" },
  { value: "all", label: "All" },
];

const SPRITES: SpriteFamily[] = [
  { name: "Jackrabbit", rarity: "Legendary", variants: ["Base", "Gold", "Cheat Master"] },
  { name: "Shadow", rarity: "Epic", variants: ["Base", "Cheat Master", "Gold"] },
  { name: "Bush", rarity: "Rare", variants: ["Base", "Cheat Master", "Gold"] },
  { name: "Tails", rarity: "Epic", variants: ["Base", "Cheat Master", "Gold"] },
  { name: "Killswitch", rarity: "Epic", variants: ["Base", "Cheat Master", "Gold"] },
  { name: "Adventure", rarity: "Rare", variants: ["Base", "Cheat Master", "Gold"] },
  { name: "Klombo", rarity: "Mythic", variants: ["Base", "Cheat Master", "Gold"] },
  { name: "Jonesy", rarity: "Rare", variants: ["Base", "Cheat Master", "Gold"] },
  { name: "Sonic", rarity: "Epic", variants: ["Base", "Cheat Master", "Gold"] },
  { name: "Crown", rarity: "Mythic", variants: ["Base", "Cheat Master", "Gold"] },
  { name: "8-Bit", rarity: "Rare", variants: ["Base", "Cheat Master", "Gold"] },
  { name: "Storm Scout", rarity: "Rare", variants: ["Base", "Cheat Master", "Gold"] },
];

const TOTAL = SPRITES.reduce((sum, sprite) => sum + sprite.variants.length, 0);
const keyFor = (name: string, variant: Variant) => `${name}::${variant}`;
const imageFor = (name: string, variant: Variant) => {
  const slug = name.toLowerCase().replace(/\./g, "").replace(/\s+/g, "-");
  const variantSlug = variant.toLowerCase().replace(/\s+/g, "-");
  return `/sprites/${slug}-${variantSlug}-256.webp`;
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

function MultiSelectFilter({
  label,
  items,
  selected,
  onToggle,
  onClear,
  className = "",
}: {
  label: string;
  items: readonly string[];
  selected: readonly string[];
  onToggle: (item: string) => void;
  onClear: () => void;
  className?: string;
}) {
  const summary = selected.length === 0 ? "All" : selected.length === 1 ? selected[0] : `${selected.length} selected`;
  return (
    <details className={`multi-filter ${className}`}>
      <summary><span>{label}</span><strong>{summary}</strong></summary>
      <div className="filter-menu" role="group" aria-label={`Filter by ${label}`}>
        <button type="button" className="filter-menu-clear" onClick={onClear}>Show all</button>
        {items.map((item) => (
          <label key={item}>
            <input type="checkbox" checked={selected.includes(item)} onChange={() => onToggle(item)} />
            <span>{item}</span>
          </label>
        ))}
      </div>
    </details>
  );
}

export default function Home() {
  const [progress, setProgress] = useState<Progress>({});
  const [filter, setFilter] = useState<Filter>("missing");
  const [selectedSprites, setSelectedSprites] = useState<string[]>([]);
  const [selectedVariants, setSelectedVariants] = useState<Variant[]>([]);
  const [query, setQuery] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
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
    if (ready) localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
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
      if (selectedVariants.length && !selectedVariants.includes(variant)) return false;
      const state = progress[keyFor(sprite.name, variant)] ?? { acquired: false, mastered: false };
      if (filter === "missing") return !state.acquired;
      if (filter === "not-mastered") return !state.mastered;
      if (filter === "acquired") return state.acquired;
      if (filter === "acquired-unmastered") return state.acquired && !state.mastered;
      if (filter === "mastered") return state.mastered;
      return true;
    }),
  })).filter((sprite) => (
    sprite.variants.length
    && (!selectedSprites.length || selectedSprites.includes(sprite.name))
    && sprite.name.toLowerCase().includes(query.toLowerCase())
  )), [filter, progress, query, selectedSprites, selectedVariants]);

  function toggleSpriteFilter(name: string) {
    setSelectedSprites((current) => current.includes(name) ? current.filter((item) => item !== name) : [...current, name]);
  }

  function toggleVariantFilter(variant: string) {
    const typedVariant = variant as Variant;
    setSelectedVariants((current) => current.includes(typedVariant) ? current.filter((item) => item !== typedVariant) : [...current, typedVariant]);
  }

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
          <div className="brand-lockup" data-season-id={CURRENT_SEASON_ID}>
            <a className="brand" href="#top" aria-label="Fortnite Sprite Locker home">
              <img src="/fortnite-sprite-locker-logo-transparent.png" alt="Fortnite Sprite Locker" width="1983" height="793" />
            </a>
            <p className="season-badge" aria-label={`Current Fortnite season: ${CURRENT_SEASON_LABEL}`}>
              {CURRENT_SEASON_LABEL}
            </p>
          </div>
          <a className="source-link" href="https://fortnite.gg/sprites" target="_blank" rel="noreferrer">Live Sprite source ↗</a>
          <div className="header-status" id="top">
            <div className="progress-panel" aria-label="Collection progress">
              <ProgressRing value={counts.acquired} label="Acquired" tone="green" />
              <ProgressRing value={counts.mastered} label="Mastered" tone="gold" />
            </div>
            <p className="update-stamp">UPDATED AUGUST 20, 2026 · PATCH V42.00</p>
          </div>
        </nav>
      </header>

      <section className="tracker" aria-label="Sprite checklist">
        <div className="filters" role="group" aria-label="Filter checklist">
          <label className="select-filter status-filter">
            <span>Status</span>
            <select value={filter} onChange={(event) => setFilter(event.target.value as Filter)} aria-label="Filter checklist by collection status">
              {FILTERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <MultiSelectFilter
            label="Sprites"
            items={SPRITES.map((sprite) => sprite.name)}
            selected={selectedSprites}
            onToggle={toggleSpriteFilter}
            onClear={() => setSelectedSprites([])}
            className="sprite-filter"
          />
          <MultiSelectFilter
            label="Variants"
            items={["Base", "Gold", "Cheat Master"]}
            selected={selectedVariants}
            onToggle={toggleVariantFilter}
            onClear={() => setSelectedVariants([])}
            className="variant-filter"
          />
          <button className="reset" onClick={() => { if (confirm("Clear every checkmark?")) setProgress({}); }}>Reset</button>
          <label className="search">
            <span>⌕</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a Sprite…" aria-label="Find a Sprite" />
          </label>
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
                      <div className={`sprite-art ${variant.toLowerCase().replace(/\s+/g, "-")}`}>
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
