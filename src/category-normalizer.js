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

export function normalizeDraftCategories(data) {
  if (!data || typeof data !== "object") return data;

  if (Array.isArray(data.rules)) {
    for (const rule of data.rules) {
      if (!rule || typeof rule !== "object") continue;
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
