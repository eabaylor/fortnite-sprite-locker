import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const docs = join(root, "docs");
const catalog = JSON.parse(await readFile(join(root, "data", "catalog.json"), "utf8"));
const chromeCandidates = process.platform === "win32"
  ? [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    ]
  : ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"];

async function firstExisting(paths) {
  for (const path of paths) {
    try {
      await access(path);
      return path;
    } catch {}
  }
  return null;
}

const mime = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function browserHarness() {
  return `<script>
window.addEventListener("load", async () => {
  for (let i = 0; i < 100 && !document.querySelector('.locker-sharing'); i++) await new Promise(resolve => setTimeout(resolve, 20));
  const defaultList = document.querySelector('#list-view').getAttribute('aria-pressed') === 'true' && !document.querySelector('#locker-tools-host').hidden;
  const sharingCollapsed = !document.querySelector('.locker-sharing').open;
  const friendControlsGrouped = ['.locker-comparison', '.locker-count', '.locker-party-count', '.locker-edit-hint', '.locker-scroll-hint'].every(selector => document.querySelector(selector).closest('details.locker-sharing'));
  const showOutsideCollapsed = !document.querySelector('.locker-compare-filter').closest('details') && !document.querySelector('.locker-compare-filter').disabled;
  const initialShow = document.querySelector('.locker-compare-filter');
  initialShow.value = 'im-missing'; initialShow.dispatchEvent(new Event('change'));
  const missingWithoutFriends = document.querySelectorAll('.locker-list-row').length === window.SPRITE_CATALOGS.seasons[0].families.reduce((n, f) => n + f.variants.length, 0);
  initialShow.value = 'all'; initialShow.dispatchEvent(new Event('change'));
  document.querySelector('#compact-view').click();
  const status = document.querySelector("#status-filter");
  const defaultStatusAll = status.value === "all";
  const defaultCompact = document.querySelector("#sprite-list").classList.contains("compact-view") && document.querySelector("#compact-view").getAttribute("aria-pressed") === "true";
  const familyNames = [...document.querySelectorAll(".sprite-row h3")].map((heading) => heading.textContent);
  const sixVariantRow = [...document.querySelectorAll(".sprite-row")].find((row) => row.querySelectorAll(".compact-sprite-card").length === 6);
  const firstVariants = [...sixVariantRow.querySelectorAll(".sprite-card h4")].map((heading) => heading.textContent);
  const compactCards = [...sixVariantRow.querySelectorAll(".compact-sprite-card")];
  const compactRowInsideViewport = compactCards.length === 6 && compactCards.every((card) => {
    const rect = card.getBoundingClientRect();
    return rect.left >= 0 && rect.right <= document.documentElement.clientWidth;
  });
  const compactCardWidth = compactCards[0].getBoundingClientRect().width;
  let compactToggle = compactCards[0].querySelector(".compact-sprite-toggle");
  const name = compactToggle.dataset.name;
  const variant = compactToggle.dataset.variant;
  status.value = "missing";
  status.dispatchEvent(new Event("change", { bubbles: true }));
  compactToggle = document.querySelector('.compact-sprite-toggle[data-name="' + CSS.escape(name) + '"][data-variant="' + CSS.escape(variant) + '"]');
  compactToggle.click();
  const filteredRow = [...document.querySelectorAll(".sprite-row")].find((row) => row.querySelector("h3")?.textContent === name);
  const remainingCompactCard = filteredRow.querySelector(".compact-sprite-card");
  const fixedSixColumnWidth = Math.abs(remainingCompactCard.getBoundingClientRect().width - compactCardWidth) < 1;
  status.value = "all";
  status.dispatchEvent(new Event("change", { bubbles: true }));
  compactToggle = document.querySelector('.compact-sprite-toggle[data-name="' + CSS.escape(name) + '"][data-variant="' + CSS.escape(variant) + '"]');
  compactToggle.click();
  document.querySelector("#classic-view").click();
  const selector = (field) => '[data-name="' + CSS.escape(name) + '"][data-variant="' + CSS.escape(variant) + '"][data-field="' + field + '"]';
  const menu = document.querySelector("#data-menu");
  menu.open = true;
  const menuRect = menu.querySelector(".data-menu-panel").getBoundingClientRect();
  window.scrollTo(0, 600);
  const stickyTopAfterScroll = Math.round(document.querySelector(".sticky-controls").getBoundingClientRect().top);
  const result = {
    viewportWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    h1Count: document.querySelectorAll("h1").length,
    hasSkipLink: !!document.querySelector('.skip-link[href="#sprite-checklist"]'),
    updateNoticeHidden: document.querySelector("#update-notice").hidden,
    defaultStatusAll,
    defaultList,
    sharingCollapsed,
    friendControlsGrouped,
    showOutsideCollapsed,
    missingWithoutFriends,
    defaultCompact,
    compactRowInsideViewport,
    fixedSixColumnWidth,
    classicSelectable: document.querySelector("#sprite-list").classList.contains("classic-view") && document.querySelector("#classic-view").getAttribute("aria-pressed") === "true",
    stickyControls: getComputedStyle(document.querySelector(".sticky-controls")).position === "sticky",
    stickyTopAfterScroll,
    masteredImpliesAcquired: document.querySelector(selector("mastered")).checked && document.querySelector(selector("acquired")).checked,
    checkHeight: Math.round(document.querySelector(".check").getBoundingClientRect().height),
    statusHeight: Math.round(document.querySelector(".select-filter").getBoundingClientRect().height),
    searchFontSize: parseFloat(getComputedStyle(document.querySelector("#search")).fontSize),
    menuInsideViewport: menuRect.left >= 0 && menuRect.right <= document.documentElement.clientWidth,
    familyNames,
    firstVariants,
  };
  menu.open = false;
  try {
    const directoryNetworkFetch = window.fetch;
    window.fetch = async (input, init) => String(input).includes('/api/lockers/players?') ? Response.json({ players: [['Player0000000001', 'Directory friend'], ['Player0000000002', 'Ash'], ['Player0000000003', 'Casey'], ['LiveID0123456789', 'My locker'], ['Player0000000004', 'Sharon']].map(([id, name]) => ({ id, name, season: window.SPRITE_CATALOGS.seasons[0].seasonId, live: 1 })), more: false }) : directoryNetworkFetch(input, init);
    const tools = await import('./locker-tools.js');
    document.querySelector('#list-view').click();
    for (let i = 0; i < 100 && !document.querySelector('.locker-share'); i++) await new Promise(resolve => setTimeout(resolve, 20));
    document.querySelector('.locker-sharing').open = true;
    document.querySelector('.locker-players-refresh').click();
    for (let i = 0; i < 100 && !document.querySelector('button[data-player-id="Player0000000001"]'); i++) await new Promise(resolve => setTimeout(resolve, 20));
    document.querySelector('.locker-share').click();
    result.nicknameRequired = document.querySelector('.locker-share-result').hidden;
    document.querySelector('.locker-nickname').value = 'My locker';
    document.querySelector('.locker-portable').click();
    const shared = tools.decodeSnapshot(document.querySelector('.locker-share-url').value);
    result.sharedMastered = shared.entries.get(name + '::' + variant) === 2;
    const season = window.SPRITE_CATALOGS.seasons[0];
    const friendProgress = {};
    const target = season.families.find(f => f.name !== name);
    friendProgress[target.name + '::' + target.variants[0]] = { acquired: true, mastered: false };
    const before = localStorage.getItem(season.storageKey);
    document.querySelector('.locker-import-url').value = tools.encodeSnapshot(tools.makeSnapshot(season, friendProgress, 'Test friend'));
    document.querySelector('.locker-import').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await Promise.resolve(); await Promise.resolve();
    result.comparisonDoesNotOverwrite = before === localStorage.getItem(season.storageKey);
    result.listCount = document.querySelectorAll('.locker-list-row').length;
    result.namedFriendHeader = [...document.querySelectorAll('.locker-column-name')].some(el => el.textContent === 'Test friend');
    const initialFriendHeader = document.querySelectorAll('.locker-player-heading')[1];
    const totalVariants = season.families.reduce((n, f) => n + f.variants.length, 0);
    result.friendCounts = initialFriendHeader.querySelector('.locker-column-count.acquired').textContent === 'Acquired 1/' + totalVariants && initialFriendHeader.querySelector('.locker-column-count.mastered').textContent === 'Mastered 0/' + totalVariants;
    const ownHeader = document.querySelector('.locker-player-heading');
    result.ownHeaderCounts = ownHeader.querySelector('.locker-column-count.acquired').textContent === 'Acquired 1/' + totalVariants && ownHeader.querySelector('.locker-column-count.mastered').textContent === 'Mastered 1/' + totalVariants;
    result.ownStatusesTappable = document.querySelectorAll('.locker-list-row button.locker-status-toggle').length === result.listCount;
    result.friendsReadOnly = [...document.querySelectorAll('.locker-friend-status:not(.locker-my-status)')].every(el => el.tagName !== 'BUTTON');
    const comparisonFilter = document.querySelector('.locker-compare-filter');
    comparisonFilter.value = 'im-missing'; comparisonFilter.dispatchEvent(new Event('change'));
    result.missingRegardlessOfFriend = document.querySelectorAll('.locker-list-row').length === totalVariants - 1;
    comparisonFilter.value = 'i-need';
    comparisonFilter.dispatchEvent(new Event('change'));
    result.iNeedCount = document.querySelectorAll('.locker-list-row').length;
    const targetButton = () => document.querySelector('.locker-status-toggle[data-name="' + CSS.escape(target.name) + '"][data-variant="' + CSS.escape(target.variants[0]) + '"]');
    targetButton().click();
    result.comparisonReactsImmediately = document.querySelectorAll('.locker-list-row').length === 0;
    comparisonFilter.value = 'all'; comparisonFilter.dispatchEvent(new Event('change'));
    const acquiredLabel = targetButton().textContent;
    targetButton().click();
    const masteredLabel = targetButton().textContent;
    const savedMastered = JSON.parse(localStorage.getItem(season.storageKey))[target.name + '::' + target.variants[0]];
    targetButton().click();
    const missingLabel = targetButton().textContent;
    result.tapCycle = acquiredLabel === 'Acquired' && masteredLabel === 'Mastered' && missingLabel === 'Missing' && savedMastered.acquired && savedMastered.mastered;
    targetButton().click();
    for (const nickname of ['Laura', 'Chris', 'Alex', 'Sharon', 'Sixth']) {
      document.querySelector('.locker-import-url').value = tools.encodeSnapshot(tools.makeSnapshot(season, nickname === 'Chris' ? {} : friendProgress, nickname));
      document.querySelector('.locker-import').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await Promise.resolve(); await Promise.resolve();
    }
    result.fiveFriendsMaximum = document.querySelectorAll('.locker-friend-summary').length === 5 && document.querySelector('.locker-message').textContent.includes('five friends');
    result.allNamedHeaders = ['Sprite / variant', ...[...document.querySelectorAll('.locker-column-name')].map(el => el.textContent)];
    const targetFilter = document.querySelector('.locker-compare-target');
    const modeFilter = document.querySelector('.locker-compare-filter');
    modeFilter.value = 'they-need'; modeFilter.dispatchEvent(new Event('change'));
    targetFilter.value = '2'; targetFilter.dispatchEvent(new Event('change'));
    const chrisNeeds = document.querySelectorAll('.locker-list-row').length;
    targetFilter.value = '0'; targetFilter.dispatchEvent(new Event('change'));
    result.specificFriendFilter = chrisNeeds === 2 && document.querySelectorAll('.locker-list-row').length === 1;
    targetFilter.value = '*'; targetFilter.dispatchEvent(new Event('change'));
    const filter = document.querySelector('.locker-compare-filter'); filter.value = 'all'; filter.dispatchEvent(new Event('change'));
    result.sixPlayerStatuses = [...document.querySelectorAll('.locker-list-row')].every(row => row.querySelectorAll('.locker-friend-status').length === 6);
    result.sixPlayerColumns = document.querySelectorAll('.locker-player-heading').length === 6 && document.querySelector('.locker-player-heading').classList.contains('locker-current-player') && document.querySelector('.locker-party-count').textContent.includes('6/6 players');
    const scroller = document.querySelector('.locker-table-scroll');
    const header = document.querySelector('.locker-list-head');
    const headTop = header.getBoundingClientRect().top;
    scroller.scrollTop = 600;
    result.playerHeaderPinned = scroller.scrollTop > 0 && Math.abs(header.getBoundingClientRect().top - headTop) < 1 && getComputedStyle(header).position === 'sticky';
    scroller.scrollTop = 0;
    scroller.scrollLeft = 100;
    result.comparisonScrolls = scroller.scrollWidth > scroller.clientWidth && scroller.scrollLeft > 0;
    result.spriteColumnSticky = getComputedStyle(document.querySelector('.locker-sprite-name')).position === 'sticky';
    const groupBeforeRemove = document.querySelectorAll('.locker-friend-summary').length;
    document.querySelector('button[aria-label="Remove Laura"]').click();
    result.removeFriend = document.querySelectorAll('.locker-friend-summary').length === groupBeforeRemove - 1;
    document.querySelector('button[aria-label="Remove Sharon"]').click();
    const originalFetch = window.fetch;
    let reads = 0, liveWrites = 0, pausedOnline = false, listingEnabled = false;
    const shortId = 'AbCdEf0123456789';
    const liveId = 'LiveID0123456789';
    window.fetch = async (input, init) => {
      const url = String(input);
      if (!url.startsWith('https://sprite-locker-checklist.eabaylor.chatgpt.site/api/lockers')) return originalFetch(input, init);
      if (url.includes('/players?')) return originalFetch(input, init);
      if (url.endsWith('/listing')) { listingEnabled = JSON.parse(init.body).enabled; return Response.json({ listed: listingEnabled, ...(listingEnabled ? { nickname: 'My locker' } : {}) }); }
      if (url.endsWith('/ticket')) return Response.json({ ticket: shortId });
      if (url.endsWith('/pause')) { pausedOnline = true; return Response.json({ revision: 2 }); }
      if (init?.method === 'PUT') { liveWrites++; return Response.json({ revision: 1, updatedAt: Date.now() / 1000 }); }
      if (init?.method === 'POST') return Response.json({ id: JSON.parse(init.body || '{}').live ? liveId : shortId, expiresAt: 2000000000, ...(JSON.parse(init.body || '{}').live ? { writeKey: 'a'.repeat(43), revision: 0, updatedAt: Date.now() / 1000 } : {}) });
      reads++;
      return Response.json({ token: tools.encodeSnapshot(tools.makeSnapshot(season, friendProgress, url.endsWith('/Player0000000001') ? 'Directory friend' : 'Test friend')) });
    };
    const progressBeforeSharing = localStorage.getItem(season.storageKey);
    document.querySelector('.locker-share').click();
    for (let i = 0; i < 100 && document.querySelector('.locker-share-result').hidden; i++) await new Promise(resolve => setTimeout(resolve, 20));
    const shortUrl = document.querySelector('.locker-share-url').value;
    result.shortLinkCreated = shortUrl === 'https://sprite-locker-checklist.eabaylor.chatgpt.site/s/' + shortId;
    document.querySelector('.locker-import-url').value = shortUrl + '?fbclid=messenger-tracking';
    document.querySelector('.locker-import').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    for (let i = 0; i < 100 && !document.querySelector('.locker-message').textContent.includes('snapshot updated'); i++) await new Promise(resolve => setTimeout(resolve, 20));
    result.shortLinkImported = reads === 1 && document.querySelector('.locker-message').textContent.includes('snapshot updated');
    result.shortSharingPreservesProgress = localStorage.getItem(season.storageKey) === progressBeforeSharing;
    for (let i = 0; i < 100 && !document.querySelector('button[data-player-id="Player0000000001"]'); i++) await new Promise(resolve => setTimeout(resolve, 20));
    result.fivePlayersInMenu = document.querySelectorAll('.locker-directory-player').length === 5 && document.querySelector('.locker-player-list').textContent.includes('Sharon');
    const nicknameSearch = document.querySelector('.locker-player-search'); nicknameSearch.value = 'nobody matches'; nicknameSearch.dispatchEvent(new Event('input'));
    result.directorySearch = document.querySelectorAll('.locker-directory-player').length === 0;
    nicknameSearch.value = ''; nicknameSearch.dispatchEvent(new Event('input'));
    document.querySelector('button[data-player-id="Player0000000001"]').click();
    for (let i = 0; i < 100 && !document.querySelector('button[aria-label="Remove Directory friend"]'); i++) await new Promise(resolve => setTimeout(resolve, 20));
    result.directoryAddWithoutLink = [...document.querySelectorAll('.locker-column-name')].some(el => el.textContent === 'Directory friend');
    document.querySelector('button[aria-label="Remove Directory friend"]').click();
    const liveToggle = document.querySelector('.locker-live-enabled');
    result.liveOffByDefault = !liveToggle.checked;
    liveToggle.checked = true; liveToggle.dispatchEvent(new Event('change'));
    for (let i = 0; i < 100 && document.querySelector('.locker-live-link-row').hidden; i++) await new Promise(resolve => setTimeout(resolve, 20));
    result.liveOptedIn = !document.querySelector('.locker-live-link-row').hidden && document.querySelector('.locker-live-url').value.endsWith('/s/' + liveId);
    const listingToggle = document.querySelector('.locker-listing-enabled');
    result.directoryOffByDefault = !listingToggle.checked;
    listingToggle.checked = true; listingToggle.dispatchEvent(new Event('change'));
    for (let i = 0; i < 100 && !listingEnabled; i++) await new Promise(resolve => setTimeout(resolve, 20));
    result.directoryOptIn = listingEnabled;
    listingToggle.checked = false; listingToggle.dispatchEvent(new Event('change'));
    for (let i = 0; i < 100 && listingEnabled; i++) await new Promise(resolve => setTimeout(resolve, 20));
    result.directoryOptOut = !listingEnabled;
    document.querySelector('#classic-view').click();
    document.querySelector('[data-name="' + CSS.escape(target.name) + '"][data-variant="' + CSS.escape(target.variants[0]) + '"][data-field="mastered"]').click();
    for (let i = 0; i < 100 && !liveWrites; i++) await new Promise(resolve => setTimeout(resolve, 20));
    result.liveSyncsOutsideList = liveWrites > 0;
    document.querySelector('#list-view').click();
    liveToggle.checked = false; liveToggle.dispatchEvent(new Event('change'));
    for (let i = 0; i < 100 && !pausedOnline; i++) await new Promise(resolve => setTimeout(resolve, 20));
    result.livePauseWorks = pausedOnline && !liveToggle.checked;
    result.friendsStored = JSON.parse(localStorage.getItem('sprite-locker-friends-v1')).length === 3;
    window.fetch = originalFetch;
    result.listNoOverflow = document.documentElement.scrollWidth === document.documentElement.clientWidth;
  } catch (error) { result.comparisonError = error.stack || error.message; }
  document.querySelector('#brand-whats-new').click();
  result.whatsNewReopens = !document.querySelector('#whats-new-backdrop').hidden;
  const whatsNewRect = document.querySelector('.whats-new-card').getBoundingClientRect();
  result.whatsNewMobile = whatsNewRect.left >= 0 && whatsNewRect.right <= document.documentElement.clientWidth;
  document.querySelector('#whats-new-close').click();
  document.querySelector('#admin-codes-trigger').click();
  result.spriteCodesRendered = document.querySelectorAll('#code-guide-list .code-entry').length;
  document.querySelector('[data-code-view="other"]').click();
  result.otherCodesRendered = document.querySelectorAll('#code-guide-list .code-entry').length;
  result.adminCodeTotal = Number(document.querySelector('#admin-codes-count').textContent);
  result.musicReuseUnverified = ['LUHLEAKYZ', 'PR1VAT3J3T', 'B1GBODYSW3RVE'].every(code => {
    const entry = [...document.querySelectorAll('#code-guide-list .code-entry')].find(e => e.querySelector('code').textContent === code);
    return entry?.querySelector('.code-use-type').textContent === 'Reuse limit unverified' && !entry.querySelector('[data-copy-code]').disabled && !entry.querySelector('[data-mark-admin-code]') && !entry.classList.contains('is-used');
  });
  const oneTime = document.querySelector('#code-guide-list [data-mark-admin-code]');
  const usedCode = oneTime.dataset.markAdminCode; oneTime.click();
  result.suppliesOneTime = usedCode === 'SuppliesForTheHunt';
  const codeEntries = [...document.querySelectorAll('#code-guide-list .code-entry')];
  result.usedCodeLast = codeEntries.at(-1).querySelector('code').textContent === usedCode && codeEntries.at(-1).classList.contains('is-used') && codeEntries.at(-1).querySelector('[data-copy-code]').disabled;
  result.reusableCodesActive = codeEntries.filter(e => e.querySelector('.code-use-type.reusable')).every(e => !e.classList.contains('is-used') && !e.querySelector('[data-copy-code]').disabled);
  const codeRect = document.querySelector('.code-guide-card').getBoundingClientRect();
  result.codesMobile = codeRect.left >= 0 && codeRect.right <= document.documentElement.clientWidth && document.documentElement.scrollWidth === document.documentElement.clientWidth;
  document.querySelector('#code-guide-close').click();
  document.querySelector('#classic-view').click();
  status.value = 'not-mastered'; status.dispatchEvent(new Event('change'));
  const savedSeason = window.SPRITE_CATALOGS.seasons[0];
  const savedProgress = JSON.parse(localStorage.getItem(savedSeason.storageKey) || '{}');
  savedProgress[name + '::' + variant] = { acquired: true, mastered: true };
  localStorage.setItem(savedSeason.storageKey, JSON.stringify(savedProgress)); window.dispatchEvent(new Event('focus'));
  const masteredExcluded = !document.querySelector(selector('acquired'));
  savedProgress[name + '::' + variant] = { acquired: true, mastered: false };
  localStorage.setItem(savedSeason.storageKey, JSON.stringify(savedProgress)); window.dispatchEvent(new Event('focus'));
  result.notMasteredResync = masteredExcluded && document.querySelector(selector('acquired'))?.checked && !document.querySelector(selector('mastered'))?.checked;
  const output = document.createElement("pre");
  output.id = "browser-audit";
  output.textContent = JSON.stringify(result);
  document.body.replaceChildren(output);
});
</script>`;
}

async function startServer() {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://localhost");
      const relative = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
      const path = normalize(join(docs, relative));
      if (!path.startsWith(docs)) throw new Error("Invalid path");
      let body = await readFile(path);
      if (relative === "index.html") {
        body = Buffer.from(body.toString("utf8")
          .replace("</head>", `<script>localStorage.setItem("sprite-locker-last-seen-release", ${JSON.stringify(catalog.assetVersion)});</script></head>`)
          .replace("</body>", `${browserHarness()}</body>`));
      }
      response.writeHead(200, { "content-type": mime[extname(path)] || "application/octet-stream", "cache-control": "no-store" });
      response.end(body);
    } catch {
      response.writeHead(404).end("Not found");
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return server;
}

function dumpDom(chrome, url, profile) {
  return new Promise((resolve, reject) => {
    const child = spawn(chrome, [
      "--headless=new",
      "--disable-gpu",
      "--disable-gpu-shader-disk-cache",
      "--disable-dev-shm-usage",
      "--disable-background-networking",
      "--no-sandbox",
      "--no-first-run",
      `--user-data-dir=${profile}`,
      "--window-size=320,568",
      "--dump-dom",
      "--virtual-time-budget=8000",
      url,
    ], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Headless browser smoke test timed out."));
    }, 30000);
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`Headless browser exited ${code}: ${stderr}`));
      else resolve(stdout);
    });
  });
}

test("live static tracker works at 320px in a real browser", async (context) => {
  const chrome = await firstExisting(chromeCandidates);
  if (!chrome) return context.skip("Chrome or Edge is not installed.");
  const profile = await mkdtemp(join(tmpdir(), "sprite-locker-browser-test-"));
  const server = await startServer();
  try {
    const address = server.address();
    const html = await dumpDom(chrome, `http://127.0.0.1:${address.port}/`, profile);
    const match = html.match(/<pre id="browser-audit">([^<]+)<\/pre>/);
    assert.ok(match, "Browser audit output was not rendered.");
    const audit = JSON.parse(match[1].replaceAll("&quot;", '"').replaceAll("&amp;", "&"));
    assert.equal(audit.scrollWidth, audit.viewportWidth, `Page overflows by ${audit.scrollWidth - audit.viewportWidth}px.`);
    assert.equal(audit.h1Count, 1);
    assert.equal(audit.hasSkipLink, true);
    assert.equal(audit.updateNoticeHidden, true);
    assert.equal(audit.defaultStatusAll, true);
    assert.equal(audit.defaultList, true);
    assert.equal(audit.sharingCollapsed, true);
    assert.equal(audit.friendControlsGrouped, true);
    assert.equal(audit.showOutsideCollapsed, true);
    assert.equal(audit.missingWithoutFriends, true);
    assert.equal(audit.missingRegardlessOfFriend, true);
    assert.equal(audit.defaultCompact, true);
    assert.equal(audit.compactRowInsideViewport, true);
    assert.equal(audit.fixedSixColumnWidth, true);
    assert.equal(audit.classicSelectable, true);
    assert.equal(audit.stickyControls, true);
    assert.equal(audit.stickyTopAfterScroll, 0);
    assert.equal(audit.masteredImpliesAcquired, true);
    assert.ok(audit.checkHeight >= 40, `Checklist tap target is only ${audit.checkHeight}px tall.`);
    assert.ok(audit.statusHeight >= 40, `Status filter is only ${audit.statusHeight}px tall.`);
    assert.ok(audit.searchFontSize >= 16, `Search text is only ${audit.searchFontSize}px.`);
    assert.equal(audit.menuInsideViewport, true);
    assert.equal(audit.comparisonError, undefined);
    assert.equal(audit.sharedMastered, true);
    assert.equal(audit.nicknameRequired, true);
    assert.equal(audit.namedFriendHeader, true);
    assert.equal(audit.friendCounts, true);
    assert.equal(audit.ownHeaderCounts, true);
    assert.equal(audit.ownStatusesTappable, true);
    assert.equal(audit.friendsReadOnly, true);
    assert.equal(audit.tapCycle, true);
    assert.equal(audit.comparisonDoesNotOverwrite, true);
    assert.equal(audit.listCount, catalog.families.reduce((n, f) => n + f.variants.length, 0));
    assert.equal(audit.iNeedCount, 1);
    assert.equal(audit.comparisonReactsImmediately, true);
    assert.equal(audit.fiveFriendsMaximum, true);
    assert.deepEqual(audit.allNamedHeaders, ['Sprite / variant', 'My locker (You)', 'Test friend', 'Laura', 'Chris', 'Alex', 'Sharon']);
    assert.equal(audit.sixPlayerStatuses, true);
    assert.equal(audit.sixPlayerColumns, true);
    assert.equal(audit.fivePlayersInMenu, true);
    assert.equal(audit.specificFriendFilter, true);
    assert.equal(audit.comparisonScrolls, true);
    assert.equal(audit.playerHeaderPinned, true);
    assert.equal(audit.spriteColumnSticky, true);
    assert.equal(audit.removeFriend, true);
    assert.equal(audit.shortLinkCreated, true);
    assert.equal(audit.shortLinkImported, true);
    assert.equal(audit.shortSharingPreservesProgress, true);
    assert.equal(audit.directorySearch, true);
    assert.equal(audit.directoryAddWithoutLink, true);
    assert.equal(audit.directoryOffByDefault, true);
    assert.equal(audit.directoryOptIn, true);
    assert.equal(audit.directoryOptOut, true);
    assert.equal(audit.liveOffByDefault, true);
    assert.equal(audit.liveOptedIn, true);
    assert.equal(audit.liveSyncsOutsideList, true);
    assert.equal(audit.livePauseWorks, true);
    assert.equal(audit.friendsStored, true);
    assert.equal(audit.listNoOverflow, true);
    assert.equal(audit.whatsNewReopens, true);
    assert.equal(audit.whatsNewMobile, true);
    assert.equal(audit.spriteCodesRendered, catalog.unlockCodes.length);
    assert.equal(audit.otherCodesRendered, catalog.otherAdminCodes.length);
    assert.equal(audit.adminCodeTotal, catalog.unlockCodes.length + catalog.otherAdminCodes.length);
    assert.equal(audit.musicReuseUnverified, true);
    assert.equal(audit.usedCodeLast, true);
    assert.equal(audit.suppliesOneTime, true);
    assert.equal(audit.reusableCodesActive, true);
    assert.equal(audit.codesMobile, true);
    assert.equal(audit.notMasteredResync, true);
    assert.deepEqual(audit.familyNames, catalog.familyOrder);
    assert.equal(audit.familyNames.indexOf('Dumpster Dive'), audit.familyNames.indexOf('Birthday') - 1);
    assert.deepEqual(audit.firstVariants, ["Base", "Gold", "Cheat Master", "Loot Hacker", "Bounty Hunter", "Trick or Treat"]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(profile, { recursive: true, force: true });
  }
});
