import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import worker from "../src/index.js";
import { getCards, invalidateCatalogueCache } from "../src/db.js";
import { calculateRewards } from "../src/rules-engine.js";
import { APP_VERSION } from "../src/version.js";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

// ---------- helpers ----------
function catalogueDb(counter = { queries: 0 }) {
  const cardRow = { id: "test-card", issuer: "HDFC Bank", name: "Regalia Gold Credit Card", network: "Visa", reward_currency: "Reward Points", annual_fee: 2500, joining_fee: 2500, annual_fee_waiver: null, description: "", official_url: "https://www.hdfcbank.com/", review_status: "verified", source_date: null };
  const rules = [
    { id: "r1", card_id: "test-card", status: "approved", valid_from: "2024-01-01", valid_to: null, source_id: null,
      rule_json: JSON.stringify({ category: "dining", rate: 10, perAmount: 150, unit: "Reward Points", rounding: "down", priority: 5,
        cap: { type: "points", value: 5000, period: "calendar_month", overCapCategory: "general" }, sourceQuote: "10X points per Rs. 150 on dining" }) },
    { id: "r2", card_id: "test-card", status: "approved", valid_from: "2024-01-01", valid_to: null, source_id: null,
      rule_json: JSON.stringify({ category: "general", rate: 1, perAmount: 150, unit: "Reward Points", rounding: "down", priority: 0, sourceQuote: "1 point per Rs. 150" }) }
  ];
  return {
    prepare(sql) {
      counter.queries++;
      return { async all() {
        if (sql.includes("FROM card_rules")) return { results: rules };
        if (sql.includes("FROM cards")) return { results: [cardRow] };
        return { results: [] };
      } };
    }
  };
}
const post = (path, body, headers = {}) => new Request("https://app.example" + path, {
  method: "POST", headers: { "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body)
});

// ---------- security ----------
test("admin endpoints accept only the exact bearer token", async () => {
  const env = { ADMIN_TOKEN: "correct-horse-battery" };
  const cases = [
    [undefined, 401],
    ["Bearer wrong-horse-battery!", 401],            // same length, different content
    ["Bearer correct-horse-battery-extra", 401],
    ["correct-horse-battery", 401],                   // missing "Bearer " prefix
    ["Bearer correct-horse-battery", 200]
  ];
  for (const [authorization, expected] of cases) {
    const response = await worker.fetch(new Request("https://app.example/api/admin/drafts", { headers: authorization ? { authorization } : {} }), env);
    assert.equal(response.status, expected, String(authorization));
  }
});

test("malformed JSON bodies and URL encodings return 4xx instead of a 500", async () => {
  const env = { ADMIN_TOKEN: "t", DB: catalogueDb(), AI: { run: async () => ({}) } };
  const auth = { authorization: "Bearer t" };
  for (const path of ["/api/calculate", "/api/admin/extract", "/api/admin/auto-extract"]) {
    const response = await worker.fetch(post(path, "null", auth), env);
    assert.equal(response.status, 400, path + " must reject a JSON null body");
  }
  assert.equal((await worker.fetch(new Request("https://app.example/api/cards/%E0%A4%A"), env)).status, 400);
  assert.equal((await worker.fetch(post("/api/admin/drafts/%E0%A4%A/reject", {}, auth), env)).status, 400);
});

// ---------- calculation correctness ----------
test("/api/calculate forwards periodPointsBefore so shared points caps are honoured", async () => {
  const env = { DB: catalogueDb() };
  const response = await worker.fetch(post("/api/calculate", {
    cardId: "test-card", amount: 100000, category: "dining", purchaseDate: "2026-10-22", periodPointsBefore: 4900
  }), env);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.capped, true, "the points cap must be applied");
  assert.equal(result.points, 756);
});

test("floating-point noise no longer costs a reward point (₹900 at 0.7 per ₹10 is 63)", () => {
  const card = { id: "c", name: "C", rewardCurrency: "Points", reviewStatus: "verified", exclusions: [],
    rules: [{ category: "general", rate: 0.7, perAmount: 10, unit: "Points", status: "approved", rounding: "down" }] };
  const result = calculateRewards({ card, amount: 900, category: "general", purchaseDate: "2026-10-22" });
  assert.equal(result.points, 63);
});

test("purchaseDate must be a real YYYY-MM-DD calendar date", () => {
  const card = { id: "c", name: "C", rewardCurrency: "Points", reviewStatus: "verified", exclusions: [],
    rules: [{ category: "general", rate: 1, perAmount: 100, unit: "Points", status: "approved" }] };
  for (const purchaseDate of ["not-a-date", "2026-02-30", "26-10-22", "2026/10/22"]) {
    const result = calculateRewards({ card, amount: 500, category: "general", purchaseDate });
    assert.equal(result.ok, false, purchaseDate);
    assert.match(result.error, /YYYY-MM-DD/);
  }
  assert.equal(calculateRewards({ card, amount: 500, category: "general", purchaseDate: "2026-10-22" }).points, 5);
  assert.equal(calculateRewards({ card, amount: 500, category: "general" }).ok, true, "date defaults to today in IST");
});

// ---------- data integrity ----------
test("publishing writes retire + insert + card update + draft approval in ONE atomic batch", async () => {
  const SOURCE_URL = "https://www.axis.bank.in/cards/credit-card/axis-horizon-credit-card";
  const history = { runs: [], batches: [] };
  const statement = sql => ({
    sql, values: [], bind(...values) { this.values = values; return this; },
    async all() { return { results: [] }; },
    async first() {
      if (/FROM extraction_drafts WHERE id = \? AND status = 'needs_review'/i.test(sql)) return { id: "draft-1", card_id: null, source_url: SOURCE_URL, source_title: "t", source_excerpt: "x", extracted_json: "{}" };
      return null;
    },
    async run() { history.runs.push(sql); return { meta: { changes: 1 } }; }
  });
  const DB = { prepare: statement, async batch(list) { history.batches.push(list.map(item => item.sql)); return list.map(() => ({ meta: { changes: 1 } })); } };
  const approvedJson = {
    issuer: "Axis Bank", cardName: "Horizon Credit Card", rewardCurrency: "EDGE Miles", summary: "s",
    rules: [{ category: "general", rate: 2, perAmount: 100, unit: "EDGE Miles", sourceQuote: "2 EDGE Miles per Rs. 100", sourceUrl: SOURCE_URL }],
    exclusions: [], benefits: []
  };
  const response = await worker.fetch(post("/api/admin/drafts/draft-1/approve", { approvedJson }, { authorization: "Bearer t" }), { ADMIN_TOKEN: "t", DB });
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(history.batches.length, 1, "exactly one batch");
  const batch = history.batches[0].join("\n");
  for (const fragment of ["INSERT INTO cards", "INSERT INTO card_sources", "UPDATE card_rules SET status = 'retired'", "INSERT INTO card_rules", "UPDATE cards SET issuer", "UPDATE extraction_drafts SET status = 'approved'"]) {
    assert.ok(batch.includes(fragment), "batch must include " + fragment);
  }
  assert.equal(history.runs.length, 0, "no write may happen outside the atomic batch");
});

// ---------- speed ----------
test("the catalogue is cached per D1 binding, shared between concurrent callers and invalidated on demand", async () => {
  const counter = { queries: 0 };
  const env = { DB: catalogueDb(counter) };
  await Promise.all([getCards(env), getCards(env), getCards(env)]);
  assert.equal(counter.queries, 4, "one set of four D1 queries for concurrent callers");
  const again = await getCards(env);
  assert.equal(counter.queries, 4, "served from cache");
  again[0].name = "mutated by a caller";
  assert.notEqual((await getCards(env))[0].name, "mutated by a caller", "callers cannot corrupt the cache");
  invalidateCatalogueCache(env);
  await getCards(env);
  assert.equal(counter.queries, 8, "reloaded after invalidation");
  const other = { DB: catalogueDb(counter) };
  await getCards(other);
  assert.equal(counter.queries, 12, "a different binding never shares a cache entry");
});

test("a failed catalogue load is not cached", async () => {
  let fail = true;
  const env = { DB: { prepare() { return { async all() { if (fail) throw new Error("boom"); return { results: [] }; } }; } } };
  await assert.rejects(() => getCards(env), /D1 catalogue query failed/);
  fail = false;
  assert.deepEqual(await getCards(env), []);
});

test("auto-extract hands the already-read bundle to AI extraction without repeating source discovery", async () => {
  const realFetch = globalThis.fetch;
  const run = async skip => {
    let outbound = 0;
    globalThis.fetch = async () => { outbound++; return new Response("", { status: 404 }); };
    try {
      const response = await worker.fetch(post("/api/admin/extract", {
        issuer: "HDFC Bank", cardName: "Regalia Gold Credit Card",
        sourceUrl: "https://www.hdfcbank.com/personal/pay/cards/credit-cards/regalia-gold",
        sourceText: "Reward points are earned on retail spends. ".repeat(10),
        skipSupplementalSources: skip
      }, { authorization: "Bearer t" }), {
        ADMIN_TOKEN: "t",
        AI: { run: async () => ({ response: JSON.stringify({ issuer: "HDFC Bank", cardName: "Regalia Gold Credit Card", rules: [], exclusions: [], benefits: [], missingItems: [], summary: "s" }) }) }
      });
      assert.equal(response.status, 200, await response.clone().text());
    } finally { globalThis.fetch = realFetch; }
    return outbound;
  };
  assert.ok(await run(false) > 0, "baseline: the manual path still supplements from official pages");
  assert.equal(await run(true), 0, "auto path must not re-run discovery or re-fetch sources");
});

test("the browser API client reuses /cards for a short time, shares in-flight calls and clears on writes", async () => {
  const store = new Map();
  const sessionStorage = { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k), key: i => [...store.keys()][i] ?? null, get length() { return store.size; } };
  let calls = 0;
  const sandbox = { window: {}, sessionStorage, Headers, Date, JSON, Map, Promise, fetch: async () => { calls++; return { ok: true, status: 200, json: async () => ({ cards: [] }) }; } };
  runInNewContext(await read("../public/js/api.js"), sandbox);
  const { request } = sandbox.window.CRI;
  await Promise.all([request("/cards"), request("/cards")]);
  await request("/cards");
  assert.equal(calls, 1);
  await request("/admin/cards/x/archive", { method: "POST", body: "{}" });
  await request("/cards");
  assert.equal(calls, 3, "a POST clears the cache so the next read is fresh");
});

test("static hosting: fonts are preconnected (not @import-ed), assets are cacheable and security headers are set", async () => {
  const css = await read("../public/css/app.css");
  assert.doesNotMatch(css, /@import/, "render-blocking @import removed");
  for (const page of ["index", "cards", "calculator", "compare", "sources"]) {
    const html = await read(`../public/${page}.html`);
    assert.ok(html.includes('rel="preconnect" href="https://fonts.googleapis.com"'), page);
    assert.ok(html.includes("family=DM+Sans"), page);
  }
  const headers = await read("../public/_headers");
  assert.match(headers, /Content-Security-Policy:.*script-src 'self'/);
  assert.match(headers, /frame-ancestors 'none'/);
  assert.match(headers, /\/js\/\*\s+Cache-Control: public, max-age=3600/);
  assert.match(headers, /\/service-worker\.js\s+Cache-Control: no-cache/);
  const sw = await read("../public/service-worker.js");
  assert.match(sw, /NAVIGATION_TIMEOUT_MS/);
});

test("outbound user-agents follow the release instead of a hard-coded version", async () => {
  const source = await read("../src/source-discovery.js");
  assert.doesNotMatch(source, /CreditCardRewardsIntelligence\/\d/);
  assert.match(source, /CreditCardRewardsIntelligence\/\$\{APP_VERSION\}/);
  assert.match(APP_VERSION, /^\d+\.\d+\.\d+$/);
});
