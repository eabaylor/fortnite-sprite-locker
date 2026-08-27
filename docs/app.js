const BUNDLE = window.SPRITE_CATALOGS;
const CATALOGS = BUNDLE.seasons;
const RELEASE_VERSION = BUNDLE.assetVersion;
const WHATS_NEW_STORAGE_KEY = "sprite-locker-last-seen-release";
let season = CATALOGS.find((item) => item.seasonId === BUNDLE.defaultSeasonId)
  || CATALOGS[0];
let filter = "missing";
const selectedSprites = new Set();
const selectedVariants = new Set();
let query = "";
let progress = {};
let focusedCode = null;

const keyFor = (name, variant) => `${name}::${variant}`;
const slugFor = (name) => name.toLowerCase().replace(/\./g, "").replace(/\s+/g, "-");
const variantSlugFor = (variant) => variant.toLowerCase().replace(/\s+/g, "-");
const stateFor = (name, variant) => progress[keyFor(name, variant)] || { acquired: false, mastered: false };
const sprites = () => season.families;
const unlockCodes = () => season.unlockCodes || [];
const unlockFor = (name, variant) => unlockCodes().find((item) => item.rewards.some((reward) => reward.name === name && reward.variant === variant));
const total = () => sprites().reduce((sum, family) => sum + family.variants.length, 0);
const activeKeys = () => new Set(sprites().flatMap((family) => family.variants.map((variant) => keyFor(family.name, variant))));

function sanitizeProgress(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const keys = activeKeys();
  const clean = {};
  for (const [key, state] of Object.entries(value)) {
    if (!keys.has(key) || !state || typeof state !== "object" || Array.isArray(state)) continue;
    const mastered = state.mastered === true;
    const acquired = state.acquired === true || mastered;
    if (acquired || mastered) clean[key] = { acquired, mastered };
  }
  return clean;
}

function loadProgress() {
  for (const key of [season.storageKey, ...(season.legacyStorageKeys || [])]) {
    try {
      const saved = localStorage.getItem(key);
      if (!saved) continue;
      const restored = sanitizeProgress(JSON.parse(saved));
      if (key !== season.storageKey) localStorage.setItem(season.storageKey, JSON.stringify(restored));
      return restored;
    } catch {}
  }
  return {};
}

progress = loadProgress();

function save() {
  localStorage.setItem(season.storageKey, JSON.stringify(progress));
}

function updateCounts() {
  let acquired = 0;
  let mastered = 0;
  for (const family of sprites()) {
    for (const variant of family.variants) {
      const state = stateFor(family.name, variant);
      if (state.acquired) acquired += 1;
      if (state.mastered) mastered += 1;
    }
  }
  for (const [type, count] of [["acquired", acquired], ["mastered", mastered]]) {
    const percent = Math.round((count / total()) * 100);
    document.querySelector(`#${type}-count`).textContent = count;
    const ring = document.querySelector(`#${type}-ring`);
    ring.style.setProperty("--progress", `${percent * 3.6}deg`);
    ring.querySelector("span").textContent = `${percent}%`;
  }
  document.querySelectorAll(".total-count").forEach((node) => { node.textContent = total(); });
}

function updateSeasonUi() {
  document.querySelector(".brand-lockup").dataset.seasonId = season.seasonId;
  document.querySelector("#season-select").value = season.seasonId;
  document.querySelector("#season-chapter").textContent = season.chapter;
  document.querySelector("#season-name").textContent = season.season;
  document.querySelector("#season-theme").textContent = season.seasonTheme;
  document.querySelector(".update-stamp").textContent = `UPDATED ${season.updatedDate.toUpperCase()} · PATCH ${season.patch.toUpperCase()}`;
  document.querySelector(".tracker").setAttribute("aria-label", `${season.chapter} ${season.season} Sprite checklist`);
  const codeTrigger = document.querySelector("#code-guide-trigger");
  codeTrigger.hidden = unlockCodes().length === 0;
  document.querySelector("#code-guide-count").textContent = unlockCodes().length;
}

function render() {
  const list = document.querySelector("#sprite-list");
  list.replaceChildren();
  let shown = 0;

  for (const { name, rarity, variants } of sprites()) {
    if (selectedSprites.size && !selectedSprites.has(name)) continue;
    if (!name.toLowerCase().includes(query.trim().toLowerCase())) continue;
    const visibleVariants = variants.filter((variant) => {
      if (selectedVariants.size && !selectedVariants.has(variant)) return false;
      const state = stateFor(name, variant);
      if (filter === "missing") return !state.acquired;
      if (filter === "not-mastered") return !state.mastered;
      if (filter === "acquired") return state.acquired;
      if (filter === "acquired-unmastered") return state.acquired && !state.mastered;
      if (filter === "mastered") return state.mastered;
      return true;
    });
    if (!visibleVariants.length) continue;
    shown += visibleVariants.length;

    const row = document.createElement("section");
    row.className = "sprite-row";
    row.innerHTML = `
      <div class="row-label">
        <span class="rarity ${rarity.toLowerCase()}">${rarity}</span>
        <h3>${name}</h3>
        <a href="https://fortnite.gg/sprites?search=${encodeURIComponent(name)}" target="_blank" rel="noreferrer">details ↗</a>
      </div>
      <div class="variant-strip"></div>`;
    const strip = row.querySelector(".variant-strip");

    for (const variant of visibleVariants) {
      const state = stateFor(name, variant);
      const unlock = unlockFor(name, variant);
      const card = document.createElement("article");
      card.className = `sprite-card ${state.mastered ? "is-mastered" : state.acquired ? "is-acquired" : ""}`;
      card.innerHTML = `
        <div class="sprite-art ${variantSlugFor(variant)}">
          <img src="${season.imageBase}/${slugFor(name)}-${variantSlugFor(variant)}-256.webp" alt="${variant === "Base" ? "" : `${variant} `}${name} Sprite" width="256" height="256" loading="lazy" decoding="async" />
        </div>
        <h4>${variant}</h4>
        <label class="check acquired-check">
          <input type="checkbox" data-name="${name}" data-variant="${variant}" data-field="acquired" aria-label="${name} ${variant} acquired" ${state.acquired ? "checked" : ""} />
          <span><span class="long-label">Acquired</span><span class="short-label">A</span></span>
        </label>
        <label class="check mastered-check">
          <input type="checkbox" data-name="${name}" data-variant="${variant}" data-field="mastered" aria-label="${name} ${variant} mastered" ${state.mastered ? "checked" : ""} />
          <span><span class="long-label">Mastered</span><span class="short-label">M</span></span>
        </label>`;
      if (unlock) {
        const badge = document.createElement("button");
        badge.className = "code-unlock-badge";
        badge.type = "button";
        badge.textContent = "Code unlock";
        badge.setAttribute("aria-label", `View unlock code for ${name} ${variant}`);
        badge.addEventListener("click", () => openCodeGuide(unlock.code));
        card.querySelector(".sprite-art").append(badge);
      }
      strip.append(card);
    }
    list.append(row);
  }

  if (!shown) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.innerHTML = "<strong>No Sprites here.</strong><span>Try another name or filter.</span>";
    list.append(empty);
  }
  updateCounts();
}

function populateFilter(menuId, labelId, items, selected) {
  const menu = document.querySelector(`#${menuId}`);
  menu.querySelectorAll("label").forEach((label) => label.remove());
  for (const item of items) {
    const option = document.createElement("label");
    option.innerHTML = `<input type="checkbox" value="${item}" /><span>${item}</span>`;
    menu.append(option);
  }
  document.querySelector(`#${labelId}`).textContent = "All";
  selected.clear();
}

function setupMultiFilter(menuId, labelId, selected) {
  const menu = document.querySelector(`#${menuId}`);
  const label = document.querySelector(`#${labelId}`);
  const updateLabel = () => {
    label.textContent = selected.size === 0 ? "All" : selected.size === 1 ? [...selected][0] : `${selected.size} selected`;
  };
  menu.addEventListener("change", (event) => {
    const input = event.target.closest("input[type=checkbox]");
    if (!input) return;
    if (input.checked) selected.add(input.value);
    else selected.delete(input.value);
    updateLabel();
    render();
  });
  menu.querySelector("[data-clear-selection]").addEventListener("click", () => {
    selected.clear();
    menu.querySelectorAll("input[type=checkbox]").forEach((input) => { input.checked = false; });
    updateLabel();
    render();
  });
}

function populateSeasonFilters() {
  populateFilter("sprite-filter-menu", "sprite-filter-label", sprites().map(({ name }) => name), selectedSprites);
  populateFilter("variant-filter-menu", "variant-filter-label", [...new Set(sprites().flatMap(({ variants }) => variants))], selectedVariants);
}

const whatsNew = CATALOGS.find((item) => item.seasonId === BUNDLE.defaultSeasonId)?.whatsNew || {
  title: "Sprite catalog updated",
  intro: "The tracker has been refreshed with the latest released Sprites.",
  items: [],
};
const whatsNewBackdrop = document.querySelector("#whats-new-backdrop");
const whatsNewClose = document.querySelector("#whats-new-close");
document.querySelector("#whats-new-title").textContent = whatsNew.title;
document.querySelector("#whats-new-intro").textContent = whatsNew.intro || "";
document.querySelector("#whats-new-kicker").textContent = `Tracker update · ${season.updatedDate}`;
document.querySelector("#whats-new-items").replaceChildren(...whatsNew.items.map((item) => {
  const entry = document.createElement("li");
  entry.textContent = item;
  return entry;
}));

function openWhatsNew() {
  whatsNewBackdrop.hidden = false;
  document.body.classList.add("modal-open");
  queueMicrotask(() => whatsNewClose.focus());
}

function closeWhatsNew() {
  whatsNewBackdrop.hidden = true;
  document.body.classList.remove("modal-open");
  try { localStorage.setItem(WHATS_NEW_STORAGE_KEY, RELEASE_VERSION); } catch {}
}

document.querySelector("#whats-new-trigger").addEventListener("click", openWhatsNew);
whatsNewClose.addEventListener("click", closeWhatsNew);
whatsNewBackdrop.addEventListener("click", (event) => {
  if (event.target === whatsNewBackdrop) closeWhatsNew();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !whatsNewBackdrop.hidden) closeWhatsNew();
});

const codeGuideBackdrop = document.querySelector("#code-guide-backdrop");
const codeGuideClose = document.querySelector("#code-guide-close");
const codeGuideList = document.querySelector("#code-guide-list");

function renderCodeGuide() {
  document.querySelector("#code-guide-season").textContent = `${season.chapter} · ${season.season}`;
  codeGuideList.replaceChildren();
  for (const unlock of unlockCodes()) {
    const redeemed = unlock.rewards.every((reward) => stateFor(reward.name, reward.variant).acquired);
    const entry = document.createElement("article");
    entry.className = `code-entry ${focusedCode === unlock.code ? "is-focused" : ""}`;

    const rewards = document.createElement("div");
    rewards.className = "code-rewards";
    for (const reward of unlock.rewards) {
      const item = document.createElement("div");
      item.className = "code-reward";
      item.innerHTML = `
        <span class="code-reward-art"><img src="${season.imageBase}/${slugFor(reward.name)}-${variantSlugFor(reward.variant)}-256.webp" alt="" width="56" height="56" /></span>
        <span><strong>${reward.variant} ${reward.name}</strong><small>Sprite</small></span>`;
      rewards.append(item);
    }

    const codeRow = document.createElement("div");
    codeRow.className = "code-value-row";
    const code = document.createElement("code");
    code.textContent = unlock.code;
    const copy = document.createElement("button");
    copy.type = "button";
    copy.dataset.copyCode = unlock.code;
    copy.textContent = "Copy";
    codeRow.append(code, copy);

    entry.append(rewards, codeRow);
    if (unlock.requirement) {
      const requirement = document.createElement("p");
      requirement.className = "code-requirement";
      requirement.innerHTML = `<strong>Requirement:</strong> ${unlock.requirement}`;
      entry.append(requirement);
    }

    const footer = document.createElement("div");
    footer.className = "code-entry-footer";
    const verified = document.createElement("span");
    verified.textContent = `Verified ${unlock.verifiedDate}`;
    const source = document.createElement("a");
    source.href = unlock.sourceUrl;
    source.target = "_blank";
    source.rel = "noreferrer";
    source.textContent = "source ↗";
    const redeem = document.createElement("button");
    redeem.className = "redeem-code";
    redeem.type = "button";
    redeem.dataset.redeemCode = unlock.code;
    redeem.disabled = redeemed;
    redeem.textContent = redeemed ? "✓ Acquired" : "Mark redeemed";
    footer.append(verified, source, redeem);
    entry.append(footer);
    codeGuideList.append(entry);
  }
}

function openCodeGuide(code = null) {
  focusedCode = code;
  renderCodeGuide();
  codeGuideBackdrop.hidden = false;
  document.body.classList.add("modal-open");
  queueMicrotask(() => codeGuideClose.focus());
}

function closeCodeGuide() {
  codeGuideBackdrop.hidden = true;
  focusedCode = null;
  document.body.classList.remove("modal-open");
}

async function copyCodeText(value) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value);
  const field = document.createElement("textarea");
  field.value = value;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.append(field);
  field.select();
  document.execCommand("copy");
  field.remove();
}

document.querySelector("#code-guide-trigger").addEventListener("click", () => openCodeGuide());
codeGuideClose.addEventListener("click", closeCodeGuide);
codeGuideBackdrop.addEventListener("click", (event) => {
  if (event.target === codeGuideBackdrop) closeCodeGuide();
});
codeGuideList.addEventListener("click", async (event) => {
  const copy = event.target.closest("[data-copy-code]");
  if (copy) {
    try {
      await copyCodeText(copy.dataset.copyCode);
      copy.textContent = "Copied!";
      setTimeout(() => { copy.textContent = "Copy"; }, 1800);
    } catch {
      copy.textContent = "Copy failed";
    }
    return;
  }
  const redeem = event.target.closest("[data-redeem-code]");
  if (!redeem) return;
  const unlock = unlockCodes().find((item) => item.code === redeem.dataset.redeemCode);
  if (!unlock) return;
  for (const reward of unlock.rewards) {
    const key = keyFor(reward.name, reward.variant);
    progress[key] = { ...stateFor(reward.name, reward.variant), acquired: true };
  }
  save();
  render();
  renderCodeGuide();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !codeGuideBackdrop.hidden) closeCodeGuide();
});

const seasonSelect = document.querySelector("#season-select");
for (const catalog of CATALOGS) {
  const option = document.createElement("option");
  option.value = catalog.seasonId;
  option.textContent = `${catalog.chapter} · ${catalog.season} — ${catalog.seasonTheme}`;
  seasonSelect.append(option);
}
seasonSelect.addEventListener("change", () => {
  const nextSeason = CATALOGS.find((item) => item.seasonId === seasonSelect.value);
  if (!nextSeason) return;
  season = nextSeason;
  progress = loadProgress();
  filter = "missing";
  query = "";
  closeCodeGuide();
  document.querySelector("#status-filter").value = filter;
  document.querySelector("#search").value = "";
  populateSeasonFilters();
  updateSeasonUi();
  render();
});

document.querySelector("#status-filter").addEventListener("change", (event) => {
  filter = event.target.value;
  render();
});

document.querySelector("#search").addEventListener("input", (event) => {
  query = event.target.value;
  render();
});

setupMultiFilter("sprite-filter-menu", "sprite-filter-label", selectedSprites);
setupMultiFilter("variant-filter-menu", "variant-filter-label", selectedVariants);
populateSeasonFilters();

document.querySelector("#clear-filters").addEventListener("click", () => {
  filter = "missing";
  query = "";
  selectedSprites.clear();
  selectedVariants.clear();
  document.querySelector("#status-filter").value = filter;
  document.querySelector("#search").value = "";
  document.querySelectorAll(".filter-menu input[type=checkbox]").forEach((input) => { input.checked = false; });
  document.querySelector("#sprite-filter-label").textContent = "All";
  document.querySelector("#variant-filter-label").textContent = "All";
  render();
});

document.querySelector("#reset").addEventListener("click", () => {
  if (!confirm(`Clear every ${season.season} checkmark?`)) return;
  progress = {};
  save();
  render();
});

document.querySelector("#backup").addEventListener("click", () => {
  const backup = { schemaVersion: 1, seasonId: season.seasonId, exportedAt: new Date().toISOString(), progress: sanitizeProgress(progress) };
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `fortnite-sprite-locker-${season.seasonId}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

const restoreInput = document.querySelector("#restore-input");
document.querySelector("#restore").addEventListener("click", () => restoreInput.click());
restoreInput.addEventListener("change", async () => {
  const file = restoreInput.files?.[0];
  if (!file) return;
  try {
    const backup = JSON.parse(await file.text());
    if (backup.seasonId !== season.seasonId) throw new Error(`Select ${backup.seasonId || "the matching season"} before restoring this backup.`);
    progress = sanitizeProgress(backup.progress);
    save();
    render();
    alert(`Restored ${Object.keys(progress).length} saved Sprite entries.`);
  } catch (error) {
    alert(error instanceof Error ? error.message : "That backup file could not be restored.");
  } finally {
    restoreInput.value = "";
  }
});

document.querySelector("#sprite-list").addEventListener("change", (event) => {
  const input = event.target.closest("input[type=checkbox]");
  if (!input) return;
  const { name, variant, field } = input.dataset;
  const key = keyFor(name, variant);
  const next = { ...stateFor(name, variant), [field]: input.checked };
  if (field === "mastered" && next.mastered) next.acquired = true;
  if (field === "acquired" && !next.acquired) next.mastered = false;
  if (!next.acquired && !next.mastered) delete progress[key];
  else progress[key] = next;
  save();
  render();
});

updateSeasonUi();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
render();
try {
  if (localStorage.getItem(WHATS_NEW_STORAGE_KEY) !== RELEASE_VERSION) openWhatsNew();
} catch {
  openWhatsNew();
}
