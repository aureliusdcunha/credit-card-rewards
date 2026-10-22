import test from "node:test";
import assert from "node:assert/strict";
import { discoverOfficialUrls, issuerDomainFor, validateOfficialUrl } from "../src/source-discovery.js";

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
