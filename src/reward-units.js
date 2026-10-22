const CURRENCY_UNITS = /^(?:₹|inr|rs\.?|rupees?)$/i;

export function isSpendCurrencyUnit(value) {
  return CURRENCY_UNITS.test(String(value || "").trim().replace(/\s+/g, ""));
}

export function normalizeRewardUnit(unit, rewardCurrency) {
  const current = String(unit || "").trim();
  const reward = String(rewardCurrency || "").trim();
  if (!current || !isSpendCurrencyUnit(current)) return current;
  if (!reward || isSpendCurrencyUnit(reward)) return current;
  return reward;
}

function appendReviewNote(existing, note) {
  const notes = String(existing || "").trim();
  return [notes, note].filter(Boolean).join(" ");
}

export function normalizeDraftRewardUnits(data) {
  if (!data || typeof data !== "object" || !Array.isArray(data.rules)) return data;
  const rewardCurrency = String(data.rewardCurrency || "").trim();
  if (!rewardCurrency || isSpendCurrencyUnit(rewardCurrency)) return data;

  for (const rule of data.rules) {
    if (!rule || typeof rule !== "object") continue;
    const current = String(rule.unit || "").trim();
    const normalized = normalizeRewardUnit(current, rewardCurrency);
    if (normalized && normalized !== current) {
      rule.unit = normalized;
      const note = 'The extracted unit "' + current + '" was interpreted as the spend currency, not the reward unit. It was normalized to "' + normalized + '" from rewardCurrency; verify this against the quoted issuer terms before publishing.';
      rule.notes = appendReviewNote(rule.notes, note);
    }
  }
  return data;
}
