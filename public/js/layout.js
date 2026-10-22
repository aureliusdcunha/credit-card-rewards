(() => {
  const APP_VERSION = "0.3.1";
  const APP_BUILD = "20261022.13";
  const current = location.pathname.split("/").pop() || "index.html";
  const items = [
    ["index.html", "Overview", "⌂"],
    ["cards.html", "Card catalogue", "▤"],
    ["calculator.html", "Calculator", "₹"],
    ["compare.html", "Compare", "⇄"],
    ["sources.html", "Source review", "✳"]
  ];
  const root = document.getElementById("site-nav");
  if (!root) return;
  root.innerHTML = `<div class="topbar"><a class="brand" href="/index.html" aria-label="Rewards Intelligence overview"><span class="brand-mark"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 7.5 12 3l7 4.5v9L12 21l-7-4.5v-9Z" stroke="currentColor" stroke-width="1.7"/><path d="M8.5 12.2 11 14.5l4.8-5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span><span class="brand-name">Rewards Intelligence</span><span class="brand-sub">CARD KNOWLEDGE BASE</span></span></a><button class="nav-menu-button" id="nav-menu-button" type="button" aria-expanded="false" aria-controls="primary-nav">Menu ☰</button><nav class="nav-links" id="primary-nav" aria-label="Main navigation">${items.map(([href, label, symbol]) => `<a class="nav-link ${current === href ? "active" : ""}" href="/${href}" ${current === href ? 'aria-current="page"' : ""}><span class="nav-symbol">${symbol}</span><span class="nav-text">${label}</span></a>`).join("")}</nav><div class="nav-right"><span class="env-badge">PROTOTYPE</span><span class="app-version" title="Application release and build">v${APP_VERSION} · b${APP_BUILD}</span></div></div>`;
  const button = document.getElementById("nav-menu-button");
  const nav = document.getElementById("primary-nav");
  button?.addEventListener("click", () => {
    const opened = nav.classList.toggle("open");
    button.setAttribute("aria-expanded", String(opened));
  });
})();
