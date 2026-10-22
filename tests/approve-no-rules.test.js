import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

const SOURCE_URL = "https://www.axis.bank.in/cards/credit-card/axis-horizon-credit-card";

function createDb({ existingCard = null, approvedRuleCount = 0 } = {}) {
  const history = { runs: [], batches: [], prepared: [] };
  const pendingDraft = {
    id: "draft-1", card_id: null, source_url: SOURCE_URL,
    source_title: "Axis Horizon Credit Card terms",
    source_excerpt: "Official card source excerpt for tests.",
    extracted_json: JSON.stringify({ issuer: "Axis Bank", cardName: "Horizon Credit Card", rules: [] }),
    status: "needs_review"
  };

  function statement(sql) {
    return {
      sql,
      values: [],
      bind(...values) { this.values = values; return this; },
      async all() {
        history.prepared.push({ kind: "all", sql: this.sql, values: this.values });
        return { results: [] };
      },
      async first() {
        history.prepared.push({ kind: "first", sql: this.sql, values: this.values });
        if (/FROM extraction_drafts WHERE id = \? AND status = 'needs_review'/i.test(this.sql)) return pendingDraft;
        if (/lower\(trim\(issuer\)\)/i.test(this.sql)) return existingCard;
        if (/SELECT COUNT\(\*\) AS count FROM card_rules/i.test(this.sql)) return { count: approvedRuleCount };
        if (/FROM cards WHERE id = \?/i.test(this.sql)) {
          if (existingCard && this.values[0] === existingCard.id) return existingCard;
          return null;
        }
        return null;
      },
      async run() {
        history.runs.push({ sql: this.sql, values: this.values });
        return { meta: { changes: 1 } };
      }
    };
  }

  return {
    history,
    DB: {
      prepare: statement,
      async batch(statements) {
        const batch = statements.map(item => ({ sql: item.sql, values: item.values }));
        history.batches.push(batch);
        return batch.map(() => ({ meta: { changes: 1 } }));
      }
    }
  };
}

const approvedJson = {
  issuer: "Axis Bank", cardName: "Horizon Credit Card", network: null,
  rewardCurrency: "EDGE Miles", annualFee: null, joiningFee: null,
  annualFeeWaiver: null, effectiveDate: null,
  summary: "Horizon card details reviewed against official issuer terms.",
  rules: [], exclusions: [],
  benefits: [{
    name: "Travel benefit",
    description: "Travel-related benefit stated by the issuer.",
    conditions: "Subject to the published card terms.",
    sourceQuote: "Travel-related benefit stated by the issuer.",
    sourceUrl: SOURCE_URL
  }],
  missingItems: ["The numeric base earning rate could not be verified from the source."]
};

async function approve(db, selectedCardId = null) {
  return worker.fetch(new Request("https://app.example/api/admin/drafts/draft-1/approve", {
    method: "POST",
    headers: {
      authorization: "Bearer test-admin-token",
      "content-type": "application/json"
    },
    body: JSON.stringify({ approvedJson, cardId: selectedCardId })
  }), { ADMIN_TOKEN: "test-admin-token", DB: db.DB });
}

test("publishes reviewed card details with no complete earning rule and marks a new card no_verified_rules", async () => {
  const db = createDb();
  const response = await approve(db);
  assert.equal(response.status, 200, await response.clone().text());

  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.createdNewCard, true);
  assert.equal(body.publishedRules, 0);
  assert.equal(body.reviewStatus, "no_verified_rules");
  assert.equal(body.preservedExistingRules, false);
  assert.match(body.message, /New card created/i);
  assert.match(body.message, /No verified rules/i);

  const finalCardUpdate = db.history.runs.find(item => /UPDATE cards SET issuer =/.test(item.sql));
  assert.ok(finalCardUpdate, "card metadata should be persisted");
  assert.ok(finalCardUpdate.values.includes("no_verified_rules"), "card must not be marked verified without earning rules");

  const ruleRetirement = db.history.batches[0].find(item => /UPDATE card_rules SET status/.test(item.sql));
  assert.match(ruleRetirement.sql, /status = 'demo'/);
  assert.doesNotMatch(ruleRetirement.sql, /status IN \('approved','demo'\)/);
  assert.ok(db.history.runs.some(item => /INSERT INTO card_benefits/.test(item.sql)), "reviewed benefit details should be saved");
});

test("does not retire existing approved earning rules when an update draft has no new complete rule", async () => {
  const existingCard = { id: "axis-horizon", review_status: "verified" };
  const db = createDb({ existingCard, approvedRuleCount: 1 });
  const response = await approve(db);
  assert.equal(response.status, 200, await response.clone().text());

  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.cardId, "axis-horizon");
  assert.equal(body.createdNewCard, false);
  assert.equal(body.publishedRules, 0);
  assert.equal(body.reviewStatus, "verified");
  assert.equal(body.preservedExistingRules, true);
  assert.match(body.message, /existing approved earning rules were kept unchanged/i);

  const ruleRetirement = db.history.batches[0].find(item => /UPDATE card_rules SET status/.test(item.sql));
  assert.match(ruleRetirement.sql, /status = 'demo'/);
  assert.doesNotMatch(ruleRetirement.sql, /status IN \('approved','demo'\)/);
  assert.equal(db.history.runs.some(item => /UPDATE cards SET review_status = 'needs_review'/.test(item.sql)), false);
});
