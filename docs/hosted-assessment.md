# Optional hosted inference assessment

**Final product recommendation (November 16, 2026):** use only a separately isolated static, read-only synthetic showcase with bundled invented records and clearly labeled fixed outputs. Include no API, résumé input, backup/restore, SQLite file, credentials, local Ollama connection or remote inference. Link to the local repository for actual inference. Do not deploy the current local-only server directly to Vercel. No hosted resources have been created. The assessment below is retained historical context, not the selected approach.

Assessed November 15, 2026. No resources created, provider enabled, credentials provisioned or private data transmitted.

The local SQLite + Ollama architecture remains the default. Hosting the current local-only API publicly is unsuitable: it has no multi-user authentication, relies on device-local disk, and deliberately rejects non-loopback hosts.

Cloudflare Workers AI can provide actual remote inference on its Free plan within **10,000 Neurons/day**, with errors once that allocation is exhausted. Some models require a paid billing method. These are compute units, not a guarantee of a fixed request count or uninterrupted capacity. See [official pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) and [model access restrictions](https://developers.cloudflare.com/changelog/post/2026-07-28-models-require-workers-paid/).

This makes a small opt-in synthetic demonstration plausible; it does not verify that the exact local `qwen3:4b` model is available, that a replacement satisfies the same extraction contract, or that a shared public demo will stay within quota. Model and quota selection would need fresh verification and extraction evaluation. No hosted model is configured in this repository.

A future hosted implementation should keep résumé parsing, evidence review and matching local. A separate explicit consent screen could send **job description text only** to a selected remote provider. It would need an independently implemented adapter with the same strict output contracts, provider disclosure on every result, authentication, request/concurrency limits, hard free-quota failure and no automatic paid fallback. Any storage migration would require a separate privacy and access-control design; do not reuse this device's SQLite file in a public deployment.

A public synthetic showcase must state that vacancies and candidate evidence are invented and distinguish saved/manual examples, live remote inference, and live local inference. The present seeded demo is synthetic with human/demo requirements. Local inference has since passed independently; see the [live verification and quality results](extraction-evaluation.md). The evaluation still has semantic failures, and no public or remote-inference demo is enabled.
