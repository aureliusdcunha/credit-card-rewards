import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

test("auto-extraction refreshes one existing pending draft instead of inserting another copy", async () => {
  const sameCard = { issuer: "ICICI Bank", cardName: "Sapphiro Credit Card" };
  const pendingRows = [
    {
      id: "pending-newest",
      card_id: null,
      source_url: "https://campaigns.icicibank.com/credit-card/alumni/index.html",
      extracted_json: JSON.stringify(sameCard),
      created_at: "2026-10-22T04:00:00Z"
    },
    {
      id: "pending-older",
      card_id: null,
      source_url: "https://campaigns.icicibank.com/credit-card/alumni/index.html",
      extracted_json: JSON.stringify(sameCard),
      created_at: "2026-10-22T03:59:00Z"
    }
  ];
  const dbCalls = [];
  const env = {
    ADMIN_TOKEN: "test-admin-token",
    DB: {
      prepare(sql) {
        let args = [];
        return {
          bind(...values) { args = values; return this; },
          async all() {
            assert.match(sql, /SELECT id, card_id, source_url, extracted_json/);
            return { results: pendingRows };
          },
          async run() {
            dbCalls.push({ sql: sql.replace(/\s+/g, " ").trim(), args });
            return { success: true, meta: { changes: 1 } };
          }
        };
      }
    },
    AI: {
      async run(_model, _request) {
        return {
          response: JSON.stringify({
            issuer: "ICICI Bank",
            cardName: "Sapphiro Credit Card",
            network: "Variant-dependent",
            rewardCurrency: "Reward Points",
            annualFee: 3500,
            annualFeeWaiver: "Annual fee waived for eligible annual spend above ₹6 lakh",
            effectiveDate: null,
            rules: [{
              category: "general",
              rate: 2,
              perAmount: 100,
              unit: "Reward Points",
              minTransaction: 0,
              cap: null,
              rounding: "down",
              validFrom: null,
              validTo: null,
              sourceQuote: "Earn 2 reward points per ₹100 on eligible domestic spend.",
              notes: null
            }],
            exclusions: [],
            benefits: [],
            missingItems: [],
            summary: "Regression test card"
          })
        };
      }
    }
  };

  const response = await worker.fetch(new Request("https://app.example/api/admin/extract", {
    method: "POST",
    headers: { "authorization": "Bearer test-admin-token", "content-type": "application/json" },
    body: JSON.stringify({
      issuer: "ICICI Bank",
      cardName: "Sapphiro Credit Card",
      sourceUrl: "https://www.icici.bank.in/personal-banking/cards/credit-card/sapphiro-card",
      sourceTitle: "ICICI Bank Sapphiro Credit Card",
      sourceText: "Official terms. " + "Eligible domestic spend earns two reward points per one hundred rupees. ".repeat(5),
      deduplicatePending: true
    })
  }), env);

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.deduplicated, true);
  assert.equal(body.draftId, "pending-newest");
  assert.equal(dbCalls.length, 2);
  assert.match(dbCalls[0].sql, /SET card_id = ?, source_url = ?, source_title/);
  assert.deepEqual(dbCalls[0].args.slice(-1), ["pending-newest"]);
  assert.match(dbCalls[1].sql, /SET status = 'superseded'/);
  assert.deepEqual(dbCalls[1].args, ["pending-older"]);
});
