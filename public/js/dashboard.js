(async () => {
  const C = window.CRI;
  try {
    const [health, response] = await Promise.all([C.request("/health"), C.request("/cards")]);
    const cards = response.cards || [];
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
