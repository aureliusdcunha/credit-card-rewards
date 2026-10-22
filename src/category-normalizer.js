export const CATEGORIES = [
  "general", "airline_direct", "travel_edge", "travel_agency", "hotel_direct", "travel_portal",
  "groceries", "dining", "online_shopping", "utilities", "insurance", "education", "government",
  "wallet", "rent", "fuel", "transport_tolls", "emi", "jewellery", "cash_advance", "international",
  "domestic", "other"
];

const CATEGORY_ALIASES = {
  // Flight rewards are normalized to the app's direct-airline category. A note is added
  // to the draft so the reviewer can confirm that the issuer's booking channel matches.
  flight: "airline_direct",
  flights: "airline_direct",
  airfare: "airline_direct",
  airfares: "airline_direct",
  airlines: "airline_direct",
  airline: "airline_direct",
  airline_booking: "airline_direct",
  flight_booking: "airline_direct",
  flight_bookings: "airline_direct",
  direct_flight: "airline_direct",
  direct_flights: "airline_direct",
  direct_airline: "airline_direct",
  air_travel: "airline_direct",

  travel_edge_portal: "travel_edge",
  travel_edge: "travel_edge",
  travel_agent: "travel_agency",
  travel_agents: "travel_agency",
  travel_agencies: "travel_agency",
  travel_agency_booking: "travel_agency",
  online_travel_portal: "travel_portal",
  travel_website: "travel_portal",
  travel_portals: "travel_portal",

  hotel: "hotel_direct",
  hotels: "hotel_direct",
  hotel_booking: "hotel_direct",
  hotel_bookings: "hotel_direct",
  direct_hotel: "hotel_direct",
  accommodation: "hotel_direct",

  restaurant: "dining",
  restaurants: "dining",
  food: "dining",
  food_delivery: "dining",
  dining_and_restaurants: "dining",

  shopping: "online_shopping",
  ecommerce: "online_shopping",
  e_commerce: "online_shopping",
  online: "online_shopping",
  online_retail: "online_shopping",

  grocery: "groceries",
  supermarket: "groceries",
  supermarkets: "groceries",

  utility: "utilities",
  utility_bills: "utilities",
  electricity: "utilities",
  telecom: "utilities",
  mobile_recharge: "utilities",
  broadband: "utilities",

  toll: "transport_tolls",
  tolls: "transport_tolls",
  road_tolls: "transport_tolls",

  insurance_payments: "insurance",
  education_fees: "education",
  educational_institutions: "education",
  government_payments: "government",
  government_transactions: "government",
  wallet_load: "wallet",
  wallet_loads: "wallet",
  rent_payment: "rent",
  rent_payments: "rent",
  fuel_purchases: "fuel",
  emi_transactions: "emi",
  jewelry: "jewellery",
  cash_advances: "cash_advance",
  domestic_spend: "domestic",
  domestic_spends: "domestic",
  international_spend: "international",
  international_spends: "international",
  general_spend: "general",
  general_spends: "general"
};

export function normalizeCategory(value) {
  const original = String(value ?? "").trim();
  if (!original) return original;
  const key = original.toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (CATEGORIES.includes(key)) return key;
  return CATEGORY_ALIASES[key] || original;
}

function addReviewNote(existing, message) {
  return [String(existing || "").trim(), message].filter(Boolean).join(" ");
}

export function explicitPerAmountFromQuote(sourceQuote) {
  const quote = String(sourceQuote || "").replace(/\s+/g, " ").trim();
  if (!quote) return null;

  const amountPattern = "([0-9][0-9,]*(?:\\.[0-9]+)?)";
  const currencyPrefix = "(?:₹|rs\\.?|inr|rupees?)\\s*";
  const currencySuffix = "\\s*(?:₹|rs\\.?|inr|rupees?)";
  const basisLead = "(?:per|for each|for every|on every|every)";
  const spendWords = "(?:of\\s+)?(?:eligible\\s+)?(?:retail\\s+)?(?:spend|spends|spent|purchase value|purchase amount|transaction amount|transactions?)\\b";

  // Most issuers state a spend denominator with "per/every ₹100" or "per 100 INR".
  // Also accept slash notation such as "5 points / ₹100 spent" and constructions
  // such as "5 points for ₹100 spent". The match must have a currency marker or an
  // explicit spend-unit phrase; a bare number is never sufficient evidence.
  const patterns = [
    new RegExp(basisLead + "\\s*" + currencyPrefix + amountPattern, "i"),
    new RegExp(basisLead + "\\s*" + amountPattern + currencySuffix, "i"),
    new RegExp("(?:/|÷)\\s*" + currencyPrefix + amountPattern, "i"),
    new RegExp("(?:/|÷)\\s*" + amountPattern + currencySuffix, "i"),
    new RegExp("(?:for|on)\\s*" + currencyPrefix + amountPattern + "\\s*" + spendWords, "i"),
    new RegExp("(?:for|on)\\s*" + amountPattern + currencySuffix + "\\s*" + spendWords, "i"),
    new RegExp(basisLead + "\\s*" + amountPattern + "\\s+(?:(?:rupees?|inr|rs\\.?)\\s+)?"+ spendWords, "i")
  ];

  for (const pattern of patterns) {
    const match = quote.match(pattern);
    if (!match) continue;
    const amount = Number(String(match[1]).replace(/,/g, ""));
    if (Number.isFinite(amount) && amount > 0) return amount;
  }
  return null;
}

export function sanitizeIncompleteEarningRules(data) {
  if (!data || typeof data !== "object" || !Array.isArray(data.rules)) return data;
  if (!Array.isArray(data.missingItems)) data.missingItems = [];
  if (!Array.isArray(data.benefits)) data.benefits = [];

  const completeRules = [];
  for (const rule of data.rules) {
    if (!rule || typeof rule !== "object") continue;
    const rate = rule.rate;
    const perAmount = rule.perAmount;
    const hasRate = rate !== null && rate !== undefined && rate !== "" &&
      Number.isFinite(Number(rate)) && Number(rate) >= 0;
    const hasPerAmount = perAmount !== null && perAmount !== undefined && perAmount !== "" &&
      Number.isFinite(Number(perAmount)) && Number(perAmount) > 0;
    const hasUnit = Boolean(String(rule.unit || "").trim());

    if (hasRate && hasPerAmount && hasUnit) {
      completeRules.push(rule);
      continue;
    }

    const quote = String(rule.sourceQuote || "").trim();
    const missingFields = [
      !hasRate ? "a numeric reward rate" : null,
      !hasPerAmount ? "a positive spend denominator (perAmount)" : null,
      !hasUnit ? "a reward unit" : null
    ].filter(Boolean);
    const quoteLabel = quote ? ` Source quote: "${quote}".` : "";
    const missingMessage = `Incomplete earning claim omitted from calculator rules because it lacks ${missingFields.join(", ")}.${quoteLabel} Verify the issuer's current terms before adding it as a calculable rule.`;
    if (!data.missingItems.includes(missingMessage)) data.missingItems.push(missingMessage);

    // Preserve an unquantified statement for human review without allowing it into
    // the numeric rewards engine as if it were a complete earning rule.
    if (quote && !data.benefits.some(benefit => String(benefit?.sourceQuote || "").trim() === quote)) {
      data.benefits.push({
        name: "Unquantified reward claim — review required",
        description: String(rule.notes || "The source mentions a reward or multiplier but does not provide all numeric fields needed for calculation. Do not use this as an earning rule until the current terms give a complete rate."),
        conditions: "Confirm the eligible purchase channel, multiplier basis, reward unit, and any daily or monthly cap.",
        sourceQuote: quote
      });
    }
  }
  data.rules = completeRules;
  return data;
}

export function normalizeDraftCategories(data) {
  if (!data || typeof data !== "object") return data;

  if (Array.isArray(data.rules)) {
    for (const rule of data.rules) {
      if (!rule || typeof rule !== "object") continue;

      // Recover the spend denominator only when the verbatim quote explicitly states it.
      // Never replace zero/missing values with an arbitrary default.
      const currentPerAmount = Number(rule.perAmount);
      if ((!Number.isFinite(currentPerAmount) || currentPerAmount <= 0) && rule.sourceQuote) {
        const quotedPerAmount = explicitPerAmountFromQuote(rule.sourceQuote);
        if (quotedPerAmount != null) {
          rule.perAmount = quotedPerAmount;
          rule.notes = addReviewNote(
            rule.notes,
            `perAmount was set to ${quotedPerAmount} because the source quote explicitly states this spend basis. Verify the basis against the issuer terms before publishing.`
          );
        }
      }

      const original = String(rule.category ?? "").trim();
      const normalized = normalizeCategory(original);
      if (normalized !== original && CATEGORIES.includes(normalized)) {
        rule.category = normalized;
        rule.notes = addReviewNote(
          rule.notes,
          `Category "${original}" was normalized to "${normalized}". Verify that the issuer's booking channel and eligibility conditions support this mapping before publishing.`
        );
      }

      if (rule.cap && typeof rule.cap === "object" && rule.cap.overCapCategory) {
        const originalOverCap = String(rule.cap.overCapCategory).trim();
        const normalizedOverCap = normalizeCategory(originalOverCap);
        if (normalizedOverCap !== originalOverCap && CATEGORIES.includes(normalizedOverCap)) {
          rule.cap.overCapCategory = normalizedOverCap;
          rule.notes = addReviewNote(
            rule.notes,
            `Over-cap category "${originalOverCap}" was normalized to "${normalizedOverCap}"; verify the source terms before publishing.`
          );
        }
      }
    }
  }

  if (Array.isArray(data.exclusions)) {
    for (const exclusion of data.exclusions) {
      if (!exclusion || typeof exclusion !== "object") continue;
      const original = String(exclusion.category ?? "").trim();
      const normalized = normalizeCategory(original);
      if (normalized !== original && (CATEGORIES.includes(normalized) || normalized === "all")) {
        exclusion.category = normalized;
        exclusion.reason = addReviewNote(
          exclusion.reason,
          `Source category "${original}" was normalized to "${normalized}"; verify that the issuer's exclusion applies to this category.`
        );
      }
    }
  }

  return data;
}
