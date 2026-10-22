import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import worker from "../src/index.js";
import { APP_VERSION, APP_BUILD } from "../src/version.js";
import { DEFAULT_GEMINI_MODEL, DEFAULT_GEMINI_FALLBACK_MODELS } from "../src/model-provider.js";

test("health endpoint exposes the same version and build shown by the frontend release badge", async () => {
  const response = await worker.fetch(new Request("https://app.example/api/health"), {
    AI: { run: async () => ({}) },
    ADMIN_TOKEN: "test-admin-token"
  });
  assert.equal(response.status, 200);
  const health = await response.json();
  assert.equal(health.version, APP_VERSION);
  assert.equal(health.build, APP_BUILD);
  assert.equal(health.release, "v" + APP_VERSION + "+" + APP_BUILD);
  assert.equal(health.ok, true);
});

test("cards API includes release metadata for support and version verification", async () => {
  const response = await worker.fetch(new Request("https://app.example/api/cards"), {});
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.version, APP_VERSION);
  assert.equal(payload.build, APP_BUILD);
  assert.ok(Array.isArray(payload.cards));
});


test("health endpoint reports Gemini as the extraction provider without revealing the secret", async () => {
  const response = await worker.fetch(new Request("https://app.example/api/health"), {
    GEMINI_API_KEY: "do-not-expose-this-key",
    ADMIN_TOKEN: "test-admin-token"
  });
  assert.equal(response.status, 200);
  const health = await response.json();
  assert.equal(health.aiConfigured, true);
  assert.equal(health.aiProvider, "gemini");
  assert.equal(health.aiModel, DEFAULT_GEMINI_MODEL);
  assert.equal(health.pdfConversionConfigured, true);
  assert.equal(health.pdfConversionProvider, "gemini");
  assert.deepEqual(health.aiFallbackModels, DEFAULT_GEMINI_FALLBACK_MODELS);
  assert.equal(JSON.stringify(health).includes("do-not-expose-this-key"), false);
});


test("navigation version capsule stays aligned with backend release metadata", async () => {
  const layout = await readFile(new URL("../public/js/layout.js", import.meta.url), "utf8");
  assert.ok(layout.includes(`const APP_VERSION = "${APP_VERSION}";`), "layout capsule version must match backend version");
  assert.ok(layout.includes(`const APP_BUILD = "${APP_BUILD}";`), "layout capsule build must match backend build");
});


test("Source Review displays stage timings returned by automatic extraction", async () => {
  const sourceScript = await readFile(new URL("../public/js/sources.js", import.meta.url), "utf8");
  assert.ok(sourceScript.includes("formatTimingSummary(response.timingMs)"));
  assert.ok(sourceScript.includes("timingMs.discoveryMs"));
  assert.ok(sourceScript.includes("timingMs.sourceReadMs"));
  assert.ok(sourceScript.includes("timingMs.aiExtractionMs"));
});


test("Source Review offers a metadata-only publish path when the draft has no complete earning rules", async () => {
  const sourceScript = await readFile(new URL("../public/js/sources.js", import.meta.url), "utf8");
  assert.ok(sourceScript.includes("Create card from details"));
  assert.ok(sourceScript.includes("Save details (keep existing rules)"));
  assert.ok(sourceScript.includes("No complete earning rule was available"));
});


test("package version, every page cache-buster, all page footers and the visible pill match the release", async () => {
  const { version: packageVersion } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(packageVersion, APP_VERSION);

  const publicDir = new URL("../public/", import.meta.url);
  const { readdir } = await import("node:fs/promises");
  const htmlPages = (await readdir(publicDir)).filter(name => name.endsWith(".html"));
  assert.ok(htmlPages.length >= 5, "all public pages should be checked");

  for (const page of htmlPages) {
    const html = await readFile(new URL("../public/" + page, import.meta.url), "utf8");
    assert.ok(html.includes("v" + APP_VERSION + " · build " + APP_BUILD), page + " footer must match the current release");
    for (const match of html.matchAll(/\?v=([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)/g)) {
      assert.equal(match[1], APP_VERSION + ".0", page + " asset cache-busters must match the current release");
    }
  }

  const layout = await readFile(new URL("../public/js/layout.js", import.meta.url), "utf8");
  assert.ok(layout.includes('const APP_VERSION = "' + APP_VERSION + '";'));
  assert.ok(layout.includes('const APP_BUILD = "' + APP_BUILD + '";'));
});
