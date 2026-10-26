import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

test("archive endpoint requires admin authorization before changing a card", async () => {
  let databaseTouched = false;
  const env = {
    ADMIN_TOKEN: "secret",
    DB: {
      prepare() {
        databaseTouched = true;
        return { bind() { return this; }, async first() { return { id: "axis-duplicate" }; }, async run() { return { meta: { changes: 1 } }; } };
      }
    }
  };
  const response = await worker.fetch(new Request("https://app.example/api/admin/cards/axis-duplicate/archive", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({})
  }), env);
  assert.equal(response.status, 401);
  assert.equal(databaseTouched, false);
});

test("archive endpoint soft-archives a card and retains its history", async () => {
  const calls = [];
  const env = {
    ADMIN_TOKEN: "secret",
    DB: {
      prepare(sql) {
        return {
          args: [],
          bind(...args) { this.args = args; return this; },
          async first() {
            assert.equal(sql, "SELECT id, issuer, name, status FROM cards WHERE id = ?");
            calls.push({ type: "select", sql, args: this.args });
            return { id: "axis-duplicate", issuer: "Axis Bank", name: "Horizon Credit Card", status: "active" };
          },
          async run() {
            calls.push({ type: "update", sql: sql.replace(/\s+/g, " ").trim(), args: this.args });
            return { success: true, meta: { changes: 1 } };
          }
        };
      }
    }
  };
  const response = await worker.fetch(new Request("https://app.example/api/admin/cards/axis-duplicate/archive", {
    method: "POST",
    headers: { "authorization": "Bearer secret", "content-type": "application/json" },
    body: JSON.stringify({})
  }), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.cardId, "axis-duplicate");
  assert.match(body.message, /history were retained/i);
  assert.equal(calls.length, 2);
  assert.match(calls[1].sql, /SET status = 'archived'/);
  assert.deepEqual(calls[1].args.slice(1), ["axis-duplicate"]);
});

test("archive endpoint returns 404 for a missing card and does not attempt an update", async () => {
  const env = {
    ADMIN_TOKEN: "secret",
    DB: {
      prepare(sql) {
        return { bind() { return this; }, async first() { return null; }, async run() { throw new Error("should not update a missing card"); } };
      }
    }
  };
  const response = await worker.fetch(new Request("https://app.example/api/admin/cards/not-found/archive", {
    method: "POST",
    headers: { "authorization": "Bearer secret", "content-type": "application/json" },
    body: JSON.stringify({})
  }), env);
  assert.equal(response.status, 404);
  assert.match((await response.json()).error, /card not found/i);
});
