import catalogs from './locker-catalogs.js?v=20261015-9';
import { SHARE_ORIGIN, sharedLockerId, publishSharedSnapshot } from './locker-sharing.js?v=20261015-9';
import { createLockerSync } from './locker-state.js?v=20261015-9';
let backgroundSync;
export function startLockerBackground(catalogs) {
  if (!backgroundSync) backgroundSync = createLockerSync(catalogs, { makeSnapshot, encodeSnapshot, decodeSnapshot });
  return backgroundSync;
}
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
  const token = (trimmed.includes("#locker=") ? trimmed.split("#locker=")[1] : trimmed.replace(/^#locker=/, "")).split(/[?&]/)[0];
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

export function friendCollectionCounts(friend, season) {
  const counts = { acquired: 0, mastered: 0, total: 0, unknown: 0 };
  for (const family of season.families) for (const variant of family.variants) {
    const status = friend.entries.get(`${family.name}::${variant}`);
    counts.total++;
    if (status === 1 || status === 2) counts.acquired++;
    if (status === 2) counts.mastered++;
    if (status === undefined) counts.unknown++;
  }
  return counts;
}

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
  if (friends.filter(f => f.season === snapshot.season).length >= 4) throw new Error('You can compare with up to four friends per season. Remove a friend before adding another.');
  return [...friends, snapshot];
}

/** One shared DOM implementation keeps the React and GitHub Pages tools identical. */
export function createLockerTools(host) {
  let options;
  let friends = [];
  let sync, unsubscribe;
  let target = '*';
  let mode = "all";
  const initialId = new URLSearchParams(location.search).get('s');
  let importPending = location.hash.startsWith("#locker=") ? location.hash : /^[A-Za-z0-9_-]{16}$/.test(initialId || '') ? `${SHARE_ORIGIN}/s/${initialId}` : null;
  let sharing = false;
  host.className = "locker-tools";
  host.innerHTML = `
    <details class="locker-sharing" open>
      <summary>Share & compare lockers</summary>
      <p class="locker-help">Compare your locker with up to four friends. Creating a short link uploads a snapshot and your nickname, viewable by anyone with the link for 90 days. Only explicitly shared snapshots go online; your editable progress stays in this browser. Reimporting the same nickname updates that friend’s column. Comparison is read-only; update your collection in Compact or Classic view.</p>
      <p class="locker-help">Opening from Messenger? Use the same browser where you normally track your locker, so your saved progress is available. A different browser may show an empty local locker.</p>
      <div class="locker-share-actions"><label>Your nickname (required)<input class="locker-nickname" maxlength="40" placeholder="Player name" autocomplete="off" required></label><button type="button" class="locker-share">Create short link</button><button type="button" class="locker-portable">Portable link (no upload)</button></div>
      <div class="locker-share-result" hidden><label>Your share link<input class="locker-share-url" readonly aria-label="Your locker share link"></label><button type="button" class="locker-copy">Copy link</button><p>Send this link to your friend. Their saved progress stays separate.</p></div>
      <fieldset class="locker-live"><legend>Live sharing — optional</legend>
        <label class="locker-live-optin"><input type="checkbox" class="locker-live-enabled">Keep my shared locker updated for this season</label>
        <p class="locker-help">Off by default. Enabling uploads this season’s nickname and checklist automatically while you use this browser, including Compact and Classic views. Anyone with your live link can read it. Pause anytime to stop uploads; the last shared state remains visible. A new season requires a separate opt-in. Links expire after 90 days without a sync.</p>
        <p class="locker-live-status" role="status" aria-live="polite"></p>
        <div class="locker-live-link-row" hidden><label>Your live locker link<input class="locker-live-url" readonly></label><button type="button" class="locker-live-copy">Copy live link</button><button type="button" class="locker-live-sync">Sync now</button></div>
      </fieldset>
      <form class="locker-import"><label>Add a friend’s locker link<textarea class="locker-import-url" rows="2" maxlength="40000" placeholder="Paste a friend’s share link" required></textarea></label><button type="submit">Add friend</button></form>
      <p class="locker-message" role="status" aria-live="polite"></p>
    </details>
    <div class="locker-comparison" hidden><p class="locker-help">Friends are remembered in this browser, including last saved lockers from previous seasons. Live friends refresh about once a minute while this page is visible; snapshot links stay fixed.</p><button type="button" class="locker-refresh">Refresh friends</button><div class="locker-friends"></div>
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
  const importFriend = async (input) => {
    try {
      const shareId = sharedLockerId(input);
      if (shareId) message('Loading shared locker…');
      const before = friends;
      const snapshot = await sync.add(input, shareId);
      const replacing = before.some(f => f.season === snapshot.season && f.name.toLocaleLowerCase() === snapshot.name.toLocaleLowerCase());
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
  const createShare = async online => {
    if (sharing) return;
    const nickname = $('.locker-nickname');
    nickname.setCustomValidity(nickname.value.trim() ? '' : 'Enter your nickname.');
    if (!nickname.reportValidity()) return;
    const snapshot = makeSnapshot(options.season, options.progress, nickname.value);
    const token = encodeSnapshot(snapshot);
    $('.locker-share-result').hidden = true;
    sharing = true;
    $('.locker-share').disabled = true;
    $('.locker-portable').disabled = true;
    try {
      let link;
      if (online) {
        message('Creating your short link…');
        const result = await publishSharedSnapshot(token);
        link = result.url;
      } else {
        const url = new URL(location.href); url.search = ''; url.hash = `locker=${token}`; link = url.href;
      }
      if (options.season.seasonId !== snapshot.season) { message('The season changed while sharing. Switch back to create its link.'); return; }
      $('.locker-share-url').value = link;
      $('.locker-share-result').hidden = false;
      message(online ? 'Short link created. It expires in 90 days. Share a fresh link after updating your progress.' : 'Portable link created without uploading your snapshot. This longer link contains the data and has no service expiry.');
    } catch (error) { message(`${error.message} Your local progress is safe. You can use a portable link instead.`); }
    finally { sharing = false; $('.locker-share').disabled = false; $('.locker-portable').disabled = false; }
  };
  $('.locker-share').addEventListener('click', () => createShare(true));
  $('.locker-portable').addEventListener('click', () => createShare(false));
  $('.locker-live-enabled').addEventListener('change', async event => {
    const checkbox = event.target; const enabled = checkbox.checked; checkbox.disabled = true;
    try {
      if (enabled) {
        const nickname = $('.locker-nickname'); nickname.setCustomValidity(nickname.value.trim() ? '' : 'Enter your nickname.');
        if (!nickname.reportValidity()) { checkbox.checked = false; return; }
        await sync.enable(options.season, nickname.value);
        message('Live sharing enabled for this season in this browser. Send the live link to your friends.');
      } else {
        await sync.pause(options.season.seasonId);
        message('Automatic uploads stopped on this browser. The last shared locker remains visible.');
      }
    } catch (error) { message(error.message); }
    finally { checkbox.disabled = false; render(); }
  });
  $('.locker-live-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('.locker-live-url').value); message('Live locker link copied.'); }
    catch { $('.locker-live-url').focus(); $('.locker-live-url').select(); message('Copy the selected live link.'); }
  });
  $('.locker-live-sync').addEventListener('click', async () => { await sync.sync(); render(); });
  $('.locker-refresh').addEventListener('click', async event => {
    event.target.disabled = true; try { await sync.refresh(); message('Friends refreshed. Unavailable links keep their last saved locker.'); }
    catch { message('Friends could not refresh. Your saved lockers are still available.'); }
    finally { event.target.disabled = false; }
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
    sync.remove(friends[Number(button.dataset.friendIndex)]); target = '*';
    const cleanUrl = new URL(location.href); cleanUrl.searchParams.delete('s'); cleanUrl.searchParams.delete('shareExpired');
    if (cleanUrl.hash.startsWith('#locker=')) cleanUrl.hash = '';
    history.replaceState(null, '', cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
    message("Friend removed. Your checklist is unchanged."); render();
  });
  $(".locker-compare-filter").addEventListener("change", (event) => { mode = event.target.value; render(); });
  $('.locker-compare-target').addEventListener('change', event => { target = event.target.value; render(); });
  function render() {
    if (!options) return;
    const owner = sync?.owner(options.season.seasonId);
    $('.locker-live-enabled').checked = owner?.enabled === true;
    $('.locker-live-link-row').hidden = !owner;
    $('.locker-live-url').value = owner ? `${SHARE_ORIGIN}/s/${owner.id}` : '';
    $('.locker-live-sync').disabled = !owner?.enabled;
    $('.locker-live-status').textContent = !owner ? 'Off — no automatic uploads.' : owner.pendingPause ? 'Uploads stopped locally. Waiting for a connection to pause the online link.' : owner.error ? `Last saved state kept. ${owner.error}` : `${owner.enabled ? 'Live sharing on' : 'Paused'} · ${owner.name} · ${owner.updatedAt ? 'Last synced ' + new Date(owner.updatedAt * 1000).toLocaleString() : 'Waiting to sync'}`;
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
      const heading = document.createElement('div'); heading.className = 'locker-friend-heading'; heading.append(name);
      const catalog = options.catalogs.find(s => s.seasonId === friend.season);
      const counts = friendCollectionCounts(friend, catalog);
      const date = document.createElement('p'); date.className = 'locker-friend-date';
      date.textContent = `${friend.live ? 'Live' : friend.liveLink ? 'Paused — last saved snapshot' : 'Snapshot'} · Updated ${new Date((friend.updatedAt || Date.parse(friend.date) / 1000) * 1000).toLocaleString()} · ${options.catalogs.find(s => s.seasonId === friend.season)?.chapter} ${options.catalogs.find(s => s.seasonId === friend.season)?.season}${friend.season !== options.season.seasonId ? ' · Archived season' : ''}${friend.error ? ' · ' + friend.error : ''}`;
      const remove = document.createElement('button'); remove.type = 'button'; remove.dataset.friendIndex = String(index); remove.textContent = 'Remove'; remove.setAttribute('aria-label', `Remove ${friend.name}`);
      description.append(heading, date);
      if (counts.unknown) { const note = document.createElement('p'); note.className = 'locker-friend-date'; note.textContent = `${counts.unknown} variant${counts.unknown === 1 ? '' : 's'} not in this snapshot; those statuses are unknown.`; description.append(note); }
      card.append(description, remove); $('.locker-friends').append(card);
      if (friend.season !== options.season.seasonId) {
        const view = document.createElement('button'); view.type = 'button'; view.textContent = 'View season'; view.addEventListener('click', () => options.onSeason(friend.season)); card.append(view);
      }
    });
    const targetSelect = $('.locker-compare-target'); targetSelect.replaceChildren();
    const everyone = document.createElement('option'); everyone.value = '*'; everyone.textContent = 'All friends in this season'; targetSelect.append(everyone);
    activeFriends.forEach((friend, i) => { const option = document.createElement('option'); option.value = String(i); option.textContent = friend.name; targetSelect.append(option); });
    if (target !== '*' && !activeFriends[Number(target)]) target = '*';
    targetSelect.value = target;
    targetSelect.disabled = !comparing;
    $('.locker-compare-filter').disabled = !comparing;
    const headers = $('.locker-list-head'); headers.replaceChildren();
    const spriteHeading = document.createElement('span'); spriteHeading.textContent = 'Sprite / variant'; headers.append(spriteHeading);
    const ownEntries = new Map(options.season.families.flatMap(f => f.variants.map(v => {
      const key = `${f.name}::${v}`; const state = options.progress[key] || {}; return [key, state.mastered ? 2 : state.acquired ? 1 : 0];
    })));
    const players = [{ name: $('.locker-nickname').value.trim() ? `${$('.locker-nickname').value.trim()} (You)` : 'You', entries: ownEntries }, ...activeFriends];
    for (const player of players) {
      const heading = document.createElement('span'); heading.className = 'locker-player-heading'; heading.title = player.name;
      const name = document.createElement('strong'); name.className = 'locker-column-name'; name.textContent = player.name; heading.append(name);
      const counts = friendCollectionCounts(player, options.season);
      for (const [field, label] of [['acquired', 'Acquired'], ['mastered', 'Mastered']]) {
        const badge = document.createElement('small'); badge.className = `locker-column-count ${field}`; badge.textContent = `${label} ${counts[field]}/${counts.total}`; heading.append(badge);
      }
      headers.append(heading);
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
    if (!sync) {
      sync = startLockerBackground(next.catalogs);
      friends = sync.friends;
      unsubscribe = sync.subscribe(() => { friends = sync.friends; render(); });
      const owner = sync.owner(next.season.seasonId);
      if (owner?.name) $('.locker-nickname').value = owner.name;
    }
    if (seasonChanged) { $(".locker-share-result").hidden = true; target = '*'; const owner = sync.owner(next.season.seasonId); if (owner?.name) $('.locker-nickname').value = owner.name; }
    if (importPending) { const input = importPending; importPending = null; importFriend(input); }
    render();
  }, dispose() { unsubscribe?.(); } };
}
