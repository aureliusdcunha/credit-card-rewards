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

function combinedJoiningRenewalFeeFact(clauses) {
  // HDFC's current Regalia Gold product copy commonly describes one fee
  // amount as "Joining / Renewal Membership Fee of Rs. 2,500 + Applicable Taxes".
  // It explicitly applies the amount to both the joining and renewal fee.
  const combinedPattern = /\bjoining\s*\/\s*(?:renewal\s+)?(?:annual\s+)?(?:membership\s+)?fee\s*(?:(?:is|of)\s*)?(?:[:\-]\s*)?(?:₹\s*|Rs\.?\s*|INR\s*)([\d,]+(?:\.\d+)?)/i;
  for (const clause of clauses) {
    const match = combinedPattern.exec(String(clause.quote || ""));
    if (!match) continue;
    const amount = Number(match[1].replace(/,/g, ""));
    if (!Number.isFinite(amount) || amount < 0) continue;
    return { ...clause, amount, explicitZero: amount === 0, combinedJoiningRenewal: true };
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
  } else if (isUnknownCardNetwork(data.network)) {
    data.network = null;
    addMissingItem(data, "Could not verify the payment network for this exact card variant from the supplied official source. Confirm Visa, Mastercard, RuPay, American Express or other network details before publishing.");
  }

  const clauses = officialClauses(sections);
  const combinedFeeFact = combinedJoiningRenewalFeeFact(clauses);
  const joiningFact = explicitFeeFact(clauses, "joining") || combinedFeeFact;
  const annualFact = explicitFeeFact(clauses, "annual") || combinedFeeFact;
  const waiverFact = findWaiverFact(clauses);

  if (joiningFact) data.joiningFee = joiningFact.amount;
  if (annualFact) data.annualFee = annualFact.amount;
  if (waiverFact) data.annualFeeWaiver = waiverFact.quote;

  if (joiningFact || annualFact) {
    const facts = [
      joiningFact ? { label: "Joining fee", fact: joiningFact } : null,
      annualFact ? { label: "Annual/renewal fee", fact: annualFact } : null
    ].filter(Boolean);
    const description = facts.map(({ label, fact }) =>
      label + ": " + (fact.amount === 0 ? "₹0" : "₹" + fact.amount.toLocaleString("en-IN")) +
      (/\b(?:plus|\+)\s*(?:applicable\s*)?tax(?:es)?\b/i.test(fact.quote) ? " plus applicable taxes" : "")
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
