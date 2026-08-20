const CATALOG = window.SPRITE_CATALOG;
const SPRITES = CATALOG.families.map(({ name, rarity, variants }) => [name, rarity, variants]);
const TOTAL = SPRITES.reduce((sum, [, , variants]) => sum + variants.length, 0);
const ACTIVE_KEYS = new Set(SPRITES.flatMap(([name, , variants]) => variants.map((variant) => `${name}::${variant}`)));
const STORAGE_KEY = CATALOG.storageKey;
let filter = "missing";
const selectedSprites = new Set();
const selectedVariants = new Set();
let query = "";
let progress = {};

const keyFor = (name, variant) => `${name}::${variant}`;
const slugFor = (name) => name.toLowerCase().replace(/\./g, "").replace(/\s+/g, "-");
const variantSlugFor = (variant) => variant.toLowerCase().replace(/\s+/g, "-");
const stateFor = (name, variant) => progress[keyFor(name, variant)] || { acquired: false, mastered: false };

function sanitizeProgress(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const clean = {};
  for (const [key, state] of Object.entries(value)) {
    if (!ACTIVE_KEYS.has(key) || !state || typeof state !== "object" || Array.isArray(state)) continue;
    const mastered = state.mastered === true;
    const acquired = state.acquired === true || mastered;
    if (acquired || mastered) clean[key] = { acquired, mastered };
  }
  return clean;
}

try {
  progress = sanitizeProgress(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"));
} catch {
  progress = {};
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

function updateCounts() {
  let acquired = 0;
  let mastered = 0;
  for (const [name, , variants] of SPRITES) {
    for (const variant of variants) {
      const state = stateFor(name, variant);
      if (state.acquired) acquired += 1;
      if (state.mastered) mastered += 1;
    }
  }
  for (const [type, count] of [["acquired", acquired], ["mastered", mastered]]) {
    const percent = Math.round((count / TOTAL) * 100);
    document.querySelector(`#${type}-count`).textContent = count;
    const ring = document.querySelector(`#${type}-ring`);
    ring.style.setProperty("--progress", `${percent * 3.6}deg`);
    ring.querySelector("span").textContent = `${percent}%`;
  }
  document.querySelectorAll(".total-count").forEach((node) => { node.textContent = TOTAL; });
}

function render() {
  const list = document.querySelector("#sprite-list");
  list.replaceChildren();
  let shown = 0;

  for (const [name, rarity, variants] of SPRITES) {
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
      const card = document.createElement("article");
      card.className = `sprite-card ${state.mastered ? "is-mastered" : state.acquired ? "is-acquired" : ""}`;
      card.innerHTML = `
        <div class="sprite-art ${variantSlugFor(variant)}">
          <img src="sprites/${slugFor(name)}-${variantSlugFor(variant)}-256.webp" alt="${variant === "Base" ? "" : `${variant} `}${name} Sprite" width="256" height="256" loading="lazy" decoding="async" />
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

function setupMultiFilter(menuId, labelId, items, selected) {
  const menu = document.querySelector(`#${menuId}`);
  const label = document.querySelector(`#${labelId}`);
  for (const item of items) {
    const option = document.createElement("label");
    option.innerHTML = `<input type="checkbox" value="${item}" /><span>${item}</span>`;
    menu.append(option);
  }
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

document.querySelector("#status-filter").addEventListener("change", (event) => {
  filter = event.target.value;
  render();
});

document.querySelector("#search").addEventListener("input", (event) => {
  query = event.target.value;
  render();
});

setupMultiFilter("sprite-filter-menu", "sprite-filter-label", SPRITES.map(([name]) => name), selectedSprites);
setupMultiFilter("variant-filter-menu", "variant-filter-label", ["Base", "Gold", "Cheat Master"], selectedVariants);

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
  if (!confirm("Clear every checkmark?")) return;
  progress = {};
  save();
  render();
});

document.querySelector("#backup").addEventListener("click", () => {
  const backup = { schemaVersion: 1, seasonId: CATALOG.seasonId, exportedAt: new Date().toISOString(), progress: sanitizeProgress(progress) };
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `fortnite-sprite-locker-${CATALOG.seasonId}.json`;
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
    if (backup.seasonId !== CATALOG.seasonId) throw new Error("This backup belongs to a different Fortnite season.");
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

if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
render();
