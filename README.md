# Credit Card Rewards Intelligence (Cloudflare)

A multi-page prototype for Indian credit-card rewards. It deliberately uses **one Cloudflare Worker** for API/business logic and separate HTML/CSS/JavaScript assets for each page. Data persistence uses Cloudflare D1; AI-assisted source extraction supports Google Gemini API (preferred when GEMINI_API_KEY is set) with Cloudflare Workers AI as a fallback.

## Release 0.6.14 — 23 October 2026

- Adds actual, dimension-checked **192×192 and 512×512 PNG** app icons in the web manifest, including a maskable 512px PNG for PWABuilder / Android packaging. The 512px PNG is required alongside the 192px icon for robust Chromium/PWABuilder validation; SVG is no longer the sole 512px icon.
- Updates the service-worker precache to use the 512px PNG and bumps its cache version so previously installed clients fetch the new manifest/icon list.
- Adds regression checks that verify both PNG file signatures and their real width/height, plus the manifest PNG icon entries.
- Aligns package / Worker metadata, navigation pill, all HTML footers, asset cache-busters and source-discovery user-agent to **0.6.14 / build 20261023.12**.

## Release 0.6.13 — 23 October 2026

- Adds an installable Android PWA manifest with app identity, standalone display, theme/splash colours, 192px PNG and scalable 512px SVG icons, app shortcuts and home-screen metadata.
- Adds a service worker that caches the app shell and static assets, provides an offline fallback page, updates versioned caches, and deliberately never caches `/api/*` responses or admin/source-review data.
- Replaces the mobile hamburger menu with a fixed five-item bottom taskbar (Overview, Cards, Calculator, Compare, Sources), including safe-area spacing for Android gesture navigation. Desktop navigation stays in the top bar.
- Adds a browser-supported **Install app** button when Chrome exposes the PWA install prompt. The site continues to work normally if install prompting or service-worker registration is unavailable.
- Updates package/Worker release metadata, the visible version pill, all page footers, asset cache keys, user-agent and tests to **0.6.13 / build 20261023.11**.

## Release 0.6.12 — 23 October 2026

- Adds a deterministic official source bundle for **YES BANK UNI Credit Card**, whose product and catalogue pages are JavaScript-rendered for the importer.
- Reads the current YES BANK Credit Card MITC hosted on the official Uni document CDN (updated 23 June 2026) and the issuer's retail-card Key Fact Statement instead of relying on search-result ordering.
- Adds a narrowly scoped HTTPS allow-list exception for the exact UNI MITC PDF only; other URLs on the Uni CDN are not accepted as YES BANK sources.
- Adds regression coverage for discovering the known UNI source set, issuer-specific URL validation and extraction from a JavaScript-only product page.
- Updates package/Worker metadata, navigation version pill, all page footers, asset cache keys, source-discovery user-agent and docs to **0.6.12 / build 20261023.10**.

## Release 0.6.11 — 23 October 2026

- Preserves high-value facts from long issuer pages before shortening source excerpts. Fee schedules, joining/renewal fees, spend-based waivers, reward rates, multiplier offers, caps, exclusions and eligibility clauses appearing deep in page content are now prioritized for all card issuers.
- Uses a stable official source bundle for HDFC Regalia Gold that includes its dedicated Fees & Charges page and current reward terms, rather than relying on search result order.
- Adds regression tests proving that the official "Joining/Renewal Membership Fee of Rs. 2500 + Applicable Taxes" remains available to the generic fee normalizer even when it appears near the end of a very long page.
- Updates package/Worker release metadata, navigation version pill, all page footers, asset cache keys, source discovery user-agent and documentation to **0.6.11 / build 20261023.09**.

## Release 0.6.10 — 23 October 2026

- Shows extracted card details as a readable nested bullet list by default, with sections for card/programme details, earning rules, exclusions, benefits, eligibility and missing information.
- Displays each earning rule as a main point with nested conditions, merchant/channel eligibility, minimum spend, caps, validity, notes and source evidence.
- Keeps the underlying draft editable under **Advanced: view or edit raw JSON**; edits refresh the bullet summary and the same JSON remains the payload used for review/publishing.
- Adds browser-side validation for generic card labels such as "charge card" before running discovery, alongside the existing Worker-side guard. The exact card variant is required so unrelated products aren't mixed into one card.
- Adds regression tests for the default bullet view, advanced JSON path, version consistency and browser/server generic-card guards.
- Updates package/Worker release metadata, navigation pill, all page footers, cache keys and source discovery user-agent to **0.6.10 / build 20261023.08**.

## Release 0.6.9 — 23 October 2026

- Clarifies merchant-accelerator labels so a 5X total offer that includes the base rate is shown as **5X total offer (4X bonus component)**, not a 5X bonus. Explicitly additional X-times offers retain their source-supported bonus multiplier.
- Updates package/Worker release metadata, the visible navigation version pill, all page footers, asset cache keys, user-agent and version tests to **0.6.9 / build 20261023.07**.

## Release 0.6.8 — 23 October 2026

- Generalizes earning-rule extraction for every issuer/card: base rates, merchant/brand accelerators, transaction types, channels, minimum spend, caps and validity are represented as separate sourced rules when supported.
- Adds a reusable normalizer to create a separate accelerated bonus rule only when the exact multiplier, a verified base rate and issuer wording support the conversion; variable "up to" multipliers remain benefits pending review.
- Preserves merchant/channel labels and source evidence in the rule matrix. Conditional merchant rules are intentionally excluded from generic calculator calculations until a transaction can be matched to that specific merchant/channel, preventing accidental overestimates.
- Reads a balanced set of official product pages and terms PDFs for every issuer instead of limiting broader source coverage to one issuer-specific path.
- Updates package/Worker version metadata, navigation pill, every page footer, asset cache keys, source discovery user-agent and documentation to **0.6.8 / build 20261023.06**.

## Release 0.6.7 — 23 October 2026

- Applies the parent issuer-catalogue fallback to pages discovered by search as well as URLs manually supplied by an administrator.
- Tries up to three parent URL levels on the same validated issuer domain, then continues with related official pages and search/PDF fallbacks.
- Ignores “Skip to content” and fragment-only navigation links when discovering relevant terms pages.
- Rejects generic card-type names such as “charge card” because different products can have different fees/rewards; requests the specific card variant to avoid blending records.
- Updates package/Worker version metadata, the visible navigation pill, every page footer, asset cache keys, source-discovery user agent and docs to **0.6.7 / build 20261023.05**.

## Release 0.6.6 — 23 October 2026

- If a supplied official product page returns only a JavaScript shell, try its parent issuer catalogue pages before broad search. This works across nested issuer URL structures rather than hard-coding the YES BANK Uni URL.
- Focus catalogue-page extraction on the selected card's matching heading and stop at the next card heading, avoiding unrelated card variants in the same catalogue.
- When an existing card is selected, send its exact catalogue name to extraction rather than a shortened typed alias.
- Align package/backend version, navigation pill, every page footer, asset cache keys and source-discovery user agent to **0.6.6 / build 20261023.04**.

## Release 0.6.5 — 23 October 2026

- Treat a supplied official card URL as the preferred starting point, not the only source. If it yields no readable terms, continue with related official links and normal issuer-wide source discovery.
- Retry relevant official HTML/PDF candidates found through discovery, while validating every candidate against the selected issuer's configured domain.
- Show actionable next steps and clickable official source candidates when no readable source can be extracted.
- Updates the package, Worker metadata, navigation version pill, every page footer, all page asset cache-busters and source discovery user-agent to **0.6.5 / build 20261023.03**.

## Release 0.6.4 — 23 October 2026

- Adds an optional official card/terms URL to automatic Source Review. Supplying one skips search discovery and uses that URL as the starting source.
- Validates the URL against the selected issuer's known official domain (including configured legacy domains) before fetching.
- Follows relevant readable terms/PDF links on the same issuer domain when the card page is JavaScript-rendered or contains little text.
- Improves error feedback when a supplied URL is invalid or belongs to a different issuer.
- Updates package/version metadata, the navigation version pill, page footers, asset cache keys and source-discovery user agent to **0.6.4 / build 20261023.02**.

## Release 0.6.3 — 23 October 2026

- Improves server-side issuer HTML extraction by prioritizing page content, removing scripts/styles/navigation, decoding HTML entities and reading supported structured metadata.
- When a card page is a JavaScript-rendered shell, the importer checks relevant same-issuer terms links and PDFs before failing.
- Automatic discovery also searches selected original official issuer domains for useful legacy card pages and documents after domain migrations.
- Keeps source fetching restricted to validated HTTPS URLs on the configured official issuer allow-list. AI output remains a review-only draft; no rules are published automatically.
- Updates the package version, backend metadata, navigation version pill, page footers and all page asset cache-busters to **0.6.3 / build 20261023.01**.

## What's included

- `src/index.js` — one Worker entry point: catalogue API, deterministic calculator API, guarded AI extraction, draft review and rule publishing.
- `src/rules-engine.js` — pure calculation logic, kept separate from HTTP and database code.
- `src/db.js` / `src/demo-data.js` — D1 loading and clearly labelled demo fallback records.
- `migrations/0001_init.sql` — D1 schema for cards, versioned earning rules, exclusions, benefits, source records and review drafts; plus sample catalogue entries.
- `public/index.html` — overview dashboard.
- `public/cards.html` — searchable, filterable catalogue with rule details and source links.
- `public/calculator.html` — single-transaction calculator.
- `public/compare.html` — same-transaction comparison for up to three cards.
- `public/sources.html` — AI source intake, editable draft JSON, admin review and publish/reject workflow.
- `public/css/app.css` — shared responsive styling.
- `public/js/` — page-level JavaScript plus shared API/layout helpers.

## Important data-integrity note

The initial card records are **demo/provisional only** so the pages can be tested before the rules database is fully populated. They are not a complete or verified representation of the banks' current terms. The calculator will warn where the selected rule is provisional and avoids applying an unverified generic rule to an unreviewed named category. It does not claim a rupee value for points because redemption routes have not yet been configured.

AI extraction creates a `needs_review` draft. It never publishes rules on its own. Before publishing, review the exact card variant, source quote, earn rate, category, exclusions/MCCs, caps, minimum transaction amount, rounding logic and effective dates. The rule engine is deterministic; AI is only used to prepare a source-grounded draft.

## AI provider setup

To use the Google Gemini free tier for source extraction, store GEMINI_API_KEY as a Cloudflare Worker secret. The Worker retries transient overloads and falls back across configurable Gemini models. See [AI-PROVIDER-SETUP.md](./docs/AI-PROVIDER-SETUP.md) for setup, data-handling caveats, quota errors, and the production D1 migration check.

## Deploy to Cloudflare

**Prefer using the Cloudflare web dashboard?** Follow [DASHBOARD-DEPLOY.md](./DASHBOARD-DEPLOY.md). It deploys this multi-file project from a browser-managed GitHub repository. You do not need to install Wrangler on your computer; Cloudflare runs the deploy command in its own build environment.

The project uses one Worker and separate static files under `public/`. The API, card rules engine, pages and page-specific JavaScript remain split across files.

### Optional: deploy from a local terminal

Prerequisites: Node.js and a Cloudflare account with Workers, D1, and Workers AI available.

1. Install dependencies with `npm install`.
2. Create the D1 database with `npx wrangler d1 create credit-card-rewards` and replace `REPLACE_WITH_D1_DATABASE_ID` in `wrangler.jsonc` with the returned ID.
3. Apply the schema and provisional seed with `npx wrangler d1 migrations apply credit-card-rewards --remote`.
4. Set a long unique admin secret with `npx wrangler secret put ADMIN_TOKEN`.
5. Deploy with `npm run deploy`.

The `wrangler.jsonc` config binds:

- `ASSETS` to `./public` for page assets.
- `DB` to D1 for card and rule persistence.
- `AI` to Cloudflare Workers AI for extraction.

The API paths run through the Worker first. The HTML pages remain independent assets. On first deployment, check `https://YOUR-WORKER-URL/api/health` and confirm `mode` is `d1`, `aiConfigured` is `true`, and `adminConfigured` is `true`.

For local development you can create a `.dev.vars` file (it is git-ignored):

```dotenv
ADMIN_TOKEN="replace-with-a-long-random-local-token"
```

### Local demo without D1

`wrangler.local.jsonc` leaves out the D1 binding so you can preview the static pages and demo calculator without replacing a database ID:

```bash
npx wrangler dev --config wrangler.local.jsonc
```

This local config still binds Workers AI to your Cloudflare account. AI calls use the account's Workers AI allowance. Without D1, extracted drafts do not persist and cannot be published; use the production config/database or add a local D1 binding for a full local workflow.

## AI source import workflow

1. Open **Source Review** and enter the `ADMIN_TOKEN` secret.
2. Provide an official issuer URL. The Worker only auto-fetches HTTPS pages on its configured official-bank-domain allow-list.
3. For a PDF URL, the Worker uses the configured Gemini PDF transcription path or `env.AI.toMarkdown()` when supported (8 MB maximum). For a JavaScript-heavy card page, automatic discovery follows relevant same-issuer official terms links and attempts readable linked documents. If the page is blocked, the PDF is scanned/unreadable, or none of its linked sources can be read, paste the relevant terms text and keep the official URL as the source URL.
4. Run extraction. The app searches the current issuer domain and selected original official domains, reads available HTML/PDF sources, then asks the configured AI provider for rules, exclusions, source quotes, dates, benefits and missing-information notes. No rule is published automatically.
5. Review/edit the JSON. The publishing validator checks fields and requires a source quote for every published earn rule and exclusion.
6. Publish to replace the current active/demo rules for the selected card. Old rules are marked `retired` rather than deleted. Alternatively reject the draft.

Automatic discovery uses search providers and issuer-site sitemap/catalogue fallbacks to find likely official source pages; it is best-effort rather than a guarantee that every card page is indexed. The importer cannot execute arbitrary browser JavaScript or bypass access controls. When it encounters a client-rendered page, it tries to find relevant same-issuer terms/PDF links and reports source candidates when it still cannot read them. Always confirm that the draft matches the precise card variant and a current official source before publishing.

## Current implementation boundaries

- Currency-value redemption comparisons are not enabled yet. Each bank's reward-point conversion varies by redemption route and eligibility.
- Monthly/statement caps can be represented in a rule JSON. The calculator accepts prior spend and prior points for those caps, but it does not import a statement or infer spend-cycle totals.
- MCC-specific rules are retained in extraction JSON / exclusion metadata; transaction MCC is not automatically looked up in this prototype.
- No card PAN, CVV, PIN, bank password or online-banking credential is collected.
- Admin endpoints require `ADMIN_TOKEN`. Because the initial app has no user account system, protect this secret carefully and restrict distribution of the Source Review page if the Worker is publicly reachable.
- The source fetcher is limited to configured bank domains, enforces HTTPS and validates redirects. To add an issuer, extend `OFFICIAL_DOMAINS` in `src/index.js` after confirming its official domain.

## Tests

```bash
npm test
```

The rule-engine tests cover a category-specific earn rate, an exclusion, no fallback from an unverified generic rule, and invalid amounts.

## Relevant Cloudflare references

- Workers Static Assets: https://developers.cloudflare.com/workers/static-assets/
- Worker asset routing: https://developers.cloudflare.com/workers/static-assets/routing/
- Workers AI pricing and current free allocation: https://developers.cloudflare.com/workers-ai/platform/pricing/
- Workers AI bindings: https://developers.cloudflare.com/workers-ai/configuration/bindings/
- D1 limits: https://developers.cloudflare.com/d1/platform/limits/
