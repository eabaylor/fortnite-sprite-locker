import { publishSharedSnapshot, readSharedLocker, controlLiveLocker, updateLiveLocker, setPlayerListing, directoryNickname } from './locker-sharing.js?v=20261028-1';
export const FRIENDS_KEY = 'sprite-locker-friends-v1';
export const LIVE_KEY = 'sprite-locker-live-shares-v1';

/** Only this module can manage writer credentials. Public links contain only the read ID. */
export function createLockerSync(catalogs, codec) {
  const subscribers = new Set();
  let friends = [], disposed = false, refreshBusy = false, writeBusy = false;
  let lastRefresh = 0, retryAt = 0;
  const parse = key => { try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; } };
  const owners = () => { const value = parse(LIVE_KEY); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; };
  const emit = () => subscribers.forEach(fn => fn());
  const canonicalToken = snapshot => codec.encodeSnapshot({ v: 1, season: snapshot.season, name: snapshot.name, date: snapshot.date, families: snapshot.families, states: snapshot.states });
  const persistFriends = () => localStorage.setItem(FRIENDS_KEY, JSON.stringify(friends.map(f => ({ token: canonicalToken(f), shareId: f.shareId, live: f.live, liveLink: f.liveLink, updatedAt: f.updatedAt, checkedAt: f.checkedAt, error: f.error, expiresAt: f.expiresAt }))));
  function loadFriends() {
    const saved = parse(FRIENDS_KEY); const restored = [];
    for (const item of Array.isArray(saved) ? saved.slice(0, 40) : []) {
      try {
        const snapshot = codec.decodeSnapshot(item.token);
        if (item.shareId && owners()[snapshot.season]?.id === item.shareId) continue;
        if (!catalogs.some(c => c.seasonId === snapshot.season) || restored.filter(f => f.season === snapshot.season).length >= 5) continue;
        restored.push({ ...snapshot, shareId: /^[A-Za-z0-9_-]{16}$/.test(item.shareId || '') ? item.shareId : null, live: item.live === true, liveLink: item.liveLink === true, updatedAt: Number(item.updatedAt) || Date.parse(snapshot.date) / 1000, checkedAt: Number(item.checkedAt) || 0, error: typeof item.error === 'string' ? item.error.slice(0, 200) : '', expiresAt: Number(item.expiresAt) || 0 });
      } catch { /* Keep other valid friends if one stored entry is damaged. */ }
    }
    friends = restored;
  }
  function saveOwner(seasonId, owner) { const all = owners(); all[seasonId] = owner; localStorage.setItem(LIVE_KEY, JSON.stringify(all)); emit(); }
  const pendingPause = () => { const all = owners(); return catalogs.some(s => all[s.seasonId]?.writeKey && all[s.seasonId]?.pendingPause); };
  function currentSnapshot(season, owner) {
    let progress = parse(season.storageKey);
    if (!progress || typeof progress !== 'object') progress = {};
    const snapshot = codec.makeSnapshot(season, progress, owner.name);
    return { snapshot, signature: JSON.stringify([snapshot.families, snapshot.states, snapshot.name]) };
  }
  async function syncOwn() {
    if (disposed || writeBusy || (document.hidden && !pendingPause()) || Date.now() < retryAt) return;
    writeBusy = true;
    try {
      for (const season of catalogs) {
        let owner = owners()[season.seasonId];
        if (!owner?.writeKey) continue;
        try {
          if (owner.pendingPause) {
            const result = await controlLiveLocker(owner, false);
            const latest = owners()[season.seasonId];
            if (latest?.id === owner.id && !latest.enabled) saveOwner(season.seasonId, { ...latest, ...result, pendingPause: false, error: '' });
            continue;
          }
          if (!owner.enabled || document.hidden) continue;
          const { snapshot, signature } = currentSnapshot(season, owner);
          if (owner.signature === signature) continue;
          const latest = owners()[season.seasonId];
          if (!latest?.enabled || latest.pendingPause) continue;
          const result = await updateLiveLocker(owner, codec.encodeSnapshot(snapshot));
          const after = owners()[season.seasonId];
          if (after?.id === owner.id) saveOwner(season.seasonId, { ...after, ...result, signature, error: '' });
        } catch (error) {
          const latest = owners()[season.seasonId];
          if (latest?.id === owner.id) saveOwner(season.seasonId, { ...latest, ...(Number.isSafeInteger(error.revision) ? { revision: error.revision } : {}), error: error.message });
          retryAt = Date.now() + 30000;
        }
      }
    } finally {
      writeBusy = false;
      if (!disposed && Date.now() >= retryAt && pendingPause()) queueMicrotask(() => { void syncOwn().catch(() => {}); });
    }
  }
  async function refreshFriends(force = false) {
    if (disposed || refreshBusy || (!force && (document.hidden || Date.now() - lastRefresh < 60000))) return;
    refreshBusy = true; lastRefresh = Date.now();
    try {
      const targets = friends.filter(f => f.shareId && (force || f.liveLink));
      for (const old of targets) {
        try {
          const result = await readSharedLocker(old.shareId);
          const snapshot = codec.decodeSnapshot(result.token);
          if (snapshot.season !== old.season) throw new Error('The shared season changed unexpectedly; keeping the archived snapshot.');
          const index = friends.indexOf(old);
          if (index >= 0) friends[index] = { ...snapshot, ...result, name: result.nickname || snapshot.name, shareId: old.shareId, checkedAt: Date.now(), error: '' };
        } catch (error) { const index = friends.indexOf(old); if (index >= 0) friends[index] = { ...old, checkedAt: Date.now(), error: `Last saved snapshot — ${error.message}` }; }
      }
      persistFriends(); emit();
    } finally { refreshBusy = false; }
  }
  loadFriends();
  const storage = event => { if (event.key === FRIENDS_KEY) { loadFriends(); emit(); } if (event.key === LIVE_KEY) emit(); void syncOwn().catch(() => {}); };
  const wake = () => { void syncOwn().catch(() => {}); void refreshFriends().catch(() => {}); };
  window.addEventListener('storage', storage);
  document.addEventListener('visibilitychange', wake);
  window.addEventListener('sprite-locker-progress-changed', wake);
  const timer = setInterval(wake, 5000);
  queueMicrotask(wake);
  return {
    get friends() { return friends; },
    owner(seasonId) { return owners()[seasonId]; },
    subscribe(fn) { subscribers.add(fn); return () => subscribers.delete(fn); },
    async add(input, shareId) {
      if (shareId && Object.values(owners()).some(o => o?.id === shareId)) throw new Error('That is your own locker. You are already shown in the first player column; all five friend slots remain available.');
      const result = shareId ? await readSharedLocker(shareId) : null;
      const snapshot = codec.decodeSnapshot(result ? result.token : input);
      if (!catalogs.some(c => c.seasonId === snapshot.season)) throw new Error('This season is not available in the tracker yet.');
      const friend = { ...snapshot, ...result, name: result?.nickname || snapshot.name, shareId: shareId || null, checkedAt: Date.now(), updatedAt: result?.updatedAt || Date.parse(snapshot.date) / 1000, error: '' };
      const index = friends.findIndex(f => f.season === friend.season && ((shareId && f.shareId === shareId) || f.name.toLowerCase() === friend.name.toLowerCase()));
      if (index < 0 && friends.filter(f => f.season === friend.season).length >= 5) throw new Error('You can compare with up to five friends in each season. Remove a friend before adding another.');
      if (index < 0 && friends.length >= 40) throw new Error('Your friend archive is full. Remove an older saved locker first.');
      const next = [...friends]; if (index >= 0) next[index] = friend; else next.push(friend);
      const previous = friends; friends = next;
      try { persistFriends(); } catch { friends = previous; throw new Error('Your browser could not save this friend. Free some storage and try again.'); }
      emit(); return friend;
    },
    remove(friend) { friends = friends.filter(f => f !== friend); persistFriends(); emit(); },
    refresh: () => refreshFriends(true),
    async enable(season, nickname) {
      if (!nickname.trim()) throw new Error('Enter your nickname first.');
      const previous = owners()[season.seasonId];
      if (previous?.writeKey && previous.expiresAt > Date.now() / 1000) {
        const result = await controlLiveLocker(previous, true);
        saveOwner(season.seasonId, { ...previous, ...result, name: nickname.trim(), enabled: true, pendingPause: false, error: '', signature: '' });
      } else {
        const { snapshot, signature } = currentSnapshot(season, { name: nickname.trim() });
        const result = await publishSharedSnapshot(codec.encodeSnapshot(snapshot), true);
        if (!/^[A-Za-z0-9_-]{43}$/.test(result.writeKey || '')) throw new Error('The service did not return a private sharing key.');
        try { saveOwner(season.seasonId, { ...result, name: nickname.trim(), signature, enabled: true, pendingPause: false, error: '' }); }
        catch { await controlLiveLocker(result, false); throw new Error('This browser cannot save the private key. Live sharing was stopped.'); }
      }
      const ownId = owners()[season.seasonId]?.id;
      if (friends.some(f => f.shareId === ownId)) { friends = friends.filter(f => f.shareId !== ownId); persistFriends(); }
      retryAt = 0; emit(); return owners()[season.seasonId];
    },
    async pause(seasonId) {
      const owner = owners()[seasonId]; if (!owner) return;
      saveOwner(seasonId, { ...owner, enabled: false, pendingPause: true, error: '' });
      retryAt = 0; await syncOwn(); emit();
    },
    async listing(seasonId, enabled, name) {
      const owner = owners()[seasonId];
      if (!owner?.writeKey) throw new Error('Enable live sharing for this season before joining the player list.');
      const nickname = enabled ? directoryNickname(name).name : owner.name;
      const result = await setPlayerListing(owner, enabled, nickname);
      const latest = owners()[seasonId];
      if (latest?.id === owner.id) saveOwner(seasonId, { ...latest, listed: result.listed, ...(result.nickname ? { name: result.nickname, listingName: result.nickname, signature: '' } : {}) });
      return result;
    },
    sync: () => { retryAt = 0; return syncOwn(); },
    dispose() { disposed = true; clearInterval(timer); window.removeEventListener('storage', storage); document.removeEventListener('visibilitychange', wake); window.removeEventListener('sprite-locker-progress-changed', wake); subscribers.clear(); },
  };
}
