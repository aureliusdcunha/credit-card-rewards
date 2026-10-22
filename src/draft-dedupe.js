function normalizeIdentityPart(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function parseExtracted(row) {
  try {
    const data = typeof row?.extracted_json === "string" ? JSON.parse(row.extracted_json) : row?.extracted_json;
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

export function normalizeSourceUrl(raw) {
  try {
    const url = new URL(String(raw || ""));
    url.hash = "";
    url.search = "";
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString().toLowerCase();
  } catch {
    return String(raw || "").trim().toLowerCase();
  }
}

export function draftIdentity(row) {
  const extracted = parseExtracted(row);
  const issuer = normalizeIdentityPart(extracted.issuer);
  const cardName = normalizeIdentityPart(extracted.cardName);
  if (issuer && cardName) return "card|" + issuer + "|" + cardName;

  const source = normalizeSourceUrl(row?.source_url);
  if (issuer && source) return "source|" + issuer + "|" + source;
  if (source) return "source|" + source;
  return null;
}

export function deduplicatePendingDraftRows(rows) {
  const seen = new Set();
  const unique = [];
  for (const row of rows || []) {
    const key = draftIdentity(row);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    unique.push(row);
  }
  return unique;
}

export function sameCardIdentity(row, issuerName, cardNameValue) {
  const extracted = parseExtracted(row);
  const issuer = normalizeIdentityPart(extracted.issuer);
  const name = normalizeIdentityPart(extracted.cardName);
  return Boolean(issuer && name &&
    issuer === normalizeIdentityPart(issuerName) &&
    name === normalizeIdentityPart(cardNameValue));
}

export function normalizeIdentityPartForCompare(value) {
  return normalizeIdentityPart(value);
}
