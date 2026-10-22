import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { APP_VERSION, APP_BUILD } from "../src/version.js";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("card detail Source Review link carries issuer, card name and exact card ID", async () => {
  const html = await read("../public/cards.html");
  const cardsScript = await read("../public/js/cards.js");
  assert.ok(html.includes('id="open-source-review-link"'));
  assert.ok(cardsScript.includes('document.getElementById("open-source-review-link")'));
  assert.ok(cardsScript.includes('issuer: String(card.issuer || "")'));
  assert.ok(cardsScript.includes('cardName: String(card.name || "")'));
  assert.ok(cardsScript.includes('cardId: String(card.id || "")'));
  assert.ok(cardsScript.includes('sourceReviewLink.href = "/sources.html?" + params.toString()'));
});

test("Source Review pre-fills discovery fields from card-detail navigation", async () => {
  const html = await read("../public/sources.html");
  const sourcesScript = await read("../public/js/sources.js");
  assert.ok(html.includes('id="discover-issuer"'));
  assert.ok(html.includes('id="discover-card-name"'));
  assert.ok(html.includes('id="source-card"'));
  assert.match(html, /id="source-card-context"[^>]*role="status"[^>]*hidden/);
  assert.ok(sourcesScript.includes('new URLSearchParams(window.location.search)'));
  assert.ok(sourcesScript.includes('sourceLaunchParams.get("issuer")'));
  assert.ok(sourcesScript.includes('sourceLaunchParams.get("cardName")'));
  assert.ok(sourcesScript.includes('sourceLaunchParams.get("cardId")'));
  assert.ok(sourcesScript.includes("if (linkedIssuer) discoverIssuerInput.value = linkedIssuer"));
  assert.ok(sourcesScript.includes("if (linkedCardName) discoverCardNameInput.value = linkedCardName"));
});

test("Source Review selects the same card by ID first and exact issuer/name as fallback", async () => {
  const sourcesScript = await read("../public/js/sources.js");
  assert.ok(sourcesScript.includes("function resolveLinkedCardSelection()"));
  assert.ok(sourcesScript.includes('cards.find(card => String(card.id) === linkedCardId)'));
  assert.ok(sourcesScript.includes('norm(card.issuer) === norm(linkedIssuer)'));
  assert.ok(sourcesScript.includes('norm(card.name) === norm(linkedCardName)'));
  assert.ok(sourcesScript.includes("cardSelect.value = String(matchedCard.id)"));
  assert.ok(sourcesScript.includes("currentCardId = String(matchedCard.id)"));
  assert.ok(sourcesScript.includes("Existing card selected; extraction and publishing will target this record rather than create a duplicate."));
});

test("Source Review blocks automatic and manual extraction if a linked existing card cannot be resolved", async () => {
  const sourcesScript = await read("../public/js/sources.js");
  assert.ok(sourcesScript.includes("new-card creation is blocked for this link"));
  assert.ok(sourcesScript.includes('The existing card from Card Catalogue is not selected.'));
  assert.ok(sourcesScript.includes('if (linkedCardId && (!linkedCardResolved || !cardSelect.value))'));
});

test("all pages reference current release/cache keys after card context navigation update", async () => {
  for (const path of [
    "../public/index.html",
    "../public/cards.html",
    "../public/calculator.html",
    "../public/compare.html",
    "../public/sources.html"
  ]) {
    const html = await read(path);
    assert.ok(html.includes("app.css?v=0.6.3.0"), path + " needs current CSS cache key");
    assert.ok(html.includes(`v${APP_VERSION} · build ${APP_BUILD}`), path + " needs current footer metadata");
  }
  const layout = await read("../public/js/layout.js");
  assert.ok(layout.includes(`const APP_VERSION = "${APP_VERSION}";`));
  assert.ok(layout.includes(`const APP_BUILD = "${APP_BUILD}";`));
});
