import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { APP_VERSION, APP_BUILD } from "../src/version.js";

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
  assert.equal(health.aiModel, "gemini-3.5-flash");
  assert.equal(health.pdfConversionConfigured, true);
  assert.equal(health.pdfConversionProvider, "gemini");
  assert.equal(JSON.stringify(health).includes("do-not-expose-this-key"), false);
});
