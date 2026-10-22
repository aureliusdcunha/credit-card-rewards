(() => {
  const C = window.CRI;
  const form = document.getElementById("compare-form");
  const optionsHost = document.getElementById("compare-card-options");
  const resultsHost = document.getElementById("compare-results");
  const statusLabel = document.getElementById("compare-status");
  const dateInput = document.getElementById("compare-date");
  const now = new Date(); dateInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  let cards = [];

  function drawOptions() {
    optionsHost.innerHTML = cards.map((card, index) => `<label class="compare-option"><input type="checkbox" name="compare-card" value="${C.escapeHtml(card.id)}" ${index < Math.min(2, cards.length) ? "checked" : ""}><span><b>${C.escapeHtml(card.name)}</b><small>${C.escapeHtml(card.issuer)} · ${C.escapeHtml(card.rewardCurrency)}</small></span></label>`).join("");
    optionsHost.querySelectorAll('input[name="compare-card"]').forEach(checkbox => checkbox.addEventListener("change", () => {
      const selected = [...optionsHost.querySelectorAll('input:checked')];
      if (selected.length > 3) { checkbox.checked = false; statusLabel.textContent = "You can compare up to 3 cards."; }
    }));
  }
  function resultCard(item, index) {
    const data = item.data;
    if (data.error) return `<article class="compare-card-result"><div class="compare-rank">CARD ${index + 1}</div><h3>${C.escapeHtml(item.card.name)}</h3><p class="compare-issuer">${C.escapeHtml(item.card.issuer)}</p><div class="compare-note">${C.escapeHtml(data.error)}</div></article>`;
    if (data.unavailable) {
      const diagnostics = Array.isArray(data.ruleDiagnostics) ? data.ruleDiagnostics : [];
      const diagnosticDetails = diagnostics.length ? `<details class="compare-diagnostics"><summary>Saved rules (${diagnostics.length})</summary><div class="compare-diagnostic-context">App rule context: ${C.escapeHtml(data.cardReviewStatus || "unknown card status")} · category ${C.escapeHtml(data.selectedCategory || "unknown")} · date ${C.escapeHtml(data.selectedDate || "unknown")}</div><div class="compare-diagnostics-list">${diagnostics.map(rule => {
        const rate = rule.rate == null ? "rate missing" : `${C.formatNumber(rule.rate)} ${C.escapeHtml(rule.unit || item.card.rewardCurrency || "rewards")}`;
        const basis = rule.perAmount == null ? "" : ` per ₹${C.formatNumber(rule.perAmount)}`;
        const validity = [rule.validFrom ? `from ${rule.validFrom}` : "", rule.validTo ? `to ${rule.validTo}` : ""].filter(Boolean).join(" · ");
        return `<div class="compare-diagnostic-item"><b>${C.escapeHtml(rule.category || "uncategorized")}</b> · ${C.escapeHtml(rule.status || "unknown status")}<div>${rate}${basis}${validity ? ` · ${C.escapeHtml(validity)}` : ""}</div>${rule.sourceQuote ? `<small>${C.escapeHtml(rule.sourceQuote)}</small>` : ""}${rule.notes ? `<small>${C.escapeHtml(rule.notes)}</small>` : ""}</div>`;
      }).join("")}</div></details>` : "";
      return `<article class="compare-card-result"><div class="compare-rank">CARD ${index + 1}</div><h3>${C.escapeHtml(item.card.name)}</h3><p class="compare-issuer">${C.escapeHtml(item.card.issuer)}</p><div class="compare-note">${C.escapeHtml(data.explanation || "No applicable verified rule is available for this category.")}</div>${data.notes?.length ? `<ul class="compare-detail-notes">${data.notes.map(note => `<li>${C.escapeHtml(note)}</li>`).join("")}</ul>` : ""}${diagnosticDetails}${item.card.officialUrl ? `<a class="result-source" href="${C.escapeHtml(item.card.officialUrl)}" target="_blank" rel="noopener noreferrer">Issuer source ↗</a>` : ""}</article>`;
    }
    return `<article class="compare-card-result"><div class="compare-rank">CARD ${index + 1} · ${data.ruleStatus === "approved" ? "VERIFIED RULE" : "PROVISIONAL RULE"}</div><h3>${C.escapeHtml(item.card.name)}</h3><p class="compare-issuer">${C.escapeHtml(item.card.issuer)}</p><div class="compare-points">${data.points == null ? "—" : C.formatNumber(data.points)}</div><div class="compare-unit">${C.escapeHtml(data.rewardUnit || "Rewards")}${data.excluded ? " · excluded" : " estimated"}</div><div class="compare-rule">${C.escapeHtml(data.explanation || "No calculation details.")}</div>${data.notes?.length ? `<div class="compare-note">${C.escapeHtml(data.notes[0])}</div>` : ""}${item.card.officialUrl ? `<a class="result-source" href="${C.escapeHtml(item.card.officialUrl)}" target="_blank" rel="noopener noreferrer">Issuer source ↗</a>` : ""}</article>`;
  }
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const ids = [...optionsHost.querySelectorAll('input[name="compare-card"]:checked')].map(input => input.value);
    if (ids.length < 2) { statusLabel.textContent = "Choose at least two cards."; return; }
    if (ids.length > 3) { statusLabel.textContent = "Choose no more than three cards."; return; }
    const amount = Number(document.getElementById("compare-amount").value);
    const category = document.getElementById("compare-category").value;
    statusLabel.textContent = "Calculating…";
    resultsHost.innerHTML = '<div class="loading-card">Calculating selected cards…</div>';
    const comparison = await Promise.all(ids.map(async id => {
      const card = cards.find(item => item.id === id);
      try {
        const data = await C.request("/calculate", { method: "POST", body: JSON.stringify({ cardId: id, amount, category, purchaseDate: dateInput.value }) });
        return { card, data };
      } catch (error) { return { card, data: { error: error.message } }; }
    }));
    resultsHost.innerHTML = comparison.map(resultCard).join("");
    statusLabel.textContent = `${comparison.length} cards compared · points are not necessarily equivalent`;
  });

  C.request("/cards").then(response => { cards = response.cards || []; drawOptions(); }).catch(error => {
    optionsHost.textContent = `Could not load cards: ${error.message}`;
    resultsHost.innerHTML = `<div class="empty-state"><h3>Catalogue unavailable</h3><p>${C.escapeHtml(error.message)}</p></div>`;
  });
})();
