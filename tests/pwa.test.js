import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function read(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("all app pages reference a valid installable Android PWA manifest and icons", async () => {
  const pages = [
    "../public/index.html",
    "../public/cards.html",
    "../public/calculator.html",
    "../public/compare.html",
    "../public/sources.html"
  ];
  for (const path of pages) {
    const html = await read(path);
    assert.match(html, /<link rel="manifest" href="\/manifest\.webmanifest\?v=0\.6\.13\.0">/);
    assert.match(html, /<link rel="icon" type="image\/png" sizes="192x192" href="\/icons\/icon-192\.png/);
    assert.match(html, /<link rel="apple-touch-icon" href="\/icons\/icon-192\.png/);
    assert.match(html, /name="apple-mobile-web-app-capable" content="yes"/);
    assert.match(html, /name="theme-color" content="#0d141b"/);
  }

  const manifest = JSON.parse(await read("../public/manifest.webmanifest"));
  assert.equal(manifest.name, "Rewards Intelligence — Card Rewards");
  assert.equal(manifest.short_name, "Card Rewards");
  assert.equal(manifest.start_url, "/index.html?source=pwa");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.theme_color, "#0d141b");
  assert.equal(manifest.background_color, "#0d141b");
  assert.equal(manifest.prefer_related_applications, false);
  assert.ok(manifest.icons.some(icon => icon.sizes === "192x192" && icon.type === "image/png"));
  assert.ok(manifest.icons.some(icon => icon.sizes === "512x512" && icon.type === "image/png"));
  assert.ok(manifest.icons.some(icon => icon.purpose === "maskable" && icon.sizes === "512x512"));
  assert.ok(manifest.shortcuts.some(shortcut => shortcut.url === "/cards.html"));
  assert.ok(manifest.shortcuts.some(shortcut => shortcut.url === "/calculator.html"));
});

test("the service worker precaches the app shell and never intercepts or caches API responses", async () => {
  const worker = await read("../public/service-worker.js");
  for (const path of [
    '"/index.html"', '"/cards.html"', '"/calculator.html"', '"/compare.html"',
    '"/sources.html"', '"/offline.html"', '"/manifest.webmanifest"',
    '"/icons/icon-192.png"', '"/icons/icon-512.png"'
  ]) assert.ok(worker.includes(path), "precache list should include " + path);

  assert.match(worker, /const CACHE_VERSION = "0\.6\.13"/);
  assert.match(worker, /url\.pathname === "\/api" \|\| url\.pathname\.startsWith\("\/api\/"\)/);
  const bypass = worker.indexOf('if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return;');
  const fetchCache = worker.indexOf("event.respondWith", bypass);
  assert.ok(bypass >= 0 && fetchCache > bypass, "API requests must bypass the cache logic");
  assert.match(worker, /Never cache API responses/);
  assert.match(worker, /caches\.delete\(key\)/);
  assert.match(worker, /catch \{\s*const cache = await caches\.open\(CACHE_NAME\)/);
});

test("mobile navigation is a five-item bottom taskbar, not a hamburger menu", async () => {
  const layout = await read("../public/js/layout.js");
  const styles = await read("../public/css/app.css");
  for (const page of ["index.html", "cards.html", "calculator.html", "compare.html", "sources.html"]) {
    assert.ok(layout.includes('["' + page + '"'), "navigation should include " + page);
  }
  assert.ok(layout.includes('class="bottom-taskbar"') || layout.includes('className = "bottom-taskbar"'));
  assert.ok(layout.includes('id="bottom-taskbar"'));
  assert.ok(!layout.includes("nav-menu-button"), "the mobile hamburger button must be removed");
  assert.ok(!layout.includes("Menu ☰"), "the mobile menu label must be removed");
  assert.match(styles, /\.bottom-taskbar\s*\{\s*display:none;\s*\}/);
  assert.match(styles, /@media\s*\(max-width:720px\)\s*\{[\s\S]*?\.bottom-taskbar\s*\{[\s\S]*?position:fixed\s*!important;[\s\S]*?grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(styles, /env\(safe-area-inset-bottom,0px\)/);
  assert.match(styles, /nav-menu-button\s*\{\s*display:none\s*!important;/);
});

test("PWA installs through the browser prompt without affecting online app startup", async () => {
  const layout = await read("../public/js/layout.js");
  assert.match(layout, /beforeinstallprompt/);
  assert.match(layout, /deferredInstallPrompt\.prompt\(\)/);
  assert.match(layout, /navigator\.serviceWorker\.register\("\/service-worker\.js", \{ scope: "\/" \}\)/);
  assert.match(layout, /PWA enhancement must never prevent the online app from loading/);
  const manifest = await read("../public/manifest.webmanifest");
  assert.ok(manifest.includes('"display": "standalone"'));
});
