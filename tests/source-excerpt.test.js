import test from "node:test";
import assert from "node:assert/strict";
import { prioritizeOfficialSourceText } from "../src/source-excerpt.js";
import { normalizeCommonCardFacts } from "../src/issuer-normalizers.js";

test("preserves fee, reward and waiver lines that appear deep in a long official card page", () => {
  const pageUrl = "https://www.hdfc.bank.in/credit-cards/regalia-gold-credit-card";
  const intro = Array.from({ length: 1400 }, (_, index) =>
    "General product marketing paragraph " + index + " describing application convenience and card services."
  ).join("\n");
  const criticalTerms = [
    "Fees & Charges",
    "Joining/ Renewal Membership Fee of Rs. 2500 + Applicable Taxes.",
    "You can get Renewal Fee waived for next renewal on spends of ₹4 Lakhs.",
    "5 Reward Points on every Rs. 200 spent on retail spends.",
    "5X Reward Points is applicable on spends at select merchants – Myntra, Nykaa, Reliance Digital, Marks & Spencers.",
    "5X Reward points will be capped at 5,000 RP per month across all brands combined.",
    "Base reward points accrued on these will continue as is with no capping.",
    "Minimum transaction value to be eligible for the offer is Rs. 150."
  ].join("\n");
  const fullPageText = [
    "Regalia Gold Credit Card — official HDFC Bank page.",
    intro,
    "Other low-priority application details ".repeat(600),
    criticalTerms
  ].join("\n");
  assert.ok(fullPageText.length > 45000, "fixture needs to exceed the whole-source limit");

  const excerpt = prioritizeOfficialSourceText(fullPageText, 7200);
  assert.ok(excerpt.length <= 7200);
  assert.match(excerpt, /Joining\/ Renewal Membership Fee of Rs\. 2500 \+ Applicable Taxes\./);
  assert.match(excerpt, /Renewal Fee waived for next renewal on spends of ₹4 Lakhs/);
  assert.match(excerpt, /5 Reward Points on every Rs\. 200 spent on retail spends/);
  assert.match(excerpt, /5X Reward Points is applicable on spends at select merchants/);
  assert.match(excerpt, /5X Reward points will be capped at 5,000 RP per month/);

  const sourceBundle = [
    "OFFICIAL SOURCE 1",
    "TITLE: Regalia Gold Credit Card",
    "URL: " + pageUrl,
    "SOURCE TEXT START",
    excerpt,
    "SOURCE TEXT END"
  ].join("\n");
  const draft = {
    issuer: "HDFC Bank",
    cardName: "Regalia Gold",
    joiningFee: null,
    annualFee: null,
    annualFeeWaiver: null,
    benefits: [],
    missingItems: [],
    rules: [],
    exclusions: []
  };
  normalizeCommonCardFacts(draft, {
    issuer: draft.issuer,
    cardName: draft.cardName,
    sourceText: sourceBundle,
    sourceUrl: pageUrl
  });
  assert.equal(draft.joiningFee, 2500);
  assert.equal(draft.annualFee, 2500);
  assert.match(draft.annualFeeWaiver, /₹4,00,000|4 Lakhs/i);
  const feeBenefit = draft.benefits.find(item => item.name === "Joining and annual fee");
  assert.ok(feeBenefit);
  assert.equal(feeBenefit.sourceUrl, pageUrl);
});

test("does not exceed its excerpt budget or truncate exact fee quotes", () => {
  const pageUrl = "https://issuer.example/cards/test";
  const pageText = [
    "Card product overview.",
    ...Array.from({ length: 1000 }, (_, index) => "General descriptive line " + index + " about product application steps."),
    "Joining Fee: ₹3,000 plus applicable taxes.",
    "Annual Fee: ₹3,000 plus applicable taxes.",
    "Reward points: 4 points for every ₹100 spent on eligible retail purchases."
  ].join("\n");
  const excerpt = prioritizeOfficialSourceText(pageText, 6000);
  assert.ok(excerpt.length <= 6000);
  assert.match(excerpt, /Joining Fee: ₹3,000 plus applicable taxes\./);
  assert.match(excerpt, /Annual Fee: ₹3,000 plus applicable taxes\./);
  assert.match(excerpt, /4 points for every ₹100 spent/);
  assert.ok(pageUrl.startsWith("https://"));
});
