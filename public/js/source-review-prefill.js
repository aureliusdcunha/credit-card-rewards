(() => {
  const clean = value => String(value == null ? "" : value).trim();
  const normalize = value => clean(value).replace(/\\s+/g, " ").toLowerCase();

  function buildHref(card, baseHref = window.location.href) {
    const url = new URL("/sources.html", baseHref);
    const values = [
      ["issuer", card && card.issuer],
      ["cardName", card && card.name],
      ["cardId", card && card.id]
    ];
    values.forEach(([key, value]) => {
      const text = clean(value);
      if (text) url.searchParams.set(key, text);
    });
    return url.pathname + url.search;
  }

  function applyQueryPrefill({
    search = window.location.search,
    issuerInput = null,
    cardNameInput = null,
    cardSelect = null,
    cards = []
  } = {}) {
    const params = new URLSearchParams(search || "");
    const issuer = clean(params.get("issuer"));
    const cardName = clean(params.get("cardName"));
    const requestedCardId = clean(params.get("cardId"));

    if (issuer && issuerInput) issuerInput.value = issuer;
    if (cardName && cardNameInput) cardNameInput.value = cardName;

    let selectedCard = requestedCardId
      ? cards.find(card => clean(card.id) === requestedCardId)
      : null;

    if (!selectedCard && issuer && cardName) {
      const matches = cards.filter(card =>
        normalize(card.issuer) === normalize(issuer) &&
        normalize(card.name) === normalize(cardName)
      );
      // Only use a name-based match when it is unambiguous; never select an arbitrary duplicate.
      if (matches.length === 1) selectedCard = matches[0];
    }

    if (selectedCard && cardSelect) cardSelect.value = clean(selectedCard.id);

    return {
      hasPrefill: Boolean(issuer || cardName || requestedCardId),
      cardSelected: Boolean(selectedCard),
      cardId: selectedCard ? clean(selectedCard.id) : ""
    };
  }

  window.CRI_SOURCE_REVIEW_PREFILL = { buildHref, applyQueryPrefill };
})();
