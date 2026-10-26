(() => {
  const API_BASE = "/api";
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
  // Overview, Cards, Calculator and Compare each load /cards (and Overview also /health) on
  // every page view. Keep the last response for a short time per tab and share concurrent
  // requests; any non-GET call (publish, archive, reject, extract) clears it immediately.
  const GET_CACHE_TTL_MS = 30000;
  const CACHEABLE_GET_PATHS = new Set(["/cards", "/health"]);
  const CACHE_PREFIX = "criCache:";
  const inflight = new Map();
  function readCached(path) {
    try {
      const entry = JSON.parse(sessionStorage.getItem(CACHE_PREFIX + path) || "null");
      return entry && Date.now() - entry.at < GET_CACHE_TTL_MS ? entry.data : null;
    } catch { return null; }
  }
  function writeCached(path, data) {
    try { sessionStorage.setItem(CACHE_PREFIX + path, JSON.stringify({ at: Date.now(), data })); } catch { /* storage full or unavailable */ }
  }
  function clearCached() {
    try {
      for (let index = sessionStorage.length - 1; index >= 0; index--) {
        const key = sessionStorage.key(index);
        if (key && key.startsWith(CACHE_PREFIX)) sessionStorage.removeItem(key);
      }
    } catch { /* ignore */ }
  }
  async function request(path, options = {}) {
    const method = String(options.method || "GET").toUpperCase();
    if (method !== "GET") clearCached();
    if (method === "GET" && CACHEABLE_GET_PATHS.has(path)) {
      const cached = readCached(path);
      if (cached) return cached;
      if (inflight.has(path)) return inflight.get(path);
      const pending = networkRequest(path, options)
        .then(data => { writeCached(path, data); return data; })
        .finally(() => inflight.delete(path));
      inflight.set(path, pending);
      return pending;
    }
    return networkRequest(path, options);
  }
  async function networkRequest(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (options.body && !headers.has("content-type")) headers.set("content-type", "application/json");
    const token = sessionStorage.getItem("criAdminToken");
    if (token && path.startsWith("/admin/")) headers.set("authorization", `Bearer ${token}`);
    const response = await fetch(`${API_BASE}${path}`, { ...options, headers, cache: "no-store" });
    let data;
    try { data = await response.json(); } catch { data = { error: `Unexpected response (${response.status}).` }; }
    if (!response.ok) {
      const messageParts = [data.error || `Request failed (${response.status}).`];
      if (data.stage) messageParts.push("Stage: " + data.stage);
      if (data.details) messageParts.push("Details: " + data.details);
      if (data.nextStep) messageParts.push(data.nextStep);
      if (data.diagnosticId) messageParts.push("Diagnostic ID: " + data.diagnosticId);
      const error = new Error(messageParts.join(" "));
      error.status = response.status; error.data = data; throw error;
    }
    return data;
  }
  const formatINR = value => value == null || !Number.isFinite(Number(value)) ? "Not specified" : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(value));
  const formatNumber = value => value == null || !Number.isFinite(Number(value)) ? "—" : new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(Number(value));
  const prettyCategory = value => String(value || "other").split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  const statusLabel = status => ({ verified: "Verified", needs_review: "Needs review", no_verified_rules: "No verified rules", demo: "Provisional demo", approved: "Approved", retired: "Retired" }[status] || "Needs review");
  const statusPill = status => {
    const cls = status === "verified" || status === "approved" ? "pill-green" : status === "no_verified_rules" ? "pill-gray" : "pill-amber";
    return `<span class="pill ${cls}">${escapeHtml(statusLabel(status))}</span>`;
  };
  const bankClass = issuer => {
    const v = String(issuer || "").toLowerCase();
    if (v.includes("axis")) return "bank-axis";
    if (v.includes("hdfc")) return "bank-hdfc";
    if (v.includes("icici")) return "bank-icici";
    return "";
  };
  const initials = issuer => String(issuer || "CC").replace(/\b(bank|limited|ltd)\b/gi, "").trim().split(/\s+/).map(word => word[0]).join("").slice(0, 3).toUpperCase() || "CC";
  function renderCardTile(card, compact = false) {
    const rules = Array.isArray(card.rules) ? card.rules : [];
    const approvedRules = rules.filter(rule => rule.status === "approved").length;
    const benefits = Array.isArray(card.benefits) ? card.benefits : [];
    const exclusions = Array.isArray(card.exclusions) ? card.exclusions : [];
    const statusText = card.reviewStatus === "verified" && approvedRules ? "verified" : card.reviewStatus;
    const annualFee = card.annualFee == null || !Number.isFinite(Number(card.annualFee))
      ? "Not recorded"
      : formatINR(card.annualFee);
    const network = card.network || "Not recorded";
    return `<article class="credit-card-tile" data-card-id="${escapeHtml(card.id)}">
      <div class="tile-top">
        <div class="bank-icon ${bankClass(card.issuer)}">${escapeHtml(initials(card.issuer))}</div>
        <div class="tile-status-stack">${statusPill(statusText)}<small>RECORD ${escapeHtml(String(card.id || "").slice(0, 14).toUpperCase() || "—")}</small></div>
      </div>
      <div class="tile-bank">${escapeHtml(card.issuer)}</div>
      <h3 class="tile-title">${escapeHtml(card.name)}</h3>
      <p class="tile-desc">${escapeHtml(card.description || "Issuer card details awaiting review.")}</p>
      <div class="tile-meta">
        <div><div class="meta-label">Network</div><div class="meta-value">${escapeHtml(network)}</div></div>
        <div><div class="meta-label">Reward currency</div><div class="meta-value">${escapeHtml(card.rewardCurrency || "Rewards")}</div></div>
        <div><div class="meta-label">Earning rules</div><div class="meta-value">${rules.length} total · ${approvedRules} approved</div></div>
        <div><div class="meta-label">Annual fee</div><div class="meta-value">${escapeHtml(annualFee)}</div></div>
      </div>
      <div class="tile-card-counts">
        <span><b>${benefits.length}</b> BENEFITS</span>
        <span><b>${exclusions.length}</b> EXCLUSIONS</span>
      </div>
      <div class="tile-bottom">
        <span class="source-indicator ${card.reviewStatus === "verified" ? "verified" : ""}">${card.reviewStatus === "verified" ? "RULES REVIEWED" : "REVIEW REQUIRED"}</span>
        <button class="button button-secondary button-small view-rules-button" type="button" data-card-id="${escapeHtml(card.id)}">${compact ? "Open record" : "View record ↗"}</button>
      </div>
    </article>`;
  }
  function catalogueDataWarning(health, cards) {
    const records = Array.isArray(cards) ? cards : [];
    if (!health || health.mode !== "d1") {
      return {
        tone: "warning",
        title: "Demonstration data is not authoritative.",
        message: "The app is using its starter catalogue because a production D1 database is not connected. Do not use example reward rules for payment decisions."
      };
    }

    const hasDemoStatus = item => item && item.status === "demo";
    const demoCards = records.filter(card =>
      card.reviewStatus === "demo" ||
      [...(card.rules || []), ...(card.benefits || []), ...(card.exclusions || [])].some(hasDemoStatus)
    );
    if (demoCards.length) {
      return {
        tone: "warning",
        title: "Some demonstration rules are present.",
        message: demoCards.length + " card record(s) contain provisional demonstration data. Verify the exact variant, exclusions, caps and effective dates before relying on those entries."
      };
    }

    const cardsNeedingReview = records.filter(card =>
      ["needs_review", "no_verified_rules"].includes(String(card.reviewStatus || "")) ||
      (card.rules || []).some(rule => ["demo", "needs_review"].includes(String(rule.status || "")))
    );
    if (cardsNeedingReview.length) {
      return {
        tone: "neutral",
        title: "Some card records need review.",
        message: cardsNeedingReview.length + " card record(s) have unverified details or no verified earning rules. Use only reviewed earning rules when estimating rewards."
      };
    }
    return null;
  }

  window.CRI = { request, escapeHtml, formatINR, formatNumber, prettyCategory, statusLabel, statusPill, renderCardTile, bankClass, initials, catalogueDataWarning };
})();
