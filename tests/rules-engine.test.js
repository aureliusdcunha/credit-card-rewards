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


test("uses a verified general retail rule when comparing a named merchant category", () => {
  const card = {
    id: "verified-base",
    name: "Verified Base Card",
    issuer: "Example Bank",
    rewardCurrency: "Reward Points",
    reviewStatus: "verified",
    rules: [
      { category: "general", rate: 2, perAmount: 100, unit: "Reward Points", status: "approved", validFrom: "2026-01-01" },
      { category: "airline_direct", rate: 5, perAmount: 100, unit: "Reward Points", status: "approved", validFrom: "2026-01-01" }
    ],
    exclusions: []
  };
  const result = calculateRewards({ card, amount: 25000, category: "dining", purchaseDate: "2026-10-22" });
  assert.equal(result.ok, true);
  assert.equal(result.unavailable, undefined);
  assert.equal(result.points, 500);
  assert.match(result.notes.join(" "), /verified general eligible-spend rate was used/i);
});

test("uses an other-spend rule as a fallback only when the issuer quote says it covers other eligible spend", () => {
  const card = {
    id: "verified-other",
    name: "Verified Other Spend Card",
    issuer: "Example Bank",
    rewardCurrency: "EDGE Miles",
    reviewStatus: "verified",
    rules: [
      { category: "other", rate: 2, perAmount: 100, unit: "EDGE Miles", status: "approved", sourceQuote: "Earn 2 EDGE Miles per ₹100 spent on other spends." }
    ],
    exclusions: []
  };
  const result = calculateRewards({ card, amount: 25000, category: "dining", purchaseDate: "2026-10-22" });
  assert.equal(result.ok, true);
  assert.equal(result.points, 500);
  assert.match(result.notes.join(" "), /other eligible spend.*fallback/i);
});

test("uses verified domestic rate as a caveated fallback for a non-international category", () => {
  const card = {
    id: "verified-domestic",
    name: "Verified Domestic Card",
    issuer: "Example Bank",
    rewardCurrency: "Reward Points",
    reviewStatus: "verified",
    rules: [
      { category: "domestic", rate: 2, perAmount: 100, unit: "Reward Points", status: "approved", sourceQuote: "Earn 2 reward points per ₹100 on domestic spends." }
    ],
    exclusions: []
  };
  const result = calculateRewards({ card, amount: 25000, category: "dining", purchaseDate: "2026-10-22" });
  assert.equal(result.ok, true);
  assert.equal(result.points, 500);
  assert.match(result.notes.join(" "), /assumes the transaction is domestic/i);
});

test("exact category-specific rates override general fallback rates", () => {
  const card = {
    id: "verified-specific",
    name: "Verified Specific Card",
    issuer: "Example Bank",
    rewardCurrency: "Reward Points",
    reviewStatus: "verified",
    rules: [
      { category: "general", rate: 2, perAmount: 100, unit: "Reward Points", status: "approved" },
      { category: "dining", rate: 4, perAmount: 100, unit: "Reward Points", status: "approved" }
    ],
    exclusions: []
  };
  const result = calculateRewards({ card, amount: 25000, category: "dining", purchaseDate: "2026-10-22" });
  assert.equal(result.points, 1000);
  assert.equal(result.rate, 4);
  assert.equal(result.notes.some(note => /general eligible-spend rate was used/i.test(note)), false);
});

test("verified fallback does not override a matching category exclusion", () => {
  const card = {
    id: "verified-excluded",
    name: "Verified Excluded Card",
    issuer: "Example Bank",
    rewardCurrency: "Reward Points",
    reviewStatus: "verified",
    rules: [{ category: "general", rate: 2, perAmount: 100, unit: "Reward Points", status: "approved" }],
    exclusions: [{ category: "dining", reason: "Dining transactions excluded", status: "approved" }]
  };
  const result = calculateRewards({ card, amount: 25000, category: "dining", purchaseDate: "2026-10-22" });
  assert.equal(result.excluded, true);
  assert.equal(result.points, 0);
});


test("explains when every approved rule starts after the selected transaction date", () => {
  const card = {
    id: "future-rules",
    name: "Recently reviewed card",
    issuer: "Example Bank",
    rewardCurrency: "Reward Points",
    reviewStatus: "verified",
    rules: [
      { category: "general", rate: 2, perAmount: 100, unit: "Reward Points", status: "approved", validFrom: "2026-10-22" },
      { category: "airline_direct", rate: 5, perAmount: 100, unit: "Reward Points", status: "approved", validFrom: "2026-10-22" }
    ],
    exclusions: []
  };
  const result = calculateRewards({ card, amount: 25000, category: "dining", purchaseDate: "2026-10-07" });
  assert.equal(result.ok, true);
  assert.equal(result.unavailable, true);
  assert.equal(result.ruleStatus, "date_mismatch");
  assert.match(result.explanation, /transaction date \(2026-10-07\) is before the available rules become effective \(2026-10-22\)/i);
  assert.equal(result.firstFutureEffectiveDate, "2026-10-22");
});

test("explains when all approved rules expired before the selected transaction date", () => {
  const card = {
    id: "expired-rules",
    name: "Expired rules card",
    issuer: "Example Bank",
    rewardCurrency: "Reward Points",
    reviewStatus: "verified",
    rules: [
      { category: "general", rate: 2, perAmount: 100, unit: "Reward Points", status: "approved", validFrom: "2024-01-01", validTo: "2025-12-31" }
    ],
    exclusions: []
  };
  const result = calculateRewards({ card, amount: 25000, category: "dining", purchaseDate: "2026-10-07" });
  assert.equal(result.unavailable, true);
  assert.equal(result.ruleStatus, "date_mismatch");
  assert.match(result.explanation, /rules expired \(2025-12-31\)/i);
  assert.equal(result.lastExpiredDate, "2025-12-31");
});


test("uses Regalia Gold's explicit base retail rate for Dining and calculates 625 points on ₹25,000", () => {
  const card = {
    id: "hdfc-regalia-gold",
    name: "Regalia Gold",
    issuer: "HDFC Bank",
    rewardCurrency: "Reward Points",
    reviewStatus: "verified",
    rules: [
      {
        category: "online_shopping",
        rate: 5,
        perAmount: 200,
        unit: "Reward Points",
        status: "approved",
        validFrom: "2026-05-15",
        sourceQuote: "5 Reward Points on every Rs. 200 spent (On retail spends)"
      },
      {
        category: "online_shopping",
        rate: 5,
        perAmount: 200,
        unit: "Reward Points",
        status: "approved",
        validFrom: "2026-05-15",
        sourceQuote: "5X Reward Points on spends at select brands including Myntra and Nykaa"
      }
    ],
    exclusions: []
  };
  const result = calculateRewards({ card, amount: 25000, category: "dining", purchaseDate: "2026-10-22" });
  assert.equal(result.ok, true);
  assert.equal(result.unavailable, undefined);
  assert.equal(result.points, 625);
  assert.equal(result.rate, 5);
  assert.equal(result.perAmount, 200);
  assert.equal(result.rewardUnit, "Reward Points");
  assert.match(result.notes.join(" "), /base rate explicitly quoted for retail spends/i);
  assert.match(result.explanation, /base retail-spend fallback/i);
  assert.equal(result.sourceQuote, "5 Reward Points on every Rs. 200 spent (On retail spends)");
});

test("does not treat an accelerated retail-brand rate as a general retail fallback", () => {
  const card = {
    id: "hdfc-accelerated-only",
    name: "Regalia Gold",
    issuer: "HDFC Bank",
    rewardCurrency: "Reward Points",
    reviewStatus: "verified",
    rules: [{
      category: "online_shopping",
      rate: 5,
      perAmount: 200,
      unit: "Reward Points",
      status: "approved",
      sourceQuote: "5X Reward Points on spends at select brands including Myntra and Nykaa"
    }],
    exclusions: []
  };
  const result = calculateRewards({ card, amount: 25000, category: "dining", purchaseDate: "2026-10-22" });
  assert.equal(result.unavailable, true);
});


test("corrects a spend-currency unit label to the card reward currency in an Axis comparison", () => {
  const card = {
    id: "axis-horizon",
    name: "Horizon Credit Card",
    issuer: "Axis Bank",
    rewardCurrency: "EDGE Miles",
    reviewStatus: "verified",
    rules: [{
      category: "other",
      rate: 2,
      perAmount: 100,
      unit: "INR",
      status: "approved",
      sourceQuote: "2 EDGE Miles per ₹100 on other eligible spend."
    }],
    exclusions: []
  };
  const result = calculateRewards({ card, amount: 25000, category: "dining", purchaseDate: "2026-10-22" });
  assert.equal(result.ok, true);
  assert.equal(result.points, 500);
  assert.equal(result.rewardUnit, "EDGE Miles");
  assert.match(result.explanation, /2 EDGE Miles per ₹100/i);
  assert.match(result.notes.join(" "), /other eligible spend.*fallback/i);
});
