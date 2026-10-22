import test from "node:test";
import assert from "node:assert/strict";
import { normalizeHdfcRegaliaExtraction } from "../src/issuer-normalizers.js";

const termsUrl = "https://www.hdfc.bank.in/content/dam/hdfcbankpws/in/en/personal-banking/discover-products/cards/credit-cards/regalia-gold-credit-card/pdfs/regalia-gold-travel-edge-tnc.pdf";
const cardUrl = "https://www.hdfc.bank.in/credit-cards/regalia-gold-credit-card";

function combinedSources() {
  return [
    "OFFICIAL SOURCE 1",
    "TITLE: HDFC Bank Regalia Gold rewards terms effective 15 May 2026",
    "URL: " + termsUrl,
    "SOURCE TEXT START",
    "UPDATES ON YOUR REGALIA GOLD REWARDS, FEES & CHARGES (Effective 15th May, 2026). Earlier, Base reward points of 4 Reward Points were accrued on every ₹150 spends across eligible categories. Effective 15th May, 2026, your card will accrue base reward points of 5 Reward Points for every ₹200 spends across eligible categories. All other accelerated rewards program will continue.",
    "5X Reward Points on select merchants: 5X Reward Points is applicable on spends at select merchants – Myntra, Nykaa, Reliance Digital, Marks & Spencers. 5X Reward points on will be capped at 5000 RP per month across all brands combined. Base reward points accrued on these will continue as is with no capping.",
    "SOURCE TEXT END",
    "",
    "OFFICIAL SOURCE 2",
    "TITLE: HDFC Bank Regalia Gold Credit Card",
    "URL: " + cardUrl,
    "SOURCE TEXT START",
    "5 Reward Points on every Rs. 200 spent (On retail spends). 5X Reward Points on spends at Myntra, Nykaa, Reliance Digital and more! The maximum reward points that can be earned in a statement cycle is 50,000.",
    "SOURCE TEXT END"
  ].join("\n");
}

test("replaces malformed Regalia Gold 5X and base-continuation pseudo-rules with the official 5 per 200 base rate", () => {
  const draft = {
    issuer: "HDFC Bank",
    cardName: "Regalia Gold",
    rewardCurrency: "Reward Points",
    effectiveDate: null,
    rules: [
      {
        category: "other",
        rate: 5,
        perAmount: 1,
        unit: "Reward Points",
        validFrom: "2026-10-22",
        sourceQuote: "5X Reward Points is applicable on spends at select merchants – Myntra, Nykaa, Reliance Digital, Marks & Spencers.",
        notes: "Applicable on select merchants – Myntra, Nykaa, Reliance Digital, Marks & Spencer"
      },
      {
        category: "other",
        rate: 1,
        perAmount: 1,
        unit: "Reward Points",
        validFrom: "2026-10-22",
        sourceQuote: "Base reward points accrued on these will continue as is with no capping. Base reward points for transactions not eligible for 5X reward points.",
        notes: "Base reward points for transactions not eligible for 5X reward points"
      }
    ],
    benefits: [],
    missingItems: []
  };

  normalizeHdfcRegaliaExtraction(draft, {
    issuer: "HDFC Bank",
    cardName: "Regalia Gold",
    sourceText: combinedSources(),
    sourceUrl: cardUrl
  });

  assert.equal(draft.rules.length, 1);
  assert.equal(draft.rules[0].category, "general");
  assert.equal(draft.rules[0].rate, 5);
  assert.equal(draft.rules[0].perAmount, 200);
  assert.equal(draft.rules[0].unit, "Reward Points");
  assert.equal(draft.rules[0].validFrom, "2026-05-15");
  assert.match(draft.rules[0].sourceQuote, /5 Reward Points for every ₹200 spends/i);
  assert.equal(draft.rules[0].sourceUrl, termsUrl);
  assert.match(draft.rules[0].notes, /50,000 Reward Point statement-cycle maximum/i);
  assert.equal(draft.benefits.length, 1);
  assert.match(draft.benefits[0].name, /Accelerated select-merchant reward offer/i);
  assert.match(draft.benefits[0].sourceQuote, /5X Reward Points is applicable/i);
  assert.equal(draft.benefits[0].sourceUrl, termsUrl);
  assert.equal(draft.missingItems.length, 1);
});

test("does not guess the Regalia Gold base rate when official text contains no numeric denominator", () => {
  const draft = {
    issuer: "HDFC Bank",
    cardName: "Regalia Gold",
    rewardCurrency: "Reward Points",
    rules: [{
      category: "other",
      rate: 1,
      perAmount: 1,
      unit: "Reward Points",
      sourceQuote: "Base reward points accrued on these will continue as is with no capping.",
      notes: null
    }],
    benefits: [],
    missingItems: []
  };
  normalizeHdfcRegaliaExtraction(draft, {
    issuer: "HDFC Bank",
    cardName: "Regalia Gold",
    sourceText: "OFFICIAL SOURCE 1\nTITLE: HDFC Bank Regalia Gold\nURL: " + cardUrl + "\nSOURCE TEXT START\nWelcome benefits and airport lounge access.\nSOURCE TEXT END",
    sourceUrl: cardUrl
  });
  assert.equal(draft.rules.length, 0);
  assert.match(draft.missingItems.join(" "), /Could not verify the current Regalia Gold base rate/i);
});

test("does not change an unrelated issuer or card", () => {
  const draft = {
    issuer: "ICICI Bank",
    cardName: "Sapphiro Credit Card",
    rules: [{ category: "other", rate: 1, perAmount: 1, unit: "Reward Points", sourceQuote: "Original rule" }],
    benefits: [],
    missingItems: []
  };
  normalizeHdfcRegaliaExtraction(draft, {
    issuer: "ICICI Bank",
    cardName: "Sapphiro Credit Card",
    sourceText: combinedSources(),
    sourceUrl: cardUrl
  });
  assert.equal(draft.rules[0].rate, 1);
  assert.equal(draft.rules[0].perAmount, 1);
  assert.equal(draft.rules[0].sourceQuote, "Original rule");
});

test("keeps base rule evidence and does not turn the official base quote into an accelerated offer", () => {
  const draft = {
    issuer: "HDFC Bank",
    cardName: "Regalia Gold",
    rewardCurrency: "Reward Points",
    rules: [{
      category: "other",
      rate: 1,
      perAmount: 1,
      unit: "Reward Points",
      sourceQuote: "5 Reward Points on every Rs. 200 spent (On retail spends)",
      notes: null
    }],
    benefits: [],
    missingItems: []
  };
  normalizeHdfcRegaliaExtraction(draft, {
    issuer: "HDFC Bank",
    cardName: "Regalia Gold",
    sourceText: combinedSources(),
    sourceUrl: cardUrl
  });
  assert.equal(draft.rules[0].rate, 5);
  assert.equal(draft.rules[0].perAmount, 200);
  assert.equal(draft.rules[0].category, "general");
});
