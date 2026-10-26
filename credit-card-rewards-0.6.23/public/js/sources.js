(() => {
  const C = window.CRI;
  const tokenInput = document.getElementById("admin-token");
  const adminStatus = document.getElementById("admin-status");
  const sourceForm = document.getElementById("source-form");
  const discoverForm = document.getElementById("discover-form");
  const discoverButton = document.getElementById("discover-button");
  const discoverError = document.getElementById("discover-error");
  const discoverSuccess = document.getElementById("discover-success");
  const extractButton = document.getElementById("extract-button");
  const errorBox = document.getElementById("source-error");
  const successBox = document.getElementById("source-success");
  const draftPanel = document.getElementById("draft-editor-panel");
  const draftJson = document.getElementById("draft-json");
  const draftSummary = document.getElementById("draft-summary");
  const draftMeta = document.getElementById("draft-meta");
  const reviewMessage = document.getElementById("review-message");
  const draftList = document.getElementById("draft-list");
  const cardSelect = document.getElementById("source-card");
  let cards = [];
  let currentDraftId = null;
  let currentSourceUrl = "";
  let currentSourceTitle = "";
  let currentCardId = "";

  const getToken = () => sessionStorage.getItem("criAdminToken") || "";
  function formatTimingSummary(timingMs) {
    if (!timingMs || typeof timingMs !== "object") return "";
    const seconds = value => Number.isFinite(Number(value)) ? (Number(value) / 1000).toFixed(1) + "s" : "n/a";
    return " Timing: discovery " + seconds(timingMs.discoveryMs) +
      " · source reading " + seconds(timingMs.sourceReadMs) +
      " · AI + save " + seconds(timingMs.aiExtractionMs) +
      " · total " + seconds(timingMs.totalMs) + ".";
  }
  function setAdminStatus(message, isError = false) {
    adminStatus.textContent = message;
    adminStatus.style.color = isError ? "#b42318" : "#8499ac";
  }
  function parseEditorJson() {
    try {
      const value = JSON.parse(draftJson.value);
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("The JSON must be an object.");
      return value;
    } catch (error) { throw new Error(`Review JSON is invalid: ${error.message}`); }
  }
  function displayFieldName(key) {
    const known = {
      cardName: "Card name", issuer: "Issuer", rewardCurrency: "Reward currency", network: "Network",
      annualFee: "Annual fee", joiningFee: "Joining fee", annualFeeWaiver: "Fee waiver",
      effectiveDate: "Effective date", validFrom: "Valid from", validTo: "Valid to",
      perAmount: "Spend amount", minTransaction: "Minimum transaction", cap: "Cap / limit",
      overCapCategory: "Rate after cap", merchantCondition: "Eligible merchants",
      channelCondition: "Payment channel", sourceQuote: "Source evidence", sourceUrl: "Official source URL",
      calculatorEligible: "Used by calculator", isAccelerated: "Accelerated offer",
      isBonus: "Bonus component", multiplier: "Multiplier", rounding: "Rounding",
      missingItems: "Missing information", exclusions: "Exclusions", benefits: "Benefits",
      rules: "Earning rules", annualFeeWaiverText: "Annual fee waiver", summary: "Summary",
      notes: "Notes", status: "Status", category: "Category", rate: "Rate", unit: "Reward unit",
      formula: "Earning formula", eligibility: "Eligibility", conditions: "Conditions",
      description: "Description", name: "Name", title: "Title", type: "Type", value: "Value",
      period: "Period", minimum: "Minimum", maximum: "Maximum", amount: "Amount"
    };
    if (known[key]) return known[key];
    return String(key || "")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .replace(/^./, letter => letter.toUpperCase());
  }

  function hasDisplayValue(value) {
    return value !== null && value !== undefined && value !== "" &&
      !(typeof value === "number" && !Number.isFinite(value));
  }

  function appendNestedValue(parent, value) {
    if (Array.isArray(value)) {
      if (!value.length) return;
      const ul = document.createElement("ul");
      ul.className = "draft-bullet-list draft-bullet-sublist";
      value.forEach(item => {
        if (!hasDisplayValue(item)) return;
        const li = document.createElement("li");
        if (item && typeof item === "object") {
          const title = item.label || item.name || item.title || item.merchant || item.category || item.type;
          if (title) {
            const strong = document.createElement("strong");
            strong.textContent = String(title);
            li.append(strong);
          }
          appendObjectFields(li, item, ["label", "name", "title", "merchant", "category", "type"]);
        } else {
          li.textContent = String(item);
        }
        ul.append(li);
      });
      if (ul.children.length) parent.append(ul);
      return;
    }
    if (value && typeof value === "object") {
      appendObjectFields(parent, value);
      return;
    }
    const span = document.createElement("span");
    span.className = "draft-bullet-value";
    span.textContent = typeof value === "boolean" ? (value ? "Yes" : "No") : String(value);
    parent.append(span);
  }

  function appendObjectFields(parent, object, excluded = []) {
    if (!object || typeof object !== "object" || Array.isArray(object)) return;
    const fields = Object.entries(object).filter(([key, value]) =>
      !excluded.includes(key) && hasDisplayValue(value)
    );
    if (!fields.length) return;
    const ul = document.createElement("ul");
    ul.className = "draft-bullet-list draft-bullet-sublist";
    fields.forEach(([key, value]) => {
      const li = document.createElement("li");
      const label = document.createElement("strong");
      label.textContent = displayFieldName(key) + ": ";
      li.append(label);
      appendNestedValue(li, value);
      ul.append(li);
    });
    parent.append(ul);
  }

  function createSummarySection(title) {
    const section = document.createElement("section");
    section.className = "draft-summary-section";
    const heading = document.createElement("h3");
    heading.textContent = title;
    section.append(heading);
    const list = document.createElement("ul");
    list.className = "draft-bullet-list";
    section.append(list);
    draftSummary.append(section);
    return list;
  }

  function appendSummaryItem(list, label, value, excluded = []) {
    if (!hasDisplayValue(value)) return;
    const li = document.createElement("li");
    const strong = document.createElement("strong");
    strong.textContent = label;
    li.append(strong);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      appendObjectFields(li, value, excluded);
    } else {
      appendNestedValue(li, value);
    }
    list.append(li);
  }

  function renderSimpleArraySection(title, values) {
    if (!Array.isArray(values) || !values.length) return;
    const list = createSummarySection(title);
    values.forEach((item, index) => {
      if (!hasDisplayValue(item)) return;
      const li = document.createElement("li");
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const primary = item.label || item.name || item.title || item.merchant || item.category || item.type || title.slice(0, -1) + " " + (index + 1);
        const strong = document.createElement("strong");
        strong.textContent = String(primary);
        li.append(strong);
        const excluded = ["label", "name", "title", "merchant", "category", "type"];
        appendObjectFields(li, item, excluded);
      } else {
        li.textContent = String(item);
      }
      list.append(li);
    });
  }

  function renderRuleSection(rules) {
    if (!Array.isArray(rules) || !rules.length) return;
    const list = createSummarySection("Earning rules");
    rules.forEach((rule, index) => {
      if (!rule || typeof rule !== "object") {
        const li = document.createElement("li");
        li.textContent = String(rule);
        list.append(li);
        return;
      }
      const li = document.createElement("li");
      const label = rule.label || displayFieldName(rule.category || "Earning rule");
      const amount = Number(rule.perAmount);
      const numericRate = rule.rate !== null && rule.rate !== undefined && Number.isFinite(Number(rule.rate));
      let rateSummary = "";
      if (numericRate && Number.isFinite(amount) && amount > 0) {
        rateSummary = " — " + rule.rate + " " + String(rule.unit || rule.rewardCurrency || "rewards") + " per ₹" + amount.toLocaleString("en-IN");
      } else if (rule.formula) {
        rateSummary = " — " + String(rule.formula);
      }
      const strong = document.createElement("strong");
      strong.textContent = String(label) + rateSummary;
      li.append(strong);
      const fields = [
        "category", "merchantCondition", "channelCondition", "minTransaction", "cap",
        "validFrom", "validTo", "isAccelerated", "isBonus", "multiplier",
        "calculatorEligible", "rounding", "notes", "sourceQuote", "sourceUrl", "eligibility", "conditions"
      ];
      appendObjectFields(li, Object.fromEntries(fields.filter(key => hasDisplayValue(rule[key])).map(key => [key, rule[key]])));
      list.append(li);
    });
  }

  function renderDraftSummary(draft) {
    if (!draftSummary) return;
    draftSummary.replaceChildren();
    if (!draft || typeof draft !== "object" || Array.isArray(draft)) {
      const message = document.createElement("p");
      message.className = "draft-summary-empty";
      message.textContent = "This draft cannot be displayed as a structured list. Check the advanced JSON editor.";
      draftSummary.append(message);
      return;
    }

    const cardFields = [
      "issuer", "cardName", "network", "rewardCurrency", "annualFee", "joiningFee",
      "annualFeeWaiver", "annualFeeWaiverText", "effectiveDate", "summary"
    ];
    const cardDetails = Object.fromEntries(cardFields.filter(key => hasDisplayValue(draft[key])).map(key => [key, draft[key]]));
    if (Object.keys(cardDetails).length) {
      const list = createSummarySection("Card and programme details");
      Object.entries(cardDetails).forEach(([key, value]) => appendSummaryItem(list, displayFieldName(key) + ":", value));
    }

    renderRuleSection(draft.rules);
    renderSimpleArraySection("Exclusions", draft.exclusions);
    renderSimpleArraySection("Benefits", draft.benefits);
    renderSimpleArraySection("Eligibility and conditions", draft.eligibility);
    renderSimpleArraySection("Missing information / items to verify", draft.missingItems);

    const handled = new Set([...cardFields, "rules", "exclusions", "benefits", "eligibility", "missingItems"]);
    const otherFields = Object.fromEntries(Object.entries(draft).filter(([key, value]) => !handled.has(key) && hasDisplayValue(value) && !["rawJson", "id"].includes(key)));
    if (Object.keys(otherFields).length) {
      const list = createSummarySection("Other extracted details");
      Object.entries(otherFields).forEach(([key, value]) => appendSummaryItem(list, displayFieldName(key) + ":", value));
    }

    if (!draftSummary.children.length) {
      const empty = document.createElement("p");
      empty.className = "draft-summary-empty";
      empty.textContent = "No readable details were extracted. Review the source evidence and advanced JSON.";
      draftSummary.append(empty);
    }
  }

  function showSummaryEditorError() {
    if (!draftSummary) return;
    draftSummary.replaceChildren();
    const message = document.createElement("p");
    message.className = "draft-summary-error";
    message.textContent = "The advanced JSON has a syntax error. Fix it below to refresh this bullet-point summary.";
    draftSummary.append(message);
  }

  function updatePublishButtonLabel() {
    const button = document.getElementById("approve-draft");
    if (!button || !currentDraftId || (button.disabled && button.textContent === "Publishing…")) return;
    let hasRules = true;
    try {
      const current = JSON.parse(draftJson.value);
      hasRules = Array.isArray(current.rules) && current.rules.length > 0;
    } catch {}
    const hasCard = Boolean(cardSelect.value || currentCardId);
    button.textContent = hasRules
      ? (hasCard ? "Publish reviewed rules" : "Create card & publish reviewed rules")
      : (hasCard ? "Save details (keep existing rules)" : "Create card from details");
  }
  function openDraft(draft) {
    currentDraftId = draft.id;
    currentSourceUrl = draft.sourceUrl || "";
    currentSourceTitle = draft.sourceTitle || "Official issuer terms";
    currentCardId = draft.cardId || "";
    document.getElementById("source-url").value = currentSourceUrl;
    document.getElementById("source-title").value = currentSourceTitle;
    cardSelect.value = currentCardId;
    let parsed;
    try { parsed = typeof draft.extractedJson === "string" ? JSON.parse(draft.extractedJson) : draft.extractedJson; }
    catch { parsed = draft.extractedJson; }
    draftJson.value = JSON.stringify(parsed, null, 2);
    renderDraftSummary(parsed);
    draftJson.readOnly = false;
    document.getElementById("approve-draft").disabled = false;
    updatePublishButtonLabel();
    document.getElementById("reject-draft").disabled = false;
    const statusPill = document.getElementById("draft-status-pill");
    const draftStatus = String(draft.status || "needs_review").toLowerCase();
    if (statusPill) {
      statusPill.className = "pill " + (draftStatus === "approved" ? "pill-green" : draftStatus === "rejected" ? "pill-gray" : "pill-amber");
      statusPill.textContent = draftStatus === "approved" ? "Approved" : draftStatus === "rejected" ? "Rejected" : "Needs review";
    }
    draftMeta.innerHTML = `<div><strong>Draft ID:</strong> ${C.escapeHtml(draft.id)}</div><div><strong>Source:</strong> <a href="${C.escapeHtml(currentSourceUrl)}" target="_blank" rel="noopener noreferrer">${C.escapeHtml(currentSourceTitle)} ↗</a></div><div><strong>Created:</strong> ${C.escapeHtml(draft.createdAt || "Not available")} · <strong>Status:</strong> <span id="draft-status">${C.escapeHtml(draft.status || "needs_review")}</span></div>${draft.sourceExcerpt ? `<details><summary>Show source excerpt</summary><p>${C.escapeHtml(draft.sourceExcerpt)}</p></details>` : ""}`;
    reviewMessage.textContent = "Review all rates, source quotes, exclusions and effective dates. Publishing will affect calculations for this card.";
    draftPanel.hidden = false;
    draftPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  async function loadCards() {
    const response = await C.request("/cards");
    cards = response.cards || [];
    cardSelect.innerHTML = '<option value="">Create a new card from the extracted details</option>' + cards.map(card => `<option value="${C.escapeHtml(card.id)}">${C.escapeHtml(card.issuer)} · ${C.escapeHtml(card.name)}</option>`).join("");
  }
  async function refreshDrafts(preloadedResponse = null) {
    if (!getToken()) {
      draftList.innerHTML = '<div class="empty-state"><h3>Admin token required</h3><p>Set the admin token above, then refresh to load saved drafts from D1.</p></div>';
      return;
    }
    try {
      const response = preloadedResponse || await C.request("/admin/drafts");
      const drafts = response.drafts || [];
      if (!drafts.length) {
        draftList.innerHTML = `<div class="empty-state"><h3>No saved drafts</h3><p>${C.escapeHtml(response.note || "Start by importing an official bank source above.")}</p></div>`;
        return;
      }
      draftList.innerHTML = drafts.map(draft => `<article class="draft-row"><div><span class="status-inline">${C.escapeHtml(draft.status)}</span><h3>${C.escapeHtml(draft.sourceTitle || "Official issuer terms")}</h3><p>${C.escapeHtml(draft.sourceUrl || "No source URL")}<br>${C.escapeHtml(draft.createdAt || "")}</p></div><div class="draft-row-actions"><button class="button button-secondary button-small open-draft" type="button" data-draft-id="${C.escapeHtml(draft.id)}">Review</button></div></article>`).join("");
      draftList.querySelectorAll(".open-draft").forEach(button => button.addEventListener("click", () => {
        const draft = drafts.find(item => item.id === button.dataset.draftId);
        if (draft) openDraft(draft);
      }));
    } catch (error) {
      draftList.innerHTML = `<div class="empty-state"><h3>Could not load drafts</h3><p>${C.escapeHtml(error.message)}</p></div>`;
    }
  }

  document.getElementById("save-token").addEventListener("click", async () => {
    const value = tokenInput.value.trim();
    if (!value) { setAdminStatus("Paste the admin token first.", true); return; }
    sessionStorage.setItem("criAdminToken", value);
    try {
      const [health, drafts] = await Promise.all([
        C.request("/health"),
        C.request("/admin/drafts")
      ]);
      setAdminStatus(`Token accepted. ${health.mode === "d1" ? "D1 is connected." : "Demo mode: drafts will not persist until D1 is configured."} ${drafts.drafts?.length || 0} saved draft(s).`);
      await refreshDrafts(drafts);
    } catch (error) {
      setAdminStatus(error.message, true);
    }
  });
  document.getElementById("clear-token").addEventListener("click", () => {
    sessionStorage.removeItem("criAdminToken"); tokenInput.value = ""; setAdminStatus("Admin token cleared from this tab.");
    draftList.innerHTML = '<div class="empty-state"><h3>Admin token required</h3><p>Enter the token to view saved drafts.</p></div>';
  });
  document.getElementById("refresh-drafts").addEventListener("click", refreshDrafts);
  cardSelect.addEventListener("change", updatePublishButtonLabel);
  draftJson.addEventListener("input", () => {
    updatePublishButtonLabel();
    try { renderDraftSummary(JSON.parse(draftJson.value)); }
    catch { showSummaryEditorError(); }
  });

  discoverForm.addEventListener("submit", async event => {
    event.preventDefault();
    discoverError.textContent = "";
    discoverSuccess.textContent = "";
    if (!getToken()) {
      discoverError.textContent = "Enter and verify the admin token before running AI discovery.";
      return;
    }
    const issuerInput = document.getElementById("discover-issuer").value.trim();
    const typedCardName = document.getElementById("discover-card-name").value.trim();
    const selectedExistingCard = cards.find(card => String(card.id) === String(cardSelect.value));
    const sameIssuer = selectedExistingCard &&
      String(selectedExistingCard.issuer || "").trim().toLowerCase().replace(/\s+/g, " ") ===
      issuerInput.toLowerCase().replace(/\s+/g, " ");
    const payload = {
      issuer: sameIssuer ? selectedExistingCard.issuer : issuerInput,
      cardName: sameIssuer ? selectedExistingCard.name : typedCardName,
      sourceUrl: document.getElementById("discover-source-url")?.value.trim() || "",
      cardId: cardSelect.value || null
    };
    if (!payload.issuer || !payload.cardName) {
      discoverError.textContent = "Enter both the bank and exact card name.";
      return;
    }
    const normalizedCardName = payload.cardName.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
    if (/^(?:(?:credit|charge|debit|prepaid|secured)\s+cards?|cards?)$/i.test(normalizedCardName)) {
      discoverError.textContent = '"' + payload.cardName + '" is a card type, not a specific product name. Enter the exact card name (for example, American Express Platinum Card or American Express Gold Card). No search or extraction was started.';
      return;
    }
    discoverButton.disabled = true;
    discoverButton.textContent = payload.sourceUrl ? "Reading supplied official source…" : "Searching official sources…";
    try {
      const response = await C.request("/admin/auto-extract", { method: "POST", body: JSON.stringify(payload) });
      currentDraftId = response.draftId;
      currentSourceUrl = response.sourceUrl;
      currentSourceTitle = response.sourceTitle;
      currentCardId = payload.cardId || "";
      const draft = { id: response.draftId, cardId: payload.cardId || "", sourceUrl: response.sourceUrl, sourceTitle: response.sourceTitle, sourceExcerpt: response.sourceExcerpt, extractedJson: response.extracted, status: "needs_review" };
      openDraft(draft);
      const discovery = response.discovery || {};
      discoverSuccess.textContent = (response.deduplicated ? "Updated the existing pending draft in D1. " : response.persisted ? "Draft saved to D1. " : "Draft generated but not persisted. ") +
        (discovery.suppliedSourceUrl
          ? "Used your supplied official URL as the starting point and selected " + (response.sourceTitle || "a readable issuer source") + ". "
          : "Found " + (discovery.candidatesFound || 0) + " official-source candidate(s); selected " + (response.sourceTitle || "one readable issuer source") + ". ") +
        (response.warning || "Review before publishing.");
      if (discovery.sourceCandidates && discovery.sourceCandidates.length) {
        discoverSuccess.textContent += " Candidate URLs: " + discovery.sourceCandidates.map(item => item.url).join(" | ");
      }
      discoverSuccess.textContent += formatTimingSummary(response.timingMs);
      if (!response.persisted) reviewMessage.textContent = "This run is in demo mode, so approval cannot persist. Confirm D1 is configured.";
      void refreshDrafts();
    } catch (error) {
      const data = error && error.data && typeof error.data === "object" ? error.data : {};
      const diagnostics = [
        data.stage ? "Stage: " + data.stage : "",
        data.details ? "Details: " + data.details : "",
        data.diagnosticId ? "Diagnostic ID: " + data.diagnosticId : "",
        data.nextStep || "",
        data.timingMs ? formatTimingSummary(data.timingMs).trim() : ""
      ].filter(Boolean);
      discoverError.textContent = [error.message, ...diagnostics].join(" ");
      if (Array.isArray(data.sourceCandidates) && data.sourceCandidates.length) {
        const list = document.createElement("span");
        list.className = "source-candidate-links";
        list.append(document.createTextNode(" Official source candidates: "));
        data.sourceCandidates.slice(0, 8).forEach((candidate, index) => {
          let url;
          try { url = new URL(String(candidate.url || "")); } catch { return; }
          if (url.protocol !== "https:") return;
          if (index) list.append(document.createTextNode(" · "));
          const link = document.createElement("a");
          link.href = url.toString();
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent = String(candidate.title || url.hostname).slice(0, 140);
          list.append(link);
        });
        discoverError.append(document.createElement("br"), list);
      }
    } finally {
      discoverButton.disabled = false;
      discoverButton.innerHTML = 'Find official sources &amp; extract details <span>→</span>';
    }
  });

  sourceForm.addEventListener("submit", async event => {
    event.preventDefault(); errorBox.textContent = ""; successBox.textContent = "";
    if (!getToken()) { errorBox.textContent = "Set the admin token before running AI extraction."; return; }
    extractButton.disabled = true; extractButton.textContent = "Extracting with AI…";
    const payload = {
      sourceUrl: document.getElementById("source-url").value.trim(),
      sourceTitle: document.getElementById("source-title").value.trim(),
      sourceText: document.getElementById("source-text").value.trim(),
      cardId: cardSelect.value || null
    };
    try {
      const response = await C.request("/admin/extract", { method: "POST", body: JSON.stringify(payload) });
      currentDraftId = response.draftId;
      currentSourceUrl = response.sourceUrl;
      currentSourceTitle = response.sourceTitle;
      currentCardId = payload.cardId || "";
      const draft = { id: response.draftId, cardId: payload.cardId || "", sourceUrl: response.sourceUrl, sourceTitle: response.sourceTitle, sourceExcerpt: response.sourceExcerpt, extractedJson: response.extracted, status: "needs_review" };
      openDraft(draft);
      successBox.textContent = `${response.persisted ? "Draft saved to D1" : "Draft generated but not persisted"}. ${response.warning || "Review before publishing."}`;
      if (!response.persisted) reviewMessage.textContent = "This run is in local demo mode, so approval cannot persist. Configure D1 before publishing rules.";
      void refreshDrafts();
    } catch (error) { errorBox.textContent = error.message; }
    finally { extractButton.disabled = false; extractButton.innerHTML = 'Extract draft with AI <span>→</span>'; }
  });

  document.getElementById("approve-draft").addEventListener("click", async () => {
    if (!currentDraftId) { reviewMessage.textContent = "Select or extract a saved draft first."; return; }
    if (!getToken()) { reviewMessage.textContent = "Admin token is required."; return; }
    let approvedJson;
    try { approvedJson = parseEditorJson(); }
    catch (error) { reviewMessage.textContent = error.message; return; }
    const draftIdBeingPublished = currentDraftId;
    const cardId = cardSelect.value || currentCardId || null;
    const button = document.getElementById("approve-draft");
    let published = false;
    button.disabled = true; button.textContent = "Publishing…";
    try {
      const response = await C.request(`/admin/drafts/${encodeURIComponent(draftIdBeingPublished)}/approve`, { method: "POST", body: JSON.stringify({ approvedJson, cardId }) });
      published = true;
      currentDraftId = null;
        if (response.publishedRules === 0) {
        reviewMessage.textContent = response.preservedExistingRules
          ? `Saved card details to ${response.cardId}. Existing approved earning rules were preserved because this draft had no new complete rule.`
          : `Saved card details to ${response.cardId}. No complete earning rule was available, so the card is marked “No verified rules”. Add a source-backed earning rule before using reward calculations.`;
      } else {
        reviewMessage.textContent = response.createdNewCard
          ? `Created new card ${response.cardId} and published the reviewed rules. The card is now in the catalogue.`
          : `Published successfully to card ${response.cardId}. This draft is now approved and removed from pending review. Previous rules were retained as retired history.`;
      }
      successBox.textContent = response.message;
      const status = document.getElementById("draft-status");
      if (status) status.textContent = "approved";
      const statusPill = document.getElementById("draft-status-pill");
      if (statusPill) {
        statusPill.className = "pill pill-green";
        statusPill.textContent = "Approved";
      }
      draftJson.readOnly = true;
      document.getElementById("reject-draft").disabled = true;
      button.textContent = "Published";
      button.disabled = true;
      await Promise.all([loadCards(), refreshDrafts()]);
    } catch (error) {
      reviewMessage.textContent = error.message;
    } finally {
      if (!published) {
        button.disabled = false;
        updatePublishButtonLabel();
      }
    }
  });
  document.getElementById("reject-draft").addEventListener("click", async () => {
    if (!currentDraftId) return;
    if (!getToken()) { reviewMessage.textContent = "Admin token is required."; return; }
    try {
      const response = await C.request(`/admin/drafts/${encodeURIComponent(currentDraftId)}/reject`, { method: "POST", body: JSON.stringify({}) });
      reviewMessage.textContent = response.message;
      currentDraftId = null; await refreshDrafts();
    } catch (error) { reviewMessage.textContent = error.message; }
  });
  document.getElementById("hide-draft").addEventListener("click", () => { draftPanel.hidden = true; });

  tokenInput.value = getToken();
  if (getToken()) setAdminStatus("Token present in this tab. Select Use token to verify it.");
  const sourceReviewPrefill = window.CRI_SOURCE_REVIEW_PREFILL;
  const reviewPrefillOptions = {
    search: window.location.search,
    issuerInput: document.getElementById("discover-issuer"),
    cardNameInput: document.getElementById("discover-card-name"),
    cardSelect
  };
  if (sourceReviewPrefill) sourceReviewPrefill.applyQueryPrefill({ ...reviewPrefillOptions, cards: [] });
  loadCards().then(() => {
    if (sourceReviewPrefill) sourceReviewPrefill.applyQueryPrefill({ ...reviewPrefillOptions, cards });
  }).catch(error => { cardSelect.innerHTML = '<option value="">Card catalogue unavailable</option>'; errorBox.textContent = error.message; });
  refreshDrafts();
})();
