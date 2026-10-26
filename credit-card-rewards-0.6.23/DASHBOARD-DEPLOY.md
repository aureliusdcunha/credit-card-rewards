# Browser-only deployment guide (no local Wrangler)

You do **not** need to install Wrangler on your computer. This project is a multi-file Worker with JavaScript modules and static HTML/CSS/JS assets. The reliable browser-only workflow is to upload the source files to a Git repository using its website, then connect that repository to Cloudflare Workers Builds. Cloudflare runs the deployment tooling in its own build environment; it is not installed on your computer.

Cloudflare's dashboard workflow supports importing a Git repository and deploying it as a Worker. See: https://developers.cloudflare.com/workers/get-started/dashboard/ and https://developers.cloudflare.com/workers/ci-cd/builds/configuration/.

## Part A — Create the D1 database in Cloudflare

1. Open the Cloudflare dashboard.
2. Go to **Storage & databases → D1 SQL Database** (the menu wording may vary).
3. Select **Create database** and name it `credit-card-rewards`.
4. Open the new database details and copy its **Database ID**. Keep this page open.
5. In the database, open **Console**.
6. Before running SQL, open `migrations/0001_init.sql` from the project files. Copy the complete file contents into the D1 Console and select **Execute**. This creates the tables and provisional sample card records. If the console reports a `PRAGMA` statement is unsupported, remove the first line `PRAGMA foreign_keys = ON;` and execute the remaining SQL.

The seeded rules are explicitly marked as demo/provisional. Do not treat them as verified current card terms.

## Part B — Put the project files into a GitHub repository using the browser

1. Extract `credit-card-rewards-cloudflare.zip` on your computer using File Explorer. No terminal is required.
2. On GitHub's website, create a new repository. A **private** repository is recommended while the application is being developed.
3. Use **Add file → Upload files** and upload the project contents, preserving the folder structure. The repository root must contain `package.json`, `wrangler.jsonc`, `src/`, `public/`, and `migrations/`. Do not upload only the ZIP file.
4. In the repository's `wrangler.jsonc`, use GitHub's web editor to replace `REPLACE_WITH_D1_DATABASE_ID` with the Database ID copied in Part A. Commit the change.

If GitHub's uploader does not preserve the folders when dropping them into the browser, create the files in their paths or upload each folder's contents separately. Check that paths such as `src/index.js`, `public/index.html`, and `migrations/0001_init.sql` appear at the correct locations.

## Part C — Connect the repository to Cloudflare Workers

1. In Cloudflare, open **Workers & Pages → Create application**.
2. Choose the option to import/connect an existing Git repository and connect GitHub if prompted.
3. Select the repository and the `main` branch.
4. For the project root, use `/` or leave the root directory blank (the `package.json` and `wrangler.jsonc` are at the repository root).
5. Use these build settings:
   - **Build command:** leave blank.
   - **Deploy command:** `npm run deploy`
   - **Root directory:** repository root.
   - **Preview command:** leave the default unless you later configure preview deployments.
6. Select **Deploy**. Cloudflare will install the project dependency and run the deploy command on its build infrastructure. You do not need Wrangler locally.

The `wrangler.jsonc` file configures the single Worker, separate static page assets in `public/`, the `DB` D1 binding, and the `AI` Workers AI binding. Keep this as one Worker project; the individual HTML pages remain separate files.

## Part D — Set and verify the runtime secret and bindings

After the first deployment:

1. Open the deployed Worker → **Settings → Variables and Secrets** (wording can vary).
2. Add a **Secret** named `ADMIN_TOKEN`. Set a long, unique random value. Do not put this value in HTML, GitHub, or a normal variable. Save/deploy the setting as Cloudflare requests.
3. Open the Worker **Settings → Bindings** and verify:
   - `DB` points to the `credit-card-rewards` D1 database.
   - `AI` is a Workers AI binding.
   - Static assets are configured from the `public/` directory under the `ASSETS` binding.

The `wrangler.jsonc` declarative configuration should describe the bindings during deployment. If any binding is missing in the dashboard, add it with the exact binding name above and redeploy.

## Part E — Smoke test

Open your Worker URL in a browser and check:

- `/` — dashboard
- `/cards.html` — card catalogue
- `/calculator.html` — reward calculator
- `/compare.html` — card comparison
- `/sources.html` — source intake/review
- `/api/health` — JSON health status

For `/api/health`, look for `mode: "d1"`, `aiConfigured: true`, and `adminConfigured: true`. If `mode` is `demo`, the Worker is not connected to D1. If `aiConfigured` is `false`, check the Workers AI binding. If `adminConfigured` is `false`, set the `ADMIN_TOKEN` secret.

Enter the same `ADMIN_TOKEN` in the Source Review page when using the protected admin functions. The page stores it in the current browser tab session only.

## Updating the app later

Edit the relevant file in GitHub's browser editor and commit the change. Cloudflare Workers Builds will deploy the new commit automatically. Pages are kept as separate files, shared styling is in `public/css/app.css`, page-specific logic is in `public/js/`, the API is in `src/index.js`, and rewards calculations are in `src/rules-engine.js`.

## Security / data integrity reminders

- Never use actual bank passwords, card numbers, CVVs, or PINs in this app.
- Restrict access to the Source Review page and keep `ADMIN_TOKEN` private. The token protects admin API endpoints; it does not make the public catalogue private.
- All AI output is a draft. Verify the exact card variant, source quote, caps, exclusions, MCC details, rounding and effective dates before publishing.
- The current sample rules are provisional. Complete source validation before relying on the calculator for financial decisions.
