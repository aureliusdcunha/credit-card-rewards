import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { APP_VERSION, APP_BUILD } from "../src/version.js";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("data terminal theme applies dark financial surfaces and mint/cyan data accents", async () => {
  const css = await read("../public/css/app.css");
  assert.match(css, /0\.5\.0\s+—\s+DATA TERMINAL/);
  assert.match(css, /--canvas:\s*#0d141b/);
  assert.match(css, /--surface:\s*#151f29/);
  assert.match(css, /--blue:\s*#55d6b3/);
  assert.match(css, /ui-monospace/);
  assert.match(css, /\.terminal-table\s*\{/);
  assert.match(css, /\.stat-card:before\s*\{/);
});

test("individual card details include a facts strip and source-first earning rule table", async () => {
  const html = await read("../public/cards.html");
  const cardsScript = await read("../public/js/cards.js");
  const modalScript = await read("../public/js/card-modal.js");
  assert.ok(html.includes('id="card-modal-summary"'));
  assert.ok(cardsScript.includes("renderCardSummary(card)"));
  assert.ok(cardsScript.includes('cell("Payment network"'));
  assert.ok(cardsScript.includes('cell("Annual fee"'));
  assert.ok(modalScript.includes("terminal-table"));
  assert.ok(modalScript.includes("Inspect source evidence"));
  assert.ok(modalScript.includes("sourceLink(rule, card)"));
});

test("catalogue tiles expose network, fee, rule count and benefit/exclusion totals", async () => {
  const apiScript = await read("../public/js/api.js");
  assert.ok(apiScript.includes('class="tile-card-counts"'));
  assert.ok(apiScript.includes(">Network</div>"));
  assert.ok(apiScript.includes(">Annual fee</div>"));
  assert.ok(apiScript.includes("REVIEW REQUIRED"));
});

test("all pages reference the current release and cache-busted assets", async () => {
  for (const path of [
    "../public/index.html",
    "../public/cards.html",
    "../public/calculator.html",
    "../public/compare.html",
    "../public/sources.html"
  ]) {
    const html = await read(path);
    assert.ok(html.includes(`app.css?v=${APP_VERSION}.0`), path + " needs the terminal stylesheet cache key");
    assert.ok(html.includes(`v${APP_VERSION} · build ${APP_BUILD}`), path + " needs current release metadata");
  }
  const layout = await read("../public/js/layout.js");
  assert.ok(layout.includes(`const APP_VERSION = "${APP_VERSION}";`));
  assert.ok(layout.includes(`const APP_BUILD = "${APP_BUILD}";`));
});


test("data terminal keeps selected text readable on dark surfaces", async () => {
  const css = await read("../public/css/app.css");
  assert.match(css, /::selection,\s*\n?::-moz-selection\s*\{[^}]*color:\s*#f2fffa\s*!important/s);
  assert.match(css, /\.card-modal-tabs\s+\[role="tab"\]:hover\s*\{[^}]*color:\s*#e8fff8\s*!important/s);
  assert.match(css, /\.card-modal-tabs\s+\[role="tab"\]\[aria-selected="true"\]\s*\{[^}]*background:\s*#193b36\s*!important/s);
  assert.match(css, /\.card-modal-tabs\s+\[role="tab"\]\[aria-selected="true"\]:hover\s*\{[^}]*color:\s*#e6fff7\s*!important/s);
  assert.match(css, /\.card-modal-tabs\s+\[role="tab"\]:focus-visible,\s*\.card-modal-close:focus-visible\s*\{[^}]*outline:\s*2px solid #70e0bc/s);
});


test("calculator and comparison selectors include SimplySAVE accelerated categories", async () => {
  const calculator = await read("../public/calculator.html");
  const compare = await read("../public/compare.html");
  for (const html of [calculator, compare]) {
    assert.match(html, /<option value="movies">Movies<\/option>/);
    assert.match(html, /<option value="departmental_stores">Departmental stores<\/option>/);
  }
});


test("mobile catalogue uses compact filters and one card per row", async () => {
  const css = await read("../public/css/app.css");
  assert.ok(css.includes("0.6.18 — Responsive mobile card catalogue"));
  assert.ok(css.includes("grid-template-columns: minmax(0, 1fr); gap: 12px;"));
  assert.ok(css.includes("flex: 0 0 46px;"));
  assert.ok(css.includes("height: 46px;"));
  assert.ok(css.includes(".card-grid .tile-meta { grid-template-columns: repeat(2, minmax(0, 1fr)); }"));
});