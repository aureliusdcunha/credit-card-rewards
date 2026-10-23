(() => {
  const APP_VERSION = "0.6.22";
  const APP_BUILD = "20261023.20";
  const current = location.pathname.split("/").pop() || "index.html";
  const items = [
    ["index.html", "Overview", "⌂"],
    ["cards.html", "Cards", "▤"],
    ["calculator.html", "Calculator", "₹"],
    ["compare.html", "Compare", "⇄"],
    ["sources.html", "Sources", "✳"]
  ];
  const linkMarkup = (href, label, symbol, className = "nav-link") =>
    '<a class="' + className + " " + (current === href ? "active" : "") +
    '" href="/' + href + '"' + (current === href ? ' aria-current="page"' : "") +
    ' aria-label="' + label + '"><span class="nav-symbol" aria-hidden="true">' + symbol +
    '</span><span class="nav-text">' + label + '</span></a>';
  const root = document.getElementById("site-nav");
  if (!root) return;

  root.innerHTML =
    '<div class="topbar">' +
      '<a class="brand" href="/index.html" aria-label="Rewards Intelligence overview">' +
        '<span class="brand-mark"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 7.5 12 3l7 4.5v9L12 21l-7-4.5v-9Z" stroke="currentColor" stroke-width="1.7"/><path d="m8.5 12.2 2.5 2.3 4.8-5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg></span>' +
        '<span><span class="brand-name">Rewards Intelligence</span><span class="brand-sub">CARD KNOWLEDGE BASE</span></span>' +
      '</a>' +
      '<nav class="nav-links" id="primary-nav" aria-label="Main navigation">' +
        items.map(([href, label, symbol]) => linkMarkup(href, label, symbol)).join("") +
      '</nav>' +
      '<div class="nav-right">' +
        '<button class="pwa-install-button" id="install-pwa" type="button" hidden>Install app</button>' +
        '<span class="env-badge">PWA</span>' +
        '<span class="app-version" title="Application release and build">v' + APP_VERSION + ' · b' + APP_BUILD + '</span>' +
      '</div>' +
    '</div>' +
    '<nav class="bottom-taskbar" id="bottom-taskbar" aria-label="App navigation">' +
      items.map(([href, label, symbol]) => linkMarkup(href, label, symbol, "taskbar-link")).join("") +
    '</nav>';

  let deferredInstallPrompt = null;
  const installButton = document.getElementById("install-pwa");
  const standalone = window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;
  if (standalone) document.documentElement.classList.add("is-installed-pwa");

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    if (installButton) {
      installButton.hidden = false;
      installButton.textContent = "Install app";
    }
  });

  installButton?.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    if (choice?.outcome === "accepted") installButton.hidden = true;
    deferredInstallPrompt = null;
  });

  window.addEventListener("appinstalled", () => {
    if (installButton) installButton.hidden = true;
    deferredInstallPrompt = null;
    document.documentElement.classList.add("is-installed-pwa");
  });

  if ("serviceWorker" in navigator && window.isSecureContext) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/service-worker.js", { scope: "/" })
        .catch(() => {
          // PWA enhancement must never prevent the online app from loading.
        });
    }, { once: true });
  }
})();