import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { APP_VERSION, APP_BUILD } from "../src/version.js";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("Compare page supports searching and selecting two to five catalogue cards", async () => {
  const html = await read("../public/compare.html");
  const js = await read("../public/js/compare.js");
  assert.match(html, /Compare two to five cards/);
  assert.ok(html.includes('id="compare-card-search"'));
  assert.ok(html.includes('id="compare-selection-count"'));
  assert.ok(html.includes('id="compare-matrix"'));
  assert.ok(html.includes("Card features comparison"));
  assert.ok(js.includes("const MAX_COMPARE = 5"));
  assert.ok(js.includes("const selectedIds = new Set()"));
  assert.ok(js.includes("function drawOptions()"));
  assert.ok(js.includes("function cardFeatureMatrix(selectedCards)"));
  assert.ok(js.includes("selectedIds.size >= MAX_COMPARE"));
  assert.ok(js.includes("No approved"));
});

test("comparison matrix covers key card metadata, rules, benefits, restrictions and sources", async () => {
  const js = await read("../public/js/compare.js");
  for (const label of [
    "Review status",
    "Payment network",
    "Reward currency",
    "Annual fee",
    "Joining fee",
    "Annual-fee waiver",
    "Approved earning rules",
    "Benefits",
    "Exclusions / restrictions",
    "Source / effective date"
  ]) assert.ok(js.includes(label), "missing comparison field: " + label);
  assert.ok(js.includes("Rules for"));
  assert.ok(js.includes("Inspect source evidence") === false); // this screen uses per-rule source quotes instead
  assert.ok(js.includes("const sourceUrls = card =>"));
  assert.ok(js.includes("sourceQuote"));
  assert.ok(js.includes('target="_blank" rel="noopener noreferrer"'));
});

test("comparison treats missing data as not recorded and does not infer a zero fee", async () => {
  const js = await read("../public/js/compare.js");
  assert.ok(js.includes('value == null || value === "" || !Number.isFinite(Number(value))'));
  assert.ok(js.includes('"Not recorded"'));
  assert.ok(js.includes("Only approved earning rules are shown"));
  assert.ok(js.includes("does not mean ₹0"));
});

test("comparison page uses current cache-busted frontend and release metadata", async () => {
  const html = await read("../public/compare.html");
  assert.ok(html.includes("app.css?v=0.6.0.0"));
  assert.ok(html.includes("compare.js?v=0.6.0.0"));
  assert.ok(html.includes(`v${APP_VERSION} · build ${APP_BUILD}`));
});

test("Source Review step badges are distinct and accessible", async () => {
  const html = await read("../public/sources.html");
  assert.ok(html.includes('aria-label="Step 1: administrator access">01'));
  assert.ok(html.includes('aria-label="Step 2: automatic source discovery">02'));
  assert.ok(html.includes('aria-label="Step 3: manual source import">03'));
  assert.equal((html.match(/aria-label="Step 2:/g) || []).length, 1);
});
