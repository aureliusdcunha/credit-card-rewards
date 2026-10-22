import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

async function getCatalogueWarningFunction() {
  const apiSource = await read("../public/js/api.js");
  const sandbox = { window: {} };
  runInNewContext(apiSource, sandbox);
  return sandbox.window.CRI.catalogueDataWarning;
}

test("demo mode gets an explicit non-authoritative catalogue warning", async () => {
  const catalogueDataWarning = await getCatalogueWarningFunction();
  const warning = catalogueDataWarning({ mode: "demo" }, []);
  assert.equal(warning.tone, "warning");
  assert.match(warning.title, /Demonstration data is not authoritative/);
  assert.match(warning.message, /production D1 database is not connected/);
});

test("production catalogue with approved, verified records has no global warning", async () => {
  const catalogueDataWarning = await getCatalogueWarningFunction();
  const warning = catalogueDataWarning({ mode: "d1" }, [
    {
      reviewStatus: "verified",
      rules: [{ status: "approved", rate: 5, perAmount: 100, unit: "Points" }],
      benefits: [],
      exclusions: []
    }
  ]);
  assert.equal(warning, null);
});

test("production catalogue with records needing review gets a compact neutral warning", async () => {
  const catalogueDataWarning = await getCatalogueWarningFunction();
  const warning = catalogueDataWarning({ mode: "d1" }, [
    { reviewStatus: "verified", rules: [{ status: "approved" }], benefits: [], exclusions: [] },
    { reviewStatus: "needs_review", rules: [], benefits: [], exclusions: [] },
    { reviewStatus: "no_verified_rules", rules: [], benefits: [], exclusions: [] }
  ]);
  assert.equal(warning.tone, "neutral");
  assert.match(warning.title, /Some card records need review/);
  assert.match(warning.message, /2 card record\(s\)/);
});

test("production catalogue with provisional demo rules gets a warning", async () => {
  const catalogueDataWarning = await getCatalogueWarningFunction();
  const warning = catalogueDataWarning({ mode: "d1" }, [
    { reviewStatus: "verified", rules: [{ status: "demo" }], benefits: [], exclusions: [] }
  ]);
  assert.equal(warning.tone, "warning");
  assert.match(warning.title, /demonstration rules are present/);
});

test("overview contains only a hidden runtime banner placeholder", async () => {
  const html = await read("../public/index.html");
  const dashboard = await read("../public/js/dashboard.js");
  assert.ok(html.includes('id="catalogue-data-warning"'));
  assert.match(html, /id="catalogue-data-warning"[^>]*hidden/);
  assert.equal(html.includes("Important: demonstration data is not authoritative."), false);
  assert.ok(dashboard.includes("C.catalogueDataWarning(health, cards)"));
  assert.ok(dashboard.includes("banner.hidden = true"));
});
