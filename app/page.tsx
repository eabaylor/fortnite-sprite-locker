"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import catalog from "@/data/catalog.json";

type Variant = "Base" | "Gold" | "Cheat Master";
type SpriteFamily = { name: string; rarity: string; variants: Variant[] };
type SpriteState = { acquired: boolean; mastered: boolean };
type Progress = Record<string, SpriteState>;
type Filter = "all" | "missing" | "not-mastered" | "acquired" | "acquired-unmastered" | "mastered";

const SPRITES = catalog.families as SpriteFamily[];
const TOTAL = SPRITES.reduce((sum, sprite) => sum + sprite.variants.length, 0);
const ACTIVE_KEYS = new Set(SPRITES.flatMap((sprite) => sprite.variants.map((variant) => `${sprite.name}::${variant}`)));
const VARIANTS: Variant[] = ["Base", "Gold", "Cheat Master"];

const FILTERS: { value: Filter; label: string }[] = [
  { value: "missing", label: "Missing" },
  { value: "not-mastered", label: "Not Mastered" },
  { value: "acquired", label: "Acquired" },
  { value: "acquired-unmastered", label: "Acquired / Not Mastered" },
  { value: "mastered", label: "Mastered" },
  { value: "all", label: "All" },
];

const keyFor = (name: string, variant: Variant) => `${name}::${variant}`;
const imageFor = (name: string, variant: Variant) => {
  const slug = name.toLowerCase().replace(/\./g, "").replace(/\s+/g, "-");
  const variantSlug = variant.toLowerCase().replace(/\s+/g, "-");
  return `/sprites/${slug}-${variantSlug}-256.webp`;
};

function sanitizeProgress(value: unknown): Progress {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const clean: Progress = {};
  for (const [key, state] of Object.entries(value)) {
    if (!ACTIVE_KEYS.has(key) || !state || typeof state !== "object" || Array.isArray(state)) continue;
    const raw = state as Partial<SpriteState>;
    const mastered = raw.mastered === true;
    const acquired = raw.acquired === true || mastered;
    if (acquired || mastered) clean[key] = { acquired, mastered };
  }
  return clean;
}

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

function MultiSelectFilter({ label, items, selected, onToggle, onClear, className = "" }: {
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
  const restoreInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let savedProgress: Progress = {};
    try {
      const saved = localStorage.getItem(catalog.storageKey);
      if (saved) savedProgress = sanitizeProgress(JSON.parse(saved));
    } catch {}
    queueMicrotask(() => {
      setProgress(savedProgress);
      setReady(true);
    });
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem(catalog.storageKey, JSON.stringify(progress));
  }, [progress, ready]);

  const counts = useMemo(() => {
    let acquired = 0;
    let mastered = 0;
    for (const sprite of SPRITES) {
      for (const variant of sprite.variants) {
        const state = progress[keyFor(sprite.name, variant)];
        if (state?.acquired) acquired += 1;
        if (state?.mastered) mastered += 1;
      }
    }
    return { acquired, mastered };
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
    && sprite.name.toLowerCase().includes(query.trim().toLowerCase())
  )), [filter, progress, query, selectedSprites, selectedVariants]);

  function toggleSpriteFilter(name: string) {
    setSelectedSprites((current) => current.includes(name) ? current.filter((item) => item !== name) : [...current, name]);
  }

  function toggleVariantFilter(variant: string) {
    const typedVariant = variant as Variant;
    setSelectedVariants((current) => current.includes(typedVariant) ? current.filter((item) => item !== typedVariant) : [...current, typedVariant]);
  }

  function clearFilters() {
    setFilter("missing");
    setSelectedSprites([]);
    setSelectedVariants([]);
    setQuery("");
  }

  function toggle(name: string, variant: Variant, field: "acquired" | "mastered") {
    const key = keyFor(name, variant);
    setProgress((current) => {
      const old = current[key] ?? { acquired: false, mastered: false };
      const next = { ...old, [field]: !old[field] };
      if (field === "mastered" && next.mastered) next.acquired = true;
      if (field === "acquired" && !next.acquired) next.mastered = false;
      const updated = { ...current };
      if (!next.acquired && !next.mastered) delete updated[key];
      else updated[key] = next;
      return updated;
    });
  }

  function backupProgress() {
    const backup = { schemaVersion: 1, seasonId: catalog.seasonId, exportedAt: new Date().toISOString(), progress: sanitizeProgress(progress) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `fortnite-sprite-locker-${catalog.seasonId}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function restoreProgress(file?: File) {
    if (!file) return;
    try {
      const backup = JSON.parse(await file.text()) as { seasonId?: string; progress?: unknown };
      if (backup.seasonId !== catalog.seasonId) throw new Error("This backup belongs to a different Fortnite season.");
      const restored = sanitizeProgress(backup.progress);
      setProgress(restored);
      alert(`Restored ${Object.keys(restored).length} saved Sprite entries.`);
    } catch (error) {
      alert(error instanceof Error ? error.message : "That backup file could not be restored.");
    } finally {
      if (restoreInput.current) restoreInput.current.value = "";
    }
  }

  return (
    <main>
      <header className="hero">
        <nav>
          <div className="brand-lockup" data-season-id={catalog.seasonId}>
            <a className="brand" href="#top" aria-label="Fortnite Sprite Locker home">
              <Image src="/fortnite-sprite-locker-logo-transparent.png" alt="Fortnite Sprite Locker" width={1983} height={793} priority sizes="(max-width: 760px) 43vw, 330px" unoptimized />
            </a>
            <div className="season-badge" aria-label={`Current Fortnite season: ${catalog.chapter}, ${catalog.season}, ${catalog.seasonTheme}`}>
              <span className="season-chapter">{catalog.chapter}</span>
              <strong>{catalog.season}</strong>
              <span className="season-theme">{catalog.seasonTheme}</span>
            </div>
          </div>
          <a className="source-link" href="https://fortnite.gg/sprites" target="_blank" rel="noreferrer">Live Sprite source ↗</a>
          <div className="header-status" id="top">
            <div className="progress-panel" aria-label="Collection progress">
              <ProgressRing value={counts.acquired} label="Acquired" tone="green" />
              <ProgressRing value={counts.mastered} label="Mastered" tone="gold" />
            </div>
            <p className="update-stamp">UPDATED {catalog.updatedDate.toUpperCase()} · PATCH {catalog.patch.toUpperCase()}</p>
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
          <MultiSelectFilter label="Sprites" items={SPRITES.map((sprite) => sprite.name)} selected={selectedSprites} onToggle={toggleSpriteFilter} onClear={() => setSelectedSprites([])} className="sprite-filter" />
          <MultiSelectFilter label="Variants" items={VARIANTS} selected={selectedVariants} onToggle={toggleVariantFilter} onClear={() => setSelectedVariants([])} className="variant-filter" />
          <button className="clear-filters" onClick={clearFilters}>Clear filters</button>
          <div className="data-actions" aria-label="Checklist data">
            <button type="button" onClick={backupProgress}>Backup</button>
            <button type="button" onClick={() => restoreInput.current?.click()}>Restore</button>
            <input ref={restoreInput} className="visually-hidden" type="file" accept="application/json,.json" onChange={(event) => restoreProgress(event.target.files?.[0])} aria-label="Restore checklist backup" />
            <button className="reset" onClick={() => { if (confirm("Clear every checkmark?")) setProgress({}); }}>Reset</button>
          </div>
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
                        <Image src={imageFor(sprite.name, variant)} alt={`${variant === "Base" ? "" : `${variant} `}${sprite.name} Sprite`} width={256} height={256} loading="lazy" sizes="(max-width: 760px) calc((100vw - 82px) / 3), 30vw" unoptimized />
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
        <div><strong>Your checklist stays on this device</strong><p>Epic does not currently offer public access to a player’s Sprite collection. Use Backup before switching browsers or phones, then Restore to bring your progress with you.</p></div>
      </aside>

      <footer>
        <span>FORTNITE SPRITE LOCKER · FAN-MADE CHECKLIST</span>
        <p>Not affiliated with or endorsed by Epic Games. Fortnite is a trademark of Epic Games, Inc.</p>
      </footer>
    </main>
  );
}
