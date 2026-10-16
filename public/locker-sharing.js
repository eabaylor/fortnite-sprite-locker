export const SHARE_ORIGIN = 'https://sprite-locker-checklist.eabaylor.chatgpt.site';
const idPattern = /^[A-Za-z0-9_-]{16}$/;

export function directoryNickname(value) {
  const name = typeof value === 'string' ? value.normalize('NFKC').trim().replace(/\s+/g, ' ') : '';
  if (name.length < 2 || name.length > 40 || !/^[\p{L}\p{N} ._'’-]+$/u.test(name)) throw new Error('Use 2–40 letters, numbers, spaces, dots, underscores, apostrophes, or hyphens for your searchable nickname.');
  return { name, key: name.toLowerCase() };
}

export function sharedLockerId(input) {
  let url;
  try { url = new URL(input); } catch { return null; }
  if (url.origin === SHARE_ORIGIN) {
    const match = url.pathname.match(/^\/s\/([A-Za-z0-9_-]{16})\/?$/);
    if (match) return match[1];
  }
  if (url.origin === 'https://eabaylor.github.io' && url.pathname === '/fortnite-sprite-locker/') {
    const id = url.searchParams.get('s');
    if (idPattern.test(id || '')) return id;
  }
  return null;
}

async function request(path, options = {}) {
  const response = await fetch(`${SHARE_ORIGIN}${path}`, { ...options, credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(15000) });
  let data;
  try { data = await response.json(); } catch { throw new Error('Sharing service unavailable. Try again, or create a portable link.'); }
  if (!response.ok) { const error = new Error(data.error || 'The sharing request could not be completed.'); error.status = response.status; error.revision = data.revision; throw error; }
  return data;
}

export async function publishSharedSnapshot(token, live = false) {
  const { ticket } = await request('/api/lockers/ticket', { method: 'POST' });
  const result = await request('/api/lockers', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Locker-Share-Token': ticket }, body: JSON.stringify({ token, live }) });
  if (!idPattern.test(result.id || '')) throw new Error('Sharing service returned an invalid link.');
  return { ...result, url: `${SHARE_ORIGIN}/s/${result.id}` };
}

export async function readSharedLocker(id) {
  if (!idPattern.test(id || '')) throw new Error('This short locker link is invalid.');
  return request(`/api/lockers/${id}`);
}

export async function controlLiveLocker(owner, enabled) {
  return request(`/api/lockers/${owner.id}/${enabled ? 'resume' : 'pause'}`, { method: 'POST', headers: { 'X-Locker-Write-Key': owner.writeKey } });
}

export async function updateLiveLocker(owner, token) {
  return request(`/api/lockers/${owner.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Locker-Write-Key': owner.writeKey }, body: JSON.stringify({ token, revision: owner.revision }) });
}

export async function setPlayerListing(owner, enabled, name) {
  return request(`/api/lockers/${owner.id}/listing`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Locker-Write-Key': owner.writeKey }, body: JSON.stringify({ enabled, name }) });
}

export async function searchPlayers(season, query = '') {
  const result = await request(`/api/lockers/players?${new URLSearchParams({ season, q: query })}`);
  if (!Array.isArray(result.players)) throw new Error('The player list is temporarily unavailable.');
  return result;
}

export async function loadSharedSnapshot(id) {
  if (!idPattern.test(id || '')) throw new Error('This short locker link is invalid.');
  const result = await readSharedLocker(id);
  if (typeof result.token !== 'string') throw new Error('This shared locker is unavailable.');
  return result.token;
}
