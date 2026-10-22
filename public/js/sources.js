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
  draftJson.addEventListener("input", updatePublishButtonLabel);

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
      String(selectedExistingCard.issuer || "").trim().toLowerCase().replace(/\s+/g, " ") ===
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
