import test from "node:test";
import assert from "node:assert/strict";
import {
  deduplicatePendingDraftRows,
  draftIdentity,
  normalizeSourceUrl
} from "../src/draft-dedupe.js";
import { getDrafts } from "../src/db.js";

test("deduplicates retries for the same issuer and card variant, keeping the newest draft", () => {
  const rows = [
    { id: "newest", source_url: "https://campaigns.icicibank.com/credit-card/alumni/index.html", created_at: "2026-10-22T04:00:00Z", extracted_json: JSON.stringify({ issuer: "ICICI Bank", cardName: "Sapphiro Credit Card" }) },
    { id: "older-2", source_url: "https://www.icici.bank.in/personal-banking/cards/credit-card/sapphiro-card?utm=tracking", created_at: "2026-10-22T03:59:00Z", extracted_json: JSON.stringify({ issuer: "ICICI Bank", cardName: " Sapphiro   Credit Card " }) },
    { id: "different-card", source_url: "https://www.icici.bank.in/personal-banking/cards/credit-card/coral-card", created_at: "2026-10-22T03:58:00Z", extracted_json: JSON.stringify({ issuer: "ICICI Bank", cardName: "Coral Credit Card" }) }
  ];
  const result = deduplicatePendingDraftRows(rows);
  assert.deepEqual(result.map(row => row.id), ["newest", "different-card"]);
});

test("deduplicates old drafts that have no extracted card name when their issuer and source URL match", () => {
  const rows = [
    { id: "newest", source_url: "https://campaigns.icicibank.com/credit-card/alumni/index.html", extracted_json: JSON.stringify({ issuer: "ICICI Bank", cardName: null }) },
    { id: "older", source_url: "https://campaigns.icicibank.com/credit-card/alumni/index.html?utm=one", extracted_json: JSON.stringify({ issuer: " icici bank " }) }
  ];
  assert.deepEqual(deduplicatePendingDraftRows(rows).map(row => row.id), ["newest"]);
});

test("normalizes source URL tracking parameters and fragments for duplicate matching", () => {
  assert.equal(
    normalizeSourceUrl("https://Example.com/card/page?utm_source=search#benefits"),
    "https://example.com/card/page"
  );
  const left = { source_url: "https://example.com/card/?ref=1", extracted_json: JSON.stringify({ issuer: "Bank" }) };
  const right = { source_url: "https://example.com/card", extracted_json: JSON.stringify({ issuer: " bank " }) };
  assert.equal(draftIdentity(left), draftIdentity(right));
});

test("does not combine different card variants from the same issuer", () => {
  const rows = [
    { id: "sapphiro", source_url: "https://issuer.example/card", extracted_json: JSON.stringify({ issuer: "ICICI Bank", cardName: "Sapphiro" }) },
    { id: "coral", source_url: "https://issuer.example/card", extracted_json: JSON.stringify({ issuer: "ICICI Bank", cardName: "Coral" }) }
  ];
  assert.deepEqual(deduplicatePendingDraftRows(rows).map(row => row.id), ["sapphiro", "coral"]);
});


test("getDrafts exposes only one review item for repeated copies of the same card", async () => {
  const rows = [
    { id: "latest", card_id: null, source_url: "https://campaigns.icicibank.com/credit-card/alumni/index.html", source_title: "ICICI Bank", source_excerpt: "", extracted_json: JSON.stringify({ issuer: "ICICI Bank", cardName: "Sapphiro Credit Card" }), status: "needs_review", created_at: "2026-10-22T04:00:00Z" },
    { id: "older-one", card_id: null, source_url: "https://campaigns.icicibank.com/credit-card/alumni/index.html", source_title: "ICICI Bank", source_excerpt: "", extracted_json: JSON.stringify({ issuer: "ICICI Bank", cardName: "Sapphiro Credit Card" }), status: "needs_review", created_at: "2026-10-22T03:59:00Z" },
    { id: "older-two", card_id: null, source_url: "https://campaigns.icicibank.com/credit-card/alumni/index.html?source=retry", source_title: "ICICI Bank", source_excerpt: "", extracted_json: JSON.stringify({ issuer: "ICICI Bank", cardName: "Sapphiro Credit Card" }), status: "needs_review", created_at: "2026-10-22T03:58:00Z" }
  ];
  const env = {
    DB: {
      prepare: () => ({
        all: async () => ({ results: rows })
      })
    }
  };
  const drafts = await getDrafts(env);
  assert.deepEqual(drafts.map(draft => draft.id), ["latest"]);
  assert.equal(drafts[0].status, "needs_review");
});
