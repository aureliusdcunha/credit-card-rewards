(() => {
  const C = window.CRI;
  const form = document.getElementById("calculator-form");
  const result = document.getElementById("calc-result");
  const errorEl = document.getElementById("calc-error");
  const dateInput = document.getElementById("calc-date");
  const today = new Date();
  dateInput.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  let cards = [];

  function renderResult(data) {
    if (data.unavailable) {
      result.innerHTML = `<div class="result-header"><div><div class="result-label">RULE NOT AVAILABLE</div><h2 class="result-card-name">${C.escapeHtml(data.cardName)}</h2><div class="result-amount">${C.formatINR(data.amount)} · ${C.escapeHtml(C.prettyCategory(data.category))}</div></div>${C.statusPill("no_verified_rules")}</div><hr class="result-divider"><div class="empty-state"><h3>Cannot calculate this category yet</h3><p>${C.escapeHtml(data.explanation)}</p></div><ul class="result-notes">${(data.notes || []).map(note => `<li>${C.escapeHtml(note)}</li>`).join("")}</ul>${data.sourceUrl ? `<a class="result-source" href="${C.escapeHtml(data.sourceUrl)}" target="_blank" rel="noopener noreferrer">Review official issuer source ↗</a>` : ""}`;
      return;
    }
    const points = data.points == null ? "—" : C.formatNumber(data.points);
    const amount = C.formatINR(data.amount);
    const status = data.ruleStatus === "approved" ? "verified" : "needs_review";
    result.innerHTML = `<div class="result-header"><div><div class="result-label">${data.excluded ? "ELIGIBILITY RESULT" : "REWARD ESTIMATE"}</div><h2 class="result-card-name">${C.escapeHtml(data.cardName)}</h2><div class="result-amount">${amount} · ${C.escapeHtml(C.prettyCategory(data.category))}</div></div>${C.statusPill(status)}</div><div class="result-points">${points}</div><div class="result-unit">${C.escapeHtml(data.rewardUnit || "Rewards")}${data.excluded ? " expected under the selected rule" : " estimated"}</div><div class="result-subtitle">${data.excluded ? "No rewards under the applicable configured exclusion/minimum." : `Calculated on ${C.formatINR(data.eligibleAmount ?? data.amount)} of eligible spend.`}</div><hr class="result-divider"><div class="result-kv"><div><div class="result-kv-label">Earning rate</div><div class="result-kv-value">${data.rate == null ? "Not applicable" : `${C.formatNumber(data.rate)} ${C.escapeHtml(data.rewardUnit)} / ₹${C.formatNumber(data.perAmount)}`}</div></div><div><div class="result-kv-label">Rupee value</div><div class="result-kv-value">Not configured</div></div><div><div class="result-kv-label">Cap applied</div><div class="result-kv-value">${data.capped ? "Yes / capped" : "No cap applied"}</div></div><div><div class="result-kv-label">Rule status</div><div class="result-kv-value">${C.escapeHtml(C.statusLabel(data.ruleStatus))}</div></div></div><div class="explanation-box">${C.escapeHtml(data.explanation || "Calculation based on the matching reward rule.")}</div>${data.notes?.length ? `<ul class="result-notes">${data.notes.map(note => `<li>${C.escapeHtml(note)}</li>`).join("")}</ul>` : ""}${data.sourceUrl ? `<a class="result-source" href="${C.escapeHtml(data.sourceUrl)}" target="_blank" rel="noopener noreferrer">Open linked issuer terms ↗</a>` : ""}`;
  }

  async function init() {
    try {
      const response = await C.request("/cards");
      cards = response.cards || [];
      const select = document.getElementById("calc-card");
      select.innerHTML = '<option value="">Select a credit card</option>' + cards.map(card => `<option value="${C.escapeHtml(card.id)}">${C.escapeHtml(card.issuer)} · ${C.escapeHtml(card.name)}</option>`).join("");
      const initial = new URLSearchParams(location.search).get("card");
      if (initial && cards.some(card => card.id === initial)) select.value = initial;
    } catch (error) {
      errorEl.textContent = `Could not load cards: ${error.message}`;
    }
  }
  form.addEventListener("submit", async event => {
    event.preventDefault(); errorEl.textContent = "";
    const payload = {
      cardId: document.getElementById("calc-card").value,
      amount: Number(document.getElementById("calc-amount").value),
      category: document.getElementById("calc-category").value,
      purchaseDate: dateInput.value,
      periodSpendBefore: Number(document.getElementById("calc-prior").value || 0),
      periodPointsBefore: Number(document.getElementById("calc-prior-points")?.value || 0)
    };
    try {
      const data = await C.request("/calculate", { method: "POST", body: JSON.stringify(payload) });
      if (!data.ok) throw new Error(data.error || "Could not calculate the rewards.");
      renderResult(data);
    } catch (error) {
      errorEl.textContent = error.message;
    }
  });
  init();
})();
