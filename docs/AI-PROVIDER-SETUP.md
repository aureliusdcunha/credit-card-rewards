# AI provider setup

The Worker supports Google Gemini API for card-term extraction, with Cloudflare Workers AI retained as the fallback. Gemini is preferred automatically when GEMINI_API_KEY is configured.

## Use Gemini's free tier

1. Open https://aistudio.google.com/apikey and create an API key for a project that has Gemini API free-tier access.
2. In the Cloudflare dashboard, open Workers & Pages → credit-card-rewards-intelligence → Settings → Variables and Secrets.
3. Add GEMINI_API_KEY as a Secret, not as a plain-text variable. Do not commit the key to GitHub or put it in frontend JavaScript.
4. Deploy the latest main branch and open /api/health. It should report aiProvider: "gemini" and the selected model.
5. The default model is gemini-3.5-flash. To choose another available Gemini model, add GEMINI_MODEL as a plain-text Worker variable with the exact model ID, then redeploy.

You can also add the secret from a terminal in the repository with:

```sh
npx wrangler secret put GEMINI_API_KEY
```

### Free-tier limits and data handling

Google's free tier has model-specific rate limits. When quota is reached, Source Review will show the Gemini HTTP status and a quota/rate-limit hint; wait for the quota reset or check AI Studio usage.

Google's pricing documentation says content submitted under the free tier may be used to improve its products. This app sends the official card-term text it has collected for extraction. Do not send personal or confidential information through the free-tier API.

## Cloudflare AI and PDF conversion

If GEMINI_API_KEY is set, Gemini handles both card-rule extraction and PDF text extraction, so the Cloudflare AI binding is not needed for extraction. If GEMINI_API_KEY is absent, the Worker falls back to Cloudflare Workers AI for extraction and PDF conversion. Health reports the active provider and PDF converter separately.

If GEMINI_API_KEY is absent, the Worker falls back to Cloudflare Workers AI for extraction. The key is never sent to the browser; requests are made server-side by the Worker.

## Production D1 migration

Card publishing requires the joining-fee column introduced by migrations/0002_joining_fee.sql. If Source Review reports that migration as missing, first verify the configured database ID in wrangler.jsonc, then run:

```sh
npx wrangler d1 migrations list credit-card-rewards --remote
npx wrangler d1 migrations apply credit-card-rewards --remote
```

Confirm the target database before applying any remote migration. Retry publishing only after Wrangler reports that the migration has been applied.
