# Showcase verification

The public presentation is separate from local application baseline `aca0a75ee717e1032a9b55006c25a08d791f91d7`. No existing application code, inference code, prompts, contracts, model configuration, database, local tests or local CI workflow was changed. No live inference was requested.

Local verification completed November 16, 2026:

- Independent TypeScript check and production build: PASS.
- Static artifact and fixture/matching regressions: PASS.
- All three Chromium acceptance scenarios: PASS.
- Axe WCAG 2 A/AA and 2.1 A/AA checks: zero violations across eight views at 1440, 768 and 390 pixels. No rules disabled. Automated checks supplement keyboard and visual inspection; they are not a certification of complete accessibility.
- Search/filter/empty state, exact 3/7 matching, flagged-priority recalculation, tracking reset on reload, explicit approval, rejection and clipboard copy: PASS.
- Public notice, canonical/title/Open Graph metadata, genuine local-app screenshots, forbidden API/private paths and failed-module fallback: PASS.
- Runtime request assertions: only same-origin static GETs; no inference, persistence, external requests or mutations.
- Artifact checks reject injected server files, network/storage primitives and SQLite signatures. Only 17 explicitly allowlisted static files are eligible for upload.

Actual showcase screenshots are recorded in [screenshots.json](screenshots.json), with viewport dimensions and hashes. The Open Graph image is a genuine 1200 × 630 browser viewport. The public gallery separately labels the original local application screenshots as synthetic/human-demo examples. No image generation or fabricated model-result asset is used.

The existing Vercel team `mubidotjs-projects` was inspected read-only and confirmed to have an active Hobby plan. The intended release is a new `rolecraft-showcase` project with only the audited static files; existing projects are outside scope. Deployment and DNS must be verified against the actual release response. Final source SHA, exact-SHA CI results, Vercel deployment identity and public HTTPS/DNS status are reported in delivery rather than inferred from this local acceptance.
