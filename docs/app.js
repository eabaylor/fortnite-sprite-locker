const SPRITES = [
  ["Batman", "Mythic", ["Base", "Gold", "Gummy", "Galaxy", "Holofoil", "Cube"]],
  ["Water", "Rare", ["Base", "Gold", "Gummy", "Galaxy", "Holofoil"]],
  ["Earth", "Rare", ["Base", "Gold", "Gummy", "Galaxy", "Cube"]],
  ["Fire", "Rare", ["Base", "Gold", "Gummy", "Galaxy", "Holofoil", "Cube"]],
  ["Duck", "Epic", ["Base", "Gold", "Gummy", "Galaxy"]],
  ["Ghost", "Epic", ["Base", "Gold", "Gummy", "Galaxy", "Holofoil"]],
  ["Dream", "Legendary", ["Base", "Gold", "Gummy", "Galaxy", "Cube"]],
  ["Demon", "Epic", ["Base", "Gold", "Gummy", "Galaxy"]],
  ["Punk", "Legendary", ["Base", "Gold", "Gummy", "Galaxy", "Cube"]],
  ["King", "Epic", ["Base", "Gold", "Gummy", "Galaxy", "Holofoil"]],
  ["Burnt Peanut", "Mythic", ["Base"]],
  ["Vini Jr.", "Mythic", ["Base"]],
  ["Zero Point", "Mythic", ["Base", "Gold", "Gummy", "Galaxy"]],
  ["Fishy", "Rare", ["Base", "Gold", "Gummy", "Galaxy", "Cube"]],
  ["Striker", "Legendary", ["Base", "Gold", "Gummy", "Galaxy", "Holofoil"]],
  ["Aura", "Legendary", ["Base", "Gold", "Gummy", "Galaxy"]],
  ["Boss", "Legendary", ["Base", "Gold", "Gummy", "Galaxy", "Cube"]],
  ["Grim", "Mythic", ["Base", "Gold", "Gummy", "Galaxy", "Cube"]],
  ["Air", "Rare", ["Base", "Gold", "Gummy", "Galaxy", "Holofoil"]],
  ["Seven", "Legendary", ["Base", "Gold", "Gummy", "Galaxy", "Holofoil"]],
  ["Pollo", "Mythic", ["Base"]],
];

const TOTAL = SPRITES.reduce((sum, [, , variants]) => sum + variants.length, 0);
const STORAGE_KEY = "sprite-locker-progress";
let filter = "all";
let query = "";
let progress = {};

try {
  progress = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  Object.values(progress).forEach((state) => {
    if (state.mastered) state.acquired = true;
  });
} catch {
  progress = {};
}

const keyFor = (name, variant) => `${name}::${variant}`;
const slugFor = (name) => name.toLowerCase().replace(/\./g, "").replace(/\s+/g, "-");
const stateFor = (name, variant) => progress[keyFor(name, variant)] || { acquired: false, mastered: false };

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

function updateCounts() {
  const states = Object.values(progress);
  const acquired = states.filter((state) => state.acquired).length;
  const mastered = states.filter((state) => state.mastered).length;
  for (const [type, count] of [["acquired", acquired], ["mastered", mastered]]) {
    const percent = Math.round((count / TOTAL) * 100);
    document.querySelector(`#${type}-count`).textContent = count;
    const ring = document.querySelector(`#${type}-ring`);
    ring.style.setProperty("--progress", `${percent * 3.6}deg`);
    ring.querySelector("span").textContent = `${percent}%`;
  }
}

function render() {
  const list = document.querySelector("#sprite-list");
  list.replaceChildren();
  let shown = 0;

  for (const [name, rarity, variants] of SPRITES) {
    if (!name.toLowerCase().includes(query.toLowerCase())) continue;
    const visibleVariants = variants.filter((variant) => {
      const state = stateFor(name, variant);
      if (filter === "missing") return !state.acquired;
      if (filter === "acquired") return state.acquired;
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
        <div class="sprite-art ${variant.toLowerCase()}">
          <img src="sprites/${slugFor(name)}-${variant.toLowerCase()}-256.webp" alt="${variant === "Base" ? "" : `${variant} `}${name} Sprite" width="256" height="256" loading="lazy" />
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

document.querySelector(".filters").addEventListener("click", (event) => {
  const button = event.target.closest("[data-filter]");
  if (!button) return;
  filter = button.dataset.filter;
  document.querySelectorAll("[data-filter]").forEach((item) => item.classList.toggle("active", item === button));
  render();
});

document.querySelector("#search").addEventListener("input", (event) => {
  query = event.target.value;
  render();
});

document.querySelector("#reset").addEventListener("click", () => {
  if (!confirm("Clear every checkmark?")) return;
  progress = {};
  save();
  render();
});

document.querySelector("#sprite-list").addEventListener("change", (event) => {
  const input = event.target.closest("input[type=checkbox]");
  if (!input) return;
  const { name, variant, field } = input.dataset;
  const key = keyFor(name, variant);
  const next = { ...stateFor(name, variant), [field]: input.checked };
  if (field === "mastered" && next.mastered) next.acquired = true;
  if (field === "acquired" && !next.acquired) next.mastered = false;
  progress[key] = next;
  save();
  render();
});

render();
