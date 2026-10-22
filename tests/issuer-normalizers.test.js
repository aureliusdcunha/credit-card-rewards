import test from "node:test";
import assert from "node:assert/strict";
import { normalizeHdfcRegaliaExtraction, normalizeCommonCardFacts } from "../src/issuer-normalizers.js";

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


test("extracts HDFC Regalia Gold joining/renewal fees, spend waiver and both lounge entitlements from official sources", () => {
  const cardPage = "https://www.hdfc.bank.in/credit-cards/regalia-gold-credit-card";
  const feePage = "https://www.hdfc.bank.in/credit-cards/regalia-gold-credit-card/fees-and-charges";
  const loungePdf = "https://www.hdfc.bank.in/content/dam/hdfcbankpws/in/en/personal-banking/discover-products/cards/credit-cards/regalia-gold-credit-card/pdfs/lounge-t-and-cs-and-list-Regalia-Gold.pdf";
  const sourceText = [
    "OFFICIAL SOURCE 1",
    "TITLE: Regalia Gold Credit Card",
    "URL: " + cardPage,
    "SOURCE TEXT START",
    "3 Lounge visits within India per calendar quarter on spends of ₹60,000 or more in the preceding calendar quarter using the HDFC Bank Regalia Gold Credit Card.",
    "6 Complimentary Lounge Access per calendar year outside India using Priority Pass. Minimum 4 retail transactions to apply for Priority Pass.",
    "SOURCE TEXT END",
    "",
    "OFFICIAL SOURCE 2",
    "TITLE: Regalia Gold Fees and Charges",
    "URL: " + feePage,
    "SOURCE TEXT START",
    "Joining Fee: ₹2500 plus Applicable Taxes.",
    "Renewal Fee: ₹2500 plus Applicable Taxes.",
    "Fee Waiver on annual spends of ₹4,00,000. Spend ₹4 lakh within 12 billing cycles of your anniversary year to enjoy a waiver on the renewal fee for the following year.",
    "SOURCE TEXT END",
    "",
    "OFFICIAL SOURCE 3",
    "TITLE: Domestic Airport Lounge Access Program",
    "URL: " + loungePdf,
    "SOURCE TEXT START",
    "Spend condition for unlocking 3 lounge accesses per quarter; W.e.f - 01-07-2026. Customer needs to achieve spends of 60,000 in current calendar quarter to avail lounge access on credit card in next calendar quarter.",
    "SOURCE TEXT END"
  ].join("\n");
  const draft = {
    issuer: "HDFC Bank",
    cardName: "Regalia Gold",
    rewardCurrency: "Reward Points",
    annualFee: null,
    joiningFee: null,
    annualFeeWaiver: null,
    rules: [],
    benefits: [],
    missingItems: []
  };
  normalizeHdfcRegaliaExtraction(draft, { issuer: "HDFC Bank", cardName: "Regalia Gold", sourceText, sourceUrl: cardPage });

  assert.equal(draft.joiningFee, 2500);
  assert.equal(draft.annualFee, 2500);
  assert.match(draft.annualFeeWaiver, /₹4,00,000/);
  assert.match(draft.annualFeeWaiver, /12 billing cycles/i);

  const domestic = draft.benefits.find(item => item.name === "Domestic airport lounge access");
  assert.ok(domestic, "domestic lounge benefit should be structured");
  assert.match(domestic.conditions, /₹60,000/i);
  assert.match(domestic.conditions, /preceding calendar quarter/i);
  assert.equal(domestic.validFrom, "2026-07-01");
  assert.equal(domestic.sourceUrl, cardPage);

  const international = draft.benefits.find(item => item.name === "International airport lounge access");
  assert.ok(international, "international lounge benefit should be structured");
  assert.match(international.description, /6 complimentary lounge visits/i);
  assert.match(international.conditions, /4 retail transactions/i);

  const fees = draft.benefits.find(item => item.name === "Joining and annual fee");
  assert.ok(fees, "fee benefit should be structured");
  assert.match(fees.description, /₹2,500 each, plus applicable taxes/i);
  assert.equal(fees.sourceUrl, feePage);
});


test("extracts fees, spend-based fee waiver and lounge eligibility for a non-HDFC card", async () => {
  const sourceUrl = "https://www.axis.bank.in/cards/horizon/fees-and-benefits";
  const sourceText = [
    "OFFICIAL SOURCE 1",
    "TITLE: Axis Horizon Credit Card fees and benefits",
    "URL: " + sourceUrl,
    "SOURCE TEXT START",
    "Joining Fee: ₹3,000 plus applicable taxes.",
    "Annual Fee: ₹3,000 plus applicable taxes.",
    "Spend ₹2,50,000 in the preceding 12 months to waive the renewal fee for the following year.",
    "Domestic airport lounge access: Cardholders spending ₹50,000 in the preceding calendar quarter receive two visits in the next quarter.",
    "SOURCE TEXT END"
  ].join("\n");
  const draft = {
    issuer: "Axis Bank",
    cardName: "Horizon Credit Card",
    rewardCurrency: "EDGE Miles",
    annualFee: null,
    joiningFee: null,
    annualFeeWaiver: null,
    benefits: [],
    missingItems: [],
    rules: [],
    exclusions: []
  };

  normalizeCommonCardFacts(draft, { issuer: draft.issuer, cardName: draft.cardName, sourceText, sourceUrl });

  assert.equal(draft.joiningFee, 3000);
  assert.equal(draft.annualFee, 3000);
  assert.match(draft.annualFeeWaiver, /₹2,50,000/i);
  assert.match(draft.annualFeeWaiver, /preceding 12 months/i);

  const fee = draft.benefits.find(item => item.name === "Joining and annual fee");
  assert.ok(fee);
  assert.match(fee.description, /Joining fee: ₹3,000 plus applicable taxes/i);
  assert.match(fee.description, /Annual\/renewal fee: ₹3,000 plus applicable taxes/i);
  assert.equal(fee.sourceUrl, sourceUrl);

  const lounge = draft.benefits.find(item => item.name === "Domestic lounge access eligibility");
  assert.ok(lounge);
  assert.match(lounge.conditions, /₹50,000/i);
  assert.match(lounge.conditions, /preceding calendar quarter/i);
  assert.equal(lounge.sourceUrl, sourceUrl);
});

test("handles explicit no-fee terms for an unrelated issuer without guessing a waiver or lounge threshold", () => {
  const sourceUrl = "https://www.icici.bank.in/cards/sample/terms";
  const sourceText = [
    "OFFICIAL SOURCE 1",
    "TITLE: ICICI Sample Card Terms",
    "URL: " + sourceUrl,
    "SOURCE TEXT START",
    "No joining fee.",
    "No annual fee.",
    "Cardholders can access the lounge subject to the current lounge program terms.",
    "SOURCE TEXT END"
  ].join("\n");
  const draft = {
    issuer: "ICICI Bank",
    cardName: "Sample Credit Card",
    benefits: [],
    missingItems: [],
    rules: [],
    exclusions: []
  };
  normalizeCommonCardFacts(draft, { issuer: draft.issuer, cardName: draft.cardName, sourceText, sourceUrl });
  assert.equal(draft.joiningFee, 0);
  assert.equal(draft.annualFee, 0);
  assert.equal(draft.annualFeeWaiver, undefined);
  assert.equal(draft.benefits.some(item => /lounge access eligibility/i.test(item.name)), false);
});

test("does not mistake a fee-waiver spend threshold for the actual annual fee", () => {
  const sourceUrl = "https://issuer.example/terms";
  const sourceText = [
    "OFFICIAL SOURCE 1",
    "TITLE: Issuer fees and conditions",
    "URL: " + sourceUrl,
    "SOURCE TEXT START",
    "Annual fee waiver: spend ₹4,00,000 in eligible transactions in the previous membership year to waive the next renewal fee.",
    "SOURCE TEXT END"
  ].join("\n");
  const draft = { benefits: [], missingItems: [], rules: [], exclusions: [] };
  normalizeCommonCardFacts(draft, { sourceText, sourceUrl });
  assert.equal(draft.annualFee, undefined);
  assert.match(draft.annualFeeWaiver, /₹4,00,000/);
});
