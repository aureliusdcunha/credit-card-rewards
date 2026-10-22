import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { discoverOfficialUrls, parseDuckDuckGoLiteResults } from "../src/source-discovery.js";

test("auto discovery finds an official issuer source and saves an unverified draft", async () => {
  const originalFetch = globalThis.fetch;
  const sourceUrl = "https://www.axis.bank.in/cards/credit-card/axis-horizon-credit-card";
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
    if (url.hostname === "www.axis.bank.in") {
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
    assert.ok(body.discovery.candidatesFound >= 1);
    assert.equal(body.discovery.selectedSource, sourceUrl);
    assert.equal(body.extracted.issuer, "Axis Bank");
    assert.equal(body.extracted.cardName, "Horizon Credit Card");
    assert.match(body.warning, /draft/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("falls back to a known official Axis Horizon page when search providers return no parseable results", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async raw => {
    const url = new URL(typeof raw === "string" ? raw : raw.url || raw.toString());
    if (url.hostname === "html.duckduckgo.com" || url.hostname === "www.bing.com") {
      return new Response("<html><body>No parseable results</body></html>", {
        status: 200,
        headers: { "content-type": url.hostname === "www.bing.com" ? "application/rss+xml" : "text/html" }
      });
    }
    throw new Error("Unexpected outbound test URL: " + url.hostname);
  };
  try {
    const results = await discoverOfficialUrls("Axis Bank", "Horizon Credit Card");
    assert.equal(results[0].url, "https://www.axis.bank.in/cards/credit-card/axis-horizon-credit-card");
    assert.ok(results.some(item => item.url.includes("terms-and-conditions-for-horizon-credit-card.pdf")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("falls back to HDFC Bank's official Regalia Gold page when search providers return no results", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async raw => {
    const url = new URL(typeof raw === "string" ? raw : raw.url || raw.toString());
    if (url.hostname === "html.duckduckgo.com" || url.hostname === "lite.duckduckgo.com" || url.hostname === "www.bing.com") {
      return new Response("<html><body>No parseable results</body></html>", {
        status: 200,
        headers: { "content-type": url.hostname === "www.bing.com" ? "application/rss+xml" : "text/html" }
      });
    }
    throw new Error("Unexpected outbound test URL: " + url.hostname);
  };
  try {
    const results = await discoverOfficialUrls("HDFC Bank", "Regalia Gold");
    assert.equal(results[0].url, "https://www.hdfc.bank.in/credit-cards/regalia-gold-credit-card");
    assert.ok(results.some(item => item.url.includes("RG-T-and-Cs-PDF.pdf")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("DuckDuckGo lite parser accepts official issuer anchors without result__a classes", () => {
  const html = '<a href="https://www.hdfc.bank.in/credit-cards/regalia-gold-credit-card">Regalia Gold Credit Card</a>' +
    '<a href="https://not-an-issuer.example/credit-card">untrusted</a>';
  const results = parseDuckDuckGoLiteResults(html, "hdfc.bank.in");
  assert.equal(results.length, 1);
  assert.equal(results[0].url, "https://www.hdfc.bank.in/credit-cards/regalia-gold-credit-card");
});


test("uses the current official ICICI Sapphiro page when search results are empty", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async raw => {
    const url = new URL(typeof raw === "string" ? raw : raw.url || raw.toString());
    if (["html.duckduckgo.com", "lite.duckduckgo.com", "www.bing.com"].includes(url.hostname)) {
      return new Response("<html><body>No parseable results</body></html>", {
        status: 200,
        headers: { "content-type": url.hostname === "www.bing.com" ? "application/rss+xml" : "text/html" }
      });
    }
    throw new Error("Unexpected outbound test URL: " + url.hostname);
  };
  try {
    const results = await discoverOfficialUrls("ICICI Bank", "Sapphiro Credit Card");
    assert.equal(results[0].url, "https://www.icici.bank.in/personal-banking/cards/credit-card/sapphiro-card");
    assert.ok(results.some(item => item.url === "https://www.icici.bank.in/ishop/faqs"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("auto extraction models Sapphiro's published numeric rates instead of an unquantified multiplier", async () => {
  const originalFetch = globalThis.fetch;
  const sourceUrl = "https://www.icici.bank.in/personal-banking/cards/credit-card/sapphiro-card";
  const sourceHtml = "<html><head><title>ICICI Bank Sapphiro Credit Card — rewards and fees</title></head><body>" +
    "<h1>Earn Points on every ₹100 spend</h1>" +
    "<p>4 On International Spend.</p><p>2 On Domestic Spend.</p>" +
    "<p>1 On Utility and Insurance Spend.</p>" +
    "<p>Joining fee- ₹6,500 + GST.</p>" +
    "<p>Annual fee- ₹3,500 + GST (Spend over ₹6 lakh and get your Annual fee waived off for the next year).</p>" +
    "<p>Earn 6x-12x reward points on flights, hotels and shopping vouchers on iShop offers subject to applicable conditions.</p>" +
    "<p>Other benefits are subject to ICICI Bank terms and eligibility.</p></body></html>";
  globalThis.fetch = async raw => {
    const url = new URL(typeof raw === "string" ? raw : raw.url || raw.toString());
    if (["html.duckduckgo.com", "lite.duckduckgo.com", "www.bing.com"].includes(url.hostname)) {
      return new Response("<html><body>No parseable results</body></html>", {
        status: 200,
        headers: { "content-type": url.hostname === "www.bing.com" ? "application/rss+xml" : "text/html" }
      });
    }
    if (url.hostname === "www.icici.bank.in") {
      return new Response(sourceHtml, { status: 200, headers: { "content-type": "text/html" } });
    }
    throw new Error("Unexpected outbound test URL: " + url.hostname);
  };
  try {
    const extracted = {
      issuer: "ICICI Bank",
      cardName: "Sapphiro Credit Card",
      network: null,
      rewardCurrency: "Reward Points",
      annualFee: 3500,
      annualFeeWaiver: "Annual fee waived for spends over ₹6 lakh in the previous year",
      effectiveDate: null,
      rules: [
        { category: "general", rate: 2, perAmount: 100, unit: "Reward Points", minTransaction: 0, cap: null, rounding: "down", sourceQuote: "Earn Points on every ₹100 spend 2 On Domestic Spend", notes: "Base rate for eligible domestic retail; use category-specific overrides where applicable." },
        { category: "international", rate: 4, perAmount: 100, unit: "Reward Points", minTransaction: 0, cap: null, rounding: "down", sourceQuote: "Earn Points on every ₹100 spend 4 On International Spend", notes: null },
        { category: "utilities", rate: 1, perAmount: 100, unit: "Reward Points", minTransaction: 0, cap: null, rounding: "down", sourceQuote: "Earn Points on every ₹100 spend 1 On Utility and Insurance Spend", notes: null },
        { category: "insurance", rate: 1, perAmount: 100, unit: "Reward Points", minTransaction: 0, cap: null, rounding: "down", sourceQuote: "Earn Points on every ₹100 spend 1 On Utility and Insurance Spend", notes: null }
      ],
      exclusions: [],
      benefits: [{
        name: "Accelerated iShop rewards",
        description: "Reward multipliers may apply to eligible flights, hotels and shopping vouchers on iShop subject to current offer terms and caps.",
        conditions: "Verify booking channel, current offer terms, and daily/monthly reward-point caps.",
        sourceQuote: "Earn 6x-12x reward points on flights, hotels and shopping vouchers on iShop offers subject to applicable conditions."
      }],
      missingItems: ["Confirm whether the cardholder has a lifetime-free offer or the standard fee schedule."],
      summary: "Sapphiro earns reward points at domestic, international and utility/insurance rates, with separate conditional iShop multipliers."
    };
    let capturedPrompt = "";
    const env = {
      ADMIN_TOKEN: "test-admin-token",
      AI: { run: async (_model, request) => {
        capturedPrompt = request.messages?.[1]?.content || "";
        return { response: JSON.stringify(extracted) };
      } }
    };
    const response = await worker.fetch(new Request("https://app.example/api/admin/auto-extract", {
      method: "POST",
      headers: { "authorization": "Bearer test-admin-token", "content-type": "application/json" },
      body: JSON.stringify({ issuer: "ICICI Bank", cardName: "Sapphiro Credit Card" })
    }), env);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.discovery.selectedSource, sourceUrl);
    assert.deepEqual(body.extracted.rules.map(rule => rule.rate), [2, 4, 1, 1]);
    assert.ok(body.extracted.rules.every(rule => rule.perAmount === 100 && rule.unit === "Reward Points"));
    assert.match(capturedPrompt, /Do not put a rule with rate\/perAmount\/unit set to null into "rules"/);
    assert.match(body.extracted.benefits[0].sourceQuote, /6x-12x/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
