import catalogs from './locker-catalogs.js';
/** Versioned, immutable dictionaries keep small links safe across catalog reordering. */
export function makeSnapshot(season, progress, nickname = "") {
  const families = season.families.map(({ name, variants }) => [name, [...variants]]);
  const states = families.flatMap(([name, variants]) => variants.map((variant) => {
    const state = progress[`${name}::${variant}`];
    return state?.mastered ? "2" : state?.acquired ? "1" : "0";
  })).join("");
  return { v: 1, season: season.seasonId, name: nickname.trim().slice(0, 40) || "Friend", date: new Date().toISOString(), families, states };
}

export function encodeSnapshot(snapshot) {
  const dictionary = Object.entries(catalogs).find(([, item]) => item.season === snapshot.season && JSON.stringify(item.families) === JSON.stringify(snapshot.families));
  if (dictionary && snapshot.v === 1 && /^[012]+$/.test(snapshot.states)) {
    const bytes = [];
    for (let i = 0; i < snapshot.states.length; i += 5) {
      let value = 0;
      for (let j = 0; j < 5; j++) value = value * 3 + Number(snapshot.states[i + j] || 0);
      bytes.push(value);
    }
    snapshot = [3, dictionary[0], snapshot.name, Math.floor(Date.parse(snapshot.date) / 60000), btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')];
  }
  return btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(snapshot))))
    .replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function decodeSnapshot(input) {
  const trimmed = input.trim();
  const token = trimmed.includes("#locker=") ? trimmed.split("#locker=")[1] : trimmed.replace(/^#locker=/, "");
  if (!token || token.length > 40000 || !/^[A-Za-z0-9_-]+$/.test(token)) throw new Error("Paste a complete locker share link.");
  let value;
  try {
    const base64 = token.replaceAll("-", "+").replaceAll("_", "/");
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))));
  } catch { throw new Error("This locker link is incomplete or damaged. Ask your friend to share it again."); }
  if (Array.isArray(value) && value[0] === 3) {
    const [, id, name, minute, packed] = value;
    const dictionary = catalogs[id];
    if (!dictionary || !Number.isSafeInteger(minute) || typeof packed !== 'string' || !/^[A-Za-z0-9_-]+$/.test(packed)) throw new Error('This locker link needs a newer tracker. Refresh the page and try again.');
    const count = dictionary.families.reduce((n, [, variants]) => n + variants.length, 0);
    const bytes = [...atob(packed.replaceAll('-', '+').replaceAll('_', '/'))].map(c => c.charCodeAt(0));
    if (bytes.length !== Math.ceil(count / 5) || bytes.some(b => b > 242)) throw new Error('This locker snapshot has invalid progress.');
    const states = bytes.map(b => b.toString(3).padStart(5, '0')).join('').slice(0, count);
    value = { v: 1, season: dictionary.season, families: dictionary.families, name, date: new Date(minute * 60000).toISOString(), states };
  }
  const text = (s, max) => typeof s === "string" && s.length > 0 && s.length <= max && !s.includes("::");
  if (value?.v !== 1 || !text(value.season, 80) || typeof value.name !== "string" || !value.name.length || value.name.length > 40 || typeof value.date !== "string" || !Number.isFinite(Date.parse(value.date))
    || !Array.isArray(value.families) || value.families.length > 100 || !value.families.length
    || typeof value.states !== "string" || !/^[012]+$/.test(value.states)) throw new Error("This locker snapshot has an unsupported format.");
  const keys = [];
  for (const entry of value.families) {
    if (!Array.isArray(entry) || entry.length !== 2 || !text(entry[0], 80) || !Array.isArray(entry[1]) || !entry[1].length || entry[1].length > 30 || !entry[1].every((v) => text(v, 60))) throw new Error("This locker snapshot has invalid Sprite entries.");
    for (const variant of entry[1]) keys.push(`${entry[0]}::${variant}`);
  }
  if (keys.length !== value.states.length || keys.length > 2000 || new Set(keys).size !== keys.length) throw new Error("This locker snapshot has mismatched or duplicate entries.");
  return { ...value, entries: new Map(keys.map((key, i) => [key, Number(value.states[i])])) };
}

export function matchesComparison(mode, mine, theirs) {
  if (mode === "all") return true;
  if (theirs === undefined) return false;
  if (mode === "i-need") return mine === 0 && theirs > 0;
  if (mode === "they-need") return mine > 0 && theirs === 0;
  if (mode === "both-missing") return mine === 0 && theirs === 0;
  if (mode === "not-mastered") return mine < 2 || theirs < 2;
  return true;
}

const statusName = (status) => status === 2 ? "Mastered" : status === 1 ? "Acquired" : status === 0 ? "Missing" : "Not in snapshot";

/** One shared DOM implementation keeps the React and GitHub Pages tools identical. */
export function createLockerTools(host) {
  let options;
  let friend = null;
  let mode = "all";
  let importPending = location.hash.startsWith("#locker=") ? location.hash : null;
  host.className = "locker-tools";
  host.innerHTML = `
    <details class="locker-sharing" open>
      <summary>Share & compare lockers</summary>
      <p class="locker-help">Share a snapshot of this season’s checklist. Links include your collection and optional nickname. Anyone with the link can view it; updates require a fresh link.</p>
      <div class="locker-share-actions"><label>Your nickname (optional)<input class="locker-nickname" maxlength="40" placeholder="Player name" autocomplete="off"></label><button type="button" class="locker-share">Create share link</button></div>
      <div class="locker-share-result" hidden><label>Your share link<input class="locker-share-url" readonly aria-label="Your locker share link"></label><button type="button" class="locker-copy">Copy link</button><p>Send this link to your friend. Their saved progress stays separate.</p></div>
      <form class="locker-import"><label>Friend’s locker link<textarea class="locker-import-url" rows="2" maxlength="40000" placeholder="Paste a friend’s share link" required></textarea></label><button type="submit">Compare locker</button></form>
      <p class="locker-message" role="status" aria-live="polite"></p>
    </details>
    <div class="locker-comparison" hidden><div><strong class="locker-friend-name"></strong><p class="locker-friend-date"></p></div><button type="button" class="locker-remove">Remove comparison</button>
      <label>Compare<select class="locker-compare-filter" aria-label="Filter locker comparison"><option value="all">All Sprites</option><option value="i-need">I need / they have</option><option value="they-need">They need / I have</option><option value="both-missing">Both missing</option><option value="not-mastered">Either player not mastered</option></select></label>
    </div>
    <p class="locker-count" role="status" aria-live="polite"></p>
    <div class="locker-list-head"><span>Sprite / variant</span><span>You</span><span class="locker-friend-column" hidden>Friend</span></div>
    <div class="locker-list" role="list" aria-label="Sprite locker comparison"></div>`;
  const $ = (selector) => host.querySelector(selector);
  const message = (text) => { $(".locker-message").textContent = text; };
  const importFriend = (input) => {
    try {
      const snapshot = decodeSnapshot(input);
      if (!options.catalogs.some((s) => s.seasonId === snapshot.season)) throw new Error("This link uses a season that isn’t available in this tracker yet.");
      friend = snapshot;
      mode = "all";
      $(".locker-compare-filter").value = mode;
      $(".locker-share-result").hidden = true;
      if (snapshot.season !== options.season.seasonId) options.onSeason(snapshot.season);
      message("Snapshot loaded. Your own checklist has not been changed.");
      render();
    } catch (error) { message(error.message); }
  };
  $(".locker-share").addEventListener("click", () => {
    const snapshot = makeSnapshot(options.season, options.progress, $(".locker-nickname").value);
    const url = new URL(location.href);
    url.search = "";
    url.hash = `locker=${encodeSnapshot(snapshot)}`;
    $(".locker-share-url").value = url.href;
    $(".locker-share-result").hidden = false;
    message("Share link created. It captures your progress right now; create a new link after further updates.");
  });
  $(".locker-copy").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($(".locker-share-url").value); message("Locker link copied."); }
    catch { $(".locker-share-url").focus(); $(".locker-share-url").select(); message("Copy the selected link to share it."); }
  });
  $(".locker-import").addEventListener("submit", (event) => { event.preventDefault(); importFriend($(".locker-import-url").value); });
  $(".locker-remove").addEventListener("click", () => {
    friend = null; mode = "all";
    if (location.hash.startsWith("#locker=")) history.replaceState(null, "", location.pathname + location.search);
    message("Comparison removed. Your checklist is unchanged."); render();
  });
  $(".locker-compare-filter").addEventListener("change", (event) => { mode = event.target.value; render(); });
  $(".locker-list").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-field]");
    if (button) options.onToggle(button.dataset.name, button.dataset.variant, button.dataset.field);
  });
  function render() {
    if (!options) return;
    const comparing = friend?.season === options.season.seasonId;
    $(".locker-comparison").hidden = !comparing;
    $(".locker-friend-column").hidden = !comparing;
    host.classList.toggle("is-comparing", comparing);
    if (comparing) {
      $(".locker-friend-name").textContent = `${friend.name} · ${options.season.chapter} ${options.season.season}`;
      $(".locker-friend-date").textContent = `Snapshot from ${new Date(friend.date).toLocaleString()}. Progress may have changed since sharing.`;
      $(".locker-friend-column").textContent = friend.name;
    }
    const list = $(".locker-list");
    const focus = document.activeElement?.closest("button[data-field]");
    const focusedKey = focus && host.contains(focus) ? [focus.dataset.name, focus.dataset.variant, focus.dataset.field] : null;
    list.replaceChildren();
    let count = 0;
    for (const family of options.families) for (const variant of family.variants) {
      const key = `${family.name}::${variant}`;
      const state = options.progress[key] || {};
      const mine = state.mastered ? 2 : state.acquired ? 1 : 0;
      const theirs = comparing ? friend.entries.get(key) : undefined;
      if (comparing && !matchesComparison(mode, mine, theirs)) continue;
      count++;
      const row = document.createElement("div");
      row.className = "locker-list-row"; row.setAttribute("role", "listitem");
      const identity = document.createElement("div"); identity.className = "locker-sprite-name";
      const image = document.createElement("img"); image.src = options.imageFor(family.name, variant); image.alt = ""; image.loading = "lazy"; image.width = 42; image.height = 42;
      const text = document.createElement("span"); const strong = document.createElement("strong"); strong.textContent = family.name;
      const small = document.createElement("small"); small.textContent = variant; text.append(strong, small); identity.append(image, text); row.append(identity);
      const actions = document.createElement("div"); actions.className = "locker-own-status";
      for (const [field, label, pressed] of [["acquired", "Acquired", mine > 0], ["mastered", "Mastered", mine === 2]]) {
        const button = document.createElement("button"); button.type = "button"; button.textContent = label;
        button.dataset.name = family.name; button.dataset.variant = variant; button.dataset.field = field;
        button.className = `locker-status ${field}`; button.setAttribute("aria-pressed", String(pressed)); button.setAttribute("aria-label", `${family.name} ${variant} ${label}`); actions.append(button);
        if (focusedKey?.join("::") === [family.name, variant, field].join("::")) queueMicrotask(() => button.focus({ preventScroll: true }));
      }
      row.append(actions);
      if (comparing) {
        const badge = document.createElement("span"); badge.className = `locker-friend-status state-${theirs ?? "unknown"}`; badge.textContent = statusName(theirs); row.append(badge);
      }
      list.append(row);
    }
    $(".locker-count").textContent = `${count} Sprite variant${count === 1 ? "" : "s"}${comparing ? " match this comparison" : " shown"}.`;
    if (!count) { const empty = document.createElement("p"); empty.className = "locker-help"; empty.textContent = "No matches. Try another comparison or clear the checklist filters above."; list.append(empty); }
  }
  return { update(next) {
    const seasonChanged = options && options.season.seasonId !== next.season.seasonId;
    options = next;
    if (seasonChanged) { $(".locker-share-result").hidden = true; if (friend && friend.season !== next.season.seasonId) message("This friend’s snapshot is from another season. Switch back to its season to compare."); }
    if (importPending) { const input = importPending; importPending = null; importFriend(input); }
    render();
  } };
}
