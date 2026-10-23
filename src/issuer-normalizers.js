const BASE_RATE_PATTERN = /5\s*(?:reward\s*)?points?\s+(?:for\s+every|on\s+every|per)\s*(?:₹|rs\.?\s*|inr\s*)?200\s*(?:spent|spends)?(?:\s*\(?\s*on\s+retail\s+spends?\s*\)?)?/i;
const ACCELERATED_PATTERN = /\b(?:5\s*[x×]|accelerated reward|select merchants?|select brands?|smartbuy|myntra|nykaa|reliance digital|marks\s*(?:&|and)\s*spencer)\b/i;
const BASE_CONTINUATION_PATTERN = /\bbase reward points?\b.{0,140}\b(?:continue|not eligible|as is|no capping)\b/i;

function officialSourceSections(sourceText, fallbackUrl) {
  const sections = [];
  // Source Review assembles supplementary sources as "Title / URL / Document text",
  // while older callers and unit fixtures use "TITLE / SOURCE TEXT START/END".
  // Accept both formats so issuer-specific normalizers can retain per-source URLs
  // and parse facts across every official document in the assembled bundle.
  const pattern = /OFFICIAL SOURCE\s+\d+\s*\n(?:TITLE|Title):\s*([^\n]+)\s*\nURL:\s*(https:\/\/[^\s]+)\s*\n(?:SOURCE TEXT START\s*\n([\s\S]*?)\s*\nSOURCE TEXT END|Document text:\s*\n([\s\S]*?))(?=\n\s*\nOFFICIAL SOURCE\s+\d+|\s*$)/gi;
  for (const match of String(sourceText || "").matchAll(pattern)) {
    sections.push({
      title: match[1].trim(),
      url: match[2].trim(),
      text: String(match[3] ?? match[4] ?? "").trim()
    });
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


function findMccExclusionFacts(sections) {
  const facts = [];
  const seen = new Set();
  for (const section of sections) {
    const clauses = officialClauses([section]);
    for (const clause of clauses) {
      if (!/\bMCC(?:s|\s+codes?)?\b|merchant category codes?/i.test(clause.quote)) continue;
      if (!/\b(?:exclud(?:e|ed|es|ing|sion)|not eligible|ineligible|will not earn|do not earn|no reward|not earn reward)\b/i.test(clause.quote)) continue;
      const codes = [...new Set(clause.quote.match(/\b\d{4}\b/g) || [])];
      if (!codes.length) continue;
      const key = clause.url + "|" + clause.quote.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      facts.push({ url: clause.url || null, title: clause.title, quote: clause.quote, codes });
    }
  }
  return facts;
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
    /Joining\s+Fee\s*:\s*(?:₹|Rs\.?\s*)?2,?500\s*(?:plus|\+)\s*(?:Applicable\s+)?Taxes?/i
  );
  const annualFact = findOfficialFact(
    sourceText,
    /(?:Renewal|Annual|Membership)\s+Fee\s*:\s*(?:₹|Rs\.?\s*)?2,?500\s*(?:plus|\+)\s*(?:Applicable\s+)?Taxes?/i
  );
  const feeWaiverFact = findOfficialFact(
    sourceText,
    /(?:spend|spends).{0,80}(?:₹\s*|Rs\.?\s*)?(?:4,00,000|4\s*lakh).{0,180}(?:waiv|renewal fee|following year|next year)/i
  ) || findOfficialFact(
    sourceText,
    /fee waiver.{0,180}(?:₹\s*|Rs\.?\s*)?(?:4,00,000|4\s*lakh)/i
  ) || findOfficialFact(
    sourceText,
    /renewal fee.{0,180}(?:₹\s*|Rs\.?\s*)?(?:4,00,000|4\s*lakh)/i
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
      name: "Joining and annual fee",
      description: "Joining fee and annual/renewal fee are ₹2,500 each, plus applicable taxes.",
      conditions: "Renewal fee waiver requires eligible retail spends of ₹4,00,000 within the preceding 12 billing cycles of the anniversary year.",
      sourceQuote: [joiningFact?.quote, annualFact?.quote, feeWaiverFact?.quote].filter(Boolean).join(" "),
      sourceUrl: primaryFact?.url || sections.find(section => /fee|charges/i.test(section.title))?.url || null
    });
  }

  const domesticLoungeFact = findOfficialFact(
    sourceText,
    /3\s+(?:complimentary\s+)?(?:lounge\s+visits|airport lounge accesses|lounge accesses)\s+within\s+India[\s\S]{0,250}?(?:₹\s*|Rs\.?\s*)?60,000[\s\S]{0,250}?(?:preceding|previous)\s+calendar\s+quarter/i
  ) || findOfficialFact(
    sourceText,
    /spend\s+condition[\s\S]{0,100}(?:₹\s*|Rs\.?\s*)?60,000[\s\S]{0,180}?(?:lounge accesses|lounge visits)[\s\S]{0,100}?(?:next|following)\s+calendar\s+quarter/i
  ) || findOfficialFact(
    sourceText,
    /(?:₹\s*|Rs\.?\s*)?60,000.{0,180}(?:3|three)\s+(?:airport\s+)?lounge\s+(?:accesses|visits)[\s\S]{0,100}(?:next|following)\s+calendar\s+quarter/i
  );

  if (domesticLoungeFact) {
    const effectiveFrom = /(?:w\.?e\.?f\.?|effective\s+from)\s*[:\-]?\s*(?:1(?:st)?\s+July\s+2026|01[-/.]07[-/.]2026|July\s+1,?\s*2026)/i.test(sourceText)
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


function officialClauses(sections) {
  const clauses = [];
  for (const section of sections) {
    const chunks = String(section.text || "")
      .split(/\n+|;\s*|(?<=[.!?])\s+(?=[A-Z₹])/g)
      .map(value => value.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    for (const quote of chunks) {
      clauses.push({ ...section, quote });
    }
  }
  return clauses;
}


function combinedMembershipFeeFact(sections) {
  const pattern = /\bjoining\s*\/\s*(?:renewal|annual)\s+(?:membership\s+)?fee\s*(?:(?:is|of)\s*)?(?:[:\-]\s*)?(?:₹\s*|Rs\.?\s*|INR\s*)([\d,]+(?:\.\d+)?)(?:\s*(?:\+|plus)\s*(?:applicable\s*)?tax(?:es)?)?/i;
  for (const section of sections) {
    const match = pattern.exec(String(section.text || ""));
    if (!match) continue;
    const amount = Number(match[1].replace(/,/g, ""));
    if (!Number.isFinite(amount) || amount < 0) continue;
    let quote = quoteForMatch(section.text, match);
    const tail = String(section.text || "").slice(match.index + match[0].length);
    const taxSuffix = tail.match(/^\s*(?:\+|plus)\s*(?:applicable\s*)?tax(?:es)?/i)?.[0] || "";
    if (taxSuffix && !/(?:\+|plus)\s*(?:applicable\s*)?tax(?:es)?/i.test(quote)) {
      quote = (quote + " " + taxSuffix).replace(/\s+/g, " ").trim();
    }
    return {
      amount,
      explicitZero: amount === 0,
      taxesApplicable: /(?:\+|plus)\s*(?:applicable\s*)?tax(?:es)?/i.test(quote),
      quote,
      url: section.url || null,
      title: section.title || null
    };
  }
  return null;
}

function explicitFeeFact(clauses, feeKind) {
  const isJoining = feeKind === "joining";
  const label = isJoining ? /\bjoining fee\b/i : /\b(?:annual|renewal|membership) fee\b/i;
  const zeroLabel = isJoining
    ? /\bno joining fee\b|\bjoining fee\s*(?::|is)?\s*(?:nil|zero|₹\s*0)\b/i
    : /\bno (?:annual|renewal|membership) fee\b|\b(?:annual|renewal|membership) fee\s*(?::|is)?\s*(?:nil|zero|₹\s*0)\b/i;
  const priceAfterLabel = isJoining
    ? /\bjoining fee\b\s*(?:(?:is|of)\s*)?(?:[:\-]\s*)?(?:₹\s*|Rs\.?\s*|INR\s*)([\d,]+(?:\.\d+)?)/i
    : /\b(?:annual|renewal|membership) fee\b\s*(?:(?:is|of)\s*)?(?:[:\-]\s*)?(?:₹\s*|Rs\.?\s*|INR\s*)([\d,]+(?:\.\d+)?)/i;

  for (const clause of clauses) {
    if (zeroLabel.test(clause.quote)) return { ...clause, amount: 0, explicitZero: true };
    if (!label.test(clause.quote)) continue;
    // Don't interpret a fee-waiver threshold, minimum spend or transaction spend as a fee.
    const match = priceAfterLabel.exec(clause.quote);
    if (!match) continue;
    const gap = clause.quote.slice(match.index + match[0].indexOf("fee") + 3, match.index + match[0].length);
    if (/\b(?:waiv|spend|minimum|threshold|eligible)\b/i.test(gap)) continue;
    const amount = Number(match[1].replace(/,/g, ""));
    if (!Number.isFinite(amount) || amount < 0) continue;
    return { ...clause, amount, explicitZero: amount === 0 };
  }
  return null;
}

function findWaiverFact(clauses) {
  const candidates = clauses.filter(clause => {
    const quote = clause.quote;
    const hasFeeContext = /\b(?:fee waiver|waiv\w*|renewal fee|annual fee)\b/i.test(quote);
    const hasSpendContext = /\b(?:spend|spends|spent|annual purchase|eligible purchase|eligible transaction)\b/i.test(quote);
    const hasThreshold = /(?:₹\s*|Rs\.?\s*|INR\s*)[\d,]+|\b\d+(?:\.\d+)?\s*(?:lakh|lakhs|k)\b/i.test(quote);
    return hasFeeContext && hasSpendContext && hasThreshold;
  });
  // Prefer the most informative issuer sentence (billing-cycle, anniversary or
  // waiver-period wording) over a short heading that merely repeats the threshold.
  candidates.sort((a, b) => {
    const score = value => (/billing cycles?|anniversary|following year|next year|preceding|previous/i.test(value.quote) ? 100 : 0) + value.quote.length;
    return score(b) - score(a);
  });
  return candidates[0] || null;
}

function findLoungeSpendFacts(clauses) {
  return clauses.filter(clause => {
    const quote = clause.quote;
    return /\b(?:lounge|airport lounge|priority pass)\b/i.test(quote) &&
      /(?:₹\s*|Rs\.?\s*|INR\s*)[\d,]+|\b\d+(?:\.\d+)?\s*(?:lakh|lakhs|k)\b/i.test(quote) &&
      /\b(?:spend|spends|spent|transaction|retail purchase|eligible purchase|calendar quarter|quarterly|per quarter|per month)\b/i.test(quote);
  });
}

function appendUniqueSentence(existing, value) {
  const a = String(existing || "").trim();
  const b = String(value || "").trim();
  if (!b || a.includes(b)) return a || null;
  return a ? a + " " + b : b;
}

function genericUpsertBenefit(data, benefit) {
  if (!Array.isArray(data.benefits)) data.benefits = [];
  const index = data.benefits.findIndex(item =>
    String(item.name || "").trim().toLowerCase() === String(benefit.name || "").trim().toLowerCase()
  );
  if (index < 0) {
    data.benefits.push(benefit);
    return data.benefits[data.benefits.length - 1];
  }
  const old = data.benefits[index];
  data.benefits[index] = {
    ...old,
    ...benefit,
    conditions: benefit.conditions || old.conditions || null,
    sourceQuote: benefit.sourceQuote || old.sourceQuote || null,
    sourceUrl: benefit.sourceUrl || old.sourceUrl || null,
    validFrom: benefit.validFrom || old.validFrom || null,
    validTo: benefit.validTo || old.validTo || null
  };
  return data.benefits[index];
}

/**
 * Issuer-agnostic enrichment for all supported cards. Only promotes fees or
 * eligibility conditions when an explicit matching fact is present in official
 * source text; otherwise leaves unknown values unknown.
 */
const CARD_NETWORKS = [
  { label: "American Express", pattern: /\b(?:american\s+express|amex)\b/i },
  { label: "Diners Club", pattern: /\bdiners?\s+club(?:\s+international)?\b/i },
  { label: "Mastercard", pattern: /\bmaster\s*card\b/i },
  { label: "Visa", pattern: /\bvisa\b/i },
  { label: "RuPay", pattern: /\brupay\b/i }
];

function extractExplicitCardNetwork(sections) {
  const cues = [
    /\b(?:card|payment)\s+network\b/i,
    /\bnetwork\s+(?:type|variant)\b/i,
    /\b(?:available|issued|offered)\s+(?:on|through|in|as)\s+(?:the\s+)?(?:visa|master\s*card|rupay|american\s+express|amex|diners?\s+club)\b/i,
    /\b(?:choose|select)\s+(?:your|a)\s+(?:card\s+)?network\b/i,
    /\b(?:visa|master\s*card|rupay|american\s+express|amex|diners?\s+club)\b.{0,30}\bnetwork\b/i
  ];
  for (const section of sections) {
    const clauses = String(section.text || "")
      .split(/\n+|(?<=[.!?;])\s+/)
      .map(value => value.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    for (const clause of clauses) {
      if (!cues.some(cue => cue.test(clause))) continue;
      const found = CARD_NETWORKS
        .map(network => ({ label: network.label, index: clause.search(network.pattern) }))
        .filter(network => network.index >= 0)
        .sort((a, b) => a.index - b.index)
        .map(network => network.label);
      const unique = [...new Set(found)];
      if (!unique.length) continue;
      const variantDependent = unique.length > 1 &&
        /\b(?:depending on|variant|variants|choice|choose|either|or)\b/i.test(clause);
      return {
        value: unique.length === 1
          ? unique[0]
          : unique.join(" / ") + (variantDependent ? " (variant-dependent)" : ""),
        quote: clause.slice(0, 320),
        sourceUrl: section.url || null
      };
    }
  }
  return null;
}

function isUnknownCardNetwork(value) {
  return !String(value || "").trim() || /^(?:not specified|not recorded|unknown|n\/?a|none|null)$/i.test(String(value).trim());
}

export function normalizeCommonCardFacts(data, context = {}) {
  if (!data || typeof data !== "object") return data;
  if (!Array.isArray(data.benefits)) data.benefits = [];
  if (!Array.isArray(data.missingItems)) data.missingItems = [];

  const sections = officialSourceSections(String(context.sourceText || ""), context.sourceUrl || "");
  if (!sections.length) return data;

  // The payment network is separate from the rewards currency. Populate it only
  // when the supplied official card source explicitly ties a network to the card.
  const networkFact = extractExplicitCardNetwork(sections);
  if (networkFact) {
    data.network = networkFact.value;
    data.missingItems = data.missingItems.filter(item =>
      !/payment network specification|could not verify the payment network/i.test(String(item))
    );
  } else if (isUnknownCardNetwork(data.network)) {
    data.network = null;
    addMissingItem(data, "Could not verify the payment network for this exact card variant from the supplied official source. Confirm Visa, Mastercard, RuPay, American Express or other network details before publishing.");
  }

  const clauses = officialClauses(sections);
  const combinedMembershipFact = combinedMembershipFeeFact(sections);
  const parsedJoiningFact = explicitFeeFact(clauses, "joining");
  const parsedAnnualFact = explicitFeeFact(clauses, "annual");
  // HDFC Regalia Gold and some other issuer pages state a single
  // "Joining/Renewal Membership Fee of Rs. 2500 + Applicable Taxes" line.
  // That one explicit statement applies to both the joining fee and renewal fee.
  // Prefer this official combined fact over an AI-produced null or zero.
  const joiningFact = combinedMembershipFact
    ? { ...combinedMembershipFact, label: "Joining fee" }
    : parsedJoiningFact;
  const annualFact = combinedMembershipFact
    ? { ...combinedMembershipFact, label: "Annual/renewal fee" }
    : parsedAnnualFact;
  const waiverFact = findWaiverFact(clauses);

  // Preserve MCC-specific exclusions as source-backed review data. These codes
  // are not interchangeable with broad spend categories and should not be guessed.
  const mccFacts = findMccExclusionFacts(sections);
  if (mccFacts.length) {
    genericUpsertBenefit(data, {
      name: "MCC-based reward exclusions",
      description: "Official-source MCC exclusion clauses found: " + [...new Set(mccFacts.flatMap(fact => fact.codes))].sort().join(", ") + ". Check the quoted terms for the transaction types and scope that each code excludes.",
      conditions: mccFacts.map(fact => fact.quote).join(" "),
      sourceQuote: mccFacts.map(fact => fact.quote).join(" "),
      sourceUrl: mccFacts[0].url || null
    });
    if (new Set(mccFacts.flatMap(fact => fact.codes)).size >= 2) {
      data.missingItems = data.missingItems.filter(item => !/detailed list of mcc code exclusions/i.test(String(item)));
    }
  }

  if (joiningFact) {
    data.joiningFee = joiningFact.amount;
    data.missingItems = data.missingItems.filter(item =>
      !/exact numerical joining fee amount|joining fee amount/i.test(String(item))
    );
  }
  if (annualFact) {
    data.annualFee = annualFact.amount;
    data.missingItems = data.missingItems.filter(item =>
      !/exact numerical annual fee amount|annual fee amount/i.test(String(item))
    );
  }
  if (waiverFact) data.annualFeeWaiver = waiverFact.quote;

  if (joiningFact || annualFact) {
    const facts = [
      joiningFact ? { label: "Joining fee", fact: joiningFact } : null,
      annualFact ? { label: "Annual/renewal fee", fact: annualFact } : null
    ].filter(Boolean);
    const description = facts.map(({ label, fact }) =>
      label + ": " + (fact.amount === 0 ? "₹0" : "₹" + fact.amount.toLocaleString("en-IN")) +
      ((fact.taxesApplicable || /\b(?:plus|\+)\s*(?:applicable\s*)?tax(?:es)?\b/i.test(fact.quote)) ? " plus applicable taxes" : "")
    ).join(". ") + ".";
    const quote = facts.map(item => item.fact.quote).join(" ");
    genericUpsertBenefit(data, {
      name: "Joining and annual fee",
      description,
      conditions: waiverFact ? waiverFact.quote : null,
      sourceQuote: [quote, waiverFact?.quote].filter(Boolean).join(" ") || null,
      sourceUrl: facts[0].fact.url || waiverFact?.url || null
    });
  }

  if (waiverFact) {
    genericUpsertBenefit(data, {
      name: "Annual fee waiver",
      description: "Fee-waiver eligibility is based on the spend condition stated by the issuer.",
      conditions: waiverFact.quote,
      sourceQuote: waiverFact.quote,
      sourceUrl: waiverFact.url || null
    });
  }

  for (const fact of findLoungeSpendFacts(clauses)) {
    const international = /\b(?:international|outside India|outside the country|Priority Pass)\b/i.test(fact.quote);
    const domestic = /\b(?:domestic|within India|inside India)\b/i.test(fact.quote);
    const desiredName = international
      ? "International lounge access eligibility"
      : domestic ? "Domestic lounge access eligibility" : "Lounge access eligibility";
    const existingIndex = data.benefits.findIndex(benefit => {
      const fullText = [benefit.name, benefit.description, benefit.conditions, benefit.sourceQuote].filter(Boolean).join(" ");
      if (!/\b(?:lounge|airport|priority pass)\b/i.test(fullText)) return false;
      if (international && !/\b(?:international|outside India|Priority Pass)\b/i.test(fullText)) return false;
      if (domestic && !/\b(?:domestic|within India|inside India)\b/i.test(fullText)) return false;
      return true;
    });
    if (existingIndex >= 0) {
      const existing = data.benefits[existingIndex];
      existing.conditions = appendUniqueSentence(existing.conditions, fact.quote);
      existing.sourceQuote = appendUniqueSentence(existing.sourceQuote, fact.quote);
      existing.sourceUrl = existing.sourceUrl || fact.url || null;
    } else {
      genericUpsertBenefit(data, {
        name: desiredName,
        description: "Lounge eligibility is subject to the issuer's published spend and transaction conditions.",
        conditions: fact.quote,
        sourceQuote: fact.quote,
        sourceUrl: fact.url || null
      });
    }
  }

  return data;
}


function firstOfficialMatch(sections, patterns) {
  const candidates = [];
  for (const section of sections) {
    let hostname = "";
    try { hostname = new URL(section.url).hostname.toLowerCase(); } catch {}
    if (!hostname.endsWith("sbicard.com")) continue;
    for (const pattern of patterns) {
      const match = pattern.exec(section.text);
      if (match) {
        candidates.push({
          sourceUrl: section.url,
          sourceTitle: section.title,
          sourceText: section.text,
          quote: quoteForMatch(section.text, match),
          index: match.index
        });
        break;
      }
    }
  }
  return candidates[0] || null;
}

export function normalizeSbiSimplySaveExtraction(data, context = {}) {
  if (!data || typeof data !== "object") return data;
  const issuer = String(context.issuer || data.issuer || "").toLowerCase();
  const cardName = String(context.cardName || data.cardName || "").toLowerCase();
  const isSbi = /\bsbi\b|\bstate bank of india\b/.test(issuer) ||
    /\bsbi card\b/.test(cardName);
  if (!isSbi || !/simply\s*save/.test(cardName)) return data;

  const sections = officialSourceSections(String(context.sourceText || ""), context.sourceUrl || "");
  const officialSections = sections.filter(section => {
    try { return new URL(section.url).hostname.toLowerCase().endsWith("sbicard.com"); }
    catch { return false; }
  });
  if (!officialSections.length) return data;

  const baseFact = firstOfficialMatch(officialSections, [
    /\bon\s+all\s+other\s+(?:eligible\s+)?(?:spends?|categories)[,:]?\s*(?:earn\s+)?1\s+reward\s+point\s+(?:per|for\s+every|on\s+every)\s*(?:₹|Rs\.?\s*|INR\s*)?150\s*(?:spent|spends?)\b/i,
    /\b1\s+reward\s+point\s+(?:per|for\s+every|on\s+every)\s*(?:₹|Rs\.?\s*|INR\s*)?150\s*(?:spent|spends?)\s+(?:on\s+all\s+other\s+(?:eligible\s+)?(?:spends?|categories))\b/i
  ]);

  const acceleratedFact = firstOfficialMatch(officialSections, [
    /\b10\s*(?:x|×)?\s+reward\s+points?\s+(?:per|for\s+every|on\s+every)\s*(?:₹|Rs\.?\s*|INR\s*)?150\s*(?:spent|spends?)\s+(?:on|for)\s+[^.!?;\n]{0,220}/i
  ]);
  const acceleratedQuote = acceleratedFact?.quote || "";
  const hasEveryAcceleratedCategory =
    /\bdining\b/i.test(acceleratedQuote) &&
    /\bmovies?\b/i.test(acceleratedQuote) &&
    /\b(?:grocer(?:y|ies))\b/i.test(acceleratedQuote) &&
    /\bdepartmental\s+stores?\b/i.test(acceleratedQuote);

  const capFact = firstOfficialMatch(officialSections, [
    /(?:maximum\s+cap\s+of|cap\s+of)\s*5,?000\s+reward\s+points?\s*(?:\/\s*month|per\s+(?:calendar\s+)?month|monthly)/i,
    /\b5,?000\s+reward\s+points?\s+(?:per|each)\s+(?:calendar\s+)?month\b/i
  ]);

  if (!Array.isArray(data.rules)) data.rules = [];
  if (!Array.isArray(data.benefits)) data.benefits = [];
  if (!Array.isArray(data.missingItems)) data.missingItems = [];

  const newRules = [];
  if (baseFact) {
    newRules.push({
      category: "general",
      rate: 1,
      perAmount: 150,
      unit: "Reward Points",
      minTransaction: null,
      cap: null,
      rounding: "down",
      validFrom: null,
      validTo: null,
      sourceQuote: baseFact.quote,
      sourceUrl: baseFact.sourceUrl,
      notes: "Base earning rate for all other eligible spend. Verify applicable exclusions and current issuer terms."
    });
  }

  if (baseFact && acceleratedFact && hasEveryAcceleratedCategory && capFact) {
    const acceleratedCategories = ["dining", "movies", "groceries", "departmental_stores"];
    for (const category of acceleratedCategories) {
      newRules.push({
        category,
        rate: 10,
        perAmount: 150,
        unit: "Reward Points",
        minTransaction: null,
        cap: {
          type: "points",
          value: 5000,
          period: "calendar_month",
          overCapCategory: "general"
        },
        rounding: "down",
        validFrom: null,
        validTo: null,
        sourceQuote: acceleratedFact.quote,
        sourceUrl: acceleratedFact.sourceUrl,
        notes: "10 Reward Points per ₹150 on the issuer-listed accelerated category. The ₹5,000 monthly accelerated-points cap is cumulative across dining, movies, departmental stores and grocery; enter any prior accelerated points from all these categories. After the shared cap, the source says the base 1 Reward Point per ₹150 continues. Verify merchant/MCC eligibility."
      });
    }
    genericUpsertBenefit(data, {
      name: "Accelerated reward monthly cap",
      description: "Cumulative maximum of 5,000 accelerated Reward Points per month across dining, movies, departmental stores and grocery.",
      conditions: "Once the shared monthly accelerated-points cap is reached, the base rate of 1 Reward Point per ₹150 spent continues. The calculator needs the prior accelerated points balance to model this correctly.",
      sourceQuote: capFact.quote,
      sourceUrl: capFact.sourceUrl
    });
  } else if (acceleratedFact) {
    genericUpsertBenefit(data, {
      name: "Accelerated 10X rewards on selected everyday categories — rate needs complete verification",
      description: "The official source describes accelerated rewards on dining, movies, departmental stores and grocery, but the supplied official source bundle did not include the full numeric cap/rate conditions needed to safely publish these as calculator rules.",
      conditions: "Confirm the absolute points per ₹150 and the cumulative monthly cap from the current SimplySAVE card terms before using these categories in calculations.",
      sourceQuote: acceleratedFact.quote,
      sourceUrl: acceleratedFact.sourceUrl
    });
    addMissingItem(data, "The SimplySAVE accelerated-reward quote was found, but the official source bundle did not confirm both the base rate and cumulative monthly cap. Add the current SimplySAVE reward terms PDF before publishing accelerated category rules.");
  }

  if (newRules.length) {
    data.rewardCurrency = "Reward Points";
    const staleRewardSummary = /reward rates? and card network details are not provided in the supplied text\.?/gi;
    const replacementSummary = newRules.length === 5
      ? "Base and accelerated reward rates were found in official issuer sources; the payment network was not verified from the supplied text."
      : "The base reward rate was found, but accelerated rewards remain unverified without complete cap evidence; the payment network was not verified from the supplied text.";
    if (typeof data.summary === "string") {
      data.summary = data.summary.replace(staleRewardSummary, replacementSummary).replace(/\s{2,}/g, " ").trim();
    }
    if (typeof data.description === "string") {
      data.description = data.description.replace(staleRewardSummary, replacementSummary).replace(/\s{2,}/g, " ").trim();
    }
    const handledCategories = new Set(newRules.map(rule => rule.category));
    data.rules = data.rules.filter(rule => {
      const quote = String(rule?.sourceQuote || "") + " " + String(rule?.notes || "");
      return !(handledCategories.has(rule.category) &&
        /\b(?:reward points?|points?)\b/i.test(quote) &&
        /\b(?:150|simply\s*save|all other spends?|10\s*[x×])\b/i.test(quote));
    });
    data.rules.unshift(...newRules);

    // The previous AI-only pass may have reported that the numeric reward rate
    // was absent. Remove that stale warning only after exact issuer evidence was found.
    data.missingItems = data.missingItems.filter(item =>
      !/reward rates?.{0,90}(?:not provided|not available|could not verify)|could not verify.{0,90}(?:reward|earning) rate/i.test(String(item))
    );
  } else {
    addMissingItem(data, "Could not verify a complete SimplySAVE base earning rule from the supplied official source text. The current official product page and reward terms should be included in the source bundle before publishing.");
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



/**
 * Generic normalization for accelerated reward clauses across issuers.
 * Numeric rules are only created when the source and a verified base rate make
 * the multiplier relationship explicit. Vague "up to" offers remain benefits.
 */
export function normalizeGenericAcceleratedEarningRules(data, context = {}) {
  if (!data || typeof data !== "object") return data;
  if (!Array.isArray(data.rules)) data.rules = [];
  if (!Array.isArray(data.benefits)) data.benefits = [];
  if (!Array.isArray(data.missingItems)) data.missingItems = [];

  // Any explicit merchant/channel dependency must remain separate and must not
  // be applied by the category-only calculator.
  for (const rule of data.rules) {
    if (rule && (rule.merchantCondition || rule.channelCondition)) {
      rule.calculatorEligible = false;
      if (!rule.label) {
        rule.label = rule.merchantCondition
          ? "Merchant-specific rewards — " + String(rule.merchantCondition)
          : "Channel-specific rewards — " + String(rule.channelCondition);
      }
    }
  }

  const sourceText = String(context.sourceText || "");
  const fallbackUrl = String(context.sourceUrl || "");
  const sections = officialSourceSections(sourceText, fallbackUrl);
  if (!sections.length) return data;

  const baseRule = data.rules.find(rule =>
    rule && rule.category === "general" &&
    Number.isFinite(Number(rule.rate)) && Number(rule.rate) > 0 &&
    Number.isFinite(Number(rule.perAmount)) && Number(rule.perAmount) > 0 &&
    String(rule.unit || "").trim()
  );
  const generated = [];
  const generatedQuotes = new Set();
  const malformedExistingRules = new Set();
  let sawUnquantifiedAccelerator = false;

  const normalizeMerchantText = value => String(value || "")
    .replace(/\s+/g, " ")
    .replace(/[;,.\s]+$/, "")
    .trim();

  for (const section of sections) {
    const chunks = String(section.text || "").split(/\n+/).map(value => value.trim()).filter(Boolean);
    for (const chunk of chunks) {
      const sentences = chunk.split(/(?<=[.!?])\s+(?=[A-Z0-9])/).map(value => value.trim()).filter(Boolean);
      for (const sentence of sentences) {
        const matches = [...sentence.matchAll(/\b(\d+(?:\.\d+)?)\s*[x×]\s*(?:reward\s*)?(?:points?|rewards?|miles?)\b/gi)];
        if (!matches.length) continue;

        for (const match of matches) {
          const matchIndex = match.index || 0;
          const before = sentence.slice(Math.max(0, matchIndex - 28), matchIndex);
          const sentenceKey = sentence.replace(/\s+/g, " ").trim();
          if (/\b(?:up\s*to|upto|between|from)\s*$/i.test(before) ||
              /\b(?:up\s*to|upto)\s+\d+\s*[x×]/i.test(sentence) ||
              /\d+\s*[x×]\s*(?:to|[-–])\s*\d+\s*[x×]/i.test(sentence)) {
            sawUnquantifiedAccelerator = true;
            continue;
          }
          if (generatedQuotes.has(sentenceKey)) continue;

          // If the same clause already has an explicit absolute rate, leave its
          // normalization to the ordinary numeric-rule extraction path.
          const denominatorMatch = sentence.match(/\b(\d+(?:\.\d+)?)\s*(?:reward\s*)?points?\s+(?:for\s+every|per|on\s+every)\s*(?:₹|rs\.?\s*|inr\s*)?([\d,]+(?:\.\d+)?)(?:\s*(?:spent|spend|transaction))?/i);
          if (denominatorMatch && !/\b(?:base reward points|incremental reward points|bonus points)\b/i.test(sentence)) continue;

          const multiplier = Number(match[1]);
          if (!Number.isFinite(multiplier) || multiplier <= 1) continue;

          // Cap-only sentences describe a limit on an offer already defined
          // elsewhere in the section; they must not become a second earning rule.
          const capOnlySentence = /\b(?:cap|capped|maximum|limit)\b/i.test(sentence) &&
            !/\b(?:select(?:ed)?\s+merchants?|eligible\s+merchants?|spends?\s+(?:at|on|through|via)|purchases?\s+(?:at|on|through|via)|transactions?\s+(?:at|on|through|via)|dining|grocery|groceries|departmental stores?|movies|travel|flights?|hotels?|fuel|insurance|utility|utilities|bill pay|rent|wallet|school fees|e-?com|pos|smartbuy)\b/i.test(sentence);
          if (capOnlySentence) continue;

          const merchantMatches = [
            ...sentence.matchAll(/(?:select|selected|eligible|participating)\s+merchants?\s*(?:[–—:-]\s*)?([^.;\n]+)/gi),
            ...sentence.matchAll(/(?:at|on)\s+(?:(?:the|select|selected|eligible|participating)\s+)?merchants?\s*(?:[–—:-]\s*)?([^.;\n]+)/gi),
            ...sentence.matchAll(/(?:spends?|spent|purchases?|transactions?)\s+(?:at|on|through|via)\s+([^.;\n]+)/gi)
          ].sort((a, b) => (a.index || 0) - (b.index || 0));
          const merchantMatch = merchantMatches[merchantMatches.length - 1] || null;
          let merchantCondition = normalizeMerchantText(merchantMatch?.[1] || "");
          if (/^(?:and more|etc|etcetera)$/i.test(merchantCondition)) merchantCondition = "";
          const hasNamedCondition = Boolean(merchantCondition) ||
            /\b(?:merchants?|brands?|dining|grocery|groceries|departmental stores?|movies|travel|flights?|hotels?|fuel|insurance|utility|utilities|bill pay|rent|wallet|school fees|online|offline|e-?com|pos|smartbuy|transactions?)\b/i.test(sentence);
          if (!hasNamedCondition) continue;

          // Issuer-specific or AI-extracted numeric category rules may already
          // cover every transaction category named by a multiplier clause. Do not
          // create a duplicate group rule on top of those independently sourced rates.
          if (!merchantCondition) {
            const categoryHints = [
              ["dining", /\b(?:dining|restaurants?|food delivery)\b/i],
              ["movies", /\bmovies?\b/i],
              ["departmental_stores", /\bdepartmental stores?\b/i],
              ["groceries", /\b(?:grocery|groceries)\b/i],
              ["airline_direct", /\b(?:flights?|airlines?)\b/i],
              ["hotel_direct", /\bhotels?\b/i],
              ["travel_portal", /\b(?:smartbuy|travel portal|booking portal)\b/i],
              ["fuel", /\bfuel\b/i],
              ["insurance", /\binsurance\b/i],
              ["utilities", /\b(?:utilities|utility|bill pay)\b/i],
              ["education", /\b(?:education|school fees)\b/i]
            ];
            const mentionedCategories = categoryHints.filter(([, pattern]) => pattern.test(sentence)).map(([category]) => category);
            const allCategoriesAlreadyHaveRates = mentionedCategories.length > 0 &&
              mentionedCategories.every(category => data.rules.some(rule =>
                rule.category === category &&
                Number(rule.perAmount) > 0 &&
                Number(rule.rate) >= 0 &&
                rule.sourceQuote
              ));
            if (allCategoriesAlreadyHaveRates) continue;
          }

          if (!baseRule) {
            sawUnquantifiedAccelerator = true;
            continue;
          }

          const hasBaseContinuation = /\bbase\s+(?:reward\s+)?points?\b[\s\S]{0,220}\b(?:continue|continues|continued|as is|without any capping|no capping|not be capped)\b/i.test(section.text) ||
            /\bincremental\s+(?:accelerated\s+)?reward\s+points?\b/i.test(section.text);
          const explicitlyAdditional = /\b(?:additional|incremental|bonus)\b/i.test(before + " " + sentence.slice(matchIndex, matchIndex + match[0].length + 55));
          const isBonus = explicitlyAdditional || hasBaseContinuation;
          const effectiveFactor = explicitlyAdditional ? multiplier : hasBaseContinuation ? Math.max(0, multiplier - 1) : multiplier;
          if (effectiveFactor <= 0) continue;

          const amountRate = Number(baseRule.rate) * effectiveFactor;
          const denominator = Number(baseRule.perAmount);
          if (!Number.isFinite(amountRate) || amountRate <= 0 || denominator <= 0) continue;

          const existingAccelerated = data.rules.find(rule => {
            const quote = String(rule.sourceQuote || "").replace(/\s+/g, " ").trim();
            return rule.category !== "general" && quote &&
              /\b\d+(?:\.\d+)?\s*[x×]/i.test(quote) &&
              (sentenceKey.includes(quote) || quote.includes(sentenceKey));
          });
          if (existingAccelerated &&
              Number(existingAccelerated.rate) === amountRate &&
              Number(existingAccelerated.perAmount) === denominator) {
            existingAccelerated.label = existingAccelerated.label || ((isBonus ? String(multiplier) + "X accelerated bonus" : String(multiplier) + "X accelerated total") + (merchantCondition ? " — " + merchantCondition : ""));
            existingAccelerated.merchantCondition = existingAccelerated.merchantCondition || merchantCondition || null;
            existingAccelerated.channelCondition = existingAccelerated.channelCondition || null;
            existingAccelerated.isAccelerated = true;
            existingAccelerated.isBonus = isBonus;
            existingAccelerated.multiplier = multiplier;
            existingAccelerated.calculatorEligible = false;
            existingAccelerated.notes = [existingAccelerated.notes, "This merchant/channel-specific rule is kept separate and excluded from generic calculator estimates until the exact condition can be matched."].filter(Boolean).join(" ");
            continue;
          }
          if (existingAccelerated) malformedExistingRules.add(existingAccelerated);

          const sectionHasPointCap = /(?:capped|cap|maximum|limit)[^.]{0,90}\b(?:reward\s*)?(?:points?|rp)\b/i.test(section.text);
          const pointCapMatch = section.text.match(/(?:capped\s+at|cap(?:ped)?\s+(?:of|at)|maximum\s+(?:cap\s+)?of)\s*(?:₹|rs\.?\s*)?([\d,]+)\s*(?:rp|reward\s+points?|points?)\s*(?:per|\/|a)\s*(?:calendar\s+)?month/i) ||
            section.text.match(/([\d,]+)\s*(?:rp|reward\s+points?)\s*(?:per|\/|a)\s*(?:calendar\s+)?month[^.\n]{0,80}\b(?:cap|capped|maximum)\b/i);
          const minimumMatch = section.text.match(/(?:minimum\s+transaction(?:\s+value)?|minimum\s+purchase)[^\.\n]{0,100}?(?:₹|rs\.?\s*|inr\s*)?([\d,]+(?:\.\d+)?)/i);
          const capValue = pointCapMatch ? Number(String(pointCapMatch[1]).replace(/,/g, "")) : null;
          const minTransaction = minimumMatch ? Number(String(minimumMatch[1]).replace(/,/g, "")) : null;
          const cap = sectionHasPointCap && Number.isFinite(capValue) && capValue >= 0
            ? {
                type: "points",
                value: capValue,
                period: /calendar\s+month/i.test(section.text) ? "calendar_month" : "month",
                overCapCategory: "general"
              }
            : null;

          const offerLabel = isBonus && hasBaseContinuation && !explicitlyAdditional
            ? String(multiplier) + "X total offer (" + String(effectiveFactor) + "X bonus component)"
            : isBonus
              ? String(multiplier) + "X accelerated bonus"
              : String(multiplier) + "X accelerated total";
          const label = offerLabel +
            (merchantCondition ? " — " + merchantCondition : " — " + sentence.replace(/\s+/g, " ").slice(0, 100));
          const channelMatch = section.text.match(/(?:can be accumulated|eligible|applicable|valid)\s+(?:for|on|in|through)\s+([^.\n]{1,160}(?:e-?com|pos|point.of.sale|online|offline|smartbuy|portal|app)[^.\n]{0,100})/i);
          const channelCondition = channelMatch ? normalizeMerchantText(channelMatch[1]) : "";
          const noteParts = [
            isBonus
              ? "Separate accelerated bonus component: " + effectiveFactor + "× the verified base rate. The standard base rule continues separately."
              : "Source describes " + multiplier + "× total rewards; normalized using the verified base rate. Confirm the issuer's multiplier definition during review.",
            merchantCondition ? "Eligible merchants: " + merchantCondition + "." : "",
            channelCondition ? "Channel condition: " + channelCondition + "." : "",
            cap ? "The source states a " + cap.value.toLocaleString("en-IN") + " point monthly cap for this accelerated component; use the general base rate after the accelerated cap is exhausted." : "",
            minTransaction != null && Number.isFinite(minTransaction) ? "Minimum transaction: ₹" + minTransaction.toLocaleString("en-IN") + "." : "",
            "This merchant/channel-conditional rule is retained as a separate record but excluded from generic calculator estimates until the specific merchant and channel can be matched."
          ].filter(Boolean);

          const merchantKey = value => normalizeMerchantText(value)
            .toLowerCase()
            .replace(/\band\s+more\b|\betc(?:etera)?\b/g, " ")
            .split(/[^a-z0-9]+/)
            .filter(token => token.length > 2 && !["selected", "select", "eligible", "merchants", "brands", "spends", "spend", "reward", "rewards", "points", "point", "transactions", "transaction", "online", "offline", "through", "via"].includes(token));
          const newMerchantTokens = new Set(merchantKey(merchantCondition));
          const channelOnlyFollowup = !merchantCondition &&
            Boolean(channelCondition) &&
            /\b(?:can be accumulated|eligible|applicable|valid)\s+(?:for|on|in|through)\s+[^.\n]*(?:e-?com|pos|point.of.sale|online|offline|smartbuy|portal|app)/i.test(sentence) &&
            !/\b(?:select(?:ed)?\s+merchants?|eligible\s+merchants?|brands?|dining|grocery|groceries|departmental stores?|movies|travel|flights?|hotels?|fuel|insurance|utility|utilities|bill pay|rent|wallet|school fees)\b/i.test(sentence);
          if (channelOnlyFollowup) {
            const merchantOffer = generated.find(rule =>
              Number(rule.multiplier) === multiplier && rule.merchantCondition
            );
            if (merchantOffer) {
              merchantOffer.channelCondition = merchantOffer.channelCondition || channelCondition;
              merchantOffer.notes = [merchantOffer.notes, "The same source also specifies channel eligibility: " + channelCondition + "."].filter(Boolean).join(" ");
              continue;
            }
          }
          const equivalentGenerated = generated.find(rule => {
            if (Number(rule.multiplier) !== multiplier) return false;
            const priorTokens = merchantKey(rule.merchantCondition);
            if (!newMerchantTokens.size || !priorTokens.length) return !newMerchantTokens.size && !priorTokens.length;
            const overlap = priorTokens.filter(token => newMerchantTokens.has(token)).length;
            const smaller = Math.min(priorTokens.length, newMerchantTokens.size);
            return (overlap >= 2 && overlap / smaller >= 0.6) ||
              normalizeMerchantText(rule.merchantCondition).toLowerCase() === normalizeMerchantText(merchantCondition).toLowerCase();
          });
          if (equivalentGenerated) {
            // One offer may span several sentences (merchant list, channel,
            // minimum spend and cap) or appear in product page plus terms PDF.
            // Keep a single rule and prefer the more complete merchant list.
            const existingTokens = merchantKey(equivalentGenerated.merchantCondition);
            if (newMerchantTokens.size > existingTokens.length &&
                !/\band\s+more\b/i.test(merchantCondition)) {
              equivalentGenerated.merchantCondition = merchantCondition;
              equivalentGenerated.label = offerLabel + " — " + merchantCondition;
            }
            if (channelCondition && !equivalentGenerated.channelCondition) equivalentGenerated.channelCondition = channelCondition;
            if (cap && !equivalentGenerated.cap) equivalentGenerated.cap = cap;
            if (minTransaction != null && equivalentGenerated.minTransaction == null) equivalentGenerated.minTransaction = minTransaction;
            continue;
          }

          generated.push({
            category: "other",
            label,
            merchantCondition: merchantCondition || null,
            channelCondition: channelCondition || null,
            isAccelerated: true,
            isBonus,
            multiplier,
            calculatorEligible: false,
            rate: amountRate,
            perAmount: denominator,
            unit: String(baseRule.unit || data.rewardCurrency || "Rewards"),
            minTransaction: Number.isFinite(minTransaction) && minTransaction >= 0 ? minTransaction : null,
            cap,
            rounding: baseRule.rounding || "down",
            validFrom: null,
            validTo: null,
            sourceQuote: sentenceKey,
            sourceUrl: section.url || fallbackUrl || baseRule.sourceUrl || null,
            notes: noteParts.join(" ")
          });
          generatedQuotes.add(sentenceKey);
        }
      }
    }
  }

  if (generated.length) {
    // Remove an incomplete pseudo-rule for the same multiplier clause, but keep
    // ordinary rules and explicitly quantified rules untouched.
    data.rules = data.rules.filter(rule => {
      if (malformedExistingRules.has(rule)) return false;
      const quote = String(rule.sourceQuote || "").replace(/\s+/g, " ").trim();
      return !generatedQuotes.has(quote) ||
        (rule.isAccelerated === true && rule.calculatorEligible === false);
    });
    data.missingItems = data.missingItems.filter(item =>
      !/5X selected-merchant offer was retained as a benefit, not a generic calculator rule/i.test(String(item))
    );
    data.rules.push(...generated);
  } else if (sawUnquantifiedAccelerator) {
    addMissingItem(data, "An accelerated/multiplier reward offer appears in the official source, but no unambiguous calculator-ready rate, channel or base-rate relationship was available. It remains a benefit pending source review; no numeric accelerated rule was invented.");
  }

  return data;
}
