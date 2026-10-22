import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

test("automatic source reading follows an official terms PDF linked from a JavaScript-heavy issuer page", async () => {
  const originalFetch = globalThis.fetch;
  const fetchedUrls = [];
  const validDraft = {
    issuer: "Yes Bank",
    cardName: "Uni Credit Card",
    network: null,
    rewardCurrency: "Points",
    annualFee: null,
    joiningFee: null,
    annualFeeWaiver: null,
    effectiveDate: null,
    rules: [],
    exclusions: [],
    benefits: [],
    missingItems: ["Confirm numeric reward rate from the current card terms."],
    summary: "Draft awaiting human review."
  };
  const termsText = "Official Uni Credit Card terms and conditions. " +
    "Eligible retail purchases, reward programme rules, annual fees, exclusion categories, " +
    "minimum spend conditions, benefits and service charges. ".repeat(4);

  globalThis.fetch = async input => {
    const url = new URL(typeof input === "string" ? input : input.url);
    fetchedUrls.push(url.toString());

    if (url.hostname === "html.duckduckgo.com") {
      const query = url.searchParams.get("q") || "";
      if (query.includes("site:yes.bank.in")) {
        return new Response(
          '<html><a class="result__a" href="https://www.yes.bank.in/credit-cards/uni">YES Bank Uni Credit Card</a></html>',
          { headers: { "content-type": "text/html" } }
        );
      }
      return new Response("<html></html>", { headers: { "content-type": "text/html" } });
    }

    if (url.hostname === "www.yes.bank.in" && url.pathname === "/credit-cards/uni") {
      return new Response(
        '<html><head><title>Uni Credit Card | Yes Bank</title></head><body>' +
        '<main><div id="app"></div>' +
        '<a href="/content/uni-card-terms.pdf" title="Uni credit card terms and conditions PDF">Terms and Conditions PDF</a>' +
        '</main><script src="/assets/app.js"></script></body></html>',
        { headers: { "content-type": "text/html; charset=utf-8" } }
      );
    }

    if (url.hostname === "www.yes.bank.in" && url.pathname === "/content/uni-card-terms.pdf") {
      return new Response(new Uint8Array([37, 80, 68, 70, 45, 49]), {
        headers: { "content-type": "application/pdf" }
      });
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
      body: JSON.stringify({ issuer: "Yes Bank", cardName: "Uni Credit Card" })
    }), {
      ADMIN_TOKEN: "test-admin-token",
      AI: {
        async toMarkdown() {
          return { format: "markdown", data: termsText };
        },
        async run() {
          return { response: JSON.stringify(validDraft) };
        }
      }
    });

    assert.equal(response.status, 200, await response.clone().text());
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.extractionMode, "auto-discovery");
    assert.equal(body.discovery.selectedSource, "https://www.yes.bank.in/content/uni-card-terms.pdf");
    assert.ok(fetchedUrls.includes("https://www.yes.bank.in/content/uni-card-terms.pdf"));
    assert.match(body.sourceExcerpt, /Official Uni Credit Card terms and conditions/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("uses a supplied YES Bank Uni product URL without depending on search discovery", async () => {
  const originalFetch = globalThis.fetch;
  const fetchedUrls = [];
  const startUrl = "https://www.yes.bank.in/personal-banking/yes-individual/cards/credit-cards/uni-credit-card";
  const termsUrl = "https://www.yes.bank.in/personal-banking/yes-individual/cards/credit-cards/uni-card-terms.pdf";
  const termsText = "Official Uni Credit Card terms and conditions. " +
    "Eligible retail purchases, reward programme rules, annual fees, exclusion categories, " +
    "minimum spend conditions, benefits and service charges. ".repeat(4);
  const validDraft = {
    issuer: "Yes Bank", cardName: "Uni", network: null, rewardCurrency: "Points",
    annualFee: null, joiningFee: null, annualFeeWaiver: null, effectiveDate: null,
    rules: [], exclusions: [], benefits: [],
    missingItems: ["Confirm numeric reward rate from the current card terms."],
    summary: "Draft awaiting human review."
  };

  globalThis.fetch = async input => {
    const url = new URL(typeof input === "string" ? input : input.url);
    fetchedUrls.push(url.toString());

    if (["html.duckduckgo.com", "lite.duckduckgo.com", "www.bing.com"].includes(url.hostname)) {
      throw new Error("Search discovery should be skipped when an official URL is supplied.");
    }
    if (url.toString() === startUrl) {
      return new Response(
        '<html><head><title>Uni Credit Card | Yes Bank</title></head><body>' +
        '<main><div id="app"></div><a href="' + termsUrl + '" title="Uni Credit Card terms and conditions PDF">Terms and Conditions PDF</a></main>' +
        '<script src="/assets/app.js"></script></body></html>',
        { headers: { "content-type": "text/html; charset=utf-8" } }
      );
    }
    if (url.toString() === termsUrl) {
      return new Response(new Uint8Array([37, 80, 68, 70, 45, 49]), {
        headers: { "content-type": "application/pdf" }
      });
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
      body: JSON.stringify({ issuer: "Yes Bank", cardName: "Uni", sourceUrl: startUrl })
    }), {
      ADMIN_TOKEN: "test-admin-token",
      AI: {
        async toMarkdown() { return { format: "markdown", data: termsText }; },
        async run() { return { response: JSON.stringify(validDraft) }; }
      }
    });

    assert.equal(response.status, 200, await response.clone().text());
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.discovery.suppliedSourceUrl, true);
    assert.equal(body.discovery.candidatesFound, 1);
    assert.equal(body.discovery.selectedSource, termsUrl);
    assert.ok(fetchedUrls.includes(startUrl));
    assert.ok(fetchedUrls.includes(termsUrl));
    assert.ok(!fetchedUrls.some(url => /duckduckgo|bing\\.com/.test(url)));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects a supplied official URL that belongs to a different issuer", async () => {
  const response = await worker.fetch(new Request("https://app.example/api/admin/auto-extract", {
    method: "POST",
    headers: {
      authorization: "Bearer test-admin-token",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      issuer: "Yes Bank",
      cardName: "Uni",
      sourceUrl: "https://www.axis.bank.in/cards/credit-card/axis-horizon-credit-card"
    })
  }), {
    ADMIN_TOKEN: "test-admin-token",
    AI: { async run() { return { response: "{}" }; } }
  });
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.match(body.error, /domain does not match Yes Bank/);
});


test("falls back to issuer-wide official source discovery when a supplied product page is JavaScript-only", async () => {
  const originalFetch = globalThis.fetch;
  const fetchedUrls = [];
  const startUrl = "https://www.yes.bank.in/personal-banking/yes-individual/cards/credit-cards/uni-credit-card";
  const termsUrl = "https://www.yes.bank.in/content/uni-key-fact-statement.pdf";
  const termsText = "Official YES BANK UNI Credit Card Key Fact Statement and terms. " +
    "Annual fee details, finance charges, rewards, eligible transactions, exclusions, " +
    "fuel surcharge waiver and important cardholder conditions. ".repeat(5);
  const validDraft = {
    issuer: "Yes Bank", cardName: "Uni", network: null, rewardCurrency: "Uni Coins",
    annualFee: 499, joiningFee: 0, annualFeeWaiver: null, effectiveDate: null,
    rules: [], exclusions: [], benefits: [],
    missingItems: ["Confirm the current cashback earning rate from a dedicated rewards document."],
    summary: "Draft awaiting human review."
  };

  globalThis.fetch = async input => {
    const url = new URL(typeof input === "string" ? input : input.url);
    fetchedUrls.push(url.toString());

    if (url.hostname === "html.duckduckgo.com") {
      const query = url.searchParams.get("q") || "";
      if (query.includes("site:yes.bank.in")) {
        return new Response(
          '<html><a class="result__a" href="' + termsUrl + '">YES BANK UNI Credit Card Key Fact Statement PDF</a></html>',
          { headers: { "content-type": "text/html" } }
        );
      }
      return new Response("<html></html>", { headers: { "content-type": "text/html" } });
    }

    if (url.toString() === startUrl) {
      return new Response(
        '<html><head><title>UNI Credit Card | YES BANK</title></head><body>' +
        '<div id="root"></div><script src="/assets/uni-app.js"></script></body></html>',
        { headers: { "content-type": "text/html; charset=utf-8" } }
      );
    }
    if (url.toString() === termsUrl) {
      return new Response(new Uint8Array([37, 80, 68, 70, 45, 49]), {
        headers: { "content-type": "application/pdf" }
      });
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
      body: JSON.stringify({ issuer: "Yes Bank", cardName: "Uni", sourceUrl: startUrl })
    }), {
      ADMIN_TOKEN: "test-admin-token",
      AI: {
        async toMarkdown() { return { format: "markdown", data: termsText }; },
        async run() { return { response: JSON.stringify(validDraft) }; }
      }
    });

    assert.equal(response.status, 200, await response.clone().text());
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.discovery.suppliedSourceUrl, true);
    assert.equal(body.discovery.selectedSource, termsUrl);
    assert.ok(body.discovery.candidatesFound >= 2);
    assert.ok(fetchedUrls.includes(startUrl));
    assert.ok(fetchedUrls.includes(termsUrl));
    assert.ok(fetchedUrls.some(url => url.includes("html.duckduckgo.com")));
    assert.match(body.sourceExcerpt, /Official YES BANK UNI Credit Card Key Fact Statement/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("uses the supplied product URL's parent catalogue when the product page is JavaScript-only", async () => {
  const originalFetch = globalThis.fetch;
  const fetchedUrls = [];
  let extractionPrompt = "";
  const startUrl = "https://www.yes.bank.in/personal-banking/yes-individual/cards/credit-cards/uni-credit-card";
  const catalogueUrl = "https://www.yes.bank.in/personal-banking/yes-individual/cards/credit-cards/";
  const catalogueHtml = '<html><head><title>Credit Cards | YES BANK</title></head><body><main>' +
    '<section><article><h3>UNI Credit Card</h3>' +
    '<p>Joining Fees 0. Renewal Fees ₹499.</p>' +
    '<p>1% cash back in Uni Coins on all transactions.</p>' +
    '<p>0% foreign currency conversion charges for international transactions.</p>' +
    '<p>1% fuel surcharge waiver on fuel transactions.</p></article>' +
    '<article><h3>UNI Rupay Credit Card</h3><p>Joining Fees 0. Renewal Fees ₹0.</p>' +
    '<p>Different rewards and eligibility conditions for this other variant.</p></article>' +
    '<article><h3>Zagg Credit Card</h3><p>Two domestic lounge visits subject to spend eligibility.</p></article>' +
    '</section></main></body></html>';
  const validDraft = {
    issuer: "Yes Bank", cardName: "UNI Credit Card", network: null, rewardCurrency: "Uni Coins",
    annualFee: 499, joiningFee: 0, annualFeeWaiver: null, effectiveDate: null,
    rules: [], exclusions: [], benefits: [],
    missingItems: ["Confirm the current reward programme limitations from dedicated terms."],
    summary: "Draft awaiting human review."
  };

  globalThis.fetch = async input => {
    const url = new URL(typeof input === "string" ? input : input.url);
    fetchedUrls.push(url.toString());

    if (url.toString() === startUrl) {
      return new Response(
        '<html><head><title>UNI Credit Card | YES BANK</title></head><body>' +
        '<div id="root"></div><script src="/assets/uni-app.js"></script></body></html>',
        { headers: { "content-type": "text/html; charset=utf-8" } }
      );
    }
    if (url.toString() === catalogueUrl || url.toString() === catalogueUrl.slice(0, -1)) {
      return new Response(catalogueHtml, { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    if (["html.duckduckgo.com", "lite.duckduckgo.com", "www.bing.com"].includes(url.hostname)) {
      throw new Error("Search should not be needed if the parent official catalogue is readable.");
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
      body: JSON.stringify({ issuer: "Yes Bank", cardName: "UNI Credit Card", sourceUrl: startUrl })
    }), {
      ADMIN_TOKEN: "test-admin-token",
      AI: {
        async run(_model, request) {
          extractionPrompt = request.messages?.[1]?.content || "";
          return { response: JSON.stringify(validDraft) };
        }
      }
    });

    assert.equal(response.status, 200, await response.clone().text());
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.discovery.suppliedSourceUrl, true);
    assert.equal(body.discovery.selectedSource, catalogueUrl);
    assert.ok(fetchedUrls.includes(startUrl));
    assert.ok(fetchedUrls.includes(catalogueUrl));
    assert.match(extractionPrompt, /1% cash back in Uni Coins on all transactions/);
    assert.match(extractionPrompt, /Renewal Fees ₹499/);
    assert.doesNotMatch(extractionPrompt, /UNI Rupay Credit Card|Zagg Credit Card|Different rewards/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
