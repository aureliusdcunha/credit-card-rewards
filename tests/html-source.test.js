import test from "node:test";
import assert from "node:assert/strict";
import { extractOfficialHtml } from "../src/html-source.js";

test("extracts readable issuer page content while dropping scripts, styles and navigation", () => {
  const html = '<!doctype html><html><head>' +
    '<title>Uni Credit Card | Yes Bank</title>' +
    '<meta name="description" content="Official Uni credit card fees, eligibility and rewards.">' +
    '<style>.menu{display:none}</style></head><body>' +
    '<nav>Home Personal Banking</nav>' +
    '<main><h1>Uni Credit Card</h1><p>Earn reward points on eligible spends. Annual fee: &#8377;499.</p>' +
    '<p>See all eligibility conditions and excluded transaction categories in the current terms.</p></main>' +
    '<script>window.secret = "not card terms";</script><footer>Cookie settings</footer>' +
    '</body></html>';
  const result = extractOfficialHtml(html, "https://www.yes.bank.in/credit-cards/uni", "Uni");
  assert.match(result.title, /Uni Credit Card/);
  assert.match(result.text, /Earn reward points on eligible spends/);
  assert.match(result.text, /₹499/);
  assert.doesNotMatch(result.text, /window.secret|Cookie settings|Home Personal Banking/);
});

test("discovers same-issuer terms PDF links from JavaScript-heavy pages", () => {
  const html = '<html><head><title>Uni | Yes Bank</title></head><body>' +
    '<div id="app"></div>' +
    '<a href="/content/uni-card-terms.pdf" title="Uni credit card terms and conditions PDF">Terms and Conditions PDF</a>' +
    '<a href="https://www.yesbank.in/card/uni-fees.pdf">Annual fee terms PDF</a>' +
    '<a href="https://www.otherbank.bank.in/terms.pdf">Foreign bank terms PDF</a>' +
    '<script>const demo = \'<a href="/fake/terms.pdf">Fake source</a>\';</script>' +
    '</body></html>';
  const result = extractOfficialHtml(html, "https://www.yes.bank.in/credit-cards/uni", "Uni");
  assert.equal(result.javascriptHeavy, true);
  assert.ok(result.relatedUrls.some(link => link.url === "https://www.yes.bank.in/content/uni-card-terms.pdf"));
  assert.ok(!result.relatedUrls.some(link => link.url.includes("otherbank")));
  assert.ok(!result.relatedUrls.some(link => link.url.includes("/fake/")));
});

test("keeps same-issuer links only and safely decodes URL entities", () => {
  const html = '<html><body><main><p>Official card terms and conditions for eligible customers, including reward rates and lounge access restrictions.</p></main>' +
    '<a href="/terms?type=fees&amp;doc=card">Fees and card terms</a>' +
    '<a href="//evil.example/terms.pdf">Terms and conditions PDF</a></body></html>';
  const result = extractOfficialHtml(html, "https://www.hdfc.bank.in/card/regalia", "Regalia Gold");
  assert.ok(result.relatedUrls.some(link => link.url === "https://www.hdfc.bank.in/terms?type=fees&doc=card"));
  assert.ok(!result.relatedUrls.some(link => link.url.includes("evil.example")));
});
