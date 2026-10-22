import test from "node:test";
import assert from "node:assert/strict";
import { isSpendCurrencyUnit, normalizeRewardUnit, normalizeDraftRewardUnits } from "../src/reward-units.js";

test("recognizes only currency-denominator labels as spend units", () => {
  for (const value of ["INR", "₹", "Rs.", "rs", "Rupees"]) assert.equal(isSpendCurrencyUnit(value), true);
  for (const value of ["EDGE Miles", "Reward Points", "Cashback points"]) assert.equal(isSpendCurrencyUnit(value), false);
});

test("normalizes INR mistakenly extracted as a reward unit to the card's reward currency", () => {
  assert.equal(normalizeRewardUnit("INR", "EDGE Miles"), "EDGE Miles");
  assert.equal(normalizeRewardUnit("Rs.", "Reward Points"), "Reward Points");
  assert.equal(normalizeRewardUnit("Reward Points", "Reward Points"), "Reward Points");
});

test("normalizes saved extraction JSON and annotates the correction for human review", () => {
  const draft = {
    rewardCurrency: "EDGE Miles",
    rules: [{ category: "other", rate: 2, perAmount: 100, unit: "INR", sourceQuote: "2 EDGE Miles per ₹100", notes: null }]
  };
  normalizeDraftRewardUnits(draft);
  assert.equal(draft.rules[0].unit, "EDGE Miles");
  assert.match(draft.rules[0].notes, /spend currency.*reward unit/i);
});

test("retains currency as the unit when the card's reward currency itself is cash/currency denominated", () => {
  assert.equal(normalizeRewardUnit("INR", "INR"), "INR");
  assert.equal(normalizeRewardUnit("₹", "Cashback"), "₹");
});
