# Credit Card Rewards Intelligence (Cloudflare)

A multi-page prototype for Indian credit-card rewards. It deliberately uses **one Cloudflare Worker** for API/business logic and separate HTML/CSS/JavaScript assets for each page. Data persistence uses Cloudflare D1; AI-assisted source extraction supports Google Gemini API (preferred when GEMINI_API_KEY is set) with Cloudflare Workers AI as a fallback.

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
