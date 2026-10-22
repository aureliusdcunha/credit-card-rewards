(async () => {
  const C = window.CRI;
  try {
    const [health, response] = await Promise.all([C.request("/health"), C.request("/cards")]);
    const cards = response.cards || [];

    // Show a catalogue warning only when runtime health/card status warrants it.
    const banner = document.getElementById("catalogue-data-warning");
    const warning = C.catalogueDataWarning(health, cards);
    if (banner) {
      banner.replaceChildren();
      if (!warning) {
        banner.hidden = true;
      } else {
        banner.hidden = false;
        banner.className = "notice notice-" + warning.tone + " space-top catalogue-data-warning";
        const icon = document.createElement("span");
        icon.className = "notice-icon";
        icon.textContent = warning.tone === "warning" ? "!" : "i";
        const copy = document.createElement("div");
        const title = document.createElement("strong");
        title.textContent = warning.title;
        const message = document.createElement("p");
        message.textContent = warning.message;
        copy.append(title, message);
        banner.append(icon, copy);
      }
    }

    const reviewCount = cards.filter(card =>
      ["needs_review", "no_verified_rules", "demo"].includes(String(card.reviewStatus || "")) ||
      (card.rules || []).some(rule => ["demo", "needs_review"].includes(String(rule.status || "")))
    ).length;
    const sectionNote = document.getElementById("catalogue-section-note");
    if (sectionNote) {
      sectionNote.textContent = health.mode !== "d1"
        ? "Demo catalogue · example rules only"
        : reviewCount
          ? reviewCount + " card record(s) need review"
          : "Production catalogue · no provisional rules detected";
    }
    const featuredTitle = document.getElementById("featured-cards-title");
    if (featuredTitle) featuredTitle.textContent = health.mode !== "d1" ? "Cards we're setting up" : "Cards in your catalogue";
    document.getElementById("stat-cards").textContent = cards.length;
    document.getElementById("stat-verified").textContent = cards.filter(card => card.reviewStatus === "verified").length;
    document.getElementById("stat-rules").textContent = cards.reduce((count, card) => count + (card.rules || []).length, 0);
    document.getElementById("stat-ai").textContent = health.aiConfigured ? "Connected" : "Not configured";
    document.getElementById("stat-mode").textContent = `${health.mode === "d1" ? "D1 database connected" : "Demo data mode"} · ${health.adminConfigured ? "admin enabled" : "admin secret pending"}`;
    const target = document.getElementById("featured-cards");
    target.innerHTML = cards.slice(0, 3).map(card => C.renderCardTile(card, true)).join("") || '<div class="empty-state">No cards have been added yet.</div>';
    document.querySelectorAll(".view-rules-button").forEach(button => button.addEventListener("click", () => { location.href = `/cards.html?id=${encodeURIComponent(button.dataset.cardId)}`; }));
  } catch (error) {
    document.getElementById("stat-cards").textContent = "—";
    document.getElementById("stat-verified").textContent = "—";
    document.getElementById("stat-rules").textContent = "—";
    document.getElementById("stat-ai").textContent = "Unavailable";
    document.getElementById("stat-mode").textContent = error.message;
    document.getElementById("featured-cards").innerHTML = `<div class="empty-state"><h3>Could not load the catalogue</h3><p>${C.escapeHtml(error.message)}</p></div>`;
  }
})();
