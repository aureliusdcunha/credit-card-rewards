const PRIORITY_GROUPS = [
  { score: 140, pattern: /\b(?:joining|annual|renewal|membership)\s*(?:\/\s*(?:annual|renewal|membership)\s*)?fee\b|\bfees?\s*(?:&|and)\s*charges\b|\bjoining\s*\/\s*renewal\b/i },
  { score: 135, pattern: /\bfee.{0,80}\b(?:waiv|waived|waiver)\b|\b(?:waiv|waived|waiver).{0,80}\bfee\b/i },
  { score: 130, pattern: /\b(?:reward points?|reward rate|points?\s+(?:for every|per|on every)|base reward|earning rate)\b/i },
  { score: 125, pattern: /\b\d+(?:\.\d+)?\s*[x×]\b|\b(?:accelerated|select merchants?|eligible merchants?|cashback|cash back)\b/i },
  { score: 115, pattern: /\b(?:minimum transaction|minimum spend|minimum purchase|capped|cap of|maximum of|statement cycle|per month|monthly cap)\b/i },
  { score: 105, pattern: /\b(?:joining fee|annual fee|renewal fee|membership fee)\b.{0,100}(?:₹|rs\.?\s*|inr\s*)?[\d,]+/i },
  { score: 95, pattern: /\b(?:lounge|priority pass|boarding pass|airport access)\b/i },
  { score: 90, pattern: /\b(?:exclusions?|excluded|not eligible|will not earn|does not earn|zero reward|no reward)\b/i },
  { score: 85, pattern: /\b(?:insurance|utilities|utility|education|rent|wallet|fuel|cash advance|emi|bill pay|forex|foreign currency|markup)\b/i },
  { score: 75, pattern: /\b(?:milestone|voucher|welcome benefit|benefits?|redemption|redeem|eligibility|valid from|effective from|validity)\b/i }
];

const CONTEXT_HEADING = /^(?:fees?(?:\s*&\s*charges)?|charges|joining fee|annual fee|renewal fee|membership fee|fee waiver|reward benefits?|reward points?|rewards? terms?|exclusions?|eligibility|lounge access|milestone benefits?|welcome benefits?|important terms and conditions)\s*:?$/i;

function scoreLine(line) {
  return PRIORITY_GROUPS.reduce((total, group) => total + (group.pattern.test(line) ? group.score : 0), 0);
}

function cleanLine(line) {
  return String(line || "").replace(/[ \t\r\f\v]+/g, " ").trim();
}

export function prioritizeOfficialSourceText(input, maxChars = 7500) {
  const raw = String(input || "").replace(/\r\n?/g, "\n").trim();
  const limit = Math.max(500, Math.floor(Number(maxChars) || 7500));
  if (raw.length <= limit) return raw;

  const lines = raw.split(/\n+/).map(cleanLine).filter(Boolean);
  if (!lines.length) return raw.slice(0, limit);

  const selected = new Map();
  let used = 0;
  const add = (index, priority = 0) => {
    if (index < 0 || index >= lines.length || selected.has(index)) return;
    const line = lines[index];
    if (!line) return;
    const separatorCost = selected.size ? 1 : 0;
    const available = limit - used - separatorCost;
    if (available <= 0) return;
    // Never store a truncated fee/rule quote, as that would break verbatim
    // evidence and could turn a partial statement into a misleading fact.
    if (line.length > available) return;
    selected.set(index, { line, priority });
    used += line.length + separatorCost;
  };

  // Retain the opening context, which normally identifies the card and explains
  // the product, but reserve most of the budget for source-backed conditions.
  const openingBudget = Math.floor(limit * 0.28);
  for (let i = 0; i < lines.length && used < openingBudget; i++) {
    if (used + lines[i].length + (selected.size ? 1 : 0) > openingBudget) break;
    add(i, 1);
  }

  // Prefer explicit fees/waivers, numeric reward rates, accelerators and their
  // caps/eligibility; these facts are often far below large hero/navigation text
  // on issuer pages. Pull in short section headings immediately before a match.
  const ranked = lines.map((line, index) => ({ line, index, score: scoreLine(line) }))
    .filter(item => item.score > 0 && !selected.has(item.index))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  for (const item of ranked) {
    const previous = lines[item.index - 1];
    if (previous && previous.length <= 90 && CONTEXT_HEADING.test(previous) && !selected.has(item.index - 1)) {
      add(item.index - 1, item.score - 1);
    }
    add(item.index, item.score);
  }

  // Use whatever space remains for other content in original order. This keeps
  // the excerpt useful for non-fee benefits and does not discard all context.
  for (let i = 0; i < lines.length && used < limit; i++) add(i, 0);

  return [...selected.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, value]) => value.line)
    .join("\n")
    .slice(0, limit);
}
