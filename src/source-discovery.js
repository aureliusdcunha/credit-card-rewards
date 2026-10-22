export const OFFICIAL_DOMAINS = [
  "axisbank.com", "axis.bank.in", "hdfcbank.com", "hdfc.bank.in", "icicibank.com", "sbicard.com", "sbi.co.in",
  "kotak.com", "idfcfirstbank.com", "indusind.com", "rblbank.com", "yesbank.in",
  "hsbc.co.in", "icici.bank.in", "americanexpress.com", "amex.co.in", "bobfinancial.com",
  "federalbank.co.in", "aubank.in", "au.bank.in", "standardchartered.co.in", "sc.bank.in"
];

const ISSUER_DOMAIN_MAP = [
  { terms: ["axis"], domain: "axis.bank.in" },
  { terms: ["hdfc"], domain: "hdfc.bank.in" },
  { terms: ["icici"], domain: "icici.bank.in" },
  { terms: ["sbi", "state bank", "sbicard"], domain: "sbicard.com" },
  { terms: ["kotak"], domain: "kotak.com" },
  { terms: ["idfc"], domain: "idfcfirstbank.com" },
  { terms: ["indusind"], domain: "indusind.com" },
  { terms: ["rbl"], domain: "rblbank.com" },
  { terms: ["yes bank", "yesbank"], domain: "yesbank.in" },
  { terms: ["hsbc"], domain: "hsbc.co.in" },
  { terms: ["american express", "amex"], domain: "americanexpress.com" },
  { terms: ["bank of baroda", "bob financial", "bobcard"], domain: "bobfinancial.com" },
  { terms: ["federal bank", "federal"], domain: "federalbank.co.in" },
  { terms: ["au small finance", "au bank", "aubank"], domain: "aubank.in" },
  { terms: ["standard chartered", "stanchart", "standardchartered"], domain: "sc.bank.in" }
];

export function hostIsAllowed(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/\.$/, "");
  return OFFICIAL_DOMAINS.some(domain => host === domain || host.endsWith("." + domain));
}

export function validateOfficialUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new Error("Enter a valid official issuer URL."); }
  if (url.protocol !== "https:") throw new Error("Only HTTPS issuer URLs are accepted.");
  if (url.username || url.password) throw new Error("URLs containing usernames or passwords are not allowed.");
  if (!hostIsAllowed(url.hostname)) throw new Error("This URL is not on the configured official-issuer allow-list.");
  return url;
}

export function issuerDomainFor(issuer) {
  const value = String(issuer || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const match = ISSUER_DOMAIN_MAP.find(entry => entry.terms.some(term => value.includes(term)));
  return match ? match.domain : null;
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&").replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">");
}

function stripMarkup(value) {
  return decodeHtml(String(value || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function unwrapSearchUrl(rawHref) {
  try {
    const href = decodeHtml(rawHref).replace(/^\/\//, "https://");
    const link = new URL(href, "https://html.duckduckgo.com/");
    if (link.hostname === "duckduckgo.com" || link.hostname.endsWith(".duckduckgo.com")) {
      const target = link.searchParams.get("uddg") || link.searchParams.get("u");
      if (!target) return null;
      return new URL(target).toString();
    }
    return link.toString();
  } catch { return null; }
}

export function parseDuckDuckGoResults(html, expectedDomain = null) {
  const results = [];
  const seen = new Set();
  const anchorRegex = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  for (const match of String(html || "").matchAll(anchorRegex)) {
    const attrs = match[1] || "";
    if (!/\bclass\s*=\s*["'][^"']*\bresult__a\b[^"']*["']/i.test(attrs)) continue;
    const hrefMatch = attrs.match(/\bhref\s*=\s*(["'])(.*?)\1/i);
    if (!hrefMatch) continue;
    const rawUrl = unwrapSearchUrl(hrefMatch[2]);
    if (!rawUrl) continue;
    let parsed;
    try { parsed = validateOfficialUrl(rawUrl); } catch { continue; }
    const host = parsed.hostname.toLowerCase();
    if (expectedDomain && host !== expectedDomain && !host.endsWith("." + expectedDomain)) continue;
    parsed.hash = "";
    const url = parsed.toString();
    if (seen.has(url)) continue;
    seen.add(url);
    const title = stripMarkup(match[2]).slice(0, 240) || host;
    const scoreText = (title + " " + parsed.pathname + " " + parsed.search).toLowerCase();
    const score = ["terms", "condition", "reward", "points", "exclusion", "mitc", "benefit", ".pdf", "credit-card", "creditcard"]
      .reduce((total, word) => total + (scoreText.includes(word) ? 1 : 0), 0);
    results.push({ url, title, domain: host, score });
  }
  return results.sort((a, b) => b.score - a.score).slice(0, 12);
}

export function parseDuckDuckGoLiteResults(html, expectedDomain = null) {
  const results = [];
  const seen = new Set();
  const anchorRegex = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  for (const match of String(html || "").matchAll(anchorRegex)) {
    const attrs = match[1] || "";
    const hrefMatch = attrs.match(/\bhref\s*=\s*(["'])(.*?)\1/i);
    if (!hrefMatch) continue;
    const rawUrl = unwrapSearchUrl(hrefMatch[2]);
    if (!rawUrl) continue;
    let parsed;
    try { parsed = validateOfficialUrl(rawUrl); } catch { continue; }
    const host = parsed.hostname.toLowerCase();
    if (expectedDomain && host !== expectedDomain && !host.endsWith("." + expectedDomain)) continue;
    parsed.hash = "";
    const url = parsed.toString();
    if (seen.has(url)) continue;
    seen.add(url);
    const title = stripMarkup(match[2]).slice(0, 240) || host;
    const scoreText = (title + " " + parsed.pathname + " " + parsed.search).toLowerCase();
    const score = ["terms", "condition", "reward", "points", "exclusion", "mitc", "benefit", ".pdf", "credit-card", "creditcard", "regalia", "horizon"]
      .reduce((total, word) => total + (scoreText.includes(word) ? 1 : 0), 0);
    results.push({ url, title, domain: host, score });
  }
  return results.sort((a, b) => b.score - a.score).slice(0, 12);
}

export function parseBingRssResults(xml, expectedDomain = null) {
  const results = [];
  const seen = new Set();
  for (const match of String(xml || "").matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const item = match[1] || "";
    const titleMatch = item.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const linkMatch = item.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
    if (!linkMatch) continue;
    let parsed;
    try { parsed = validateOfficialUrl(decodeHtml(linkMatch[1].trim())); } catch { continue; }
    const host = parsed.hostname.toLowerCase();
    if (expectedDomain && host !== expectedDomain && !host.endsWith("." + expectedDomain)) continue;
    parsed.hash = "";
    const url = parsed.toString();
    if (seen.has(url)) continue;
    seen.add(url);
    const title = stripMarkup(titleMatch?.[1] || "").slice(0, 240) || host;
    const scoreText = (title + " " + parsed.pathname + " " + parsed.search).toLowerCase();
    const score = ["terms", "condition", "reward", "points", "exclusion", "mitc", "benefit", ".pdf", "credit-card", "creditcard"]
      .reduce((total, word) => total + (scoreText.includes(word) ? 1 : 0), 0);
    results.push({ url, title, domain: host, score });
  }
  return results.sort((a, b) => b.score - a.score).slice(0, 12);
}



function cardNameTokens(cardName) {
  const ignored = new Set(["the", "and", "of", "for", "in", "india", "bank", "credit", "card", "cards"]);
  return [...new Set(String(cardName || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(token => token.length > 1 && !ignored.has(token)))];
}

function isExpectedIssuerHost(hostname, expectedDomain) {
  const host = String(hostname || "").toLowerCase().replace(/\.$/, "");
  const expected = String(expectedDomain || "").toLowerCase().replace(/\.$/, "");
  return Boolean(expected && (host === expected || host.endsWith("." + expected)));
}

function issuerCandidateScore(title, rawUrl, cardName) {
  let url;
  try { url = new URL(rawUrl); } catch { return 0; }
  if (/\/(?:sitemap|robots\.txt|search)(?:\/|\.|$)/i.test(url.pathname)) return 0;
  const tokens = cardNameTokens(cardName);
  if (!tokens.length) return 0;
  const titleText = stripMarkup(title || "").toLowerCase();
  const pathText = decodeURIComponent(url.pathname).replace(/[-_/]+/g, " ").toLowerCase();
  const searchable = titleText + " " + pathText;
  const matched = tokens.filter(token => searchable.includes(token));
  if (!matched.length) return 0;
  let score = matched.length * 32;
  if (matched.length === tokens.length) score += 30;
  if (/\bcredit.?cards?\b|\bcards?\b/i.test(searchable)) score += 16;
  if (/\breward|points?|terms?|conditions?|fees?|charges?|mitc|benefits?\b/i.test(searchable)) score += 8;
  if (/\.pdf$/i.test(url.pathname)) score += 4;
  return score;
}

function makeIssuerCandidate(rawUrl, title, baseUrl, expectedDomain, cardName) {
  let parsed;
  try {
    parsed = new URL(decodeHtml(rawUrl).trim(), baseUrl);
    validateOfficialUrl(parsed.toString());
  } catch { return null; }
  if (!isExpectedIssuerHost(parsed.hostname, expectedDomain)) return null;
  parsed.hash = "";
  const url = parsed.toString();
  const cleanedTitle = stripMarkup(title || "").slice(0, 240) || parsed.hostname;
  const score = issuerCandidateScore(cleanedTitle, url, cardName);
  if (score <= 0) return null;
  return { url, title: cleanedTitle, domain: parsed.hostname.toLowerCase(), score };
}

export function parseIssuerSitePage(html, baseUrl, expectedDomain, cardName) {
  const results = [];
  const seen = new Set();
  const anchorRegex = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  for (const match of String(html || "").matchAll(anchorRegex)) {
    const attrs = match[1] || "";
    const hrefMatch = attrs.match(/\bhref\s*=\s*(["'])(.*?)\1/i);
    if (!hrefMatch) continue;
    const titleMatch = attrs.match(/\btitle\s*=\s*(["'])(.*?)\1/i);
    const title = stripMarkup(titleMatch?.[2] || match[2]);
    const candidate = makeIssuerCandidate(hrefMatch[2], title, baseUrl, expectedDomain, cardName);
    if (!candidate || seen.has(candidate.url)) continue;
    seen.add(candidate.url);
    results.push(candidate);
  }
  return results.sort((a, b) => b.score - a.score).slice(0, 30);
}

export function parseIssuerSitemapResults(xml, baseUrl, expectedDomain, cardName) {
  const results = [];
  const seen = new Set();
  for (const match of String(xml || "").matchAll(/<loc\b[^>]*>([\s\S]*?)<\/loc>/gi)) {
    const candidate = makeIssuerCandidate(match[1], "", baseUrl, expectedDomain, cardName);
    if (!candidate || seen.has(candidate.url)) continue;
    seen.add(candidate.url);
    results.push(candidate);
  }
  return results.sort((a, b) => b.score - a.score).slice(0, 30);
}

function issuerSitemapUrls(content, baseUrl, expectedDomain) {
  const found = new Set();
  const candidates = [
    ...String(content || "").matchAll(/^\s*sitemap\s*:\s*(\S+)/gim),
    ...String(content || "").matchAll(/<loc\b[^>]*>([\s\S]*?)<\/loc>/gi)
  ];
  for (const match of candidates) {
    let parsed;
    try {
      parsed = new URL(decodeHtml(match[1]).trim(), baseUrl);
      validateOfficialUrl(parsed.toString());
    } catch { continue; }
    if (!isExpectedIssuerHost(parsed.hostname, expectedDomain)) continue;
    if (!/sitemap/i.test(parsed.pathname) || found.has(parsed.toString())) continue;
    parsed.hash = "";
    found.add(parsed.toString());
  }
  return [...found].slice(0, 5);
}

function discoveryTimeoutOptions(milliseconds = 4500) {
  try {
    return typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
      ? { signal: AbortSignal.timeout(milliseconds) }
      : {};
  } catch {
    return {};
  }
}

async function fetchIssuerDiscoveryPage(rawUrl) {
  try {
    const response = await fetch(rawUrl, {
      headers: {
        "accept": "text/html,application/xhtml+xml,application/xml,text/xml,text/plain;q=0.9,*/*;q=0.8",
        "user-agent": "Mozilla/5.0 (compatible; CreditCardRewardsIntelligence/0.3.0)"
      },
      redirect: "follow",
      ...discoveryTimeoutOptions()
    });
    if (!response.ok) return null;
    const body = (await response.text()).slice(0, 1500000);
    return { url: response.url || rawUrl, body };
  } catch {
    return null;
  }
}

function issuerCardHubUrls(html, baseUrl, expectedDomain) {
  const urls = [];
  const seen = new Set();
  const anchorRegex = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  for (const match of String(html || "").matchAll(anchorRegex)) {
    const attrs = match[1] || "";
    const hrefMatch = attrs.match(/\bhref\s*=\s*(["'])(.*?)\1/i);
    if (!hrefMatch) continue;
    const label = stripMarkup(match[2] + " " + (attrs.match(/\btitle\s*=\s*(["'])(.*?)\1/i)?.[2] || ""));
    let parsed;
    try { parsed = new URL(decodeHtml(hrefMatch[2]), baseUrl); } catch { continue; }
    if (!isExpectedIssuerHost(parsed.hostname, expectedDomain)) continue;
    if (!/(credit.?cards?|card.?products?)/i.test(label + " " + parsed.pathname)) continue;
    parsed.hash = "";
    if (seen.has(parsed.toString())) continue;
    seen.add(parsed.toString());
    urls.push(parsed.toString());
  }
  return urls.slice(0, 3);
}

async function discoverIssuerSiteUrls(domain, cardName) {
  const origin = "https://" + domain;
  const seedUrls = [
    origin + "/robots.txt",
    origin + "/sitemap.xml",
    origin + "/sitemap/"
  ];
  const fetched = await Promise.all(seedUrls.map(fetchIssuerDiscoveryPage));
  const combined = new Map();
  const seenFetched = new Set(seedUrls);
  const nestedSitemaps = new Set();

  const merge = results => {
    for (const result of results) {
      const previous = combined.get(result.url);
      if (!previous || result.score > previous.score) combined.set(result.url, result);
    }
  };

  for (let index = 0; index < fetched.length; index++) {
    const item = fetched[index];
    if (!item) continue;
    if (index === 0) {
      for (const url of issuerSitemapUrls(item.body, item.url, domain)) nestedSitemaps.add(url);
      continue;
    }
    merge(parseIssuerSitemapResults(item.body, item.url, domain, cardName));
    merge(parseIssuerSitePage(item.body, item.url, domain, cardName));
    for (const url of issuerSitemapUrls(item.body, item.url, domain)) nestedSitemaps.add(url);
  }

  if (combined.size < 3 && nestedSitemaps.size) {
    const followups = [...nestedSitemaps].filter(url => !seenFetched.has(url)).slice(0, 3);
    for (const url of followups) seenFetched.add(url);
    const followupBodies = await Promise.all(followups.map(fetchIssuerDiscoveryPage));
    for (const item of followupBodies) {
      if (!item) continue;
      merge(parseIssuerSitemapResults(item.body, item.url, domain, cardName));
      merge(parseIssuerSitePage(item.body, item.url, domain, cardName));
      for (const url of issuerSitemapUrls(item.body, item.url, domain)) {
        if (!seenFetched.has(url)) nestedSitemaps.add(url);
      }
    }
  }

  // If no exact card page was present in the issuer's sitemap, inspect its own
  // homepage and up to three card-catalogue links. Never leave the issuer domain.
  if (!combined.size) {
    const homepage = await fetchIssuerDiscoveryPage(origin + "/");
    if (homepage) {
      merge(parseIssuerSitePage(homepage.body, homepage.url, domain, cardName));
      const hubs = issuerCardHubUrls(homepage.body, homepage.url, domain);
      const hubPages = await Promise.all(hubs.map(fetchIssuerDiscoveryPage));
      for (const item of hubPages) {
        if (item) merge(parseIssuerSitePage(item.body, item.url, domain, cardName));
      }
    }
  }

  return [...combined.values()].sort((a, b) => b.score - a.score).slice(0, 12);
}

function knownOfficialFallbacks(issuer, cardName) {
  const issuerText = String(issuer || "").toLowerCase();
  const cardText = String(cardName || "").toLowerCase();
  if (issuerText.includes("icici") && cardText.includes("sapphiro")) {
    return [
      {
        url: "https://www.icici.bank.in/personal-banking/cards/credit-card/sapphiro-card",
        title: "ICICI Bank Sapphiro Credit Card — rewards, fees and benefits",
        domain: "www.icici.bank.in",
        score: 125
      },
      {
        url: "https://www.icici.bank.in/ishop/faqs",
        title: "ICICI Bank iShop FAQs — accelerated reward points and booking conditions",
        domain: "www.icici.bank.in",
        score: 115
      },
      {
        url: "https://www.icicibank.com/personal-banking/cards/credit-card/sapphiro-card",
        title: "ICICI Bank Sapphiro Credit Card — legacy official page",
        domain: "www.icicibank.com",
        score: 105
      }
    ];
  }
  if (issuerText.includes("hdfc") && cardText.includes("regalia") && cardText.includes("gold")) {
    return [
      {
        url: "https://www.hdfc.bank.in/credit-cards/regalia-gold-credit-card",
        title: "HDFC Bank Regalia Gold Credit Card — current benefits and reward rates",
        domain: "www.hdfc.bank.in",
        score: 145
      },
      {
        url: "https://v.hdfc.bank.in/regalia-gold/features.html",
        title: "HDFC Bank Regalia Gold — rewards, dining and travel features",
        domain: "v.hdfc.bank.in",
        score: 143
      },
      {
        url: "https://www.hdfc.bank.in/credit-cards/regalia-gold-credit-card/fees-and-charges",
        title: "HDFC Bank Regalia Gold — joining fee, renewal fee and waiver conditions",
        domain: "www.hdfc.bank.in",
        score: 142
      },
      {
        url: "https://www.hdfc.bank.in/content/dam/hdfcbankpws/in/en/personal-banking/discover-products/cards/credit-cards/regalia-gold-credit-card/pdfs/lounge-t-and-cs-and-list-Regalia-Gold.pdf",
        title: "HDFC Bank Regalia Gold — domestic lounge access terms effective 1 July 2026",
        domain: "www.hdfc.bank.in",
        score: 141
      },
      {
        url: "https://www.hdfc.bank.in/content/dam/hdfcbankpws/in/en/personal-banking/discover-products/cards/credit-cards/regalia-gold-credit-card/pdfs/regalia-gold-travel-edge-tnc.pdf",
        title: "HDFC Bank Regalia Gold — reward changes effective 15 May 2026 and Travel Edge terms",
        domain: "www.hdfc.bank.in",
        score: 140
      },
      {
        url: "https://www.hdfc.bank.in/content/dam/hdfcbankpws/in/en/personal-banking/discover-products/cards/credit-cards/regalia-gold-credit-card/terms-and-conditions.pdf",
        title: "HDFC Bank Regalia Gold Credit Card — general terms and conditions",
        domain: "www.hdfc.bank.in",
        score: 134
      },
      {
        url: "https://www.hdfcbank.com/content/bbp/repositories/723fb80a-2dde-42a3-9793-7ae1be57c87f/?path=%2FPersonal%2FPay%2FCards%2FCredit+Card%2FCredit+Card+Landing+Page%2FCredit+Cards%2FSuper+Premium%2FRegalia+Gold+Credit+Card%2FRG-T-and-Cs-PDF.pdf",
        title: "HDFC Bank Regalia Gold Credit Card General Terms and Conditions — legacy official URL",
        domain: "www.hdfcbank.com",
        score: 109
      }
    ];
  }
  if (issuerText.includes("axis") && cardText.includes("horizon")) {
    return [
      {
        url: "https://www.axis.bank.in/cards/credit-card/axis-horizon-credit-card",
        title: "Axis Bank HORIZON Credit Card",
        domain: "www.axis.bank.in",
        score: 100
      },
      {
        url: "https://www.axis.bank.in/docs/default-source/default-document-library/credit-cards/terms-and-conditions-for-horizon-credit-card.pdf?sfvrsn=5f8724c2_4",
        title: "Axis Bank HORIZON Credit Card Terms and Conditions",
        domain: "www.axis.bank.in",
        score: 99
      }
    ];
  }
  return [];
}

export async function discoverOfficialUrls(issuer, cardName) {
  const issuerValue = String(issuer || "").trim().slice(0, 100);
  const cardValue = String(cardName || "").trim().slice(0, 140);
  if (issuerValue.length < 2) throw new Error("Enter the bank or card issuer.");
  if (cardValue.length < 2) throw new Error("Enter the exact credit-card name or variant.");
  const domain = issuerDomainFor(issuerValue);
  if (!domain) throw new Error("Automatic URL discovery is not configured for this issuer yet. Check the issuer name and try again; a URL can still be supplied as an optional fallback.");
  const safeCard = cardValue.replace(/["\\]/g, " ").replace(/\s+/g, " ");
  const queries = [
    "site:" + domain + " \"" + safeCard + "\" credit card rewards points terms conditions",
    "site:" + domain + " \"" + safeCard + "\" rewards exclusions annual fee PDF",
    "site:" + domain + " \"" + safeCard + "\" credit card MITC benefits reward programme"
  ];
  const combined = new Map();
  const mergeResults = results => {
    for (const result of results) {
      const cardScore = issuerCandidateScore(result.title, result.url, cardValue);
      const ranked = { ...result, score: Math.max(Number(result.score || 0), cardScore) };
      const existing = combined.get(ranked.url);
      if (!existing || ranked.score > existing.score) combined.set(ranked.url, ranked);
    }
  };
  const readSearchResults = async (url, headers, parser) => {
    try {
      const response = await fetch(url, {
        headers,
        ...discoveryTimeoutOptions(6500)
      });
      if (!response.ok) return [];
      const body = (await response.text()).slice(0, 1200000);
      return parser(body, domain);
    } catch {
      return [];
    }
  };

  // All primary queries run concurrently so a slow provider does not serialise
  // three otherwise independent issuer-specific searches.
  const primaryResults = await Promise.all(queries.map(query =>
    readSearchResults(
      "https://html.duckduckgo.com/html/?q=" + encodeURIComponent(query),
      { "accept": "text/html", "user-agent": "CreditCardRewardsIntelligence/0.3.0" },
      parseDuckDuckGoResults
    )
  ));
  for (const results of primaryResults) mergeResults(results);

  // Search pages can change format or be bot-protected. Probe both fallback
  // formats concurrently; every returned URL still passes the issuer allow-list.
  if (!combined.size) {
    const fallbackRequests = [
      ...queries.slice(0, 2).map(query => ({
        url: "https://lite.duckduckgo.com/lite/?q=" + encodeURIComponent(query),
        headers: { "accept": "text/html", "user-agent": "Mozilla/5.0 (compatible; CreditCardRewardsIntelligence/0.3.0)" },
        parser: parseDuckDuckGoLiteResults
      })),
      ...queries.slice(0, 2).map(query => ({
        url: "https://www.bing.com/search?format=rss&q=" + encodeURIComponent(query),
        headers: { "accept": "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8", "user-agent": "Mozilla/5.0 (compatible; CreditCardRewardsIntelligence/0.3.0)" },
        parser: parseBingRssResults
      }))
    ];
    const fallbackResults = await Promise.all(fallbackRequests.map(request =>
      readSearchResults(request.url, request.headers, request.parser)
    ));
    for (const results of fallbackResults) mergeResults(results);
  }

  // If search results do not identify the requested card, inspect the issuer's
  // own sitemap/catalogue. This is generic across cards—no URL per card required.
  const hasCardMatch = [...combined.values()].some(result =>
    issuerCandidateScore(result.title, result.url, cardValue) > 0
  );
  if (!hasCardMatch) {
    for (const result of await discoverIssuerSiteUrls(domain, cardValue)) {
      const existing = combined.get(result.url);
      if (!existing || result.score > existing.score) combined.set(result.url, result);
    }
  }

  // Retain known verified landing pages as a final fallback for particularly
  // important cards, without requiring a new hardcoded entry for every card.
  mergeResults(knownOfficialFallbacks(issuerValue, cardValue));

  const results = [...combined.values()].sort((a, b) => b.score - a.score).slice(0, 12);
  if (!results.length) {
    throw new Error("No matching official issuer card page was found by search or the issuer sitemap/catalogue. Check the bank and card name and retry; pasting a URL is optional fallback.");
  }
  return results;
}
