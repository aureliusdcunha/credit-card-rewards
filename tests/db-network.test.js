import test from "node:test";
import assert from "node:assert/strict";
import { getCards } from "../src/db.js";

test("legacy 'Not specified' card network values are exposed as unknown rather than real network metadata", async () => {
  const cardRow = {
    id: "test-card",
    issuer: "Example Bank",
    name: "Example Rewards Card",
    network: "Not specified",
    reward_currency: "Points",
    annual_fee: null,
    joining_fee: null,
    annual_fee_waiver: null,
    description: "",
    official_url: "https://www.example.bank.in/cards",
    review_status: "needs_review",
    source_date: null,
    status: "active"
  };
  const env = {
    DB: {
      prepare(sql) {
        return {
          async all() {
            if (sql.includes("FROM cards")) return { results: [cardRow] };
            return { results: [] };
          }
        };
      }
    }
  };
  const cards = await getCards(env);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].network, null);
});
