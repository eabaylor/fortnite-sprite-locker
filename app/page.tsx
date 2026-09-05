"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import currentCatalog from "@/data/catalog.json";
import previousCatalog from "@/archive/chapter-7-season-3.json";

type SpriteFamily = { name: string; rarity: string; variants: string[] };
type UnlockReward = { name: string; variant: string };
type UnlockCode = {
  code: string;
  rewards: UnlockReward[];
  useType: "one-time" | "reusable";
  requirement?: string;
  verifiedDate: string;
  sourceUrl: string;
};
type OtherAdminCode = {
  code: string;
  reward: string;
  category: string;
  useType: "one-time" | "reusable";
  requirement?: string;
  verifiedDate: string;
  sourceUrl: string;
};
type SeasonCatalog = {
  seasonId: string;
  chapter: string;
  season: string;
  seasonTheme: string;
  imageBase: string;
  storageKey: string;
  legacyStorageKeys?: string[];
  updatedDate: string;
  patch: string;
  assetVersion?: string;
  whatsNew?: { title: string; intro?: string; items: string[] };
  unlockCodes?: UnlockCode[];
  otherAdminCodes?: OtherAdminCode[];
  families: SpriteFamily[];
};
type SpriteState = { acquired: boolean; mastered: boolean };
type Progress = Record<string, SpriteState>;
type Filter = "all" | "missing" | "not-mastered" | "acquired" | "acquired-unmastered" | "mastered";

const CATALOGS = [currentCatalog, previousCatalog] as SeasonCatalog[];
const DEFAULT_SEASON_ID = currentCatalog.seasonId;
const RELEASE_VERSION = currentCatalog.assetVersion;
const WHATS_NEW = currentCatalog.whatsNew;
const WHATS_NEW_STORAGE_KEY = "sprite-locker-last-seen-release";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "missing", label: "Missing" },
  { value: "not-mastered", label: "Not Mastered" },
  { value: "acquired", label: "Acquired" },
  { value: "acquired-unmastered", label: "Acquired / Not Mastered" },
  { value: "mastered", label: "Mastered" },
  { value: "all", label: "All" },
];

const keyFor = (name: string, variant: string) => `${name}::${variant}`;
const activeKeysFor = (season: SeasonCatalog) => new Set(
  season.families.flatMap((sprite) => sprite.variants.map((variant) => keyFor(sprite.name, variant))),
);

function imageFor(season: SeasonCatalog, name: string, variant: string) {
  const slug = name.toLowerCase().replace(/\./g, "").replace(/\s+/g, "-");
  const variantSlug = variant.toLowerCase().replace(/\s+/g, "-");
  return `/${season.imageBase}/${slug}-${variantSlug}-256.webp`;
}

function sanitizeProgress(value: unknown, season: SeasonCatalog): Progress {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const activeKeys = activeKeysFor(season);
  const clean: Progress = {};
  for (const [key, state] of Object.entries(value)) {
    if (!activeKeys.has(key) || !state || typeof state !== "object" || Array.isArray(state)) continue;
    const raw = state as Partial<SpriteState>;
    const mastered = raw.mastered === true;
    const acquired = raw.acquired === true || mastered;
    if (acquired || mastered) clean[key] = { acquired, mastered };
  }
  return clean;
}

function loadProgress(season: SeasonCatalog): Progress {
  const keys = [season.storageKey, ...(season.legacyStorageKeys ?? [])];
  for (const key of keys) {
    try {
      const saved = localStorage.getItem(key);
      if (!saved) continue;
      const progress = sanitizeProgress(JSON.parse(saved), season);
      if (key !== season.storageKey) localStorage.setItem(season.storageKey, JSON.stringify(progress));
      return progress;
    } catch {}
  }
  return {};
}

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

function keepFocusInDialog(event: KeyboardEvent, dialog: HTMLElement | null) {
  if (event.key !== "Tab" || !dialog) return;
  const focusable = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter((item) => !item.hidden && item.offsetParent !== null);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function ProgressRing({ value, total, label, tone }: { value: number; total: number; label: string; tone: "green" | "gold" }) {
  const percent = Math.round((value / total) * 100);
  return (
    <div className="progress-unit">
      <div className={`ring ${tone}`} style={{ "--progress": `${percent * 3.6}deg` } as React.CSSProperties}>
        <span>{percent}%</span>
      </div>
      <div>
        <strong>{value}<small> / {total}</small></strong>
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
  const [selectedSeasonId, setSelectedSeasonId] = useState(DEFAULT_SEASON_ID);
  const [progress, setProgress] = useState<Progress>({});
  const [filter, setFilter] = useState<Filter>("missing");
  const [selectedSprites, setSelectedSprites] = useState<string[]>([]);
  const [selectedVariants, setSelectedVariants] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [ready, setReady] = useState(false);
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  const [codeGuideOpen, setCodeGuideOpen] = useState(false);
  const [codeGuideView, setCodeGuideView] = useState<"sprites" | "other">("sprites");
  const [focusedCode, setFocusedCode] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [redeemedAdminCodes, setRedeemedAdminCodes] = useState<string[]>([]);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const restoreInput = useRef<HTMLInputElement>(null);
  const dataMenu = useRef<HTMLDetailsElement>(null);
  const whatsNewClose = useRef<HTMLButtonElement>(null);
  const codeGuideClose = useRef<HTMLButtonElement>(null);
  const whatsNewDialog = useRef<HTMLElement>(null);
  const codeGuideDialog = useRef<HTMLElement>(null);
  const whatsNewReturnFocus = useRef<HTMLElement | null>(null);
  const codeGuideReturnFocus = useRef<HTMLElement | null>(null);

  const activeSeason = CATALOGS.find((season) => season.seasonId === selectedSeasonId) ?? CATALOGS[0];
  const sprites = activeSeason.families;
  const total = sprites.reduce((sum, sprite) => sum + sprite.variants.length, 0);
  const variants = [...new Set(sprites.flatMap((sprite) => sprite.variants))];
  const unlockCodes = activeSeason.unlockCodes ?? [];
  const otherAdminCodes = activeSeason.otherAdminCodes ?? [];
  const adminCodeStorageKey = `sprite-locker-redeemed-admin-codes-${activeSeason.seasonId}`;

  useEffect(() => {
    const initialSeason = CATALOGS[0];
    const savedProgress = loadProgress(initialSeason);
    queueMicrotask(() => {
      setSelectedSeasonId(initialSeason.seasonId);
      setProgress(savedProgress);
      try {
        const savedCodes = JSON.parse(localStorage.getItem(`sprite-locker-redeemed-admin-codes-${initialSeason.seasonId}`) ?? "[]");
        setRedeemedAdminCodes(Array.isArray(savedCodes) ? savedCodes.filter((code): code is string => typeof code === "string") : []);
      } catch {
        setRedeemedAdminCodes([]);
      }
      setReady(true);
      try {
        if (localStorage.getItem(WHATS_NEW_STORAGE_KEY) !== RELEASE_VERSION) setWhatsNewOpen(true);
      } catch {
        setWhatsNewOpen(true);
      }
    });
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  useEffect(() => {
    if (!whatsNewOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeWhatsNew();
      else keepFocusInDialog(event, whatsNewDialog.current);
    };
    document.body.classList.add("modal-open");
    document.addEventListener("keydown", onKeyDown);
    queueMicrotask(() => whatsNewClose.current?.focus());
    return () => {
      document.body.classList.remove("modal-open");
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [whatsNewOpen]);

  useEffect(() => {
    if (!codeGuideOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeCodeGuide();
      else keepFocusInDialog(event, codeGuideDialog.current);
    };
    document.body.classList.add("modal-open");
    document.addEventListener("keydown", onKeyDown);
    queueMicrotask(() => codeGuideClose.current?.focus());
    return () => {
      document.body.classList.remove("modal-open");
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [codeGuideOpen]);

  useEffect(() => {
    let stopped = false;
    const checkForUpdate = async () => {
      try {
        const versionUrl = new URL("./version.json", document.baseURI);
        versionUrl.searchParams.set("check", String(Date.now()));
        const response = await fetch(versionUrl, { cache: "no-store" });
        if (!response.ok) return;
        const latest = await response.json() as { assetVersion?: string };
        if (!stopped && latest.assetVersion && latest.assetVersion !== RELEASE_VERSION) setUpdateAvailable(true);
      } catch {}
    };
    const checkWhenVisible = () => {
      if (document.visibilityState === "visible") void checkForUpdate();
    };
    const timer = window.setInterval(checkForUpdate, 15 * 60 * 1000);
    window.addEventListener("focus", checkForUpdate);
    document.addEventListener("visibilitychange", checkWhenVisible);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", checkForUpdate);
      document.removeEventListener("visibilitychange", checkWhenVisible);
    };
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem(activeSeason.storageKey, JSON.stringify(progress));
  }, [activeSeason.storageKey, progress, ready]);

  useEffect(() => {
    if (ready) localStorage.setItem(adminCodeStorageKey, JSON.stringify(redeemedAdminCodes));
  }, [adminCodeStorageKey, ready, redeemedAdminCodes]);

  useEffect(() => {
    if (!ready) return;
    const syncProgress = () => setProgress(loadProgress(activeSeason));
    const syncVisibleProgress = () => {
      if (document.visibilityState === "visible") syncProgress();
    };
    const syncStoredProgress = (event: StorageEvent) => {
      if ([activeSeason.storageKey, ...(activeSeason.legacyStorageKeys ?? [])].includes(event.key ?? "")) syncProgress();
    };
    window.addEventListener("focus", syncProgress);
    window.addEventListener("pageshow", syncProgress);
    window.addEventListener("storage", syncStoredProgress);
    document.addEventListener("visibilitychange", syncVisibleProgress);
    return () => {
      window.removeEventListener("focus", syncProgress);
      window.removeEventListener("pageshow", syncProgress);
      window.removeEventListener("storage", syncStoredProgress);
      document.removeEventListener("visibilitychange", syncVisibleProgress);
    };
  }, [activeSeason, ready]);

  useEffect(() => {
    const closeDataMenu = (event: PointerEvent) => {
      if (dataMenu.current?.open && !dataMenu.current.contains(event.target as Node)) dataMenu.current.open = false;
    };
    document.addEventListener("pointerdown", closeDataMenu);
    return () => document.removeEventListener("pointerdown", closeDataMenu);
  }, []);

  const counts = useMemo(() => {
    let acquired = 0;
    let mastered = 0;
    for (const sprite of sprites) {
      for (const variant of sprite.variants) {
        const state = progress[keyFor(sprite.name, variant)];
        if (state?.acquired) acquired += 1;
        if (state?.mastered) mastered += 1;
      }
    }
    return { acquired, mastered };
  }, [progress, sprites]);

  const visible = useMemo(() => sprites.map((sprite) => ({
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
  )), [filter, progress, query, selectedSprites, selectedVariants, sprites]);

  function changeSeason(seasonId: string) {
    const nextSeason = CATALOGS.find((season) => season.seasonId === seasonId);
    if (!nextSeason) return;
    setSelectedSeasonId(nextSeason.seasonId);
    setProgress(loadProgress(nextSeason));
    try {
      const savedCodes = JSON.parse(localStorage.getItem(`sprite-locker-redeemed-admin-codes-${nextSeason.seasonId}`) ?? "[]");
      setRedeemedAdminCodes(Array.isArray(savedCodes) ? savedCodes.filter((code): code is string => typeof code === "string") : []);
    } catch {
      setRedeemedAdminCodes([]);
    }
    setFilter("missing");
    setSelectedSprites([]);
    setSelectedVariants([]);
    setQuery("");
    setCodeGuideOpen(false);
  }

  function toggleSpriteFilter(name: string) {
    setSelectedSprites((current) => current.includes(name) ? current.filter((item) => item !== name) : [...current, name]);
  }

  function toggleVariantFilter(variant: string) {
    setSelectedVariants((current) => current.includes(variant) ? current.filter((item) => item !== variant) : [...current, variant]);
  }

  function clearFilters() {
    setFilter("missing");
    setSelectedSprites([]);
    setSelectedVariants([]);
    setQuery("");
  }

  function closeWhatsNew() {
    setWhatsNewOpen(false);
    try {
      localStorage.setItem(WHATS_NEW_STORAGE_KEY, RELEASE_VERSION);
    } catch {}
    const returnTarget = whatsNewReturnFocus.current;
    whatsNewReturnFocus.current = null;
    queueMicrotask(() => returnTarget?.focus());
  }

  function openWhatsNew(opener?: HTMLElement) {
    whatsNewReturnFocus.current = opener ?? (document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null);
    setWhatsNewOpen(true);
  }

  function openCodeGuide(code?: string, view: "sprites" | "other" = "sprites") {
    codeGuideReturnFocus.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    setFocusedCode(code ?? null);
    setCodeGuideView(view);
    setCopiedCode(null);
    setCodeGuideOpen(true);
  }

  function closeCodeGuide() {
    setCodeGuideOpen(false);
    setFocusedCode(null);
    const returnTarget = codeGuideReturnFocus.current;
    codeGuideReturnFocus.current = null;
    queueMicrotask(() => returnTarget?.focus());
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      window.setTimeout(() => setCopiedCode((current) => current === code ? null : current), 1800);
    } catch {
      setCopiedCode(null);
    }
  }

  function redeemCode(unlock: UnlockCode) {
    setProgress((current) => {
      const updated = { ...current };
      for (const reward of unlock.rewards) {
        const key = keyFor(reward.name, reward.variant);
        const old = updated[key] ?? { acquired: false, mastered: false };
        updated[key] = { ...old, acquired: true };
      }
      return updated;
    });
  }

  function markAdminCodeUsed(code: string) {
    setRedeemedAdminCodes((current) => current.includes(code) ? current : [...current, code]);
  }

  function toggle(name: string, variant: string, field: "acquired" | "mastered") {
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
    const backup = { schemaVersion: 1, seasonId: activeSeason.seasonId, exportedAt: new Date().toISOString(), progress: sanitizeProgress(progress, activeSeason) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `fortnite-sprite-locker-${activeSeason.seasonId}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function restoreProgress(file?: File) {
    if (!file) return;
    try {
      const backup = JSON.parse(await file.text()) as { seasonId?: string; progress?: unknown };
      if (backup.seasonId !== activeSeason.seasonId) throw new Error(`Select ${backup.seasonId ?? "the matching season"} before restoring this backup.`);
      const restored = sanitizeProgress(backup.progress, activeSeason);
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
      <a className="skip-link" href="#sprite-checklist">Skip to Sprite checklist</a>
      <header className="hero">
        <h1 className="visually-hidden">Fortnite Sprite Locker checklist</h1>
        <nav>
          <div className="brand-lockup" data-season-id={activeSeason.seasonId}>
            <button className="brand" type="button" onClick={(event) => openWhatsNew(event.currentTarget)} aria-label="Open What’s New" title="Open What’s New">
              <Image src="/fortnite-sprite-locker-logo-transparent.png" alt="Fortnite Sprite Locker" width={1983} height={793} priority sizes="(max-width: 760px) 43vw, 330px" unoptimized />
            </button>
            <label className="season-badge" aria-label="Select Fortnite chapter and season">
              <span className="season-action"><span aria-hidden="true">↕</span> Choose season</span>
              <span className="season-chapter">{activeSeason.chapter}</span>
              <span className="season-choice"><strong>{activeSeason.season}</strong><span aria-hidden="true">▾</span></span>
              <select className="season-native" value={selectedSeasonId} onChange={(event) => changeSeason(event.target.value)}>
                {CATALOGS.map((season) => <option value={season.seasonId} key={season.seasonId}>{season.chapter} · {season.season} — {season.seasonTheme}</option>)}
              </select>
              <span className="season-theme">{activeSeason.seasonTheme}</span>
            </label>
          </div>
          <div className="source-tools">
            <a className="source-link" href="https://fortnite.gg/sprites" target="_blank" rel="noreferrer">Live Sprite source ↗</a>
            <label className="search">
              <span>⌕</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a Sprite…" aria-label="Find a Sprite" />
            </label>
          </div>
          <div className="header-status" id="top">
            <div className="header-status-row">
              <div className="progress-panel" aria-label="Collection progress">
                <ProgressRing value={counts.acquired} total={total} label="Acquired" tone="green" />
                <ProgressRing value={counts.mastered} total={total} label="Mastered" tone="gold" />
              </div>
              <details className="data-menu" ref={dataMenu}>
                <summary aria-label="Open checklist options" title="Checklist options"><span aria-hidden="true">⋮</span></summary>
                <div className="data-menu-panel" aria-label="Checklist data">
                  <button type="button" onClick={(event) => { backupProgress(); event.currentTarget.closest("details")?.removeAttribute("open"); }}>Backup</button>
                  <button type="button" onClick={(event) => { restoreInput.current?.click(); event.currentTarget.closest("details")?.removeAttribute("open"); }}>Restore</button>
                  <input ref={restoreInput} className="visually-hidden" type="file" accept="application/json,.json" onChange={(event) => restoreProgress(event.target.files?.[0])} aria-label="Restore checklist backup" />
                  <button className="reset" onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); if (confirm(`Clear every ${activeSeason.season} checkmark?`)) setProgress({}); }}>Reset</button>
                </div>
              </details>
            </div>
            <p className="update-stamp">UPDATED {activeSeason.updatedDate.toUpperCase()} · PATCH {activeSeason.patch.toUpperCase()}</p>
          </div>
        </nav>
      </header>

      {updateAvailable && (
        <aside className="update-notice" role="status" aria-live="polite">
          <div><strong>A newer Sprite Locker is ready.</strong><span>Your saved checkmarks will stay in place.</span></div>
          <button type="button" onClick={() => window.location.reload()}>Reload latest</button>
        </aside>
      )}

      <section className="tracker" id="sprite-checklist" tabIndex={-1} aria-labelledby="checklist-heading">
        <h2 className="visually-hidden" id="checklist-heading">{activeSeason.chapter} {activeSeason.season} Sprite checklist</h2>
        <div className="filters" role="group" aria-label="Filter checklist">
          <label className="select-filter status-filter">
            <span>Status</span>
            <select value={filter} onChange={(event) => {
              setProgress((current) => sanitizeProgress(current, activeSeason));
              setFilter(event.target.value as Filter);
            }} aria-label="Filter checklist by collection status">
              {FILTERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <MultiSelectFilter label="Sprites" items={sprites.map((sprite) => sprite.name)} selected={selectedSprites} onToggle={toggleSpriteFilter} onClear={() => setSelectedSprites([])} className="sprite-filter" />
          <MultiSelectFilter label="Variants" items={variants} selected={selectedVariants} onToggle={toggleVariantFilter} onClear={() => setSelectedVariants([])} className="variant-filter" />
          <button className="clear-filters" onClick={clearFilters}>Clear filters</button>
          {!!(unlockCodes.length || otherAdminCodes.length) && (
            <button className="admin-codes-trigger" type="button" onClick={() => openCodeGuide()}>
              Admin Codes <span>{unlockCodes.length + otherAdminCodes.length}</span>
            </button>
          )}
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
                  const unlock = unlockCodes.find((item) => item.rewards.some((reward) => reward.name === sprite.name && reward.variant === variant));
                  return (
                    <article className={`sprite-card ${state.mastered ? "is-mastered" : state.acquired ? "is-acquired" : ""}`} key={variant}>
                      <div className={`sprite-art ${variant.toLowerCase().replace(/\s+/g, "-")}`}>
                        <Image src={imageFor(activeSeason, sprite.name, variant)} alt={`${variant === "Base" ? "" : `${variant} `}${sprite.name} Sprite`} width={256} height={256} loading="lazy" sizes="(max-width: 760px) calc((100vw - 82px) / 3), 30vw" unoptimized />
                        {unlock && (
                          <button className="code-unlock-badge" type="button" onClick={() => openCodeGuide(unlock.code)} aria-label={`View unlock code for ${sprite.name} ${variant}`}>
                            Code unlock
                          </button>
                        )}
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
        <div><strong>Each season saves separately on this device</strong><p>Switch seasons at any time without mixing checkmarks. Older progress is restored from the tracker’s previous saved data when available.</p></div>
      </aside>

      <footer>
        <span>FORTNITE SPRITE LOCKER · FAN-MADE CHECKLIST</span>
        <p>Not affiliated with or endorsed by Epic Games. Fortnite is a trademark of Epic Games, Inc.</p>
      </footer>

      {whatsNewOpen && (
        <div className="whats-new-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeWhatsNew(); }}>
          <section ref={whatsNewDialog} className="whats-new-card" role="dialog" aria-modal="true" aria-labelledby="whats-new-title">
            <span className="whats-new-kicker">Tracker update · {currentCatalog.updatedDate}</span>
            <h2 id="whats-new-title">{WHATS_NEW.title}</h2>
            {WHATS_NEW.intro && <p>{WHATS_NEW.intro}</p>}
            <ul>{WHATS_NEW.items.map((item) => <li key={item}>{item}</li>)}</ul>
            <button ref={whatsNewClose} type="button" onClick={closeWhatsNew}>Got it — show my checklist</button>
          </section>
        </div>
      )}

      {codeGuideOpen && !!(unlockCodes.length || otherAdminCodes.length) && (
        <div className="code-guide-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeCodeGuide(); }}>
          <section ref={codeGuideDialog} className="code-guide-card" role="dialog" aria-modal="true" aria-labelledby="code-guide-title">
            <header className="code-guide-header">
              <div>
                <span>Chapter 7 · Season 4</span>
                <h2 id="code-guide-title">Admin Panel Codes</h2>
                <p>In the Battle Royale lobby, open <strong>…/Admin Panel</strong>, enter a code, and submit it. Reward codes work once per account; temporary lobby transformations are reusable.</p>
              </div>
              <button ref={codeGuideClose} className="code-guide-close" type="button" onClick={closeCodeGuide} aria-label="Close Admin Panel codes">×</button>
            </header>
            <div className="code-guide-tabs" role="tablist" aria-label="Admin Panel code categories">
              <button type="button" role="tab" aria-selected={codeGuideView === "sprites"} className={codeGuideView === "sprites" ? "active" : ""} onClick={() => setCodeGuideView("sprites")}>Sprite unlocks <span>{unlockCodes.length}</span></button>
              <button type="button" role="tab" aria-selected={codeGuideView === "other"} className={codeGuideView === "other" ? "active" : ""} onClick={() => setCodeGuideView("other")}>Other rewards <span>{otherAdminCodes.length}</span></button>
            </div>
            <div className="code-guide-list" role="tabpanel">
              {codeGuideView === "sprites" && [...unlockCodes].sort((left, right) => {
                const leftUsed = left.useType === "one-time" && left.rewards.every((reward) => progress[keyFor(reward.name, reward.variant)]?.acquired);
                const rightUsed = right.useType === "one-time" && right.rewards.every((reward) => progress[keyFor(reward.name, reward.variant)]?.acquired);
                return Number(leftUsed) - Number(rightUsed);
              }).map((unlock) => {
                const redeemed = unlock.rewards.every((reward) => progress[keyFor(reward.name, reward.variant)]?.acquired);
                return (
                  <article className={`code-entry ${redeemed && unlock.useType === "one-time" ? "is-used" : ""} ${focusedCode === unlock.code ? "is-focused" : ""}`} key={unlock.code}>
                    <div className="code-rewards">
                      {unlock.rewards.map((reward) => (
                        <div className="code-reward" key={`${reward.name}-${reward.variant}`}>
                          <span className="code-reward-art"><Image src={imageFor(activeSeason, reward.name, reward.variant)} alt="" width={56} height={56} unoptimized /></span>
                          <span><strong>{reward.variant} {reward.name}</strong><small>Sprite</small></span>
                        </div>
                      ))}
                    </div>
                    <div className="code-value-row">
                      <code>{unlock.code}</code>
                      <button type="button" disabled={redeemed && unlock.useType === "one-time"} onClick={() => copyCode(unlock.code)}>{redeemed && unlock.useType === "one-time" ? "Used" : copiedCode === unlock.code ? "Copied!" : "Copy"}</button>
                    </div>
                    {unlock.requirement && <p className="code-requirement"><strong>Requirement:</strong> {unlock.requirement}</p>}
                    <div className="code-entry-footer">
                      <strong className={`code-use-type ${unlock.useType}`}>{unlock.useType === "reusable" ? "Reusable" : "One-time per account"}</strong>
                      <span>Verified {unlock.verifiedDate}</span>
                      <a href={unlock.sourceUrl} target="_blank" rel="noreferrer">source ↗</a>
                      <button className="redeem-code" type="button" disabled={redeemed} onClick={() => redeemCode(unlock)}>{redeemed ? "✓ Acquired" : "Mark redeemed"}</button>
                    </div>
                  </article>
                );
              })}
              {codeGuideView === "other" && [...otherAdminCodes].sort((left, right) => {
                const leftUsed = left.useType === "one-time" && redeemedAdminCodes.includes(left.code);
                const rightUsed = right.useType === "one-time" && redeemedAdminCodes.includes(right.code);
                return Number(leftUsed) - Number(rightUsed);
              }).map((item) => {
                const used = redeemedAdminCodes.includes(item.code);
                return (
                  <article className={`code-entry ${used && item.useType === "one-time" ? "is-used" : ""}`} key={item.code}>
                    <div className="code-rewards">
                      <div className="code-reward code-reward-generic">
                        <span className="code-reward-icon" aria-hidden="true">{item.category === "XP" ? "XP" : item.category === "Sprite Dust" ? "✦" : item.category === "Loading Screen" ? "▣" : item.category === "Lobby Effect" ? "↻" : "⌁"}</span>
                        <span><strong>{item.reward}</strong><small>{item.category}</small></span>
                      </div>
                    </div>
                    <div className="code-value-row">
                      <code>{item.code}</code>
                      <button type="button" disabled={used && item.useType === "one-time"} onClick={() => copyCode(item.code)}>{used && item.useType === "one-time" ? "Used" : copiedCode === item.code ? "Copied!" : "Copy"}</button>
                    </div>
                    {item.requirement && <p className="code-requirement"><strong>Requirement:</strong> {item.requirement}</p>}
                    <div className="code-entry-footer">
                      <strong className={`code-use-type ${item.useType}`}>{item.useType === "reusable" ? "Reusable" : "One-time per account"}</strong>
                      <span>Verified {item.verifiedDate}</span>
                      <a href={item.sourceUrl} target="_blank" rel="noreferrer">source ↗</a>
                      {item.useType === "one-time" && <button className="redeem-code" type="button" disabled={used} onClick={() => markAdminCodeUsed(item.code)}>{used ? "✓ Used" : "Mark used"}</button>}
                    </div>
                  </article>
                );
              })}
            </div>
            <p className="code-guide-note">Codes are stored in this tracker for offline access after your first visit. “One-time” means once per Fortnite account—not once per day. If a valid code is rejected, restart the game and confirm any listed requirement is complete.</p>
          </section>
        </div>
      )}
    </main>
  );
}
