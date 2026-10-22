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
