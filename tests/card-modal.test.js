import test from "node:test";
import assert from "node:assert/strict";

const oldWindow = globalThis.window;
const C = {
  escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
  },
  prettyCategory(value) {
    return String(value || "other").split("_").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
  },
  formatNumber(value) {
    return value == null || !Number.isFinite(Number(value)) ? "—" : new Intl.NumberFormat("en-IN").format(Number(value));
  },
  formatINR(value) {
    return value == null || !Number.isFinite(Number(value)) ? "Not specified" : "₹" + new Intl.NumberFormat("en-IN").format(Number(value));
  },
  statusPill(status) {
    return '<span class="pill">' + this.escapeHtml(status || "Needs review") + "</span>";
  }
};
globalThis.window = { CRI: C };
await import("../public/js/card-modal.js");
const Modal = globalThis.window.CRI_CARD_MODAL;

test("Benefits tab includes descriptions, conditions, source quotes and official links", () => {
  const card = {
    issuer: "HDFC Bank",
    name: "Regalia Gold",
    officialUrl: "https://issuer.example/card",
    benefits: [{
      name: "Airport lounge access",
      description: "Complimentary lounge visits",
      conditions: "Spend threshold applies",
      sourceQuote: "Eligible cardholders may access lounges",
      sourceUrl: "https://issuer.example/terms",
      validFrom: "2026-01-01",
      status: "approved"
    }]
  };
  const html = Modal.renderTab(card, "benefits");
  assert.match(html, /Airport lounge access/);
  assert.match(html, /Complimentary lounge visits/);
  assert.match(html, /Spend threshold applies/);
  assert.match(html, /Eligible cardholders may access lounges/);
  assert.match(html, /https:\/\/issuer\.example\/terms/);
  assert.match(html, /From 2026-01-01/);
});

test("Rules tab exposes reward math, minimum, cap, validity, quote and source", () => {
  const card = {
    rewardCurrency: "Reward Points",
    rules: [{
      category: "general",
      rate: 5,
      perAmount: 200,
      unit: "Reward Points",
      minTransaction: 500,
      cap: { type: "points", value: 50000, period: "statement_cycle" },
      rounding: "down",
      validFrom: "2026-05-15",
      sourceQuote: "5 Reward Points per ₹200",
      sourceUrl: "https://issuer.example/rewards",
      notes: "Eligible retail spends only",
      status: "approved"
    }]
  };
  const html = Modal.renderTab(card, "rules");
  assert.match(html, /General/);
  assert.match(html, /5 Reward Points/);
  assert.match(html, /₹200/);
  assert.match(html, /₹500/);
  assert.match(html, /50,000 Reward Points per statement cycle/);
  assert.match(html, /Eligible retail spends only/);
  assert.match(html, /5 Reward Points per ₹200/);
  assert.match(html, /https:\/\/issuer\.example\/rewards/);
});

test("Restrictions tab shows exclusions, MCCs and rule-specific conditions", () => {
  const card = {
    officialUrl: "https://issuer.example/card",
    exclusions: [{
      category: "fuel",
      reason: "Fuel purchases do not earn rewards",
      mccCodes: ["5541", "5542"],
      sourceQuote: "Fuel transactions are excluded",
      sourceUrl: "https://issuer.example/exclusions",
      status: "approved"
    }],
    rules: [{
      category: "general",
      notes: "Monthly cap applies",
      minTransaction: 100,
      cap: { type: "points", value: 5000, period: "month" },
      validFrom: "2026-01-01"
    }]
  };
  const html = Modal.renderTab(card, "restrictions");
  assert.match(html, /Fuel/);
  assert.match(html, /Fuel purchases do not earn rewards/);
  assert.match(html, /5541, 5542/);
  assert.match(html, /Monthly cap applies/);
  assert.match(html, /₹100/);
  assert.match(html, /5,000 rewards per month/);
  assert.match(html, /https:\/\/issuer\.example\/exclusions/);
});

test("Fees tab distinguishes unknown fees from zero fees and includes fee-waiver conditions", () => {
  const card = {
    annualFee: 2500,
    joiningFee: 2500,
    annualFeeWaiver: "Waived when annual spend reaches ₹4 lakh",
    officialUrl: "https://issuer.example/fees",
    benefits: [{
      name: "Joining and renewal fee",
      description: "Joining fee and annual/renewal fee are ₹2,500 each, plus applicable taxes.",
      conditions: "Renewal fee waived when eligible spend reaches ₹4 lakh within the preceding 12 billing cycles.",
      sourceQuote: "Joining Fee: ₹2500 plus Applicable Taxes. Renewal Fee: ₹2500 plus Applicable Taxes.",
      sourceUrl: "https://issuer.example/offer"
    }]
  };
  const html = Modal.renderTab(card, "fees");
  assert.match(html, /Annual fee/);
  assert.match(html, /₹2,500/);
  assert.match(html, /Joining fee/);
  assert.ok(html.includes("₹2,500 + applicable taxes"));
  assert.match(html, /Waived when annual spend reaches ₹4 lakh/);
  assert.match(html, /Joining and renewal fee/);
  assert.match(html, /Missing fee value means it has not been recorded/i);
});

test("empty tabs explain missing data rather than imply no benefits, rules, restrictions or fees", () => {
  const card = { annualFee: null, annualFeeWaiver: null, benefits: [], rules: [], exclusions: [] };
  assert.match(Modal.renderTab(card, "benefits"), /No benefits recorded yet/);
  assert.match(Modal.renderTab(card, "rules"), /No reward rules available/);
  assert.match(Modal.renderTab(card, "restrictions"), /This does not mean the issuer has no exclusions/);
  assert.match(Modal.renderTab(card, "fees"), /does not mean the fee is zero/i);
});

if (oldWindow === undefined) delete globalThis.window;
else globalThis.window = oldWindow;


test("Restrictions tab surfaces lounge-related spend thresholds stored as benefits", () => {
  const card = {
    officialUrl: "https://issuer.example/card",
    exclusions: [],
    rules: [],
    benefits: [{
      name: "Domestic airport lounge access",
      description: "Up to 3 complimentary lounge visits within India in the next calendar quarter.",
      conditions: "Spend at least ₹60,000 in eligible card transactions in the preceding calendar quarter to unlock 3 visits in the following quarter. Effective 1 July 2026.",
      sourceQuote: "3 Lounge visits within India per calendar quarter on spends of ₹60,000 or more in the preceding calendar quarter.",
      sourceUrl: "https://issuer.example/lounge.pdf",
      validFrom: "2026-07-01"
    }]
  };
  const html = Modal.renderTab(card, "restrictions");
  assert.match(html, /Benefit eligibility and spend thresholds/);
  assert.match(html, /Domestic airport lounge access/);
  assert.match(html, /₹60,000/);
  assert.match(html, /preceding calendar quarter/);
  assert.match(html, /https:\/\/issuer\.example\/lounge\.pdf/);
  assert.match(html, /From 2026-07-01/);
});
