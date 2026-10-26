import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { APP_VERSION, APP_BUILD } from "../src/version.js";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("Compare page has separate accessible Reward points and Benefits tabs", async () => {
  const html = await read("../public/compare.html");
  const js = await read("../public/js/compare.js");
  assert.ok(html.includes('role="tablist" aria-label="Card comparison views"'));
  assert.ok(html.includes('id="compare-tab-points"'));
  assert.ok(html.includes('id="compare-tab-benefits"'));
  assert.ok(html.includes('aria-controls="compare-panel-points"'));
  assert.ok(html.includes('aria-controls="compare-panel-benefits"'));
  assert.ok(html.includes('id="compare-panel-points"'));
  assert.match(html, /<section id="compare-panel-benefits"[^>]*hidden>/);
  assert.ok(js.includes('const MAX_COMPARE = 5'));
  assert.ok(js.includes('function setActiveTab(which)'));
  assert.ok(js.includes('pointsTab.addEventListener("click"'));
  assert.ok(js.includes('benefitsTab.addEventListener("click"'));
  assert.ok(js.includes('next.focus()'));
});

test("shared searchable picker selects two to five cards and keeps selections while filtering", async () => {
  const html = await read("../public/compare.html");
  const js = await read("../public/js/compare.js");
  assert.ok(html.includes('id="compare-card-search"'));
  assert.ok(html.includes('id="compare-selection-count"'));
  assert.ok(html.includes('id="compare-card-options"'));
  assert.ok(js.includes('const selectedIds = new Set()'));
  assert.ok(js.includes('function drawOptions()'));
  assert.ok(js.includes('selectedIds.has(String(card.id))'));
  assert.ok(js.includes('selectedIds.size >= MAX_COMPARE'));
  assert.ok(js.includes('function selectedCards()') === false); // selectedCards is an arrow helper
  assert.ok(js.includes('const selectedCards = () =>'));
});

test("Benefits tab compares metadata, rules, benefits, restrictions and official source evidence", async () => {
  const html = await read("../public/compare.html");
  const js = await read("../public/js/compare.js");
  assert.ok(html.includes("Benefits, fees &amp; features"));
  assert.ok(html.includes('id="compare-matrix"'));
  for (const label of [
    "Review status",
    "Payment network",
    "Reward currency",
    "Annual fee",
    "Joining fee",
    "Annual-fee waiver",
    "Approved earning rules",
    "Earning rules & source quotes",
    "Benefits",
    "Exclusions / restrictions",
    "Source / effective date"
  ]) assert.ok(js.includes(label), "missing comparison field: " + label);
  assert.ok(js.includes('const sourceUrls = card =>'));
  assert.ok(js.includes("sourceQuote"));
  assert.ok(js.includes('target="_blank" rel="noopener noreferrer"'));
  assert.ok(js.includes("function renderBenefitsForSelection()"));
  assert.ok(js.includes("renderBenefitsForSelection();"));
});

test("reward-points tab compares the same transaction through the existing calculator endpoint", async () => {
  const html = await read("../public/compare.html");
  const js = await read("../public/js/compare.js");
  assert.ok(html.includes('id="compare-amount"'));
  assert.ok(html.includes('id="compare-category"'));
  assert.ok(html.includes('id="compare-date"'));
  assert.ok(html.includes('id="compare-results"'));
  assert.ok(js.includes('C.request("/calculate"'));
  assert.ok(js.includes("cardId: card.id, amount, category, purchaseDate: date"));
  assert.ok(js.includes("Only approved earning rules are shown"));
});

test("comparison treats missing fees and metadata as unknown, not zero", async () => {
  const js = await read("../public/js/compare.js");
  assert.ok(js.includes('value == null || value === "" || !Number.isFinite(Number(value))'));
  assert.ok(js.includes('"Not recorded"'));
  assert.ok(js.includes("does not mean ₹0"));
});

test("Compare page uses current cache-busted assets and release metadata", async () => {
  const html = await read("../public/compare.html");
  assert.ok(html.includes("app.css?v=0.6.23.0"));
  assert.ok(html.includes("compare.js?v=0.6.23.0"));
  assert.ok(html.includes(`v${APP_VERSION} · build ${APP_BUILD}`));
});

test("Source Review step badges are distinct and accessible", async () => {
  const html = await read("../public/sources.html");
  assert.ok(html.includes('aria-label="Step 1: administrator access">01'));
  assert.ok(html.includes('aria-label="Step 2: automatic source discovery">02'));
  assert.ok(html.includes('aria-label="Step 3: manual source import">03'));
  assert.equal((html.match(/aria-label="Step 2:/g) || []).length, 1);
});