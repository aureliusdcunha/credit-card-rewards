(() => {
  const C = window.CRI;
  const form = document.getElementById("compare-form");
  const optionsHost = document.getElementById("compare-card-options");
  const resultsHost = document.getElementById("compare-results");
  const matrixHost = document.getElementById("compare-matrix");
  const statusLabel = document.getElementById("compare-status");
  const matrixStatus = document.getElementById("compare-matrix-status");
  const countLabel = document.getElementById("compare-selection-count");
  const searchInput = document.getElementById("compare-card-search");
  const dateInput = document.getElementById("compare-date");
  const amountInput = document.getElementById("compare-amount");
  const categoryInput = document.getElementById("compare-category");
  const pointsTab = document.getElementById("compare-tab-points");
  const benefitsTab = document.getElementById("compare-tab-benefits");
  const pointsPanel = document.getElementById("compare-panel-points");
  const benefitsPanel = document.getElementById("compare-panel-benefits");
  const MAX_COMPARE = 5;
  const now = new Date();
  dateInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  let cards = [];
  const selectedIds = new Set();
  let hasCalculated = false;

  const esc = value => C.escapeHtml(value ?? "");
  const feeValue = value => value == null || value === "" || !Number.isFinite(Number(value))
    ? "Not recorded" : C.formatINR(value);
  const countRules = card => {
    const rules = Array.isArray(card.rules) ? card.rules : [];
    return {
      total: rules.length,
      approved: rules.filter(rule => rule.status === "approved").length,
      provisional: rules.filter(rule => rule.status && rule.status !== "approved" && rule.status !== "retired").length
    };
  };
  const sourceUrls = card => [...new Set([
    card.officialUrl,
    ...(card.rules || []).map(rule => rule.sourceUrl),
    ...(card.benefits || []).map(item => item.sourceUrl),
    ...(card.exclusions || []).map(item => item.sourceUrl)
  ].filter(Boolean))];
  const selectedCards = () => [...selectedIds]
    .map(id => cards.find(card => String(card.id) === String(id)))
    .filter(Boolean);

  function setActiveTab(which) {
    const pointsActive = which === "points";
    pointsTab.setAttribute("aria-selected", String(pointsActive));
    benefitsTab.setAttribute("aria-selected", String(!pointsActive));
    pointsTab.tabIndex = pointsActive ? 0 : -1;
    benefitsTab.tabIndex = pointsActive ? -1 : 0;
    pointsTab.classList.toggle("is-active", pointsActive);
    benefitsTab.classList.toggle("is-active", !pointsActive);
    pointsPanel.hidden = !pointsActive;
    benefitsPanel.hidden = pointsActive;
    pointsPanel.classList.toggle("is-active", pointsActive);
    benefitsPanel.classList.toggle("is-active", !pointsActive);
    if (!pointsActive) renderBenefitsForSelection();
  }

  pointsTab.addEventListener("click", () => setActiveTab("points"));
  benefitsTab.addEventListener("click", () => setActiveTab("benefits"));
  [pointsTab, benefitsTab].forEach((tab, index) => tab.addEventListener("keydown", event => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const next = index === 0 ? benefitsTab : pointsTab;
    next.focus();
    setActiveTab(next === pointsTab ? "points" : "benefits");
  }));

  function drawOptions() {
    const query = String(searchInput.value || "").trim().toLowerCase();
    const filtered = cards.filter(card =>
      !query || [card.name, card.issuer, card.network, card.rewardCurrency]
        .some(value => String(value || "").toLowerCase().includes(query))
    );
    optionsHost.innerHTML = filtered.map(card => {
      const ruleCounts = countRules(card);
      const checked = selectedIds.has(String(card.id));
      return `<label class="compare-option ${checked ? "is-selected" : ""}">
        <input type="checkbox" name="compare-card" value="${esc(card.id)}" ${checked ? "checked" : ""}>
        <span class="compare-option-copy">
          <b>${esc(card.name)}</b>
          <small>${esc(card.issuer)} · ${esc(card.rewardCurrency || "Rewards")}</small>
          <small>NETWORK ${esc(card.network || "NOT RECORDED")} · FEE ${esc(feeValue(card.annualFee))}</small>
          <small>${ruleCounts.approved} approved rule(s) · ${esc(C.statusLabel(card.reviewStatus))}</small>
        </span>
      </label>`;
    }).join("") || '<div class="empty-state"><h3>No matching cards</h3><p>Try a different card or issuer name.</p></div>';

    optionsHost.querySelectorAll('input[name="compare-card"]').forEach(checkbox => {
      checkbox.addEventListener("change", () => {
        const id = String(checkbox.value);
        if (checkbox.checked) {
          if (selectedIds.size >= MAX_COMPARE) {
            checkbox.checked = false;
            statusLabel.textContent = `The comparison supports up to ${MAX_COMPARE} cards at a time.`;
            return;
          }
          selectedIds.add(id);
        } else {
          selectedIds.delete(id);
        }
        drawOptions();
        updateSelectionCount();
        renderBenefitsForSelection();
        if (hasCalculated) {
          hasCalculated = false;
          resultsHost.innerHTML = '<div class="empty-state"><h3>Selection changed</h3><p>Return to Reward points and calculate again to update the estimates.</p></div>';
          statusLabel.textContent = "Selection changed · calculate rewards again";
        }
      });
    });
    updateSelectionCount();
  }

  function updateSelectionCount() {
    const count = selectedIds.size;
    countLabel.textContent = count < 2
      ? `${count} selected · choose at least 2 cards.`
      : `${count} selected · compare up to ${MAX_COMPARE} cards.`;
    countLabel.classList.toggle("is-ready", count >= 2);
  }

  function sourceLink(url, label = "Open official source ↗") {
    if (!url) return '<span class="compare-muted">No official source URL recorded</span>';
    return `<a class="result-source" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`;
  }

  function resultCard(item, index) {
    const data = item.data;
    const card = item.card;
    if (data.error) {
      return `<article class="compare-card-result">
        <div class="compare-rank">CARD ${index + 1}</div><h3>${esc(card.name)}</h3>
        <p class="compare-issuer">${esc(card.issuer)}</p><div class="compare-note">${esc(data.error)}</div>
      </article>`;
    }
    if (data.unavailable) {
      const diagnostics = Array.isArray(data.ruleDiagnostics) ? data.ruleDiagnostics : [];
      const diagnosticDetails = diagnostics.length ? `<details class="compare-diagnostics"><summary>Inspect saved rules (${diagnostics.length})</summary>
        <div class="compare-diagnostic-context">Card status: ${esc(data.cardReviewStatus || "unknown")} · category ${esc(data.selectedCategory || "unknown")} · date ${esc(data.selectedDate || "unknown")}</div>
        <div class="compare-diagnostics-list">${diagnostics.map(rule => {
          const rate = rule.rate == null ? "rate missing" : `${C.formatNumber(rule.rate)} ${esc(rule.unit || card.rewardCurrency || "rewards")}`;
          const basis = rule.perAmount == null ? "" : ` per ${C.formatINR(rule.perAmount)} spend`;
          const validity = [rule.validFrom ? `from ${rule.validFrom}` : "", rule.validTo ? `to ${rule.validTo}` : ""].filter(Boolean).join(" · ");
          return `<div class="compare-diagnostic-item"><b>${esc(C.prettyCategory(rule.category))}</b> · ${esc(rule.status || "unknown status")}
            <div>${rate}${esc(basis)}${validity ? " · " + esc(validity) : ""}</div>
            ${rule.sourceQuote ? `<small>${esc(rule.sourceQuote)}</small>` : ""}
            ${rule.notes ? `<small>${esc(rule.notes)}</small>` : ""}
          </div>`;
        }).join("")}</div></details>` : "";
      return `<article class="compare-card-result">
        <div class="compare-rank">CARD ${index + 1} · ESTIMATE UNAVAILABLE</div><h3>${esc(card.name)}</h3>
        <p class="compare-issuer">${esc(card.issuer)}</p>
        <div class="compare-note">${esc(data.explanation || "No applicable verified earning rule is available for this category.")}</div>
        ${data.notes?.length ? `<ul class="compare-detail-notes">${data.notes.map(note => `<li>${esc(note)}</li>`).join("")}</ul>` : ""}
        ${diagnosticDetails}
        ${card.officialUrl ? sourceLink(card.officialUrl, "Issuer source ↗") : ""}
      </article>`;
    }
    return `<article class="compare-card-result">
      <div class="compare-rank">CARD ${index + 1} · ${data.ruleStatus === "approved" ? "VERIFIED RULE" : "PROVISIONAL RULE"}</div>
      <h3>${esc(card.name)}</h3><p class="compare-issuer">${esc(card.issuer)}</p>
      <div class="compare-points">${data.points == null ? "—" : C.formatNumber(data.points)}</div>
      <div class="compare-unit">${esc(data.rewardUnit || "Rewards")}${data.excluded ? " · excluded" : " estimated"}</div>
      <div class="compare-rule">${esc(data.explanation || "No calculation details.")}</div>
      ${data.notes?.length ? `<div class="compare-note">${esc(data.notes[0])}</div>` : ""}
      ${card.officialUrl ? sourceLink(card.officialUrl, "Issuer source ↗") : ""}
    </article>`;
  }

  function listSummary(items, kind) {
    if (!Array.isArray(items) || !items.length) return '<span class="compare-muted">No ' + esc(kind) + ' recorded</span>';
    const names = items.map(item => item.name || item.title || item.category || item.description || item.reason || "Unlabelled record");
    const visible = names.slice(0, 3).map(name => `<li>${esc(name)}</li>`).join("");
    const remaining = names.length > 3 ? `<details class="compare-more"><summary>+${names.length - 3} more</summary><ul>${names.slice(3).map(name => `<li>${esc(name)}</li>`).join("")}</ul></details>` : "";
    return `<span class="compare-list-count">${items.length} recorded</span><ul class="compare-fact-list">${visible}</ul>${remaining}`;
  }

  function ruleSummary(card) {
    const rules = Array.isArray(card.rules) ? card.rules : [];
    const approved = rules.filter(rule => rule.status === "approved");
    if (!approved.length) {
      return `<div class="compare-rule-cell">${C.statusPill(card.reviewStatus)}<p class="compare-muted">No approved earning rules recorded. ${rules.length ? "Saved rules need review." : "Source a complete rule before calculating rewards."}</p></div>`;
    }
    return `<div class="compare-rule-cell">${approved.map(rule => {
      const formula = `${C.formatNumber(rule.rate)} ${rule.unit || card.rewardCurrency || "rewards"} / ${C.formatINR(rule.perAmount)} spend`;
      const cap = rule.cap && rule.cap.value != null
        ? `<small>Cap: ${esc(C.formatNumber(rule.cap.value))} ${esc(rule.cap.type === "points" ? (rule.unit || card.rewardCurrency || "points") : "spend")} ${esc(String(rule.cap.period || "").replace(/_/g, " "))}</small>`
        : "";
      const quote = rule.sourceQuote ? `<details><summary>Source quote</summary><blockquote>${esc(rule.sourceQuote)}</blockquote>${rule.sourceUrl ? sourceLink(rule.sourceUrl) : ""}</details>` : "";
      return `<div class="compare-rule-snippet"><b>${esc(C.prettyCategory(rule.category))}</b><strong>${esc(formula)}</strong>${cap}${quote}</div>`;
    }).join("")}</div>`;
  }

  function cardFeatureMatrix(selected) {
    if (selected.length < 2) {
      matrixHost.innerHTML = '<div class="empty-state"><h3>Select at least two cards</h3><p>Use the card picker above. Your selected cards are shared with the Reward points tab.</p></div>';
      matrixStatus.textContent = "Select 2–5 cards";
      return;
    }
    const rows = [
      ["Review status", card => C.statusPill(card.reviewStatus)],
      ["Payment network", card => esc(card.network || "Not recorded")],
      ["Reward currency", card => esc(card.rewardCurrency || "Rewards")],
      ["Annual fee", card => esc(feeValue(card.annualFee))],
      ["Joining fee", card => esc(feeValue(card.joiningFee))],
      ["Annual-fee waiver", card => card.annualFeeWaiver ? esc(card.annualFeeWaiver) : '<span class="compare-muted">Not recorded</span>'],
      ["Approved earning rules", card => {
        const counts = countRules(card);
        return `<strong>${counts.approved}</strong> approved / ${counts.total} saved${counts.provisional ? `<small class="compare-muted">${counts.provisional} require review</small>` : ""}`;
      }],
      ["Earning rules & source quotes", card => ruleSummary(card)],
      ["Benefits", card => listSummary(card.benefits, "benefits")],
      ["Exclusions / restrictions", card => listSummary(card.exclusions, "exclusions")],
      ["Source / effective date", card => {
        const urls = sourceUrls(card);
        const date = card.sourceDate ? `<small>Catalogue source date: ${esc(card.sourceDate)}</small>` : "";
        return `${urls.length ? urls.slice(0, 3).map((url, i) => sourceLink(url, i === 0 ? "Open issuer source ↗" : "Additional source ↗")).join("<br>") : '<span class="compare-muted">No source URL recorded</span>'}${date}`;
      }]
    ];
    matrixHost.innerHTML = `<div class="compare-matrix-caption">BENEFITS MATRIX · ${selected.length} CARDS</div>
      <div class="terminal-table-wrap compare-matrix-wrap"><table class="terminal-table compare-matrix-table">
        <thead><tr><th scope="col">Attribute</th>${selected.map((card,index) => `<th scope="col"><span class="compare-matrix-card-num">CARD 0${index+1}</span><strong>${esc(card.issuer)}</strong><b>${esc(card.name)}</b></th>`).join("")}</tr></thead>
        <tbody>${rows.map(([label, render]) => `<tr><th scope="row">${esc(label)}</th>${selected.map(card => `<td>${render(card)}</td>`).join("")}</tr>`).join("")}</tbody>
      </table></div>
      <p class="compare-matrix-footnote">“Not recorded” means the catalogue does not have a verified value. It does not mean ₹0, no restrictions, or no benefits. Only approved earning rules are shown in this view; verify issuer quotes and the exact card variant before relying on results.</p>`;
    matrixStatus.textContent = `${selected.length} cards · fees, benefits, restrictions and rules`;
  }

  function renderBenefitsForSelection() {
    cardFeatureMatrix(selectedCards());
  }

  async function runComparison(event) {
    event.preventDefault();
    const ids = [...selectedIds];
    if (ids.length < 2) { statusLabel.textContent = "Choose at least two cards."; return; }
    if (ids.length > MAX_COMPARE) { statusLabel.textContent = `Choose no more than ${MAX_COMPARE} cards.`; return; }
    const amount = Number(amountInput.value);
    if (!Number.isFinite(amount) || amount <= 0) { statusLabel.textContent = "Enter a purchase amount greater than ₹0."; amountInput.focus(); return; }
    const category = categoryInput.value;
    const date = dateInput.value;
    if (!date) { statusLabel.textContent = "Choose a transaction date."; dateInput.focus(); return; }
    const chosenCards = selectedCards();
    statusLabel.textContent = "Calculating selected cards…";
    resultsHost.innerHTML = '<div class="loading-card">Calculating the same transaction against each selected card…</div>';
    const comparison = await Promise.all(chosenCards.map(async card => {
      try {
        const data = await C.request("/calculate", {
          method: "POST",
          body: JSON.stringify({ cardId: card.id, amount, category, purchaseDate: date })
        });
        return { card, data };
      } catch (error) { return { card, data: { error: error.message } }; }
    }));
    resultsHost.innerHTML = comparison.map(resultCard).join("");
    hasCalculated = true;
    statusLabel.textContent = `${comparison.length} cards compared · ${C.prettyCategory(category)} · ${C.formatINR(amount)}`;
  }

  searchInput.addEventListener("input", drawOptions);
  form.addEventListener("submit", runComparison);
  C.request("/cards").then(response => {
    cards = response.cards || [];
    selectedIds.clear();
    cards.slice(0, Math.min(2, MAX_COMPARE)).forEach(card => selectedIds.add(String(card.id)));
    drawOptions();
    renderBenefitsForSelection();
    if (cards.length < 2) {
      optionsHost.innerHTML = '<div class="empty-state"><h3>Not enough cards</h3><p>Add at least two cards to the catalogue to use comparison.</p></div>';
    }
  }).catch(error => {
    optionsHost.textContent = `Could not load cards: ${error.message}`;
    resultsHost.innerHTML = `<div class="empty-state"><h3>Catalogue unavailable</h3><p>${esc(error.message)}</p></div>`;
    matrixHost.innerHTML = '<div class="empty-state"><h3>Catalogue unavailable</h3><p>Card benefits could not be loaded.</p></div>';
  });
})();