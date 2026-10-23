import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { discoverOfficialUrls, issuerDomainFor, validateOfficialUrl, validateIssuerOfficialUrl } from "../src/source-discovery.js";

test("Standard Chartered resolves to its current official India domain", () => {
  assert.equal(issuerDomainFor("Standard Chartered"), "sc.bank.in");
  assert.equal(validateOfficialUrl("https://www.sc.bank.in/credit-cards/").hostname, "www.sc.bank.in");
});

test("discovers a matching card from the issuer sitemap when search providers return no results", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    calls.push(url.toString());

    if (
      url.hostname === "html.duckduckgo.com" ||
      url.hostname === "lite.duckduckgo.com" ||
      url.hostname === "www.bing.com"
    ) {
      return new Response("Search temporarily unavailable", { status: 503 });
    }

    if (url.hostname === "sc.bank.in" && url.pathname === "/robots.txt") {
      return new Response("User-agent: *\nSitemap: https://www.sc.bank.in/sitemap.xml", {
        headers: { "content-type": "text/plain" }
      });
    }

    if (url.hostname === "sc.bank.in" && url.pathname === "/sitemap.xml") {
      return new Response(
        '<?xml version="1.0"?><urlset>' +
        '<url><loc>https://www.sc.bank.in/credit-cards/rewards-credit-card/</loc></url>' +
        '<url><loc>https://www.sc.bank.in/credit-cards/ultimate-credit-card/</loc></url>' +
        '</urlset>',
        { headers: { "content-type": "application/xml" } }
      );
    }

    if (url.pathname === "/sitemap/" && (url.hostname === "sc.bank.in" || url.hostname === "www.sc.bank.in")) {
      return new Response(
        '<html><body>' +
        '<a href="/credit-cards/rewards-credit-card/">Rewards Credit Card</a>' +
        '<a href="/credit-cards/ultimate-credit-card/">Ultimate Credit Card</a>' +
        '</body></html>',
        { headers: { "content-type": "text/html" } }
      );
    }

    return new Response("Not found", { status: 404 });
  };

  try {
    const results = await discoverOfficialUrls("Standard Chartered", "Rewards");
    assert.ok(results.length > 0);
    assert.equal(results[0].url, "https://www.sc.bank.in/credit-cards/rewards-credit-card/");
    assert.ok(calls.some(url => url.includes("/sitemap.xml")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("recognises current .bank.in home domains for Indian bank issuers", () => {
  assert.equal(issuerDomainFor("Kotak Mahindra Bank"), "kotak.bank.in");
  assert.equal(issuerDomainFor("IndusInd Bank"), "indusind.bank.in");
  assert.equal(issuerDomainFor("HSBC India"), "hsbc.bank.in");
  assert.equal(issuerDomainFor("Standard Chartered Bank"), "sc.bank.in");
  assert.equal(validateOfficialUrl("https://www.somebank.bank.in/cards").hostname, "www.somebank.bank.in");
});

test("discovers a card on the .bank.in namespace when the issuer has no hardcoded domain map", async () => {
  const originalFetch = globalThis.fetch;
  const queries = [];
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    if (url.hostname === "html.duckduckgo.com") {
      queries.push(url.searchParams.get("q") || "");
      return new Response(
        '<html><a class="result__a" href="https://www.examplebank.bank.in/credit-cards/example-rewards-credit-card">Example Bank Example Rewards Credit Card</a></html>',
        { headers: { "content-type": "text/html" } }
      );
    }
    return new Response("Search unavailable", { status: 503 });
  };

  try {
    const results = await discoverOfficialUrls("Example Bank", "Rewards Credit Card");
    assert.equal(results[0].url, "https://www.examplebank.bank.in/credit-cards/example-rewards-credit-card");
    assert.ok(queries.some(query => query.includes("site:bank.in")));
    assert.ok(queries.some(query => query.includes("Example Bank")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("auto-extraction can read a discovered .bank.in URL using the same validator as search", async () => {
  const originalFetch = globalThis.fetch;
  const fetchedCardUrls = [];
  const validDraft = {
    issuer: "Kotak Mahindra Bank",
    cardName: "Rewards Credit Card",
    network: null,
    rewardCurrency: "Points",
    annualFee: null,
    joiningFee: null,
    annualFeeWaiver: null,
    effectiveDate: null,
    rules: [],
    exclusions: [],
    benefits: [],
    missingItems: ["Verify reward rate from current card terms."],
    summary: "Draft awaiting human review."
  };

  globalThis.fetch = async input => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.hostname === "html.duckduckgo.com") {
      return new Response(
        '<html><a class="result__a" href="https://www.kotak.bank.in/credit-cards/rewards-credit-card">Kotak Rewards Credit Card official details and terms</a></html>',
        { headers: { "content-type": "text/html" } }
      );
    }
    if (url.hostname === "www.kotak.bank.in" && url.pathname === "/credit-cards/rewards-credit-card") {
      fetchedCardUrls.push(url.toString());
      return new Response(
        "<html><head><title>Kotak Rewards Credit Card Official Terms</title></head><body><main>" +
          "Official Kotak card terms and conditions. " +
          "Please review eligibility, reward programme conditions, fees, limits and exclusions. ".repeat(4) +
          "</main></body></html>",
        { headers: { "content-type": "text/html; charset=utf-8" } }
      );
    }
    return new Response("Not found", { status: 404 });
  };

  try {
    const response = await worker.fetch(new Request("https://app.example/api/admin/auto-extract", {
      method: "POST",
      headers: {
        authorization: "Bearer test-admin-token",
        "content-type": "application/json"
      },
      body: JSON.stringify({ issuer: "Kotak Mahindra Bank", cardName: "Rewards Credit Card" })
    }), {
      ADMIN_TOKEN: "test-admin-token",
      AI: { async run() { return { response: JSON.stringify(validDraft) }; } }
    });

    assert.equal(response.status, 200, await response.clone().text());
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.extractionMode, "auto-discovery");
    assert.ok(fetchedCardUrls.some(url => url.includes("kotak.bank.in")));
    assert.equal(body.discovery.selectedSource, "https://www.kotak.bank.in/credit-cards/rewards-credit-card");
    assert.equal(typeof body.timingMs.discoveryMs, "number");
    assert.equal(typeof body.timingMs.sourceReadMs, "number");
    assert.equal(typeof body.timingMs.aiExtractionMs, "number");
    assert.equal(typeof body.timingMs.totalMs, "number");
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("automatic extraction fetches multiple HTML candidates concurrently", async () => {
  const originalFetch = globalThis.fetch;
  let activeSources = 0;
  let maxConcurrentSources = 0;
  const validDraft = {
    issuer: "Kotak Mahindra Bank",
    cardName: "Rewards Credit Card",
    network: null,
    rewardCurrency: "Points",
    annualFee: null,
    joiningFee: null,
    annualFeeWaiver: null,
    effectiveDate: null,
    rules: [],
    exclusions: [],
    benefits: [],
    missingItems: ["Review current reward rates and fee conditions."],
    summary: "Draft awaiting review."
  };
  const links = [
    '<a class="result__a" href="https://www.kotak.bank.in/credit-cards/rewards-credit-card">Kotak Rewards Credit Card</a>',
    '<a class="result__a" href="https://www.kotak.bank.in/credit-cards/rewards-card-terms">Kotak Rewards Card Terms</a>',
    '<a class="result__a" href="https://www.kotak.bank.in/credit-cards/rewards-card-benefits">Kotak Rewards Card Benefits</a>'
  ].join("");

  globalThis.fetch = async input => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.hostname === "html.duckduckgo.com") {
      return new Response("<html>" + links + "</html>", { headers: { "content-type": "text/html" } });
    }
    if (url.hostname === "www.kotak.bank.in") {
      activeSources++;
      maxConcurrentSources = Math.max(maxConcurrentSources, activeSources);
      await new Promise(resolve => setTimeout(resolve, 25));
      activeSources--;
      return new Response(
        "<html><head><title>Kotak Rewards Card Official Terms</title></head><body><main>" +
        "Official card rules. Eligible purchases, exclusions, card benefits and fee conditions. ".repeat(4) +
        "</main></body></html>",
        { headers: { "content-type": "text/html; charset=utf-8" } }
      );
    }
    return new Response("Not found", { status: 404 });
  };

  try {
    const response = await worker.fetch(new Request("https://app.example/api/admin/auto-extract", {
      method: "POST",
      headers: {
        authorization: "Bearer test-admin-token",
        "content-type": "application/json"
      },
      body: JSON.stringify({ issuer: "Kotak Mahindra Bank", cardName: "Rewards Credit Card" })
    }), {
      ADMIN_TOKEN: "test-admin-token",
      AI: { async run() { return { response: JSON.stringify(validDraft) }; } }
    });
    assert.equal(response.status, 200, await response.clone().text());
    assert.ok(maxConcurrentSources >= 2, "HTML source requests should overlap rather than run in serial batches");
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("routes SBI credit-card discovery to SBI Card rather than the bank website", () => {
  assert.equal(issuerDomainFor("SBI"), "sbi.bank.in");
  assert.equal(issuerDomainFor("SBI", "SimplySAVE"), "sbicard.com");
  assert.equal(issuerDomainFor("State Bank of India", "SimplySAVE SBI Card"), "sbicard.com");
  assert.equal(validateOfficialUrl("https://www.sbicard.com/en/personal/credit-cards/simplysave-sbi-card.html").hostname, "www.sbicard.com");
});

test("finds official SimplySAVE source even when search engines and SBI Card sitemap are unavailable", async () => {
  const originalFetch = globalThis.fetch;
  const queries = [];
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    if (url.hostname === "html.duckduckgo.com" || url.hostname === "lite.duckduckgo.com" || url.hostname === "www.bing.com") {
      queries.push(url.searchParams.get("q") || "");
      return new Response("Search unavailable", { status: 503 });
    }
    return new Response("Not found", { status: 404 });
  };

  try {
    const results = await discoverOfficialUrls("sbi", "simplysave");
    assert.equal(queries.length, 0, "known SimplySAVE sources should bypass unavailable search providers");
    assert.equal(results[0].url, "https://www.sbicard.com/en/personal/credit-cards/simplysave-sbi-card.html");
    assert.ok(results.some(item => item.url === "https://www.sbicard.com/en/most-important-terms-and-conditions.page"));
    assert.ok(results.some(item => item.url === "https://www.sbicard.com/sbi-card-en/assets/docs/pdf/SimplySAVE-TnC.pdf"), "the official reward terms PDF must be offered as a source");
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("validates an optional supplied URL against the selected card issuer", async () => {
  const { validateIssuerOfficialUrl } = await import("../src/source-discovery.js");
  const url = validateIssuerOfficialUrl(
    "https://www.yes.bank.in/personal-banking/yes-individual/cards/credit-cards/uni-credit-card",
    "Yes Bank",
    "Uni"
  );
  assert.equal(url.hostname, "www.yes.bank.in");
  assert.throws(
    () => validateIssuerOfficialUrl("https://www.axis.bank.in/cards/credit-card/axis-horizon-credit-card", "Yes Bank", "Uni"),
    /domain does not match Yes Bank/
  );
  assert.throws(
    () => validateIssuerOfficialUrl("http://www.yes.bank.in/credit-cards/uni", "Yes Bank", "Uni"),
    /Only HTTPS/
  );
});


test("uses a stable official Regalia Gold source bundle including the dedicated fees page", async () => {
  const originalFetch = globalThis.fetch;
  let networkCalls = 0;
  globalThis.fetch = async () => {
    networkCalls += 1;
    throw new Error("Curated Regalia Gold fallback should not depend on search availability.");
  };
  try {
    const results = await discoverOfficialUrls("HDFC Bank", "Regalia Gold");
    assert.equal(results[0].url, "https://www.hdfc.bank.in/credit-cards/regalia-gold-credit-card");
    assert.ok(results.some(item => item.url === "https://www.hdfc.bank.in/credit-cards/regalia-gold-credit-card/fees-and-charges"));
    assert.ok(results.some(item => item.url.includes("regalia-gold-travel-edge-tnc.pdf")));
    assert.ok(results.some(item => item.url.includes("terms-and-conditions.pdf")));
    assert.equal(networkCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("uses current official YES BANK UNI sources without relying on search result order", async () => {
  const originalFetch = globalThis.fetch;
  let outboundCalls = 0;
  globalThis.fetch = async () => {
    outboundCalls += 1;
    throw new Error("YES BANK UNI should use its stable official source bundle.");
  };
  try {
    const results = await discoverOfficialUrls("YES Bank", "UNI Credit Card");
    assert.equal(results[0].url, "https://www.yes.bank.in/personal-banking/yes-individual/cards/credit-cards/uni-credit-card");
    assert.ok(results.some(item => item.url === "https://webcdn.uni.cards/nxwave/docs/CC_YesBank_MITC.pdf"));
    assert.ok(results.some(item => item.url === "https://quickapply.yes.bank.in/savings/assets/files/yesbank_key_fact_statement.pdf"));
    assert.equal(outboundCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("allows only the official YES BANK UNI MITC PDF as an issuer-specific Uni CDN source", () => {
  const exact = validateIssuerOfficialUrl(
    "https://webcdn.uni.cards/nxwave/docs/CC_YesBank_MITC.pdf",
    "YES Bank",
    "UNI Credit Card"
  );
  assert.equal(exact.hostname, "webcdn.uni.cards");
  assert.throws(
    () => validateIssuerOfficialUrl("https://webcdn.uni.cards/nxwave/docs/other.pdf", "YES Bank", "UNI Credit Card"),
    /domain does not match YES Bank/
  );
  assert.throws(
    () => validateIssuerOfficialUrl("https://webcdn.uni.cards/nxwave/docs/CC_YesBank_MITC.pdf", "YES Bank", "UNI RuPay Credit Card"),
    /domain does not match YES Bank/
  );
});


test("manual MITC source review supplements the PDF with official card-page rewards", async () => {
  const originalFetch = globalThis.fetch;
  let extractionPrompt = "";
  const validDraft = {
    issuer: "YES Bank",
    cardName: "UNI Credit Card",
    network: null,
    rewardCurrency: "Uni Coins",
    annualFee: 499,
    joiningFee: 0,
    annualFeeWaiver: null,
    effectiveDate: null,
    rules: [],
    exclusions: [],
    benefits: [],
    missingItems: ["Verify exact Uni Coin redemption value and cashback calculation."],
    summary: "Draft awaiting review."
  };
  const productUrl = "https://www.yes.bank.in/personal-banking/yes-individual/cards/credit-cards/uni-credit-card";
  globalThis.fetch = async input => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.hostname === "webcdn.uni.cards" && url.pathname === "/nxwave/docs/CC_YesBank_MITC.pdf") {
      return new Response(new Uint8Array([37, 80, 68, 70]), {
        headers: { "content-type": "application/pdf" }
      });
    }
    if (url.toString().replace(/\/$/, "") === productUrl) {
      return new Response(
        "<html><head><title>YES BANK UNI Credit Card</title></head><body><main>" +
        ("UNI Credit Card: 1% cash back in Uni Coins on all transactions. Verify redemption terms, eligible transactions and exclusions. ").repeat(5) +
        "</main></body></html>",
        { headers: { "content-type": "text/html; charset=utf-8" } }
      );
    }
    if (url.hostname === "www.yes.bank.in" && url.pathname === "/personal-banking/yes-individual/cards/credit-cards") {
      return new Response(
        "<html><head><title>YES BANK Credit Cards</title></head><body><main>" +
        ("Official YES BANK credit-card catalogue with card fees, benefits and eligibility terms. ").repeat(5) +
        "</main></body></html>",
        { headers: { "content-type": "text/html; charset=utf-8" } }
      );
    }
    return new Response("Not found", { status: 404 });
  };

  try {
    const response = await worker.fetch(new Request("https://app.example/api/admin/extract", {
      method: "POST",
      headers: {
        authorization: "Bearer test-admin-token",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        issuer: "YES Bank",
        cardName: "UNI Credit Card",
        sourceUrl: "https://webcdn.uni.cards/nxwave/docs/CC_YesBank_MITC.pdf"
      })
    }), {
      ADMIN_TOKEN: "test-admin-token",
      AI: {
        async toMarkdown() {
          return { format: "markdown", data: "YES BANK UNI Credit Card. Joining fee NIL. Annual fee INR 499. " + "Official MITC terms. ".repeat(10) };
        },
        async run(model, options) {
          extractionPrompt = options.messages.find(message => message.role === "user")?.content || "";
          return { response: JSON.stringify(validDraft) };
        }
      }
    });

    assert.equal(response.status, 200, await response.clone().text());
    assert.ok(extractionPrompt.includes(productUrl), "the extraction prompt must label the supplementary official product URL");
    assert.match(extractionPrompt, /1% cash back in Uni Coins on all transactions/i);
    assert.match(extractionPrompt, /CC_YesBank_MITC\.pdf/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


// GoldX is a distinct product and must not fall back to legacy YES BANK UNI terms.
test("discovers exact Uni GoldX sources instead of the legacy UNI Credit Card catalogue and MITC", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("GoldX curated fallback should not depend on search"); };
  try {
    const results = await discoverOfficialUrls("YES Bank", "UNI Gold X");
    assert.equal(results[0].url, "https://www.uni.cards/");
    assert.ok(results.some(item => item.url === "https://www.uni.cards/campaign/?type=creative_2"));
    assert.ok(!results.some(item => item.url.includes("CC_YesBank_MITC.pdf")));
    assert.ok(!results.some(item => item.url.includes("yesbank_key_fact_statement.pdf")));
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("allows Uni official domains only for the exact GoldX variant", () => {
  assert.equal(validateIssuerOfficialUrl("https://www.uni.cards/", "YES Bank", "UNI GoldX").hostname, "www.uni.cards");
  assert.throws(
    () => validateIssuerOfficialUrl("https://www.uni.cards/", "YES Bank", "UNI Credit Card"),
    /domain does not match YES Bank/
  );
});


test("GoldX source review rejects legacy UNI MITC evidence and reads GoldX reward tiers", async () => {
  const originalFetch = globalThis.fetch;
  let extractionPrompt = "";
  const validDraft = {
    issuer: "YES Bank",
    cardName: "UNI Gold X",
    network: null,
    rewardCurrency: "Uni Coins",
    annualFee: null,
    joiningFee: null,
    annualFeeWaiver: null,
    effectiveDate: null,
    rules: [],
    exclusions: [],
    benefits: [],
    missingItems: ["Verify exact variant-specific network and complete GoldX reward terms."],
    summary: "Draft awaiting review."
  };
  globalThis.fetch = async input => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.hostname === "webcdn.uni.cards" && url.pathname === "/nxwave/docs/CC_YesBank_MITC.pdf") {
      return new Response(new Uint8Array([37, 80, 68, 70]), { headers: { "content-type": "application/pdf" } });
    }
    if (url.hostname === "www.uni.cards" && url.pathname === "/") {
      return new Response(
        "<html><head><title>Uni GoldX Credit Card</title></head><body><main>" +
        ("Uni GoldX: 1% back on all transactions. 5% back on Amazon, Flipkart, Myntra, Zomato, Swiggy, BigBasket, Nykaa and TataCliQ through Uni Store vouchers. 7% back on flights and hotels booked through Uni Store. Zero joining fee and zero annual fee. ").repeat(3) +
        "</main></body></html>",
        { headers: { "content-type": "text/html; charset=utf-8" } }
      );
    }
    if (url.hostname === "www.uni.cards" && url.pathname === "/campaign/") {
      return new Response(
        "<html><head><title>Uni GoldX rewards campaign</title></head><body><main>" +
        ("GoldX offers up to 8% back on selected merchants, 50% back on PVR and INOX vouchers subject to card spends of INR 10,000 per month, and zero forex fee. ").repeat(3) +
        "</main></body></html>",
        { headers: { "content-type": "text/html; charset=utf-8" } }
      );
    }
    if (url.hostname === "web.uni.cards") {
      return new Response(
        "<html><head><title>Uni GoldX</title></head><body><main>" +
        ("Uni GoldX card. Rewards are in digital gold, with merchant and travel offer conditions. ").repeat(4) +
        "</main></body></html>",
        { headers: { "content-type": "text/html; charset=utf-8" } }
      );
    }
    return new Response("Not found", { status: 404 });
  };

  try {
    const response = await worker.fetch(new Request("https://app.example/api/admin/extract", {
      method: "POST",
      headers: { authorization: "Bearer test-admin-token", "content-type": "application/json" },
      body: JSON.stringify({
        issuer: "YES Bank",
        cardName: "UNI Gold X",
        sourceUrl: "https://webcdn.uni.cards/nxwave/docs/CC_YesBank_MITC.pdf"
      })
    }), {
      ADMIN_TOKEN: "test-admin-token",
      AI: {
        async toMarkdown() {
          return { format: "markdown", data: "Zagg Credit Card annual fee INR 399. Zagg Credit Card waiver INR 300000." };
        },
        async run(model, options) {
          extractionPrompt = options.messages.find(message => message.role === "user")?.content || "";
          return { response: JSON.stringify(validDraft) };
        }
      }
    });

    assert.equal(response.status, 200, await response.clone().text());
    assert.match(extractionPrompt, /Uni GoldX: 1% back on all transactions/i);
    assert.match(extractionPrompt, /5% back on Amazon/i);
    assert.match(extractionPrompt, /7% back on flights and hotels/i);
    assert.match(extractionPrompt, /50% back on PVR and INOX/i);
    assert.doesNotMatch(extractionPrompt, /Zagg Credit Card annual fee INR 399/i);
    assert.doesNotMatch(extractionPrompt, /Zagg Credit Card waiver INR 300000/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
