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


function findOfficialFact(sourceText, regex) {
  for (const section of officialSourceSections(sourceText, "")) {
    const match = regex.exec(section.text);
    if (match) {
      return {
        text: section.text,
        url: section.url || null,
        title: section.title,
        quote: String(match[0] || "").replace(/\s+/g, " ").trim()
      };
    }
  }
  return null;
}

function upsertBenefit(data, benefit) {
  if (!Array.isArray(data.benefits)) data.benefits = [];
  const same = data.benefits.findIndex(existing =>
    String(existing.name || "").trim().toLowerCase() === String(benefit.name || "").trim().toLowerCase()
  );
  if (same >= 0) {
    const existing = data.benefits[same];
    data.benefits[same] = {
      ...existing,
      ...benefit,
      conditions: benefit.conditions || existing.conditions || null,
      sourceQuote: benefit.sourceQuote || existing.sourceQuote || null,
      sourceUrl: benefit.sourceUrl || existing.sourceUrl || null,
      validFrom: benefit.validFrom || existing.validFrom || null,
      validTo: benefit.validTo || existing.validTo || null
    };
    return;
  }
  data.benefits.push(benefit);
}

function enrichHdfcRegaliaFeesAndLounge(data, sourceText) {
  const sections = officialSourceSections(sourceText, "");
  if (!sections.length) return data;

  const joiningFact = findOfficialFact(
    sourceText,
    /Joining\s+Fee\s*:\s*(?:₹|Rs\.?\s*)?2,?500\s*(?:plus|\\+)\s*(?:Applicable\s+)?Taxes?/i
  );
  const annualFact = findOfficialFact(
    sourceText,
    /(?:Renewal|Annual|Membership)\s+Fee\s*:\s*(?:₹|Rs\.?\s*)?2,?500\s*(?:plus|\\+)\s*(?:Applicable\s+)?Taxes?/i
  );
  const feeWaiverFact = findOfficialFact(
    sourceText,
    /(?:spend|spends)\s*(?:of\s*)?(?:₹|Rs\.?\s*)?4,00,000.{0,180}(?:waiv|renewal fee|following year|next year)/i
  ) || findOfficialFact(
    sourceText,
    /fee waiver.{0,180}(?:₹|Rs\.?\s*)?4,00,000/i
  );

  // Fill structured fields only when the supplied official-source bundle explicitly
  // contains those fee terms. This avoids treating missing information as a zero fee.
  if (joiningFact) data.joiningFee = 2500;
  if (annualFact) data.annualFee = 2500;
  if (feeWaiverFact) {
    data.annualFeeWaiver = "Renewal fee waived when eligible retail spends reach ₹4,00,000 within the preceding 12 billing cycles of the anniversary year. ₹2,500 plus applicable taxes.";
  }

  if (joiningFact || annualFact || feeWaiverFact) {
    const primaryFact = joiningFact || annualFact || feeWaiverFact;
    upsertBenefit(data, {
      name: "Joining and renewal fee",
      description: "Joining fee and annual/renewal fee are ₹2,500 each, plus applicable taxes.",
      conditions: "Renewal fee waiver requires eligible retail spends of ₹4,00,000 within the preceding 12 billing cycles of the anniversary year.",
      sourceQuote: [joiningFact?.quote, annualFact?.quote, feeWaiverFact?.quote].filter(Boolean).join(" "),
      sourceUrl: primaryFact?.url || sections.find(section => /fee|charges/i.test(section.title))?.url || null
    });
  }

  const domesticLoungeFact = findOfficialFact(
    sourceText,
    /3\s+(?:complimentary\s+)?(?:lounge\s+visits|airport lounge accesses|lounge accesses)\s+within\s+India[\s\S]{0,250}?(?:₹|Rs\.?\s*)?60,000[\s\S]{0,250}?(?:preceding|previous)\s+calendar\s+quarter[\s\S]{0,100}?(?:next|following)\s+calendar\s+quarter/i
  ) || findOfficialFact(
    sourceText,
    /spend\s+condition[\s\S]{0,100}(?:₹|Rs\.?\s*)?60,000[\s\S]{0,180}?(?:lounge accesses|lounge visits)[\s\S]{0,100}?(?:next|following)\s+calendar\s+quarter/i
  );

  if (domesticLoungeFact) {
    const effectiveFrom = /(?:w\.?e\.?f\.?|effective\s+from)\s*(?:1(?:st)?\s+July\s+2026|01[-/.]07[-/.]2026|July\s+1,?\s*2026)/i.test(sourceText)
      ? "2026-07-01"
      : null;
    upsertBenefit(data, {
      name: "Domestic airport lounge access",
      description: "Up to 3 complimentary lounge visits within India in the next calendar quarter after meeting the eligible quarterly spend threshold.",
      conditions: "Spend at least ₹60,000 in eligible card transactions in the preceding calendar quarter to unlock 3 domestic lounge visits in the following quarter. Effective 1 July 2026. Check your individual entitlement and participating lounge list before travel.",
      sourceQuote: domesticLoungeFact.quote,
      sourceUrl: domesticLoungeFact.url,
      validFrom: effectiveFrom
    });
  }

  const internationalLoungeFact = findOfficialFact(
    sourceText,
    /(?:up\s+to\s*)?6\s+(?:complimentary\s+)?(?:airport\s+)?lounge\s+(?:accesses|visits)\s+(?:per|each)\s+calendar\s+year\s+outside\s+India[\s\S]{0,180}?(?:Priority\s+Pass)/i
  ) || findOfficialFact(
    sourceText,
    /6\s+complimentary\s+lounge\s+access\s+per\s+calendar\s+year\s+outside\s+India\s+using\s+Priority\s+Pass/i
  );

  if (internationalLoungeFact) {
    const priorityPassFact = findOfficialFact(
      sourceText,
      /minimum\s+4\s+retail\s+transactions[\s\S]{0,100}(?:Priority\s+Pass|apply)/i
    );
    upsertBenefit(data, {
      name: "International airport lounge access",
      description: "Up to 6 complimentary lounge visits per calendar year outside India using Priority Pass, subject to current program terms.",
      conditions: "A minimum of 4 retail transactions is required to apply for Priority Pass. Verify the current participating lounge list, card-specific entitlement and any guest charges.",
      sourceQuote: [internationalLoungeFact.quote, priorityPassFact?.quote].filter(Boolean).join(" "),
      sourceUrl: internationalLoungeFact.url || priorityPassFact?.url || null
    });
  }

  return data;
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
  enrichHdfcRegaliaFeesAndLounge(data, sourceText);
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
