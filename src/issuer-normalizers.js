const BASE_RATE_PATTERN = /5\s*(?:reward\s*)?points?\s+(?:for\s+every|on\s+every|per)\s*(?:₹|rs\.?\s*|inr\s*)?200\s*(?:spent|spends)?(?:\s*\(?\s*on\s+retail\s+spends?\s*\)?)?/i;
const ACCELERATED_PATTERN = /\b(?:5\s*[x×]|accelerated reward|select merchants?|select brands?|smartbuy|myntra|nykaa|reliance digital|marks\s*(?:&|and)\s*spencer)\b/i;
const BASE_CONTINUATION_PATTERN = /\bbase reward points?\b.{0,140}\b(?:continue|not eligible|as is|no capping)\b/i;

function officialSourceSections(sourceText, fallbackUrl) {
  const sections = [];
  const pattern = /OFFICIAL SOURCE\s+\d+\s*\nTITLE:\s*([^\n]+)\s*\nURL:\s*(https:\/\/[^\s]+)\s*\nSOURCE TEXT START\s*\n([\s\S]*?)\s*\nSOURCE TEXT END/g;
  for (const match of String(sourceText || "").matchAll(pattern)) {
    sections.push({ title: match[1].trim(), url: match[2].trim(), text: match[3] });
  }
  if (!sections.length && String(sourceText || "").trim()) {
    sections.push({ title: "Official issuer source", url: fallbackUrl || "", text: String(sourceText) });
  }
  return sections;
}

function quoteForMatch(text, match) {
  if (!match || match.index == null) return null;
  const start = match.index;
  const end = start + match[0].length;
  // Use the exact contiguous source text matched by the numeric reward expression.
  return String(text).slice(start, end).replace(/\s+/g, " ").trim();
}

function findBaseRateEvidence(sourceText, fallbackUrl) {
  const sections = officialSourceSections(sourceText, fallbackUrl);
  const matches = [];
  for (const section of sections) {
    const match = BASE_RATE_PATTERN.exec(section.text);
    if (!match) continue;
    const sectionHasCurrentEffectiveDate = /effective\s+(?:from\s+)?(?:15(?:st|th)?\s+may\s*,?\s*2026|may\s+15,?\s*2026)/i.test(section.text);
    const hasRetailWording = /\bretail\s+spends?\b/i.test(section.text);
    matches.push({
      sourceUrl: section.url || fallbackUrl || null,
      sourceTitle: section.title,
      sourceQuote: quoteForMatch(section.text, match),
      text: section.text,
      score: (sectionHasCurrentEffectiveDate ? 100 : 0) + (hasRetailWording ? 10 : 0)
    });
  }
  matches.sort((a, b) => b.score - a.score);
  return matches[0] || null;
}

function addMissingItem(data, item) {
  if (!Array.isArray(data.missingItems)) data.missingItems = [];
  if (!data.missingItems.includes(item)) data.missingItems.push(item);
}

function addBenefitFromRule(data, rule, sourceText, fallbackUrl, description) {
  if (!Array.isArray(data.benefits)) data.benefits = [];
  const quote = String(rule.sourceQuote || "").trim();
  if (!quote) return;
  if (data.benefits.some(benefit => String(benefit.sourceQuote || "").trim() === quote)) return;
  const sections = officialSourceSections(sourceText, fallbackUrl);
  const source = sections.find(section => quote && section.text.includes(quote));
  data.benefits.push({
    name: "Accelerated select-merchant reward offer — review conditions",
    description: description || String(rule.notes || "The source describes an accelerated reward multiplier, not a standalone base earning rate. Verify the absolute rate, eligible merchants, minimum transaction and monthly cap before using it in calculations."),
    conditions: "Do not calculate this as a base rate. Confirm the current multiplier formula, merchant/channel eligibility, minimum transaction and monthly cap in the linked issuer terms.",
    sourceQuote: quote,
    sourceUrl: rule.sourceUrl || source?.url || fallbackUrl || null
  });
}

export function normalizeHdfcRegaliaExtraction(data, context = {}) {
  if (!data || typeof data !== "object") return data;
  const issuer = String(context.issuer || data.issuer || "").toLowerCase();
  const cardName = String(context.cardName || data.cardName || "").toLowerCase();
  if (!issuer.includes("hdfc") || !cardName.includes("regalia") || !cardName.includes("gold")) return data;
  if (!Array.isArray(data.rules)) data.rules = [];
  if (!Array.isArray(data.benefits)) data.benefits = [];

  const sourceText = String(context.sourceText || "");
  const fallbackUrl = String(context.sourceUrl || "");
  const evidence = findBaseRateEvidence(sourceText, fallbackUrl);

  const kept = [];
  let explicitBaseRule = null;
  let movedAccelerated = false;
  const evidenceEffectiveDate = evidence && /effective\s+(?:from\s+)?(?:15(?:st|th)?\s+may\s*,?\s*2026|may\s+15,?\s*2026)/i.test(evidence.text)
    ? "2026-05-15"
    : null;
  for (const rule of data.rules) {
    const detail = String(rule.sourceQuote || "") + " " + String(rule.notes || "");
    const sourceQuote = String(rule.sourceQuote || "");
    // A base-point continuation sentence can mention "5X" as context, but is not
    // itself an accelerated earning rule. Handle that prose before testing the 5X marker.
    if (BASE_CONTINUATION_PATTERN.test(detail) && !BASE_RATE_PATTERN.test(sourceQuote)) {
      continue;
    }
    if (ACCELERATED_PATTERN.test(sourceQuote) || (!sourceQuote && ACCELERATED_PATTERN.test(detail))) {
      addBenefitFromRule(
        data,
        rule,
        sourceText,
        fallbackUrl,
        "The issuer source describes 5X rewards at selected merchants. The extracted per-rupee values were not retained as a calculator rule because the multiplier, base rate and cap need to be interpreted together."
      );
      movedAccelerated = true;
      continue;
    }
    if (BASE_RATE_PATTERN.test(sourceQuote)) {
      explicitBaseRule = {
        ...rule,
        category: "general",
        rate: 5,
        perAmount: 200,
        unit: "Reward Points",
        validFrom: evidenceEffectiveDate || rule.validFrom || data.effectiveDate || null,
        validTo: null,
        sourceQuote: quoteForMatch(sourceQuote, BASE_RATE_PATTERN.exec(sourceQuote)),
        sourceUrl: rule.sourceUrl || evidence?.sourceUrl || fallbackUrl || null,
        notes: [
          "Verified base retail reward rate: 5 Reward Points per ₹200, effective 15 May 2026.",
          /50[, ]?000/.test(sourceText) && /statement cycle/i.test(sourceText)
            ? "The issuer also states a 50,000 Reward Point statement-cycle maximum. This per-transaction estimate cannot account for points already accrued in the cycle."
            : ""
        ].filter(Boolean).join(" ")
      };
      continue;
    }
    // Discard only the known malformed fallback artifacts that have a currency-denominator
    // unit but no traceable numeric source denominator; leave other quoted categories intact.
    if (rule.category === "other" &&
        Number(rule.perAmount) === 1 &&
        (/\bbase reward points?\b/i.test(detail) || !/\b(?:per|every|each)\s*(?:₹|rs\.?\s*|inr\s*)?\s*\d/i.test(sourceQuote))) {
      continue;
    }
    kept.push(rule);
  }

  if (evidence) {
    const baseRule = explicitBaseRule || {
      category: "general",
      rate: 5,
      perAmount: 200,
      unit: "Reward Points",
      minTransaction: null,
      cap: null,
      rounding: "down",
      validFrom: evidenceEffectiveDate || data.effectiveDate || null,
      validTo: null,
      sourceQuote: evidence.sourceQuote,
      sourceUrl: evidence.sourceUrl,
      notes: [
        "Verified base retail reward rate extracted from the official issuer source; effective 15 May 2026.",
        /50[, ]?000/.test(sourceText) && /statement cycle/i.test(sourceText)
          ? "The issuer also states a 50,000 Reward Point statement-cycle maximum. This per-transaction estimate cannot account for points already accrued in the cycle."
          : ""
      ].filter(Boolean).join(" ")
    };
    data.rules = [baseRule, ...kept.filter(rule => !(rule.category === "general" && Number(rule.rate) === 5 && Number(rule.perAmount) === 200))];
    data.effectiveDate = data.effectiveDate || evidenceEffectiveDate || null;
    if (movedAccelerated) {
      addMissingItem(data, "The 5X selected-merchant offer was retained as a benefit, not a generic calculator rule. Verify the absolute accelerated rate and monthly cap against current issuer terms before adding a separate rule.");
    }
    return data;
  }

  // No official text with the current base rate means we must not silently invent it.
  data.rules = kept;
  addMissingItem(data, "Could not verify the current Regalia Gold base rate from the supplied source text. Include the official terms containing '5 Reward Points for every ₹200 spends' before publishing the base rate.");
  return data;
}
