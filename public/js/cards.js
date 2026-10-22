(async () => {
  const C = window.CRI;
  let allCards = [];
  const grid = document.getElementById("cards-grid");
  const search = document.getElementById("card-search");
  const issuer = document.getElementById("issuer-filter");
  const status = document.getElementById("status-filter");
  const count = document.getElementById("cards-count");
  const queryCardId = new URLSearchParams(location.search).get("id");

  function cardDetails(card) {
    const rules = card.rules || [];
    const exclusions = card.exclusions || [];
    const benefits = card.benefits || [];
    return `<div class="detail-panel"><div class="detail-heading"><strong>Reward rules</strong><span>${rules.length} rule(s)</span></div>${rules.length ? `<div class="rule-list">${rules.map(rule => `<div class="rule-row"><div><b>${C.escapeHtml(C.prettyCategory(rule.category))}</b><small>${C.escapeHtml(rule.notes || "No notes supplied.")}</small></div><div class="rule-rate"><strong>${C.escapeHtml(C.formatNumber(rule.rate))}</strong><small>${C.escapeHtml(rule.unit)} / ₹${C.escapeHtml(C.formatNumber(rule.perAmount))}</small><span class="pill ${rule.status === "approved" ? "pill-green" : "pill-amber"}">${C.escapeHtml(C.statusLabel(rule.status))}</span></div></div>`).join("")}</div>` : '<p class="field-help detail-empty">No reward rules have been approved for this card yet. Import the official issuer terms to extract them.</p>'}
      <div class="detail-heading detail-heading-spaced"><strong>Excluded categories</strong><span>${exclusions.length} listed</span></div>${exclusions.length ? `<div class="exclusion-pills">${exclusions.map(ex => `<span class="exclusion-tag">${C.escapeHtml(C.prettyCategory(ex.category))}${ex.status !== "approved" ? " · demo" : ""}</span>`).join("")}</div>` : '<p class="field-help detail-empty">No exclusions are configured. This does not mean the card has no exclusions.</p>'}
      <div class="detail-heading detail-heading-spaced"><strong>Benefits & perks</strong><span>${benefits.length} recorded</span></div>${benefits.length ? `<div class="rule-list">${benefits.map(benefit => { const sourceUrl = benefit.sourceUrl || card.officialUrl; const validity = [benefit.validFrom ? `From ${benefit.validFrom}` : "", benefit.validTo ? `until ${benefit.validTo}` : ""].filter(Boolean).join(" "); return `<div class="rule-row benefit-detail-row"><div><b>${C.escapeHtml(benefit.name)}</b><small>${C.escapeHtml(benefit.description || "No description supplied.")}</small>${benefit.conditions ? `<small><strong>Conditions:</strong> ${C.escapeHtml(benefit.conditions)}</small>` : ""}${benefit.sourceQuote ? `<small class="benefit-source-quote"><strong>Issuer quote:</strong> “${C.escapeHtml(benefit.sourceQuote)}”</small>` : ""}${validity ? `<small><strong>Validity:</strong> ${C.escapeHtml(validity)}</small>` : ""}${sourceUrl ? `<a class="text-link benefit-source-link" href="${C.escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">Open supporting issuer source ↗</a>` : ""}</div>${benefit.status ? C.statusPill(benefit.status) : ""}</div>`; }).join("")}</div>` : '<p class="field-help detail-empty">No lounge, milestone, fee, insurance or other benefits have been published yet.</p>'}
      <div class="tile-bottom source-row"><span class="source-indicator ${card.reviewStatus === "verified" ? "verified" : ""}">${C.escapeHtml(card.sourceDate || "Source date not recorded")}</span>${card.officialUrl ? `<a class="text-link" href="${C.escapeHtml(card.officialUrl)}" target="_blank" rel="noopener noreferrer">Open official source ↗</a>` : ""}<a class="text-link" href="/sources.html">Review source →</a></div></div>`;
  }
  function render() {
    const term = search.value.trim().toLowerCase();
    const issuerVal = issuer.value;
    const statusVal = status.value;
    const filtered = allCards.filter(card => {
      const matchesTerm = `${card.issuer} ${card.name} ${card.rewardCurrency}`.toLowerCase().includes(term);
      const matchesIssuer = !issuerVal || card.issuer === issuerVal;
      const matchesStatus = !statusVal || card.reviewStatus === statusVal;
      return matchesTerm && matchesIssuer && matchesStatus;
    });
    count.textContent = `${filtered.length} card${filtered.length === 1 ? "" : "s"} shown`;
    grid.innerHTML = filtered.length ? filtered.map(card => C.renderCardTile(card)).join("") : '<div class="empty-state"><h3>No matching cards</h3><p>Try a different bank or search term.</p></div>';
    document.querySelectorAll(".view-rules-button").forEach(button => button.addEventListener("click", () => {
      const card = allCards.find(item => item.id === button.dataset.cardId);
      const expanded = document.getElementById(`expanded-${button.dataset.cardId}`);
      if (!card || !expanded) return;
      const opening = expanded.hidden;
      expanded.hidden = !opening;
      if (opening) expanded.innerHTML = cardDetails(card);
      button.textContent = opening ? "Hide rules ↑" : "View benefits & rules ↗";
    }));

    // Catalogue maintenance is available only in a tab with the admin token set in
    // Source Review. Archiving hides a card from the catalogue/calculator but keeps history.
    const hasAdminToken = Boolean(sessionStorage.getItem("criAdminToken"));
    document.querySelectorAll(".credit-card-tile[data-card-id]").forEach(tile => {
      const cardId = tile.dataset.cardId;
      const card = allCards.find(item => item.id === cardId);
      if (!card) return;
      const actions = document.createElement("div");
      actions.className = "card-admin-actions";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "button button-danger card-archive-button";
      button.textContent = hasAdminToken ? "Archive card" : "Admin access required";
      button.disabled = !hasAdminToken;
      button.title = hasAdminToken
        ? "Hide this card from the catalogue and calculator while retaining its source and rule history."
        : "Open Source Review, enter the admin token, then return here to manage cards.";
      button.addEventListener("click", async () => {
        if (!hasAdminToken) return;
        const message = `Archive ${card.issuer} — ${card.name}?\\n\\nIt will disappear from the catalogue and calculator. Rules and source history will be retained. You can archive one of the duplicates and keep the other.`;
        if (!window.confirm(message)) return;
        button.disabled = true;
        button.textContent = "Archiving…";
        try {
          const response = await C.request(`/admin/cards/${encodeURIComponent(card.id)}/archive`, {
            method: "POST",
            body: JSON.stringify({})
          });
          allCards = allCards.filter(item => item.id !== card.id);
          const cardOption = [...issuer.options].find(option => option.value === card.issuer);
          const issuerStillPresent = allCards.some(item => item.issuer === card.issuer);
          if (!issuerStillPresent && cardOption) cardOption.remove();
          render();
          window.alert(response.message || "Card archived.");
        } catch (error) {
          button.disabled = false;
          button.textContent = "Archive card";
          window.alert(error.message || "Could not archive card.");
        }
      });
      actions.appendChild(button);
      tile.appendChild(actions);
    });
  }
  try {
    const { cards } = await C.request("/cards");
    allCards = cards || [];
    const banks = [...new Set(allCards.map(card => card.issuer))].sort();
    issuer.innerHTML = '<option value="">All issuers</option>' + banks.map(bank => `<option value="${C.escapeHtml(bank)}">${C.escapeHtml(bank)}</option>`).join("");
    [search, issuer, status].forEach(control => control.addEventListener(control === search ? "input" : "change", render));
    render();
    if (queryCardId) {
      const card = allCards.find(item => item.id === queryCardId);
      if (card) {
        issuer.value = card.issuer;
        render();
        const btn = document.querySelector(`.view-rules-button[data-card-id="${CSS.escape(card.id)}"]`);
        if (btn) { btn.click(); btn.scrollIntoView({ behavior: "smooth", block: "center" }); }
      }
    }
  } catch (error) {
    grid.innerHTML = `<div class="empty-state"><h3>Could not load cards</h3><p>${C.escapeHtml(error.message)}</p></div>`;
  }
})();
