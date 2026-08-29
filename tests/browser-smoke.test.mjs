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
window.addEventListener("load", () => {
  const status = document.querySelector("#status-filter");
  status.value = "all";
  status.dispatchEvent(new Event("change", { bubbles: true }));
  const mastered = document.querySelector('[data-field="mastered"]');
  const name = mastered.dataset.name;
  const variant = mastered.dataset.variant;
  mastered.click();
  const selector = (field) => '[data-name="' + CSS.escape(name) + '"][data-variant="' + CSS.escape(variant) + '"][data-field="' + field + '"]';
  const menu = document.querySelector("#data-menu");
  menu.open = true;
  const menuRect = menu.querySelector(".data-menu-panel").getBoundingClientRect();
  const result = {
    viewportWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    h1Count: document.querySelectorAll("h1").length,
    hasSkipLink: !!document.querySelector('.skip-link[href="#sprite-checklist"]'),
    updateNoticeHidden: document.querySelector("#update-notice").hidden,
    masteredImpliesAcquired: document.querySelector(selector("mastered")).checked && document.querySelector(selector("acquired")).checked,
    checkHeight: Math.round(document.querySelector(".check").getBoundingClientRect().height),
    statusHeight: Math.round(document.querySelector(".select-filter").getBoundingClientRect().height),
    searchFontSize: parseFloat(getComputedStyle(document.querySelector("#search")).fontSize),
    menuInsideViewport: menuRect.left >= 0 && menuRect.right <= document.documentElement.clientWidth,
  };
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
    assert.equal(audit.masteredImpliesAcquired, true);
    assert.ok(audit.checkHeight >= 40, `Checklist tap target is only ${audit.checkHeight}px tall.`);
    assert.ok(audit.statusHeight >= 40, `Status filter is only ${audit.statusHeight}px tall.`);
    assert.ok(audit.searchFontSize >= 16, `Search text is only ${audit.searchFontSize}px.`);
    assert.equal(audit.menuInsideViewport, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(profile, { recursive: true, force: true });
  }
});
