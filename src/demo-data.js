/*
 * Demonstration records only. Rules below are intentionally marked "demo" and
 * must not be treated as issuer-confirmed until reviewed in the admin workflow.
 */
export const DEMO_CARDS = [
  {
    id: "axis-horizon",
    issuer: "Axis Bank",
    name: "Horizon Credit Card",
    network: "Visa / Mastercard",
    rewardCurrency: "EDGE Miles",
    annualFee: null,
    annualFeeWaiver: null,
    description: "Travel-focused card. Verify current card variant and applicable issuer terms before relying on an estimate.",
    officialUrl: "https://www.axisbank.com/docs/default-source/ld/terms-and-conditions-for-horizon-credit-card.pdf",
    reviewStatus: "needs_review",
    sourceDate: "Official terms PDF; confirm latest revision",
    rules: [
      { id: "ax-horizon-airline", category: "airline_direct", rate: 5, perAmount: 100, unit: "EDGE Miles", minTransaction: 0, rounding: "down", status: "demo", notes: "Illustrative reading of the official Horizon terms; verify the currently applicable version." },
      { id: "ax-horizon-edge", category: "travel_edge", rate: 5, perAmount: 100, unit: "EDGE Miles", minTransaction: 0, rounding: "down", status: "demo", notes: "Illustrative rate; verify the currently applicable version." },
      { id: "ax-horizon-ota", category: "travel_agency", rate: 2, perAmount: 100, unit: "EDGE Miles", minTransaction: 0, rounding: "down", status: "demo", notes: "Travel agency / OTA rate shown in the referenced terms; verify transaction MCC." },
      { id: "ax-horizon-base", category: "general", rate: 2, perAmount: 100, unit: "EDGE Miles", minTransaction: 0, rounding: "down", status: "demo", notes: "Illustrative base earn rate; verify current rules and posting calculations." }
    ],
    exclusions: [
      { category: "transport_tolls", reason: "Excluded category in referenced terms; confirm current MCC mapping.", status: "demo" },
      { category: "utilities", reason: "Excluded category in referenced terms; confirm current MCC mapping.", status: "demo" },
      { category: "insurance", reason: "Excluded category in referenced terms; confirm current MCC mapping.", status: "demo" },
      { category: "education", reason: "Excluded category in referenced terms; confirm current MCC mapping.", status: "demo" },
      { category: "government", reason: "Excluded category in referenced terms; confirm current MCC mapping.", status: "demo" },
      { category: "wallet", reason: "Excluded category in referenced terms; confirm current MCC mapping.", status: "demo" },
      { category: "rent", reason: "Excluded category in referenced terms; confirm current MCC mapping.", status: "demo" },
      { category: "fuel", reason: "Excluded category in referenced terms; confirm current MCC mapping.", status: "demo" }
    ]
  },
  {
    id: "hdfc-regalia-gold",
    issuer: "HDFC Bank",
    name: "Regalia Gold Credit Card",
    network: "Visa / Mastercard",
    rewardCurrency: "Reward Points",
    annualFee: null,
    annualFeeWaiver: null,
    description: "Premium rewards card. Redemption value and accelerated earn rules depend on the applicable terms and redemption route.",
    officialUrl: "https://www.hdfcbank.com/content/bbp/repositories/723fb80a-2dde-42a3-9793-7ae1be57c87f/?path=%2FPersonal%2FPay%2FCards%2FCredit+Card%2FCredit+Card+Landing+Page%2FCredit+Cards%2FSuper+Premium%2FRegalia+Gold+Credit+Card%2FWebpage-content-T-and-Cs.pdf",
    reviewStatus: "needs_review",
    sourceDate: "Official terms PDF; confirm latest revision",
    rules: [
      { id: "hdfc-regalia-gold-base", category: "general", rate: 4, perAmount: 150, unit: "Reward Points", minTransaction: 150, rounding: "down", status: "demo", notes: "Base reward rate example. Validate eligible transaction types, minimums, rounding and all applicable exclusions." }
    ],
    exclusions: []
  },
  {
    id: "icici-sapphiro",
    issuer: "ICICI Bank",
    name: "Sapphiro Credit Card",
    network: "Visa / Mastercard / Amex (variant-dependent)",
    rewardCurrency: "Reward Points",
    annualFee: null,
    annualFeeWaiver: null,
    description: "Added to the initial catalogue. Reward rates and exclusions still need to be extracted from the correct card-variant terms and verified.",
    officialUrl: "https://www.icicibank.com/personal-banking/cards/credit-card/sapphiro-card",
    reviewStatus: "no_verified_rules",
    sourceDate: "Product page; reward terms not yet reviewed",
    rules: [],
    exclusions: []
  }
];
