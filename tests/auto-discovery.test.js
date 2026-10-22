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


test("ICICI Sapphiro discovery falls back to the legacy official page and accepts a large readable card page", async () => {
  const originalFetch = globalThis.fetch;
  const legacyUrl = "https://www.icicibank.com/personal-banking/cards/credit-card/sapphiro-card";
  const sourceHtml = "<html><head><title>ICICI Bank Sapphiro Credit Card — Official</title></head><body>" +
    "<h1>Sapphiro Credit Card</h1><p>Earn 2 reward points per ₹100 on eligible domestic spend.</p>" +
    "<p>Official source text for fallback validation.</p>" + " x".repeat(180000) + "</body></html>";
  assert.ok(sourceHtml.length > 300000, "regression fixture must exceed the old 300 KB limit");
  globalThis.fetch = async raw => {
    const url = new URL(typeof raw === "string" ? raw : raw.url || raw.toString());
    if (["html.duckduckgo.com", "lite.duckduckgo.com", "www.bing.com"].includes(url.hostname)) {
      return new Response("<html><body>No parseable results</body></html>", {
        status: 200,
        headers: { "content-type": url.hostname === "www.bing.com" ? "application/rss+xml" : "text/html" }
      });
    }
    if (url.href.startsWith("https://www.icici.bank.in/personal-banking/cards/credit-card/sapphiro-card") ||
        url.href.startsWith("https://www.icici.bank.in/ishop/faqs")) {
      return new Response("Temporarily blocked", { status: 403 });
    }
    if (url.href === legacyUrl) {
      return new Response(sourceHtml, { status: 200, headers: { "content-type": "text/html" } });
    }
    throw new Error("Unexpected outbound test URL: " + url.href);
  };
  try {
    const extracted = {
      issuer: "ICICI Bank",
      cardName: "Sapphiro Credit Card",
      network: null,
      rewardCurrency: "Reward Points",
      annualFee: 3500,
      annualFeeWaiver: "Waived for eligible annual spend over ₹6 lakh",
      effectiveDate: null,
      rules: [{ category: "general", rate: 2, perAmount: 100, unit: "Reward Points", minTransaction: 0, cap: null, rounding: "down", validFrom: null, validTo: null, sourceQuote: "Earn 2 reward points per ₹100 on eligible domestic spend.", notes: null }],
      exclusions: [],
      benefits: [],
      missingItems: [],
      summary: "Regression fixture only"
    };
    const env = { ADMIN_TOKEN: "test-admin-token", AI: { run: async (_model, request) => ({ response: JSON.stringify(extracted) }) } };
    const response = await worker.fetch(new Request("https://app.example/api/admin/auto-extract", {
      method: "POST",
      headers: { "authorization": "Bearer test-admin-token", "content-type": "application/json" },
      body: JSON.stringify({ issuer: "ICICI Bank", cardName: "Sapphiro Credit Card" })
    }), env);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.discovery.selectedSource, legacyUrl);
    assert.equal(body.extracted.rules[0].perAmount, 100);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ICICI discovery reports useful details when all official source fallbacks are blocked", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async raw => {
    const url = new URL(typeof raw === "string" ? raw : raw.url || raw.toString());
    if (["html.duckduckgo.com", "lite.duckduckgo.com", "www.bing.com"].includes(url.hostname)) {
      return new Response("<html><body>No parseable results</body></html>", {
        status: 200,
        headers: { "content-type": url.hostname === "www.bing.com" ? "application/rss+xml" : "text/html" }
      });
    }
    if (["www.icici.bank.in", "www.icicibank.com"].includes(url.hostname)) {
      return new Response("Temporarily blocked", { status: 403 });
    }
    throw new Error("Unexpected outbound test URL: " + url.href);
  };
  try {
    const env = { ADMIN_TOKEN: "test-admin-token", AI: { run: async () => { throw new Error("AI should not run if every source fetch fails"); } } };
    const response = await worker.fetch(new Request("https://app.example/api/admin/auto-extract", {
      method: "POST",
      headers: { "authorization": "Bearer test-admin-token", "content-type": "application/json" },
      body: JSON.stringify({ issuer: "ICICI Bank", cardName: "Sapphiro Credit Card" })
    }), env);
    assert.equal(response.status, 422);
    const body = await response.json();
    assert.match(body.error, /HTTP 403/i);
    assert.ok(body.discoveredCandidates >= 2);
    assert.ok(Array.isArray(body.sourceCandidates));
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("HDFC Regalia Gold extraction combines multiple official sources and produces numeric rules plus sourced benefits", async () => {
  const originalFetch = globalThis.fetch;
  const primaryUrl = "https://www.hdfc.bank.in/credit-cards/regalia-gold-credit-card";
  const featureUrl = "https://v.hdfc.bank.in/regalia-gold/features.html";
  const feePageUrl = "https://www.hdfc.bank.in/credit-cards/regalia-gold-credit-card/fees-and-charges";
  const rewardTermsUrl = "https://www.hdfc.bank.in/content/dam/hdfcbankpws/in/en/personal-banking/discover-products/cards/credit-cards/regalia-gold-credit-card/pdfs/regalia-gold-travel-edge-tnc.pdf";
  const generalTermsUrl = "https://www.hdfc.bank.in/content/dam/hdfcbankpws/in/en/personal-banking/discover-products/cards/credit-cards/regalia-gold-credit-card/terms-and-conditions.pdf";
  const fetchedUrls = [];
  const sourcePages = {
    [primaryUrl]: "<html><head><title>HDFC Bank Regalia Gold Credit Card</title></head><body><h1>Regalia Gold</h1><p>Welcome benefits: complimentary Swiggy One and MMT Black Gold membership after spends of ₹1 lakh in the first 90 days.</p><p>Travel benefits: domestic and international airport lounge access subject to terms.</p></body></html>",
    [feePageUrl]: "<html><head><title>Regalia Gold fees and charges</title></head><body><h1>Fees and Charges</h1><p>Joining / Renewal Membership Fee of Rs. 2500 + Applicable Taxes.</p><p>Get Renewal Fee waived for next renewal on spends of ₹4 Lakhs.</p><p>HDFC Bank Regalia Gold card fees are subject to applicable tax and offer-specific terms.</p></body></html>",
    [featureUrl]: "<html><head><title>Regalia Gold Features</title></head><body><h1>Rewarding Everyday Indulgences</h1><p>5 Reward Points for every ₹200 spent on daily and retail spends such as grocery, apparel, utility/bill pay, insurance and school fees, subject to terms.</p><p>Dining benefits: savings on restaurant bills via Swiggy Dineout when paid through the Swiggy app using Regalia Gold.</p><p>Milestone benefits: ₹5,000 worth flight vouchers on spends of ₹5 lakh and ₹7.5 lakh.</p></body></html>"
  };
  const pdfTexts = {
    [rewardTermsUrl]: "Updates effective 15 May 2026: base reward points of 5 Reward Points for every ₹200 spends across eligible categories. Reward points per statement cycle capped at 50,000. Boarding Edge: any 2 benefits per calendar quarter.",
    [generalTermsUrl]: "Regalia Gold general terms: welcome memberships require net retail spends of ₹1 lakh within the first 90 days. Redemption values: flights/hotels ₹0.50 per point; Gold catalogue ₹0.65 per point; vouchers up to ₹0.35 per point. Renewal fee waiver requires ₹4 lakh annual spend."
  };
  globalThis.fetch = async raw => {
    const url = new URL(typeof raw === "string" ? raw : raw.url || raw.toString());
    if (["html.duckduckgo.com", "lite.duckduckgo.com", "www.bing.com"].includes(url.hostname)) {
      return new Response("<html><body>No parseable results</body></html>", {
        status: 200,
        headers: { "content-type": url.hostname === "www.bing.com" ? "application/rss+xml" : "text/html" }
      });
    }
    const fullUrl = url.toString();
    fetchedUrls.push(fullUrl);
    if (sourcePages[fullUrl]) return new Response(sourcePages[fullUrl], { status: 200, headers: { "content-type": "text/html" } });
    if (pdfTexts[fullUrl]) return new Response(new Uint8Array([1,2,3,4]), { status: 200, headers: { "content-type": "application/pdf", "content-length": "4" } });
    throw new Error("Unexpected outbound test URL: " + fullUrl);
  };

  let promptText = "";
  const extracted = {
    issuer: "HDFC Bank",
    cardName: "Regalia Gold",
    network: null,
    rewardCurrency: "Reward Points",
    annualFee: 2500,
    joiningFee: null,
    annualFeeWaiver: "Renewal fee waived on eligible annual spends of ₹4 lakh",
    effectiveDate: "2026-05-15",
    rules: [{
      category: "general",
      rate: 5,
      perAmount: 200,
      unit: "Reward Points",
      minTransaction: 0,
      cap: { type: "points", value: 50000, period: "statement_cycle" },
      rounding: "down",
      validFrom: "2026-05-15",
      validTo: null,
      sourceQuote: "5 Reward Points for every ₹200 spends across eligible categories.",
      sourceUrl: rewardTermsUrl,
      notes: "Base rate; subject to exclusions and terms."
    }],
    exclusions: [],
    benefits: [
      { name: "Welcome benefits", description: "Complimentary Swiggy One and MMT Black Gold membership", conditions: "Eligible spends of ₹1 lakh within the first 90 days", sourceQuote: "welcome memberships require net retail spends of ₹1 lakh within the first 90 days", sourceUrl: generalTermsUrl },
      { name: "Airport lounge access", description: "Domestic and international lounge access subject to terms", conditions: "Check the currently applicable lounge eligibility", sourceQuote: "domestic and international airport lounge access subject to terms", sourceUrl: primaryUrl },
      { name: "Milestone flight vouchers", description: "₹5,000 flight voucher milestones", conditions: "Eligible spends of ₹5 lakh and ₹7.5 lakh", sourceQuote: "₹5,000 worth flight vouchers on spends of ₹5 lakh and ₹7.5 lakh", sourceUrl: featureUrl },
      { name: "Dining offer", description: "Savings on restaurant bills via Swiggy Dineout", conditions: "Pay via the Swiggy app using Regalia Gold", sourceQuote: "savings on restaurant bills via Swiggy Dineout when paid through the Swiggy app using Regalia Gold", sourceUrl: featureUrl },
      { name: "Reward redemption values", description: "Redemption value varies by category", conditions: "Flight/hotels ₹0.50 per point; Gold catalogue ₹0.65 per point; vouchers up to ₹0.35", sourceQuote: "flights/hotels ₹0.50 per point; Gold catalogue ₹0.65 per point; vouchers up to ₹0.35 per point", sourceUrl: generalTermsUrl }
    ],
    missingItems: [],
    summary: "Regalia Gold base rewards and travel, welcome, milestone, dining and redemption benefits subject to terms."
  };

  globalThis.fetch = async raw => {
    const url = new URL(typeof raw === "string" ? raw : raw.url || raw.toString());
    if (["html.duckduckgo.com", "lite.duckduckgo.com", "www.bing.com"].includes(url.hostname)) {
      return new Response("<html><body>No parseable results</body></html>", { status: 200, headers: { "content-type": "text/html" } });
    }
    fetchedUrls.push(url.toString());
    if (sourcePages[url.toString()]) return new Response(sourcePages[url.toString()], { status: 200, headers: { "content-type": "text/html" } });
    if (pdfTexts[url.toString()]) return new Response(new Uint8Array([1,2,3,4]), { status: 200, headers: { "content-type": "application/pdf", "content-length": "4" } });
    throw new Error("Unexpected outbound test URL: " + url.toString());
  };
  const env = {
    ADMIN_TOKEN: "test-admin-token",
    AI: {
      toMarkdown: async ({ name }) => ({
        format: "markdown",
        data: pdfTexts[name.includes("travel-edge") ? rewardTermsUrl : generalTermsUrl]
      }),
      run: async (_model, request) => {
        promptText = request.messages?.[1]?.content || "";
        return { response: JSON.stringify(extracted) };
      }
    }
  };

  try {
    const response = await worker.fetch(new Request("https://app.example/api/admin/auto-extract", {
      method: "POST",
      headers: { "authorization": "Bearer test-admin-token", "content-type": "application/json" },
      body: JSON.stringify({ issuer: "HDFC Bank", cardName: "Regalia Gold" })
    }), env);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.discovery.selectedSource, feePageUrl);
    assert.ok(body.discovery.sourcesRead.length >= 3);
    assert.ok(promptText.includes(featureUrl));
    assert.ok(promptText.includes(feePageUrl), "the official fee page must be included in extraction source text");
    assert.ok(promptText.includes(rewardTermsUrl));
    assert.equal(body.extracted.annualFee, 2500);
    assert.equal(body.extracted.joiningFee, 2500);
    assert.match(body.extracted.annualFeeWaiver, /₹4,00,000|4 lakh/i);
    const feeBenefit = body.extracted.benefits.find(item => item.name === "Joining and annual fee");
    assert.ok(feeBenefit);
    assert.equal(feeBenefit.sourceUrl, feePageUrl);
    assert.match(feeBenefit.sourceQuote, /Joining \/ Renewal Membership Fee of Rs\. 2500 \+ Applicable Taxes/i);
    assert.equal(body.extracted.rules.length, 1);
    assert.equal(body.extracted.rules[0].rate, 5);
    assert.equal(body.extracted.rules[0].perAmount, 200);
    assert.equal(body.extracted.rules[0].sourceUrl, rewardTermsUrl);
    assert.ok(body.extracted.benefits.length >= 5);
    assert.ok(body.extracted.benefits.every(benefit => benefit.sourceUrl));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
