import catalogs from './locker-catalogs.js';
/** Versioned, immutable dictionaries keep small links safe across catalog reordering. */
export function makeSnapshot(season, progress, nickname = "") {
  if (!nickname.trim()) throw new Error('Enter your nickname before creating a share link.');
  const families = season.families.map(({ name, variants }) => [name, [...variants]]);
  const states = families.flatMap(([name, variants]) => variants.map((variant) => {
    const state = progress[`${name}::${variant}`];
    return state?.mastered ? "2" : state?.acquired ? "1" : "0";
  })).join("");
  return { v: 1, season: season.seasonId, name: nickname.trim().slice(0, 40), date: new Date().toISOString(), families, states };
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

export function matchesGroupComparison(mode, mine, statuses) {
  if (mode === 'all') return true;
  if (!statuses.some(s => s !== undefined)) return false;
  if (mode === 'i-need') return mine === 0 && statuses.some(s => s > 0);
  if (mode === 'they-need') return mine > 0 && statuses.some(s => s === 0);
  if (mode === 'both-missing') return mine === 0 && statuses.every(s => s === 0);
  if (mode === 'not-mastered') return mine < 2 || statuses.some(s => s !== undefined && s < 2);
  return true;
}

export function addFriendSnapshot(friends, snapshot) {
  const index = friends.findIndex(f => f.season === snapshot.season && f.name.toLocaleLowerCase() === snapshot.name.toLocaleLowerCase());
  if (index >= 0) return friends.map((f, i) => i === index ? snapshot : f);
  if (friends.length >= 4) throw new Error('You can compare with up to four friends. Remove a friend before adding another.');
  return [...friends, snapshot];
}

/** One shared DOM implementation keeps the React and GitHub Pages tools identical. */
export function createLockerTools(host) {
  let options;
  let friends = [];
  let target = '*';
  let mode = "all";
  let importPending = location.hash.startsWith("#locker=") ? location.hash : null;
  host.className = "locker-tools";
  host.innerHTML = `
    <details class="locker-sharing" open>
      <summary>Share & compare lockers</summary>
      <p class="locker-help">Compare your locker with up to four friends. Links include your collection and nickname. Anyone with the link can view it; updates require a fresh link. Reimporting the same nickname updates that friend’s column. Comparison is read-only; update your collection in Compact or Classic view.</p>
      <div class="locker-share-actions"><label>Your nickname (required)<input class="locker-nickname" maxlength="40" placeholder="Player name" autocomplete="off" required></label><button type="button" class="locker-share">Create share link</button></div>
      <div class="locker-share-result" hidden><label>Your share link<input class="locker-share-url" readonly aria-label="Your locker share link"></label><button type="button" class="locker-copy">Copy link</button><p>Send this link to your friend. Their saved progress stays separate.</p></div>
      <form class="locker-import"><label>Add a friend’s locker link<textarea class="locker-import-url" rows="2" maxlength="40000" placeholder="Paste a friend’s share link" required></textarea></label><button type="submit">Add friend</button></form>
      <p class="locker-message" role="status" aria-live="polite"></p>
    </details>
    <div class="locker-comparison" hidden><div class="locker-friends"></div>
      <label>Compare against<select class="locker-compare-target" aria-label="Choose comparison friend"></select></label>
      <label>Show<select class="locker-compare-filter" aria-label="Filter locker comparison"><option value="all">All Sprites</option><option value="i-need">I need / a friend has</option><option value="they-need">A friend needs / I have</option><option value="both-missing">Everyone missing</option><option value="not-mastered">Someone not mastered</option></select></label>
    </div>
    <p class="locker-count" role="status" aria-live="polite"></p>
    <p class="locker-scroll-hint" hidden>Swipe the table sideways to see every player. Sprite names stay in place.</p>
    <div class="locker-table-scroll" tabindex="0" role="region" aria-label="Locker comparison table, scroll horizontally for more players"><div class="locker-table">
      <div class="locker-list-head"></div>
      <div class="locker-list" role="list" aria-label="Sprite locker comparison"></div>
    </div></div>`;
  const $ = (selector) => host.querySelector(selector);
  const message = (text) => { $(".locker-message").textContent = text; };
  const importFriend = (input) => {
    try {
      const snapshot = decodeSnapshot(input);
      if (!options.catalogs.some((s) => s.seasonId === snapshot.season)) throw new Error("This link uses a season that isn’t available in this tracker yet.");
      const replacing = friends.some(f => f.season === snapshot.season && f.name.toLocaleLowerCase() === snapshot.name.toLocaleLowerCase());
      friends = addFriendSnapshot(friends, snapshot);
      target = '*';
      mode = "all";
      $(".locker-compare-filter").value = mode;
      $(".locker-share-result").hidden = true;
      if (snapshot.season !== options.season.seasonId) options.onSeason(snapshot.season);
      message(`${snapshot.name}’s snapshot ${replacing ? 'updated' : 'added'}. Your own checklist has not been changed.`);
      $('.locker-import-url').value = '';
      render();
    } catch (error) { message(error.message); }
  };
  $(".locker-share").addEventListener("click", () => {
    const nickname = $('.locker-nickname');
    nickname.setCustomValidity(nickname.value.trim() ? '' : 'Enter your nickname.');
    if (!nickname.reportValidity()) return;
    const snapshot = makeSnapshot(options.season, options.progress, $(".locker-nickname").value);
    const url = new URL(location.href);
    url.search = "";
    url.hash = `locker=${encodeSnapshot(snapshot)}`;
    $(".locker-share-url").value = url.href;
    $(".locker-share-result").hidden = false;
    message("Share link created. It captures your progress right now; create a new link after further updates.");
  });
  $('.locker-nickname').addEventListener('input', () => { $('.locker-nickname').setCustomValidity(''); render(); });
  $(".locker-copy").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($(".locker-share-url").value); message("Locker link copied."); }
    catch { $(".locker-share-url").focus(); $(".locker-share-url").select(); message("Copy the selected link to share it."); }
  });
  $(".locker-import").addEventListener("submit", (event) => { event.preventDefault(); importFriend($(".locker-import-url").value); });
  $(".locker-friends").addEventListener("click", (event) => {
    const button = event.target.closest('button[data-friend-index]');
    if (!button) return;
    friends = friends.filter((_, i) => i !== Number(button.dataset.friendIndex)); target = '*';
    if (location.hash.startsWith("#locker=")) history.replaceState(null, "", location.pathname + location.search);
    message("Friend removed. Your checklist is unchanged."); render();
  });
  $(".locker-compare-filter").addEventListener("change", (event) => { mode = event.target.value; render(); });
  $('.locker-compare-target').addEventListener('change', event => { target = event.target.value; render(); });
  function render() {
    if (!options) return;
    const activeFriends = friends.filter(f => f.season === options.season.seasonId);
    const comparing = activeFriends.length > 0;
    $(".locker-comparison").hidden = friends.length === 0;
    host.classList.toggle("is-comparing", comparing);
    $('.locker-scroll-hint').hidden = !comparing;
    $('.locker-friends').replaceChildren();
    friends.forEach((friend, index) => {
      const card = document.createElement('div'); card.className = 'locker-friend-summary';
      const description = document.createElement('div');
      const name = document.createElement('strong'); name.textContent = friend.name;
      const date = document.createElement('p'); date.className = 'locker-friend-date';
      date.textContent = `Snapshot: ${new Date(friend.date).toLocaleString()} · ${options.catalogs.find(s => s.seasonId === friend.season)?.chapter} ${options.catalogs.find(s => s.seasonId === friend.season)?.season}. Updates require a fresh link.`;
      const remove = document.createElement('button'); remove.type = 'button'; remove.dataset.friendIndex = String(index); remove.textContent = 'Remove'; remove.setAttribute('aria-label', `Remove ${friend.name}`);
      description.append(name, date); card.append(description, remove); $('.locker-friends').append(card);
    });
    const targetSelect = $('.locker-compare-target'); targetSelect.replaceChildren();
    const everyone = document.createElement('option'); everyone.value = '*'; everyone.textContent = 'All friends in this season'; targetSelect.append(everyone);
    activeFriends.forEach((friend, i) => { const option = document.createElement('option'); option.value = String(i); option.textContent = friend.name; targetSelect.append(option); });
    if (target !== '*' && !activeFriends[Number(target)]) target = '*';
    targetSelect.value = target;
    targetSelect.disabled = !comparing;
    $('.locker-compare-filter').disabled = !comparing;
    const headers = $('.locker-list-head'); headers.replaceChildren();
    for (const label of ['Sprite / variant', $('.locker-nickname').value.trim() ? `${$('.locker-nickname').value.trim()} (You)` : 'You', ...activeFriends.map(f => f.name)]) {
      const heading = document.createElement('span'); heading.textContent = label; heading.title = label; headers.append(heading);
    }
    host.style.setProperty('--locker-players', String(activeFriends.length + 1));
    host.classList.toggle('locker-multi', activeFriends.length > 1);
    const list = $(".locker-list");
    list.replaceChildren();
    let count = 0;
    for (const family of options.families) for (const variant of family.variants) {
      const key = `${family.name}::${variant}`;
      const state = options.progress[key] || {};
      const mine = state.mastered ? 2 : state.acquired ? 1 : 0;
      const statuses = activeFriends.map(friend => friend.entries.get(key));
      const selected = target === '*' ? statuses : [statuses[Number(target)]];
      if (comparing && !matchesGroupComparison(mode, mine, selected)) continue;
      count++;
      const row = document.createElement("div");
      row.className = "locker-list-row"; row.setAttribute("role", "listitem");
      const identity = document.createElement("div"); identity.className = "locker-sprite-name";
      const image = document.createElement("img"); image.src = options.imageFor(family.name, variant); image.alt = ""; image.loading = "lazy"; image.width = 42; image.height = 42;
      const text = document.createElement("span"); const strong = document.createElement("strong"); strong.textContent = family.name;
      const small = document.createElement("small"); small.textContent = variant; text.append(strong, small); identity.append(image, text); row.append(identity);
      for (const [index, status] of [mine, ...statuses].entries()) {
        const badge = document.createElement('span'); badge.className = `locker-friend-status ${index === 0 ? 'locker-my-status' : ''} state-${status ?? 'unknown'}`; badge.textContent = statusName(status);
        badge.setAttribute('aria-label', `${index === 0 ? 'You' : activeFriends[index - 1].name}: ${family.name} ${variant}, ${statusName(status)}`); row.append(badge);
      }
      list.append(row);
    }
    $(".locker-count").textContent = `${count} Sprite variant${count === 1 ? "" : "s"}${comparing ? " match this comparison" : " shown"}.`;
    if (!count) { const empty = document.createElement("p"); empty.className = "locker-help"; empty.textContent = "No matches. Try another comparison or clear the checklist filters above."; list.append(empty); }
  }
  return { update(next) {
    const seasonChanged = options && options.season.seasonId !== next.season.seasonId;
    options = next;
    if (seasonChanged) { $(".locker-share-result").hidden = true; target = '*'; }
    if (importPending) { const input = importPending; importPending = null; importFriend(input); }
    render();
  } };
}
