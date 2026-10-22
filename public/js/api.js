(() => {
  const API_BASE = "/api";
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
  async function request(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (options.body && !headers.has("content-type")) headers.set("content-type", "application/json");
    const token = sessionStorage.getItem("criAdminToken");
    if (token && path.startsWith("/admin/")) headers.set("authorization", `Bearer ${token}`);
    const response = await fetch(`${API_BASE}${path}`, { ...options, headers, cache: "no-store" });
    let data;
    try { data = await response.json(); } catch { data = { error: `Unexpected response (${response.status}).` }; }
    if (!response.ok) {
      const error = new Error(data.error || `Request failed (${response.status}).`);
      error.status = response.status; error.data = data; throw error;
    }
    return data;
  }
  const formatINR = value => value == null || !Number.isFinite(Number(value)) ? "Not specified" : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(value));
  const formatNumber = value => value == null || !Number.isFinite(Number(value)) ? "—" : new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(Number(value));
  const prettyCategory = value => String(value || "other").split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  const statusLabel = status => ({ verified: "Verified", needs_review: "Needs review", no_verified_rules: "No verified rules", demo: "Provisional demo", approved: "Approved", retired: "Retired", needs_review: "Needs review" }[status] || "Needs review");
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
    const verifiedRules = rules.filter(rule => rule.status === "approved").length;
    const ruleCount = rules.length;
    const benefitCount = Array.isArray(card.benefits) ? card.benefits.length : 0;
    const statusText = card.reviewStatus === "verified" && verifiedRules ? "verified" : card.reviewStatus;
    return `<article class="credit-card-tile" data-card-id="${escapeHtml(card.id)}">
      <div class="tile-top"><div class="bank-icon ${bankClass(card.issuer)}">${escapeHtml(initials(card.issuer))}</div>${statusPill(statusText)}</div>
      <div class="tile-bank">${escapeHtml(card.issuer)}</div><h3 class="tile-title">${escapeHtml(card.name)}</h3>
      <p class="tile-desc">${escapeHtml(card.description || "Issuer card details awaiting review.")}</p>
      <div class="tile-meta"><div><div class="meta-label">Reward currency</div><div class="meta-value">${escapeHtml(card.rewardCurrency || "Rewards")}</div></div><div><div class="meta-label">Rules & benefits</div><div class="meta-value">${ruleCount ? `${ruleCount} rules · ${verifiedRules} verified` : "No rules yet"} · ${benefitCount} benefits</div></div></div>
      <div class="tile-bottom"><span class="source-indicator ${card.reviewStatus === "verified" ? "verified" : ""}">${card.reviewStatus === "verified" ? "Official rules reviewed" : "Source needs review"}</span><button class="text-link view-rules-button" type="button" data-card-id="${escapeHtml(card.id)}">${compact ? "View card" : "View benefits & rules ↗"}</button></div>
    </article>`;
  }
  window.CRI = { request, escapeHtml, formatINR, formatNumber, prettyCategory, statusLabel, statusPill, renderCardTile, bankClass, initials };
})();
