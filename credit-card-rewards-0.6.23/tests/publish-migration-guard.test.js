import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

test("publishing explains when the production D1 joining-fee migration is missing", async () => {
  const db = {
    prepare(sql) {
      return {
        all: async () => {
          if (String(sql).includes("SELECT joining_fee FROM cards")) {
            throw new Error("no such column: joining_fee");
          }
          throw new Error("Unexpected SQL in this test: " + sql);
        }
      };
    }
  };
  const response = await worker.fetch(new Request("https://app.example/api/admin/drafts/draft-test/approve", {
    method: "POST",
    headers: {
      authorization: "Bearer test-admin-token",
      "content-type": "application/json"
    },
    body: JSON.stringify({ approvedJson: {} })
  }), {
    ADMIN_TOKEN: "test-admin-token",
    DB: db
  });
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.migrationRequired, true);
  assert.match(body.error, /missing migration 0002_joining_fee\.sql/i);
  assert.match(body.nextStep, /wrangler d1 migrations apply credit-card-rewards --remote/);
  assert.match(body.error, /No rules were published/);
});
