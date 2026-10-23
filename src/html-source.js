import { validateOfficialUrl } from "./source-discovery.js";

const OMIT_BLOCKS = /<(script|style|noscript|template|iframe|svg|canvas|nav|footer|form)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const OMIT_COMMENTS = /<!--[\s\S]*?-->/g;
const LINK_TERMS = /\b(?:terms?|conditions?|tnc|t&c|mitc|reward|points?|benefits?|fees?|charges?|exclusions?|eligibility|lounge|milestone|spend|pdf|priority pass|forex|markup)\b/i;
const CARD_TERMS = /\b(?:credit.?card|card|uni|regalia|horizon|simply.?save|sapphiro|rewards?)\b/i;

export function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&nbsp;|&#160;|&#x0*a0;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, digits) => safeCodePoint(Number(digits)))
    .replace(/&#x([0-9a-f]+);/gi, (_, digits) => safeCodePoint(parseInt(digits, 16)));
}

function safeCodePoint(value) {
  if (!Number.isInteger(value) || value < 0 || value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff)) return " ";
  try { return String.fromCodePoint(value); } catch { return " "; }
}

function attribute(tag, name) {
  const source = String(tag || "");
  const patterns = [
    new RegExp("\\b" + name + "\\s*=\\s*\"([^\"]*)\"", "i"),
    new RegExp("\\b" + name + "\\s*=\\s*'([^']*)'", "i"),
    new RegExp("\\b" + name + "\\s*=\\s*([^\\s>]+)", "i")
  ];
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match) return decodeHtmlEntities(match[1]).trim();
  }
  return "";
}

function issuerRoot(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/\.$/, "");
  const parts = host.split(".").filter(Boolean);
  if (host === "bank.in" || host.endsWith(".bank.in")) return parts.slice(-3).join(".");
  if (host.endsWith(".co.in")) return parts.slice(-3).join(".");
  return parts.slice(-2).join(".");
}

function textFromMarkup(value) {
  return decodeHtmlEntities(String(value || "")
    .replace(OMIT_COMMENTS, " ")
    .replace(OMIT_BLOCKS, " ")
    .replace(/<br\b[^>]*>/gi, "\n")
    .replace(/<\/(?:p|div|li|h[1-6]|tr|section|article|main|dt|dd|table|ul|ol|blockquote|summary|details)\s*>/gi, "\n")
    .replace(/<\/td\s*>/gi, " | ")
    .replace(/<[^>]+>/g, " "))
    .replace(/\u00a0/g, " ")
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function jsonLdText(html) {
  const pieces = [];
  const pattern = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  const useful = new Set(["name", "description", "headline", "articleBody", "text", "termsOfService", "feesAndCommissionsSpecification"]);
  for (const match of String(html || "").matchAll(pattern)) {
    const type = attribute(match[1], "type").toLowerCase();
    if (type !== "application/ld+json") continue;
    try {
      const parsed = JSON.parse(match[2].replace(/^\s*<!--|-->\s*$/g, ""));
      const visit = (node, depth = 0) => {
        if (depth > 7 || node == null) return;
        if (Array.isArray(node)) {
          node.forEach(item => visit(item, depth + 1));
          return;
        }
        if (typeof node !== "object") return;
        for (const [key, value] of Object.entries(node)) {
          if (useful.has(key) && typeof value === "string" && value.trim()) pieces.push(value.trim());
          else if (typeof value === "object") visit(value, depth + 1);
        }
      };
      visit(parsed);
    } catch {}
  }
  return [...new Set(pieces)].join("\n");
}

function metaDescription(html) {
  for (const match of String(html || "").matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    const key = (attribute(tag, "name") || attribute(tag, "property")).toLowerCase();
    if (["description", "og:description", "twitter:description"].includes(key)) {
      const value = attribute(tag, "content");
      if (value) return value;
    }
  }
  return "";
}

function normalizeHeading(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function focusCardSection(html, cardName) {
  const target = normalizeHeading(cardName);
  if (!target) return null;
  const targetTokens = target.split(" ").filter(Boolean);
  const cleanHtml = String(html || "").replace(OMIT_COMMENTS, " ").replace(OMIT_BLOCKS, " ");
  const allHeadings = [...cleanHtml.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi)].map(match => {
    const heading = textFromMarkup(match[2]);
    const normalized = normalizeHeading(heading);
    const tokens = normalized.split(" ").filter(Boolean);
    const overlap = targetTokens.filter(token => tokens.includes(token)).length;
    const coverage = targetTokens.length ? overlap / targetTokens.length : 0;
    const score = normalized === target ? 1000 : coverage * 100 - Math.abs(tokens.length - targetTokens.length) * 3;
    return { level: Number(match[1]), index: match.index, end: match.index + match[0].length, heading, normalized, coverage, score };
  });
  const matches = allHeadings.filter(item => item.coverage >= 0.75 && item.heading);
  if (!matches.length) return null;
  matches.sort((a, b) => b.score - a.score || a.heading.length - b.heading.length);
  const selected = matches[0];
  const nextHeading = allHeadings
    .filter(item => item.index > selected.index && item.level <= selected.level)
    .sort((a, b) => a.index - b.index)[0];
  const sectionHtml = cleanHtml.slice(selected.index, nextHeading ? nextHeading.index : cleanHtml.length);
  return { title: selected.heading, html: sectionHtml, score: selected.score };
}

export function extractOfficialHtml(html, baseUrl, cardName = "") {
  const raw = String(html || "");
  const titleMatch = raw.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i);
  const title = textFromMarkup(titleMatch?.[1] || "") || new URL(baseUrl).hostname;
  const description = metaDescription(raw);
  const focusedSection = focusCardSection(raw, cardName);
  const jsonText = focusedSection ? "" : jsonLdText(raw);

  const withoutNoise = raw
    .replace(OMIT_COMMENTS, " ")
    .replace(OMIT_BLOCKS, " ")
    .replace(/<div\b[^>]*(?:id|class)\s*=\s*["'][^"']*(?:cookie|consent|privacy-banner|social-share|share-tools|newsletter|modal-overlay|popup-overlay)[^"']*["'][^>]*>[\s\S]*?<\/div\s*>/gi, " ");
  const extractionHtml = focusedSection ? focusedSection.html : withoutNoise;

  const mainBlocks = [...extractionHtml.matchAll(/<(?:main|article)\b[^>]*>([\s\S]*?)<\/(?:main|article)\s*>/gi)].map(match => textFromMarkup(match[1]));
  const bodyMatch = extractionHtml.match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/i);
  const bodyText = textFromMarkup(bodyMatch?.[1] || extractionHtml);
  const mainText = mainBlocks.sort((a, b) => b.length - a.length)[0] || "";
  const contentText = mainText.length >= 100 ? mainText : bodyText;
  const meaningfulText = [jsonText, contentText].filter(Boolean).join("\n").trim();
  const readableTextLength = meaningfulText.length;
  const documentTitle = focusedSection ? focusedSection.title : title;
  const documentDescription = focusedSection ? "" : description;
  const parts = [documentTitle, documentDescription, meaningfulText].filter(Boolean);
  const text = [...new Set(parts)].join("\n\n").replace(/\n{3,}/g, "\n\n").trim();

  const links = [];
  const seen = new Set();
  const safeHtml = raw.replace(OMIT_COMMENTS, " ").replace(OMIT_BLOCKS, " ");
  const expectedRoot = issuerRoot(new URL(baseUrl).hostname);
  const anchorPattern = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi;
  for (const match of safeHtml.matchAll(anchorPattern)) {
    const attrs = match[1] || "";
    const href = attribute(attrs, "href");
    if (!href || /^\\s*(?:#|javascript:|data:|mailto:|tel:)/i.test(href)) continue;
    let url;
    try {
      url = new URL(href, baseUrl);
      validateOfficialUrl(url.toString());
    } catch { continue; }
    if (issuerRoot(url.hostname) !== expectedRoot) continue;
    url.hash = "";
    const label = textFromMarkup(match[2]);
    const linkTitle = attribute(attrs, "title") || attribute(attrs, "aria-label") || label || url.pathname.split("/").pop() || url.hostname;
    if (/^(?:skip(?:\\s+to)?\\s+(?:content|main content|navigation)|back to top|menu|home|main content)$/i.test(String(linkTitle).trim()) ||
        /^(?:skip(?:\\s+to)?\\s+(?:content|main content|navigation)|back to top)$/i.test(label.trim())) continue;
    const searchable = String(linkTitle) + " " + label + " " + url.pathname + " " + url.search;
    const isPdf = /\.pdf(?:$|[?#])/i.test(url.href) || /\bpdf\b/i.test(searchable);
    if (!isPdf && !LINK_TERMS.test(searchable)) continue;
    const cardTokens = String(cardName || "").toLowerCase().split(/[^a-z0-9]+/).filter(token => token.length > 2);
    const matchingTokens = cardTokens.filter(token => searchable.toLowerCase().includes(token)).length;
    const score = (isPdf ? 20 : 0) + (LINK_TERMS.test(searchable) ? 8 : 0) +
      (CARD_TERMS.test(searchable) ? 4 : 0) + matchingTokens * 6;
    const key = url.toString();
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ url: key, title: linkTitle.slice(0, 240), score, isPdf });
  }
  links.sort((a, b) => b.score - a.score);
  return {
    title: documentTitle.slice(0, 240),
    description: documentDescription,
    text,
    readableTextLength,
    focusedCardSection: focusedSection ? focusedSection.title : null,
    relatedUrls: links.slice(0, 12),
    javascriptHeavy: readableTextLength < 100 && /<script\b/i.test(raw)
  };
}
