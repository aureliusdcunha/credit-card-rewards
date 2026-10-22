import test from "node:test";
import assert from "node:assert/strict";
import { CATEGORIES, normalizeCategory, normalizeDraftCategories } from "../src/category-normalizer.js";

test("normalizes common reward category labels to canonical categories", () => {
  assert.equal(normalizeCategory("flights"), "airline_direct");
  assert.equal(normalizeCategory("Flight Booking"), "airline_direct");
  assert.equal(normalizeCategory("online shopping"), "online_shopping");
  assert.equal(normalizeCategory("restaurants"), "dining");
  assert.equal(normalizeCategory("Travel Portal"), "travel_portal");
  assert.equal(normalizeCategory("AIRLINE_DIRECT"), "airline_direct");
  assert.equal(CATEGORIES.includes(normalizeCategory("flights")), true);
});

test("annotates normalized rule and cap categories so reviewers can verify them", () => {
  const draft = {
    rules: [{
      category: "flights",
      notes: null,
      sourceQuote: "Flights earn bonus reward points.",
      cap: { type: "points", value: 1000, overCapCategory: "general spend" }
    }],
    exclusions: []
  };
  normalizeDraftCategories(draft);
  assert.equal(draft.rules[0].category, "airline_direct");
  assert.equal(draft.rules[0].cap.overCapCategory, "general");
  assert.match(draft.rules[0].notes, /flights.*airline_direct/i);
  assert.match(draft.rules[0].notes, /Over-cap category.*general/i);
  assert.equal(draft.rules[0].sourceQuote, "Flights earn bonus reward points.");
});

test("normalizes exclusion categories but retains a reviewer warning", () => {
  const draft = {
    rules: [],
    exclusions: [{ category: "hotels", reason: "Excluded", sourceQuote: "Hotels are excluded." }]
  };
  normalizeDraftCategories(draft);
  assert.equal(draft.exclusions[0].category, "hotel_direct");
  assert.match(draft.exclusions[0].reason, /normalized/i);
});

test("does not hide unsupported labels by coercing them to unrelated categories", () => {
  assert.equal(normalizeCategory("subscription streaming"), "subscription streaming");
});
