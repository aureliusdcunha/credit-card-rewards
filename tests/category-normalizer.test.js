import test from "node:test";
import assert from "node:assert/strict";
import { CATEGORIES, normalizeCategory, normalizeDraftCategories, explicitPerAmountFromQuote } from "../src/category-normalizer.js";

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


test("recovers a zero perAmount only when the source quote explicitly states a spend denominator", () => {
  assert.equal(explicitPerAmountFromQuote("Earn 5 EDGE Miles for every INR 100 spent on eligible transactions."), 100);
  assert.equal(explicitPerAmountFromQuote("Earn 3 reward points per ₹1,000 spent."), 1000);
  assert.equal(explicitPerAmountFromQuote("Earn 4 points on every 500 INR spent."), 500);
  assert.equal(explicitPerAmountFromQuote("Earn 5 points / ₹100 spent on eligible retail purchases."), 100);
  assert.equal(explicitPerAmountFromQuote("Earn 5 points/ Rs. 100 spent on retail purchases."), 100);
  assert.equal(explicitPerAmountFromQuote("Earn 5 points for ₹200 spent on eligible transactions."), 200);
  assert.equal(explicitPerAmountFromQuote("Earn 5 points on INR 250 purchase value."), 250);
  assert.equal(explicitPerAmountFromQuote("Earn 5 points per ₹100 spent, capped at 1,000 points per month."), 100);
  assert.equal(explicitPerAmountFromQuote("Flights earn bonus EDGE Miles."), null);
  assert.equal(explicitPerAmountFromQuote("Earn 5 bonus points, with a cap of ₹1,000 per month."), null);
});

test("repairs perAmount from a quote and annotates the draft for human review", () => {
  const draft = {
    rules: [{
      category: "airline_direct",
      rate: 5,
      perAmount: 0,
      unit: "EDGE Miles",
      sourceQuote: "5 EDGE Miles for every INR 100 spent on airline purchases.",
      notes: null
    }],
    exclusions: []
  };
  normalizeDraftCategories(draft);
  assert.equal(draft.rules[0].perAmount, 100);
  assert.match(draft.rules[0].notes, /perAmount was set to 100/i);
});

test("does not invent a denominator when the source quote has no explicit spend basis", () => {
  const draft = {
    rules: [{
      category: "general",
      rate: 5,
      perAmount: 0,
      unit: "EDGE Miles",
      sourceQuote: "Earn bonus EDGE Miles on eligible purchases.",
      notes: null
    }],
    exclusions: []
  };
  normalizeDraftCategories(draft);
  assert.equal(draft.rules[0].perAmount, 0);
});
