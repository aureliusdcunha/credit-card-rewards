import test from "node:test";
import assert from "node:assert/strict";
import { calculateRewards } from "../src/rules-engine.js";

const demoAxis = {
  id: "axis-horizon", name: "Horizon Credit Card", issuer: "Axis Bank",
  rewardCurrency: "EDGE Miles", reviewStatus: "needs_review", officialUrl: "https://www.axisbank.com/example",
  rules: [
    { category: "airline_direct", rate: 5, perAmount: 100, unit: "EDGE Miles", status: "demo" },
    { category: "general", rate: 2, perAmount: 100, unit: "EDGE Miles", status: "demo" }
  ],
  exclusions: [{ category: "fuel", reason: "Excluded under sample terms", status: "demo" }]
};

test("calculates a category-specific reward estimate", () => {
  const result = calculateRewards({ card: demoAxis, amount: 20000, category: "airline_direct", purchaseDate: "2026-10-21" });
  assert.equal(result.ok, true);
  assert.equal(result.points, 1000);
  assert.equal(result.rewardUnit, "EDGE Miles");
  assert.equal(result.ruleStatus, "demo");
});

test("reports configured exclusions", () => {
  const result = calculateRewards({ card: demoAxis, amount: 1000, category: "fuel", purchaseDate: "2026-10-21" });
  assert.equal(result.ok, true);
  assert.equal(result.excluded, true);
  assert.equal(result.points, 0);
});

test("does not apply unverified general rules to other named categories", () => {
  const result = calculateRewards({ card: demoAxis, amount: 1000, category: "utilities", purchaseDate: "2026-10-21" });
  assert.equal(result.ok, true);
  assert.equal(result.unavailable, true);
});

test("rejects a zero or negative purchase amount", () => {
  const result = calculateRewards({ card: demoAxis, amount: 0, category: "general" });
  assert.equal(result.ok, false);
});


test("applies a configured general earn rate above a spend cap", () => {
  const card = {
    id: "travel-card", name: "Travel Card", issuer: "Example Bank", rewardCurrency: "Miles", reviewStatus: "verified",
    rules: [
      { category: "airline_direct", rate: 5, perAmount: 100, unit: "Miles", status: "approved", cap: { type: "spend", value: 20000, period: "calendar month", overCapCategory: "general" } },
      { category: "general", rate: 2, perAmount: 100, unit: "Miles", status: "approved" }
    ], exclusions: []
  };
  const result = calculateRewards({ card, amount: 10000, category: "airline_direct", periodSpendBefore: 19000, purchaseDate: "2026-10-21" });
  // ₹1,000 at 5/100 = 50; remaining ₹9,000 at 2/100 = 180.
  assert.equal(result.points, 230);
  assert.equal(result.capped, true);
});


test("rounds reward points down to whole units by default", () => {
  const card = { ...demoAxis, rules: [{ category: "general", rate: 4, perAmount: 150, unit: "Reward Points", minTransaction: 0, status: "demo" }], exclusions: [] };
  const result = calculateRewards({ card, amount: 25000, category: "general", purchaseDate: "2026-10-21" });
  assert.equal(result.points, 666);
});
