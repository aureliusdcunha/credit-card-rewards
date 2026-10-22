import { DEMO_CARDS } from "./demo-data.js";
import { deduplicatePendingDraftRows } from "./draft-dedupe.js";

function fromDbCard(row) {
  return {
    id: row.id,
    issuer: row.issuer,
    name: row.name,
    network: row.network || "Not specified",
    rewardCurrency: row.reward_currency || "Rewards",
    annualFee: row.annual_fee == null ? null : Number(row.annual_fee),
    annualFeeWaiver: row.annual_fee_waiver || null,
    description: row.description || "",
    officialUrl: row.official_url || null,
    reviewStatus: row.review_status || "needs_review",
    sourceDate: row.source_date || null,
    rules: [],
    exclusions: [],
    benefits: []
  };
}

export async function getCards(env) {
  if (!env.DB) return DEMO_CARDS.map(card => structuredClone(card));
  try {
    const [cardRows, ruleRows, exclusionRows, benefitRows] = await Promise.all([
      env.DB.prepare("SELECT * FROM cards WHERE status != 'archived' ORDER BY issuer, name").all(),
      env.DB.prepare("SELECT * FROM card_rules WHERE status IN ('approved','demo') ORDER BY priority DESC, created_at DESC").all(),
      env.DB.prepare("SELECT * FROM card_exclusions WHERE status IN ('approved','demo')").all(),
      env.DB.prepare("SELECT * FROM card_benefits WHERE status IN ('approved','demo')").all()
    ]);
    const cards = (cardRows.results || []).map(fromDbCard);
    const byId = new Map(cards.map(card => [card.id, card]));
    for (const row of (ruleRows.results || [])) {
      const card = byId.get(row.card_id);
      if (!card) continue;
      try {
        const rule = JSON.parse(row.rule_json);
        card.rules.push({ id: row.id, ...rule, status: row.status, validFrom: row.valid_from, validTo: row.valid_to, sourceId: row.source_id || null });
      } catch { /* malformed rows are ignored; admin can repair their source draft */ }
    }
    for (const row of (exclusionRows.results || [])) {
      const card = byId.get(row.card_id);
      if (!card) continue;
      try {
        const exclusion = JSON.parse(row.exclusion_json);
        card.exclusions.push({ id: row.id, ...exclusion, status: row.status, validFrom: row.valid_from, validTo: row.valid_to, sourceId: row.source_id || null });
      } catch { /* malformed rows are ignored */ }
    }
    for (const row of (benefitRows.results || [])) {
      const card = byId.get(row.card_id);
      if (!card) continue;
      try {
        const benefit = JSON.parse(row.benefit_json);
        card.benefits.push({ id: row.id, ...benefit, status: row.status, validFrom: row.valid_from, validTo: row.valid_to, sourceId: row.source_id || null });
      } catch { /* malformed rows are ignored */ }
    }
    return cards;
  } catch (error) {
    console.error("D1 catalogue query failed:", error?.message || error);
    throw new Error("D1 catalogue query failed. Confirm the database ID and apply all migrations.");
  }
}

export async function getDrafts(env) {
  if (!env.DB) return [];
  const result = await env.DB.prepare("SELECT id, card_id, source_url, source_title, source_excerpt, extracted_json, status, created_at FROM extraction_drafts WHERE status = 'needs_review' ORDER BY created_at DESC LIMIT 200").all();
  const uniqueRows = deduplicatePendingDraftRows(result.results || []);
  return uniqueRows.slice(0, 100).map(row => ({
    id: row.id, cardId: row.card_id, sourceUrl: row.source_url, sourceTitle: row.source_title,
    sourceExcerpt: row.source_excerpt, extractedJson: row.extracted_json, status: row.status, createdAt: row.created_at
  }));
}
