export const OFFICIAL_DOMAINS = [
  "axisbank.com", "hdfcbank.com", "icicibank.com", "sbicard.com", "sbi.co.in",
  "kotak.com", "idfcfirstbank.com", "indusind.com", "rblbank.com", "yesbank.in",
  "hsbc.co.in", "americanexpress.com", "amex.co.in", "bobfinancial.com",
  "federalbank.co.in", "aubank.in", "au.bank.in", "standardchartered.co.in"
];

const ISSUER_DOMAIN_MAP = [
  { terms: ["axis"], domain: "axisbank.com" },
  { terms: ["hdfc"], domain: "hdfcbank.com" },
  { terms: ["icici"], domain: "icicibank.com" },
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
  { terms: ["standard chartered", "stanchart"], domain: "standardchartered.co.in" }
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

export async function discoverOfficialUrls(issuer, cardName) {
  const issuerValue = String(issuer || "").trim().slice(0, 100);
  const cardValue = String(cardName || "").trim().slice(0, 140);
  if (issuerValue.length < 2) throw new Error("Enter the bank or card issuer.");
  if (cardValue.length < 2) throw new Error("Enter the exact credit-card name or variant.");
  const domain = issuerDomainFor(issuerValue);
  if (!domain) throw new Error("Automatic search is not configured for this issuer yet. Use the official-URL fallback below.");
  const safeCard = cardValue.replace(/["\\]/g, " ").replace(/\s+/g, " ");
  const queries = [
    "site:" + domain + " \"" + safeCard + "\" credit card rewards points terms conditions",
    "site:" + domain + " \"" + safeCard + "\" rewards exclusions annual fee PDF",
    "site:" + domain + " \"" + safeCard + "\" credit card MITC benefits reward programme"
  ];
  const combined = new Map();
  for (const query of queries) {
    let response;
    try {
      response = await fetch("https://html.duckduckgo.com/html/?q=" + encodeURIComponent(query), {
        headers: { "accept": "text/html", "user-agent": "CreditCardRewardsIntelligence/0.1" }
      });
    } catch { continue; }
    if (!response.ok) continue;
    const html = (await response.text()).slice(0, 1200000);
    for (const result of parseDuckDuckGoResults(html, domain)) {
      const existing = combined.get(result.url);
      if (!existing || result.score > existing.score) combined.set(result.url, result);
    }
  }
  const results = [...combined.values()].sort((a, b) => b.score - a.score).slice(0, 12);
  if (!results.length) throw new Error("The free search source returned no readable official issuer results. Try again or use the official-URL fallback below.");
  return results;
}
