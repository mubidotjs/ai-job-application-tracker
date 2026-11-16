# Rolecraft portfolio walkthrough

All demo people, employers, vacancies, salaries, notes and statuses are invented. No applications or messages are sent. The demo preserves the existing 20 synthetic fixtures and adds one manually entered invented example. Requirement records are explicitly **human/demo rules**, not live AI. Cover notes are deterministic evidence-assembled templates, not AI-generated prose.

## Reproduce a clean demonstration

```sh
npm ci
npm run build
npm run demo
```

Use the loopback URL printed in the terminal. Each invocation creates a new synthetic SQLite database under ignored `artifacts/`; it never selects the default or an existing private workspace. Stop with Ctrl+C. These demo databases persist locally after stopping, but a subsequent demo invocation intentionally creates a fresh one. Normal `npm start` uses the configured persistent workspace instead.

For repeatable screenshots from the actual production UI:

```sh
npx playwright install chromium
npm run demo:capture
```

This starts a temporary loopback-only server with a new synthetic database, captures desktop **1440 × 1000** and mobile **390 × 844** viewports, checks for overflow/browser errors, then stops the owned server. Capture deliberately blocks extraction actions; it does not call Ollama. [Capture metadata and asset hashes](demo-capture.json) identify the actual images. There are no rendered browser address bars, service addresses, credentials or private database files in the assets.

## Five-minute product story

1. **Dashboard:** inspect 21 invented opportunities, varied Applied/Interview/Offer/Rejected states, progress and follow-ups. Synthetic labels appear on records. Search or filter opportunities.
2. **Import and duplicates:** import `public/synthetic-jobs.csv`. Exact duplicates are reported as skipped. Open the Northstar near-duplicate pair and inspect the review decision; **Keep both** is an explicit action.
3. **Evidence and matching:** open Atlas Grid's Backend Engineer role. **Requirements** shows human/demo provenance and source quotes. **Fit comparison** shows a documented Node.js match and missing PostgreSQL/Redis, with required/preferred weights and each contribution. A score is alignment, not hiring probability.
4. **Fictional profile:** inspect the synthetic résumé and labeled skills/experience forms. Any edit clears confirmation. Save only after reviewing exact supporting quotes and explicitly confirming accuracy. No inferred tenure is added.
5. **Progress and draft:** save an invented status/date/note. On a role with a matched skill, create a deterministic cover-note template, edit it, save as pending, then explicitly approve it after review. Copying is manual; nothing is sent.
6. **Recovery:** download CSV for application reporting. Then use **Backup & restore** for a complete sensitive workspace backup. Preview and cancel a restore to show the safety boundary; demonstrate replacement only in this disposable synthetic workspace.
7. **Mobile and keyboard:** resize to 390 pixels. Navigate forms using Tab; job detail tabs support Left/Right, Home and End. Inspect labels, missing evidence and explicit errors rather than treating any score as a decision.

Live local inference is a separate capability requiring **Ollama and the installed `qwen3:4b` model on the same machine**. A user can explicitly run extraction in the application; CPU inference commonly takes tens of seconds and can take up to five minutes. This final hardening/demo work does not run it. The frozen [genuine verification](verification/real-ai-pass.json) and [quality correction](quality-correction.md) remain the evidence: five affected original reruns plus three retained results yielded 8/8 acceptance; an independent four-case holdout yielded 4/4 acceptance, 100% precision and 92.3% recall. One supported Flask preference was omitted. These small synthetic measurements are not general benchmark or hiring-performance guarantees.

## Public demonstration recommendation

Publish only a **separate static, read-only synthetic showcase** with bundled invented records and clearly labeled fixed example outputs. Include no tracker API, résumé entry, backup/restore, SQLite file, credentials, local Ollama connection or remote inference. Link to this repository for the actual local application. Do not deploy this local-only Next.js server directly to Vercel: persistence, loopback inference and absence of multi-user authentication deliberately make that unsuitable. This is a recommendation; no hosted resources or deployment have been created.
