import test from "node:test";
import assert from "node:assert/strict";
import { discoverOfficialUrls, issuerDomainFor } from "../src/source-discovery.js";

test("searches the original official issuer domain for non-curated YES BANK cards", async () => {
  const originalFetch = globalThis.fetch;
  const queries = [];
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    if (url.hostname !== "html.duckduckgo.com") return new Response("Search unavailable", { status: 503 });
    const query = url.searchParams.get("q") || "";
    queries.push(query);
    if (query.includes("site:yesbank.in")) {
      return new Response(
        '<html><a class="result__a" href="https://www.yesbank.in/personal-banking/cards/rewards-card-terms.pdf">YES Bank Rewards Credit Card rewards and terms PDF</a></html>',
        { headers: { "content-type": "text/html" } }
      );
    }
    if (query.includes("site:yes.bank.in")) {
      return new Response(
        '<html><a class="result__a" href="https://www.yes.bank.in/credit-cards/rewards-credit-card">YES Bank Rewards Credit Card</a></html>',
        { headers: { "content-type": "text/html" } }
      );
    }
    return new Response("<html></html>", { headers: { "content-type": "text/html" } });
  };

  try {
    assert.equal(issuerDomainFor("Yes Bank", "Uni Credit Card"), "yes.bank.in");
    const results = await discoverOfficialUrls("Yes Bank", "Rewards Credit Card");
    assert.ok(queries.some(query => query.includes("site:yesbank.in")));
    assert.ok(results.some(result => result.url === "https://www.yesbank.in/personal-banking/cards/rewards-card-terms.pdf"));
    assert.ok(results.some(result => result.url === "https://www.yes.bank.in/credit-cards/rewards-credit-card"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
