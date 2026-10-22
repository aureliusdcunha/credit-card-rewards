import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

test("auto discovery finds an official issuer source and saves an unverified draft", async () => {
  const originalFetch = globalThis.fetch;
  const sourceUrl = "https://www.axisbank.com/credit-card/horizon-reward-terms";
  const searchHtml = '<a class="result__a" href="' + sourceUrl + '">Axis Horizon Credit Card reward terms and conditions</a>';
  const sourceHtml = "<html><head><title>Axis Horizon Reward Terms</title></head><body>" +
    "<h1>Horizon credit card rewards terms</h1>" +
    "<p>Eligible retail purchases earn 2 EDGE Miles per ₹100 spent, subject to applicable card terms.</p>" +
    "<p>This is a test issuer document with enough readable text for the extraction workflow and review.</p>" +
    "</body></html>";
  globalThis.fetch = async raw => {
    const url = new URL(typeof raw === "string" ? raw : raw.url || raw.toString());
    if (url.hostname === "html.duckduckgo.com") {
      return new Response(searchHtml, { status: 200, headers: { "content-type": "text/html" } });
    }
    if (url.hostname === "www.axisbank.com") {
      return new Response(sourceHtml, { status: 200, headers: { "content-type": "text/html" } });
    }
    throw new Error("Unexpected outbound test URL: " + url.hostname);
  };

  try {
    const extracted = {
      issuer: "Axis Bank",
      cardName: "Horizon Credit Card",
      network: "Not specified",
      rewardCurrency: "EDGE Miles",
      annualFee: null,
      annualFeeWaiver: null,
      effectiveDate: null,
      rules: [{ category: "general", rate: 2, perAmount: 100, unit: "EDGE Miles", minTransaction: 0, cap: null, rounding: "down", sourceQuote: "Eligible retail purchases earn 2 EDGE Miles per ₹100 spent, subject to applicable card terms.", notes: null }],
      exclusions: [],
      benefits: [],
      missingItems: [],
      summary: "Test draft only"
    };
    const env = {
      ADMIN_TOKEN: "test-admin-token",
      AI: { run: async () => ({ response: JSON.stringify(extracted) }) }
    };
    const response = await worker.fetch(new Request("https://app.example/api/admin/auto-extract", {
      method: "POST",
      headers: { "authorization": "Bearer test-admin-token", "content-type": "application/json" },
      body: JSON.stringify({ issuer: "Axis Bank", cardName: "Horizon Credit Card" })
    }), env);

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.persisted, false);
    assert.equal(body.extractionMode, "auto-discovery");
    assert.equal(body.discovery.candidatesFound, 1);
    assert.equal(body.discovery.selectedSource, sourceUrl);
    assert.equal(body.extracted.issuer, "Axis Bank");
    assert.equal(body.extracted.cardName, "Horizon Credit Card");
    assert.match(body.warning, /draft/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
