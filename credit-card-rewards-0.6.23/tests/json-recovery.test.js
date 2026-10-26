import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

test("retries malformed AI JSON once and saves the recovered card draft", async () => {
  const validDraft = {
    issuer: "Axis Bank",
    cardName: "Horizon Credit Card",
    network: "Visa / Mastercard",
    rewardCurrency: "EDGE Miles",
    annualFee: null,
    joiningFee: null,
    annualFeeWaiver: null,
    effectiveDate: null,
    rules: [{
      category: "general",
      rate: 2,
      perAmount: 100,
      unit: "EDGE Miles",
      minTransaction: 0,
      cap: null,
      rounding: "down",
      validFrom: null,
      validTo: null,
      sourceQuote: "Eligible retail purchases earn 2 EDGE Miles per ₹100 spent.",
      sourceUrl: "https://www.axis.bank.in/cards/credit-card/axis-horizon-credit-card",
      notes: null
    }],
    exclusions: [],
    benefits: [],
    missingItems: [],
    summary: "Axis Horizon card details awaiting review."
  };
  const responses = [
    '{"issuer":"Axis Bank","cardName":"Horizon Credit Card","rules":[{"category":"general" "rate":2}]}',
    JSON.stringify(validDraft)
  ];
  const callPrompts = [];
  const env = {
    ADMIN_TOKEN: "test-admin-token",
    AI: {
      async run(_model, request) {
        callPrompts.push(request.messages?.[1]?.content || "");
        return { response: responses.shift() };
      }
    }
  };
  const response = await worker.fetch(new Request("https://app.example/api/admin/extract", {
    method: "POST",
    headers: {
      authorization: "Bearer test-admin-token",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      issuer: "Axis Bank",
      cardName: "Horizon Credit Card",
      sourceUrl: "https://www.axis.bank.in/cards/credit-card/axis-horizon-credit-card",
      sourceTitle: "Axis Horizon official terms",
      sourceText: "Official Axis Horizon terms. " +
        "Eligible retail purchases earn 2 EDGE Miles per ₹100 spent. ".repeat(4)
    })
  }), env);

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.persisted, false);
  assert.equal(body.extracted.cardName, "Horizon Credit Card");
  assert.equal(body.extracted.rules[0].rate, 2);
  assert.equal(callPrompts.length, 2);
  assert.match(callPrompts[1], /Repair JSON syntax only/);
  assert.match(callPrompts[1], /MALFORMED MODEL OUTPUT START/);
});
