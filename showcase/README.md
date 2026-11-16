# Rolecraft interactive synthetic showcase

Canonical URL: **https://rolecraft.mubashirhussain.dev/**

> Interactive synthetic demo. No live AI inference or personal data processing. Real Qwen3 inference is available in the local-first application.

This is a separate static-only presentation of the verified local application at `aca0a75ee717e1032a9b55006c25a08d791f91d7`. It is not a deployment of the Next.js server. It has zero runtime dependencies, APIs, accounts, database connections, uploads, model endpoints, analytics or persistent browser storage. It never submits applications or sends messages.

## Independent build and verification

From this directory, using Node 24.15+ within 24.x:

```sh
npm ci
npm run check
npm run build
npm test
npx playwright install chromium
npm run test:browser
npm run preview
```

The build uses Node's native TypeScript stripping and copies an explicit allowlist into `dist/`. It reads only authored showcase files, the existing synthetic fixture module, the unchanged pure matching/normalization functions, and two already verified synthetic local-app screenshots. It does not open SQLite, read environment files, probe a model or copy ignored artifacts. The first 20 descriptions remain unchanged; one invented manual example is added. The résumé belongs to an invented candidate.

Matching is the same actual pure implementation used by the local app, not a replacement score. A fixture regression checks the Atlas Grid example at 3/7 weighted points, rounded to 43, with two missing requirements. Requirement priorities are fixed human-authored examples. A visitor can flag a priority as unknown and inspect the resulting score change without changing source evidence. Tracking, review and approval are temporary in-memory illustrations, reset on reload. Cover notes are deterministic templates, not AI-generated prose. Clipboard copying requires an explicit action after the approval preview.

The local Ollama workflow, fixed synthetic extraction illustration, genuine verification links, quality results and limitations are explained in the interface and the [case study](src/case-study.html). No saved example is presented as a model response from this site. The frozen quality result includes five rerun originals plus three retained controls; the holdout still has one omitted Flask preference.

## Static artifact boundary

`npm run verify:artifact` audits every deployable file. The allowlist contains only HTML, CSS, browser modules, JSON metadata, SVG/PNG assets, robots and sitemap files, and static Vercel headers. Unexpected files, symlinks, SQLite signatures, server imports, environment configuration, model/service addresses, runtime requests, browser persistence, upload/private-input controls, remote scripts and submission forms fail the check. Tests deliberately inject forbidden artifacts to prove rejection. The complete artifact is capped at 2 MiB.

The production CSP allows scripts/styles/images only from this origin, with `connect-src 'none'`, `form-action 'none'`, `frame-ancestors 'none'` and no inline scripts or evaluation. HTTP tests confirm storage/API/private-path requests return 404. Browser request assertions prohibit remote requests and mutations. Axe checks cover eight views at desktop 1440, tablet 768 and mobile 390 widths, with no accessibility rules disabled. Keyboard, search/filter empty states, missing pages, module-load failure, matching, review, approval and reset are covered.

Actual browser screenshots and a 1200 × 630 Open Graph image are reproducible with `node capture.mjs` against the locally running preview. [Capture metadata](docs/screenshots.json) records image dimensions and SHA-256 values. The gallery separately identifies genuine local application screenshots using invented records and human/demo requirements.

## Release isolation

Deploy **only the audited `dist/` files** to a new Vercel Hobby project named `rolecraft-showcase` under the existing `mubidotjs-projects` team. Do not link/deploy the repository root or its existing application. The static configuration has no framework, installation, build, function, rewrite, cron or environment setup. No Git auto-deployment, remote inference or paid resource is configured. Releases are manual after the exact source SHA passes both GitHub workflows.

Attach only `rolecraft.mubashirhussain.dev`. Obtain the exact DNS recommendation from Vercel for that project/domain, then add or update only the Rolecraft subdomain at Dynadot. Do not change apex records, nameservers, MX/TXT records, existing projects or other subdomains. Verify DNS, public HTTPS, served asset hashes, responsive navigation and metadata after the change. A DNS write alone does not establish propagation or certificate readiness.

The local application, model, prompts, contracts, evidence validators, databases and deployments remain unchanged. Proposed links for the separate portfolio and profile repositories must be reviewed separately; this showcase does not modify them.
