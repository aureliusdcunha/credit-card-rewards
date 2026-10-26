import test from "node:test";
import assert from "node:assert/strict";

const oldWindow = globalThis.window;
globalThis.window = { location: { href: "https://rewards.example/cards.html", search: "" } };
await import("../public/js/source-review-prefill.js");
const Prefill = globalThis.window.CRI_SOURCE_REVIEW_PREFILL;

test("builds a Source Review URL carrying issuer, card name and card ID", () => {
  const href = Prefill.buildHref({
    issuer: "HDFC Bank",
    name: "Regalia Gold",
    id: "card-123"
  }, "https://rewards.example/cards.html");
  const url = new URL(href, "https://rewards.example");

  assert.equal(url.pathname, "/sources.html");
  assert.equal(url.searchParams.get("issuer"), "HDFC Bank");
  assert.equal(url.searchParams.get("cardName"), "Regalia Gold");
  assert.equal(url.searchParams.get("cardId"), "card-123");
});

test("prefills bank and card name and selects the exact existing card ID", () => {
  const issuerInput = { value: "" };
  const cardNameInput = { value: "" };
  const cardSelect = { value: "" };
  const cards = [
    { id: "duplicate-1", issuer: "HDFC Bank", name: "Regalia Gold" },
    { id: "card-123", issuer: "HDFC Bank", name: "Regalia Gold" }
  ];

  const result = Prefill.applyQueryPrefill({
    search: "?issuer=HDFC+Bank&cardName=Regalia+Gold&cardId=card-123",
    issuerInput,
    cardNameInput,
    cardSelect,
    cards
  });

  assert.equal(issuerInput.value, "HDFC Bank");
  assert.equal(cardNameInput.value, "Regalia Gold");
  assert.equal(cardSelect.value, "card-123");
  assert.deepEqual(result, { hasPrefill: true, cardSelected: true, cardId: "card-123" });
});

test("name-based fallback selects only a unique existing card", () => {
  const issuerInput = { value: "" };
  const cardNameInput = { value: "" };
  const cardSelect = { value: "" };
  const result = Prefill.applyQueryPrefill({
    search: "?issuer=Axis+Bank&cardName=Horizon+Credit+Card",
    issuerInput,
    cardNameInput,
    cardSelect,
    cards: [{ id: "axis-horizon", issuer: "Axis Bank", name: "Horizon Credit Card" }]
  });

  assert.equal(cardSelect.value, "axis-horizon");
  assert.equal(result.cardSelected, true);
});

test("ambiguous name-based matches do not auto-select a duplicate card", () => {
  const cardSelect = { value: "" };
  const result = Prefill.applyQueryPrefill({
    search: "?issuer=HDFC+Bank&cardName=Regalia+Gold",
    cardSelect,
    cards: [
      { id: "duplicate-1", issuer: "HDFC Bank", name: "Regalia Gold" },
      { id: "duplicate-2", issuer: "HDFC Bank", name: "Regalia Gold" }
    ]
  });

  assert.equal(cardSelect.value, "");
  assert.equal(result.cardSelected, false);
});

if (oldWindow === undefined) delete globalThis.window;
else globalThis.window = oldWindow;
