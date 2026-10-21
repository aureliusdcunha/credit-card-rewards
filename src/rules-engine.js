const roundDown = (n) => Math.floor(Number(n) + Number.EPSILON);
const roundRewards = (value, mode = "down") => {
  const n = Number(value);
  if (mode === "nearest") return Math.round(n);
  if (mode === "exact") return Math.round(n * 10000) / 10000;
  return roundDown(n);
};
const numeric = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function calculateRewards({ card, amount, category, purchaseDate, periodSpendBefore = 0, periodPointsBefore = 0 }) {
  const spend = numeric(amount, -1);
  const priorSpend = Math.max(0, numeric(periodSpendBefore, 0));
  const priorPoints = Math.max(0, numeric(periodPointsBefore, 0));
  if (!card) return { ok: false, error: "Select a credit card." };
  if (!Number.isFinite(spend) || spend <= 0) return { ok: false, error: "Enter a transaction amount greater than ₹0." };
  if (!category) return { ok: false, error: "Select a spending category." };

  const date = purchaseDate || new Date().toISOString().slice(0, 10);
  const eligibleRules = (card.rules || []).filter(rule => {
    const statusOk = ["approved", "demo"].includes(rule.status);
    const dateOk = (!rule.validFrom || rule.validFrom <= date) && (!rule.validTo || rule.validTo >= date);
    return statusOk && dateOk;
  });
  const eligibleExclusions = (card.exclusions || []).filter(ex => {
    const statusOk = ["approved", "demo"].includes(ex.status);
    const dateOk = (!ex.validFrom || ex.validFrom <= date) && (!ex.validTo || ex.validTo >= date);
    return statusOk && dateOk;
  });

  const exclusion = eligibleExclusions.find(ex => ex.category === category || ex.category === "all");
  if (exclusion) {
    const provisional = exclusion.status !== "approved";
    return {
      ok: true, excluded: true, cardId: card.id, cardName: card.name, amount: spend,
      points: 0, rewardUnit: card.rewardCurrency || "Rewards", valueINR: null,
      category, ruleStatus: provisional ? "demo" : "approved",
      explanation: exclusion.reason || "This category is marked as excluded by the selected rule.",
      notes: provisional ? ["This result uses unverified demonstration data. Confirm the current issuer terms."] : ["Eligibility can depend on the merchant category code (MCC) and the issuer's transaction classification."],
      sourceUrl: card.officialUrl || null
    };
  }

  const categoryRules = eligibleRules.filter(rule => rule.category === category).sort((a, b) => numeric(b.priority) - numeric(a.priority));
  const baseRules = eligibleRules.filter(rule => rule.category === "general").sort((a, b) => numeric(b.priority) - numeric(a.priority));
  let chosen = categoryRules[0];
  // An unverified general-rate example must not be assumed to cover named categories.
  if (!chosen && category !== "general" && card.reviewStatus !== "verified") {
    return {
      ok: true, unavailable: true, excluded: false, cardId: card.id, cardName: card.name,
      amount: spend, category, points: null, rewardUnit: card.rewardCurrency || "Rewards", valueINR: null,
      ruleStatus: "missing", explanation: "A category-specific or fully verified base rule is not available.",
      notes: ["The current catalogue has not verified that the card earns its general rate in this category. Import and review the current issuer terms before relying on an estimate."],
      sourceUrl: card.officialUrl || null
    };
  }
  if (!chosen) chosen = baseRules[0];
  if (!chosen) {
    return {
      ok: true, unavailable: true, excluded: false, cardId: card.id, cardName: card.name,
      amount: spend, category, points: null, rewardUnit: card.rewardCurrency || "Rewards", valueINR: null,
      ruleStatus: "missing", explanation: "No approved rule is available for this card and category.",
      notes: ["Add the official reward terms through Source Review, then approve the extracted rules."], sourceUrl: card.officialUrl || null
    };
  }

  const minTransaction = Math.max(0, numeric(chosen.minTransaction, 0));
  if (spend < minTransaction) {
    return {
      ok: true, excluded: true, cardId: card.id, cardName: card.name, amount: spend,
      points: 0, rewardUnit: chosen.unit || card.rewardCurrency || "Rewards", valueINR: null,
      category, ruleStatus: chosen.status, explanation: `The transaction is below this rule's minimum transaction amount of ₹${minTransaction.toLocaleString("en-IN")}.`,
      notes: chosen.status === "demo" ? ["This result uses unverified demonstration data; confirm the issuer's current minimum and rounding rules."] : [],
      sourceUrl: card.officialUrl || null
    };
  }

  const perAmount = numeric(chosen.perAmount, 0);
  const rate = numeric(chosen.rate, 0);
  if (perAmount <= 0 || rate < 0) {
    return { ok: false, error: "The selected rule has an invalid earning rate. Review its source before publishing." };
  }
  let eligibleAmount = spend;
  let capped = false;
  let capMessage = null;
  let overCapPoints = 0;
  const cap = chosen.cap || null;
  if (cap && cap.type === "spend" && Number.isFinite(Number(cap.value)) && Number(cap.value) >= 0) {
    const remaining = Math.max(0, Number(cap.value) - priorSpend);
    if (eligibleAmount > remaining) {
      eligibleAmount = remaining;
      capped = true;
      const overage = Math.max(0, spend - eligibleAmount);
      const overCapCategory = cap.overCapCategory || null;
      const fallback = overCapCategory ? eligibleRules.find(rule => rule.category === overCapCategory) : null;
      if (fallback && Number(fallback.perAmount) > 0 && Number(fallback.rate) >= 0) {
        overCapPoints = roundRewards((overage / Number(fallback.perAmount)) * Number(fallback.rate), fallback.rounding || "down");
        capMessage = `The configured ${cap.period || "period"} spend cap limits this rule to ₹${eligibleAmount.toLocaleString("en-IN")}; the over-cap ₹${overage.toLocaleString("en-IN")} uses the ${overCapCategory} rule.`;
      } else {
        capMessage = `The configured ${cap.period || "period"} spend cap limits this rule to ₹${eligibleAmount.toLocaleString("en-IN")}; no over-cap fallback rule is configured for the remaining ₹${overage.toLocaleString("en-IN")}.`;
      }
    }
  }
  let points = roundRewards((eligibleAmount / perAmount) * rate, chosen.rounding || "down") + overCapPoints;
  if (cap && cap.type === "points" && Number.isFinite(Number(cap.value))) {
    const remainingPoints = Math.max(0, Number(cap.value) - priorPoints);
    if (points > remainingPoints) {
      points = remainingPoints;
      capped = true;
      capMessage = `Reward points were limited by the configured ${cap.period || "period"} points cap.`;
    }
  }
  const ruleIsDemo = chosen.status !== "approved";
  const anyDemoExclusions = eligibleExclusions.some(ex => ex.status !== "approved");
  const notes = [];
  if (capMessage) notes.push(capMessage);
  if (ruleIsDemo || anyDemoExclusions || card.reviewStatus !== "verified") {
    notes.push("Provisional estimate: one or more rules for this card have not been fully verified. Check the linked official terms before making a payment decision.");
  }
  notes.push("Reward posting can differ because of rounding, transaction posting date, MCC classification, reversals, offers and issuer-specific rules.");

  return {
    ok: true, excluded: false, capped, cardId: card.id, cardName: card.name, amount: spend,
    eligibleAmount, points, rewardUnit: chosen.unit || card.rewardCurrency || "Rewards", valueINR: null,
    category, rate, perAmount, ruleStatus: ruleIsDemo ? "demo" : "approved",
    explanation: `${rate} ${chosen.unit || card.rewardCurrency || "rewards"} per ₹${perAmount} under the selected ${chosen.category === "general" ? "base" : "category-specific"} rule.`,
    notes, sourceUrl: card.officialUrl || null, sourceQuote: chosen.sourceQuote || null
  };
}
