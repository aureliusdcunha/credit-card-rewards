import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("visual refresh defines a consistent premium fintech palette and surfaces", async () => {
  const css = await read("../public/css/app.css");
  assert.match(css, /--ink:\s*#14243b/);
  assert.match(css, /--blue:\s*#4259d7/);
  assert.match(css, /background:\s*[\s\S]{0,100}radial-gradient\(ellipse at 8% 0%/);
  assert.match(css, /\.credit-card-tile\s*\{[^}]*border-radius:\s*19px/s);
  assert.match(css, /\.feature-card:hover\s*\{[^}]*translateY\(-4px\)/s);
  assert.match(css, /\.button-primary\s*\{[^}]*linear-gradient/s);
  assert.match(css, /\.panel,\s*\.result-panel\s*\{[^}]*box-shadow/s);
});

test("visual refresh keeps the card details tabs visible while the content scrolls", async () => {
  const css = await read("../public/css/app.css");
  assert.match(css, /\.card-modal-header,\s*\.card-modal-footer\s*\{\s*flex:\s*0\s+0\s+auto/s);
  assert.match(css, /\.card-modal-tabs\s*\{[^}]*flex:\s*0\s+0\s+auto/s);
  assert.match(css, /\.card-modal-tabs\s*\{[^}]*min-height:\s*58px/s);
  assert.match(css, /\.card-modal-tabs\s+\[role=tab\]\s*\{[^}]*min-height:\s*44px/s);
  assert.match(css, /\.card-modal-panel\s*\{[^}]*overflow:\s*auto/s);
});

test("visual refresh includes dedicated mobile layout and reduced-motion support", async () => {
  const css = await read("../public/css/app.css");
  assert.match(css, /@media\s*\(max-width:\s*720px\)/);
  assert.match(css, /@media\s*\(max-width:\s*390px\)/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /\.nav-links\.open\s*\{\s*display:\s*grid/);
  assert.match(css, /\.card-grid\s*\{\s*grid-template-columns:\s*minmax\(0,1fr\)/);
});

test("all pages load the refreshed frontend assets and show the same release", async () => {
  for (const path of [
    "../public/index.html",
    "../public/cards.html",
    "../public/calculator.html",
    "../public/compare.html",
    "../public/sources.html"
  ]) {
    const html = await read(path);
    assert.ok(html.includes("app.css?v=0.4.0.0"), path + " must cache-bust the refreshed stylesheet");
    assert.ok(html.includes("v0.4.0 · build 20261022.18"), path + " must show the current release");
  }
  const layout = await read("../public/js/layout.js");
  assert.ok(layout.includes('const APP_VERSION = "0.4.0";'));
  assert.ok(layout.includes('const APP_BUILD = "20261022.18";'));
});
