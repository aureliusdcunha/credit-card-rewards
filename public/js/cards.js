(async () => {
  const C = window.CRI;
  let allCards = [];
  const grid = document.getElementById("cards-grid");
  const search = document.getElementById("card-search");
  const issuer = document.getElementById("issuer-filter");
  const status = document.getElementById("status-filter");
  const count = document.getElementById("cards-count");
  const queryCardId = new URLSearchParams(location.search).get("id");

  const modal = document.getElementById("card-detail-modal");
  const modalDialog = modal?.querySelector(".card-modal-dialog");
  const modalTitle = document.getElementById("card-modal-title");
  const modalSubtitle = document.getElementById("card-modal-subtitle");
  const modalPanel = document.getElementById("card-modal-panel");
  const modalStatus = document.getElementById("card-modal-review-status");
  const modalClose = document.getElementById("card-modal-close");
  const modalTabs = [...document.querySelectorAll("[data-modal-tab]")];
  let activeModalCard = null;
  let activeModalTab = "benefits";
  let modalReturnFocus = null;

  function selectModalTab(tab, moveFocus = false) {
    if (!activeModalCard || !modalPanel || !window.CRI_CARD_MODAL) return;
    const allowedTabs = ["benefits", "rules", "restrictions", "fees"];
    activeModalTab = allowedTabs.includes(tab) ? tab : "benefits";
    modalTabs.forEach(button => {
      const selected = button.dataset.modalTab === activeModalTab;
      button.setAttribute("aria-selected", selected ? "true" : "false");
      button.tabIndex = selected ? 0 : -1;
      if (selected && moveFocus) button.focus();
    });
    const selectedButton = modalTabs.find(button => button.dataset.modalTab === activeModalTab);
    if (selectedButton) modalPanel.setAttribute("aria-labelledby", selectedButton.id);
    modalPanel.innerHTML = window.CRI_CARD_MODAL.renderTab(activeModalCard, activeModalTab);
    modalPanel.scrollTop = 0;
  }

  function openCardModal(card, trigger) {
    if (!modal || !card) return;
    activeModalCard = card;
    modalReturnFocus = trigger || document.activeElement;
    activeModalTab = "benefits";
    modalTitle.textContent = card.name || "Card details";
    modalSubtitle.textContent = [card.issuer, card.rewardCurrency || "Rewards", card.network || "Network not recorded"].filter(Boolean).join(" · ");
    modalStatus.innerHTML = C.statusPill(card.reviewStatus);
    modal.hidden = false;
    document.body.classList.add("card-modal-open");
    selectModalTab("benefits");
    modalClose?.focus();
  }

  function closeCardModal() {
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    document.body.classList.remove("card-modal-open");
    activeModalCard = null;
    if (modalReturnFocus && typeof modalReturnFocus.focus === "function") modalReturnFocus.focus();
    modalReturnFocus = null;
  }

  modalClose?.addEventListener("click", closeCardModal);
  modal?.addEventListener("click", event => {
    if (event.target === modal) closeCardModal();
  });
  modal?.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeCardModal();
      return;
    }
    if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && event.target?.matches?.("[data-modal-tab]")) {
      event.preventDefault();
      const currentIndex = modalTabs.indexOf(event.target);
      const delta = event.key === "ArrowRight" ? 1 : -1;
      const next = modalTabs[(currentIndex + delta + modalTabs.length) % modalTabs.length];
      if (next) selectModalTab(next.dataset.modalTab, true);
    }
  });
  modalTabs.forEach(button => button.addEventListener("click", () => selectModalTab(button.dataset.modalTab)));

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
      if (card) openCardModal(card, button);
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
