import { normalizeRewardUnit } from "./reward-units.js";

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
  const conditionalRulesAvailable = (card.rules || []).some(rule =>
    rule && (rule.calculatorEligible === false || rule.merchantCondition || rule.channelCondition)
  );
  const eligibleRules = (card.rules || []).filter(rule => {
    const statusOk = ["approved", "demo"].includes(rule.status);
    const dateOk = (!rule.validFrom || rule.validFrom <= date) && (!rule.validTo || rule.validTo >= date);
    // Until the calculator has explicit merchant/channel inputs, never apply a
    // conditional accelerator to a generic category such as online shopping.
    const conditionCanBeMatched = rule.calculatorEligible !== false && !rule.merchantCondition && !rule.channelCondition;
    return statusOk && dateOk && conditionCanBeMatched;
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

  const byPriority = (a, b) => numeric(b.priority) - numeric(a.priority);
  const categoryRules = eligibleRules.filter(rule => rule.category === category).sort(byPriority);
  const baseRules = eligibleRules.filter(rule => rule.category === "general").sort(byPriority);
  let chosen = categoryRules[0];
  let fallbackKind = null;

  // Do not use a generic or geography-scoped rate for a named category unless the
  // card was reviewed and verified. Exact category rules always take precedence.
  if (!chosen && category !== "general" && card.reviewStatus !== "verified") {
    return {
      ok: true, unavailable: true, excluded: false, cardId: card.id, cardName: card.name,
      amount: spend, category, points: null, rewardUnit: card.rewardCurrency || "Rewards", valueINR: null,
      ruleStatus: "missing", explanation: "A category-specific or fully verified base rule is not available.",
      notes: ["The current catalogue has not verified that the card earns its general rate in this category. Import and review the current issuer terms before relying on an estimate."],
      sourceUrl: card.officialUrl || null
    };
  }

  if (!chosen && baseRules.length) {
    chosen = baseRules[0];
    fallbackKind = "general";
  }

  // Older/manual extractions sometimes label a quoted base rate as "other". Treat it
  // as a general fallback only when its quote explicitly describes other eligible spend,
  // not when "other" is being used as a merchant category.
  if (!chosen && card.reviewStatus === "verified") {
    const otherSpendRules = eligibleRules.filter(rule =>
      rule.category === "other" &&
      /\b(?:all\s+)?other\s+(?:eligible\s+)?(?:retail\s+)?(?:spend|spends|purchases|transactions)\b|\b(?:all\s+eligible\s+)?retail\s+(?:spend|spends|purchases|transactions)\b/i
        .test(String(rule.sourceQuote || "") + " " + String(rule.notes || ""))
    ).sort(byPriority);
    if (otherSpendRules.length) {
      chosen = otherSpendRules[0];
      fallbackKind = "other_spend";
    }
  }

  // Base reward rates are sometimes mislabelled during extraction under a merchant
  // category. For verified cards only, allow a cross-category fallback when the source
  // quote explicitly states a numeric rate basis on retail spend. Never promote bonus,
  // SmartBuy, partner-outlet or select-brand multipliers to a general rate.
  if (!chosen && card.reviewStatus === "verified") {
    const retailBaseRules = eligibleRules.filter(rule => {
      const detail = String(rule.sourceQuote || "") + " " + String(rule.notes || "");
      const statesRetailBasis = /\bretail\s+spends?\b/i.test(detail);
      const statesNumericSpendBasis =
        /\b(?:per|every|each)\s+(?:₹|rs\.?\s*|inr\s*)?\s*\d[\d,]*(?:\.\d+)?\b/i.test(detail) ||
        /\b\d[\d,]*(?:\.\d+)?\s*(?:₹|rs\.?|inr)\b/i.test(detail);
      const accelerated = /\b(?:accelerated|bonus|smartbuy|partner outlets?|select brands?|myntra|nykaa|reliance digital|\d\s*[x×]|multipliers?)\b/i.test(detail);
      const categorySpecific = /\b(?:specifically for|only on|only for|on|for|at|via|through)\s+(?:(?:all|other|eligible|domestic|international)\s+)?(?:dining|restaurants?|flights?|hotels?|airline|online shopping|grocery|groceries|fuel|rent|wallet|insurance|utilities|utility and insurance|education|domestic|international)\b/i.test(detail);
      const looksLikeGenericSpendBasis = statesRetailBasis ||
        (statesNumericSpendBasis && /\b(?:reward points?|points?|miles?)\b/i.test(detail) &&
         /\b(?:spent|spend|spends|purchases?)\b/i.test(detail) &&
         !categorySpecific);
      return rule.category !== "general" && looksLikeGenericSpendBasis && statesNumericSpendBasis && !accelerated;
    }).sort(byPriority);
    if (retailBaseRules.length) {
      chosen = retailBaseRules[0];
      fallbackKind = "retail_base";
    }
  }

  // Domestic/international are spend geography, not merchant categories. This app
  // currently has one category selector, so for a verified Indian card with no exact
  // merchant/general rule we use its domestic base as an explicitly caveated fallback.
  // An exact international rule (above) still wins whenever the user selects it.
  if (!chosen && card.reviewStatus === "verified" && category !== "international") {
    const domesticRules = eligibleRules.filter(rule => rule.category === "domestic").sort(byPriority);
    if (domesticRules.length) {
      chosen = domesticRules[0];
      fallbackKind = "domestic";
    }
  }

  if (!chosen) {
    // If all approved/demo rules are outside the requested transaction date, say so
    // explicitly rather than describing this as a missing category rule.
    const dateScopedRules = (card.rules || []).filter(rule => ["approved", "demo"].includes(rule.status));
    const futureRules = dateScopedRules.filter(rule => rule.validFrom && rule.validFrom > date);
    const expiredRules = dateScopedRules.filter(rule => rule.validTo && rule.validTo < date);
    if (eligibleRules.length === 0 && dateScopedRules.length > 0 && (futureRules.length || expiredRules.length)) {
      const firstFuture = futureRules.map(rule => String(rule.validFrom)).filter(Boolean).sort()[0] || null;
      const lastExpired = expiredRules.map(rule => String(rule.validTo)).filter(Boolean).sort().slice(-1)[0] || null;
      const explanation = firstFuture && firstFuture > date
        ? `The selected transaction date (${date}) is before the available rules become effective (${firstFuture}). Select a date on or after ${firstFuture}, or correct the rules' effective dates if the issuer terms support an earlier date.`
        : `The selected transaction date (${date}) is after the available rules expired (${lastExpired}). Review the current issuer terms before calculating this historical transaction.`;
      return {
        ok: true, unavailable: true, excluded: false, cardId: card.id, cardName: card.name,
        amount: spend, category, points: null, rewardUnit: card.rewardCurrency || "Rewards", valueINR: null,
        ruleStatus: "date_mismatch", explanation,
        notes: ["The calculator does not apply rules outside their configured validity period. Missing effective dates default to the date the reviewed rules were published; adjust them only when the issuer's effective date is confirmed."],
        sourceUrl: card.officialUrl || null,
        selectedDate: date,
        firstFutureEffectiveDate: firstFuture,
        lastExpiredDate: lastExpired
      };
    }
    const ruleDiagnostics = dateScopedRules.map(rule => ({
      category: rule.category || null,
      status: rule.status || null,
      rate: rule.rate ?? null,
      perAmount: rule.perAmount ?? null,
      unit: normalizeRewardUnit(rule.unit, card.rewardCurrency) || rule.unit || null,
      validFrom: rule.validFrom || null,
      validTo: rule.validTo || null,
      sourceQuote: String(rule.sourceQuote || "").slice(0, 220),
      notes: String(rule.notes || "").slice(0, 180)
    }));
    return {
      ok: true, unavailable: true, excluded: false, cardId: card.id, cardName: card.name,
      amount: spend, category, points: null, rewardUnit: card.rewardCurrency || "Rewards", valueINR: null,
      ruleStatus: "missing",
      explanation: "No exact-category rule or verified fallback rule is available for this card and category.",
      notes: ["No source-quoted base rate matched the fallback rules. Inspect the saved rule categories, units, validity dates and source quotes; do not treat accelerated multipliers as base rates."],
      sourceUrl: card.officialUrl || null,
      cardReviewStatus: card.reviewStatus || "unknown",
      selectedDate: date,
      selectedCategory: category,
      ruleDiagnostics
    };
  }

  const selectedUnit = normalizeRewardUnit(chosen.unit, card.rewardCurrency) || card.rewardCurrency || "Rewards";
  const minTransaction = Math.max(0, numeric(chosen.minTransaction, 0));
  if (spend < minTransaction) {
    return {
      ok: true, excluded: true, cardId: card.id, cardName: card.name, amount: spend,
      points: 0, rewardUnit: selectedUnit, valueINR: null,
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
      const overCapCategory = cap.overCapCategory || null;
      const fallback = overCapCategory
        ? eligibleRules.find(rule => rule.category === overCapCategory && Number(rule.perAmount) > 0 && Number(rule.rate) >= 0)
        : null;
      if (fallback && perAmount > 0 && rate > 0) {
        // If a points cap explicitly defines an over-cap category, split this
        // transaction at the spend amount that uses the remaining accelerated
        // points and award the base rule on the remaining spend.
        const acceleratedSpend = Math.min(eligibleAmount, (remainingPoints / rate) * perAmount);
        const acceleratedPoints = roundRewards((acceleratedSpend / perAmount) * rate, chosen.rounding || "down");
        const overageSpend = Math.max(0, eligibleAmount - acceleratedSpend);
        const basePoints = roundRewards((overageSpend / Number(fallback.perAmount)) * Number(fallback.rate), fallback.rounding || "down");
        points = Math.min(remainingPoints, acceleratedPoints) + basePoints;
        capped = true;
        capMessage = `The ${String(cap.period || "period").replace(/_/g, " ")} accelerated-points cap limits this rule to ${remainingPoints.toLocaleString("en-IN")} more accelerated points; the remaining ${overageSpend.toLocaleString("en-IN")} of eligible spend uses the ${overCapCategory} rate. Enter the prior points balance accumulated across the shared cap categories.`;
      } else {
        points = remainingPoints;
        capped = true;
        capMessage = `Reward points were limited by the configured ${cap.period || "period"} points cap.`;
      }
    }
  }
  const ruleIsDemo = chosen.status !== "approved";
  const anyDemoExclusions = eligibleExclusions.some(ex => ex.status !== "approved");
  const notes = [];
  if (capMessage) notes.push(capMessage);
  if (fallbackKind === "other_spend") {
    notes.push("No exact-category rule was found; a verified rule quoted for 'other eligible spend' was used as the fallback. Confirm that the issuer's wording covers this merchant category.");
  } else if (fallbackKind === "retail_base") {
    notes.push("No exact-category rule was found; a reviewed base rate explicitly quoted for retail spends was used as the fallback. Verify that the purchase qualifies as eligible retail spend and is not excluded by merchant category code or issuer transaction rules.");
  } else if (fallbackKind === "domestic") {
    notes.push("No exact-category or general rule was found; a verified domestic-spend rate was used as a fallback. This assumes the transaction is domestic; this page does not separately ask for transaction geography.");
  } else if (fallbackKind === "general" && category !== "general") {
    notes.push("No exact-category rule was found; the card's verified general eligible-spend rate was used.");
  }
  if (ruleIsDemo || anyDemoExclusions || card.reviewStatus !== "verified") {
    notes.push("Provisional estimate: one or more rules for this card have not been fully verified. Check the linked official terms before making a payment decision.");
  }
  if (conditionalRulesAvailable) {
    notes.push("This card has separate merchant-/channel-specific accelerated rules in its details. They are not applied automatically because the calculator does not ask for an exact merchant and channel; check the rule evidence before relying on this base estimate.");
  }
  notes.push("Reward posting can differ because of rounding, transaction posting date, MCC classification, reversals, offers and issuer-specific rules.");

  const ruleDescription = fallbackKind === "retail_base"
    ? "base retail-spend fallback"
    : fallbackKind === "other_spend"
      ? "other-eligible-spend fallback"
      : fallbackKind === "domestic"
        ? "domestic-spend fallback"
        : fallbackKind === "general" || chosen.category === "general" ? "base" : "category-specific";
  return {
    ok: true, excluded: false, capped, cardId: card.id, cardName: card.name, amount: spend,
    eligibleAmount, points, rewardUnit: selectedUnit, valueINR: null,
    category, rate, perAmount, ruleStatus: ruleIsDemo ? "demo" : "approved",
    explanation: `${rate} ${selectedUnit} per ₹${perAmount} under the selected ${ruleDescription} rule.`,
    notes, sourceUrl: card.officialUrl || null, sourceQuote: chosen.sourceQuote || null
  };
}
