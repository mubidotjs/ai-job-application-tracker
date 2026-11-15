# Local extraction evaluation protocol

The eight fixtures in `fixtures/extraction-golden.ts` are deterministic, human-authored, entirely synthetic descriptions and exhaustive requirement lists. They were authored before any evaluation model call. No résumé, private job record or model-authored golden label is used.

## Actual results — November 15, 2026

**Real inference PASS; evaluation complete with unresolved quality failures.** Ollama 0.40.16, `qwen3:4b`, 4.0B Q4_K_M, CPU. Model digest: `359d7dd4bcdab3d86b87d73ac27966f4dbb9f5efdfcc75d34a8764a09474fae7`. The latest committed-fixture verifier passed with 8 requirements in 118,554 ms, HTTP 200, exact model identity, `done: true`, `done_reason: stop`, strict Zod and exact source support. [Verifier proof](verification/real-ai-pass.json).

The first full eight-fixture run is preserved as [baseline metadata](verification/evaluation-baseline.json). The [final metadata](verification/evaluation-final.json) contains seven affected-fixture reruns and the explicitly retained `gold-04-ambiguous` control. Golden labels and the model digest stayed unchanged. Each row records its adapter hash and run ID; this is not a claim that all eight were rerun with the final prompt.

| Metric                                        | Baseline      | Final reviewed set |
| --------------------------------------------- | ------------- | ------------------ |
| Schema-valid responses                        | 8/8 (100%)    | 8/8 (100%)         |
| Exact evidence support                        | 24/24 (100%)  | 27/27 (100%)       |
| Requirement precision                         | 20/24 (83.3%) | 24/27 (88.9%)      |
| Requirement recall                            | 20/28 (71.4%) | 24/28 (85.7%)      |
| Required / preferred / unknown classification | 17/20 (85%)   | 21/24 (87.5%)      |
| Correctly typed numeric experience + years    | 0/1           | 0/1                |
| No-experience cases without invented years    | 6/7           | 7/7                |
| False positives                               | 4             | 3                  |
| Unsupported claims in candidates              | 1             | 1                  |
| Strict schema failures                        | 0             | 0                  |
| Strict semantic/evidence rejections           | 3             | 4                  |

Unsupported candidates are included in these metrics even when the application rejects them. None of the final false-positive candidates was accepted into an application record. **100% schema and quote validity does not mean 100% semantic correctness.** Four final fixture outputs passed all application checks; four were rejected. The accepted Java/Docker fixture still omitted a responsibility, which recall exposes.

| Fixture                               | Final latency | Application validation | Remaining issue                                                        |
| ------------------------------------- | ------------- | ---------------------- | ---------------------------------------------------------------------- |
| 01 Explicit skills                    | 43.24 s       | PASS                   | None against this golden                                               |
| 02 Years and timezone                 | 44.40 s       | FAIL                   | Experience represented as skill; timezone priority understated         |
| 03 No explicit years                  | 24.17 s       | PASS                   | Pull-request review responsibility omitted                             |
| 04 Ambiguous stack (retained control) | 29.84 s       | PASS                   | None against this golden                                               |
| 05 Negation                           | 47.87 s       | FAIL                   | Negated skill included                                                 |
| 06 Conflict                           | 39.44 s       | FAIL                   | Priority/type errors; missing or wrongly typed Docker/API requirements |
| 07 Embedded prompt injection          | 39.67 s       | PASS                   | No instruction-only claim in the final response                        |
| 08 Constraints                        | 50.79 s       | FAIL                   | Responsibility given unsupported required priority                     |

Diagnostic repeats are excluded from all aggregate denominators. In fixture 02 the scalar `4` was extracted, but attached to a `skill` item; the existing rule that only `experience` may carry years correctly rejected it. The numeric metric requires a correctly typed experience requirement, not merely a number somewhere in JSON. Fixture 08's diagnostic verifies an unsupported required label on an ordinary responsibility. These are semantic representation errors, not malformed JSON or strict-schema failures.

Narrow corrections: full sentence/list-line quotes fixed the initial priority-evidence rejection; prompt rules then requested omitted duties and literal values. A concrete illustrative duty was removed after the model copied it into a term. Exact quote checking was made case-sensitive. Additional fail-closed checks reject instruction-line claims and cherry-picked priorities contradicted elsewhere for the same term. A preferred requirement is not treated as contradicted merely because the source also says it is not mandatory. No unsupported output is silently rewritten into a passing result. The duration budget was increased from 120 to 300 seconds after an observed CPU timeout; input, output and evidence limits were retained.

This small synthetic suite is an evaluation result, not a reliability guarantee or a green light for unattended use. Numeric representation, priority handling, negation and recall remain open issues before broader portfolio-demo claims. No public demo or hosted inference was enabled.

## Real application acceptance

**PASS.** [Metadata-only acceptance evidence](verification/live-acceptance.json) records a real Chromium → Next.js API → local Ollama → SQLite workflow on the explicit-skills synthetic job. Import, actual four-requirement extraction, literal human correction, verified fictional résumé, explainable 7/7 weighted points (100/100, one unknown responsibility), Applied status, draft creation/edit/explicit approval, actual clipboard copying, CSV download and application restart persistence all passed.

Human review normalized a responsibility label without adding experience. The current requirements are accurately labeled human-reviewed; the immutable `originalInference` retains genuine `ollama` provenance, model, HTTP/completion/schema/evidence checks, input hash and original requirements. Restarting the server preserved both that origin and the approved draft's exact text hash. The actual Windows clipboard used CRLF; the test normalizes only native line endings for comparison and checks database text separately.

The isolated synthetic database is retained locally at the `databaseFile` path in the report and is ignored by Git. No private workspace records, real résumé, employer submission, message, scraping service or remote inference were used. Diagnostic repeats in [semantic diagnostics](verification/semantic-diagnostics.json) are excluded from evaluation metrics. A passing common-job workflow does not override the four remaining model-quality rejections above.

## Gate and execution

`npm run verify` checks the local service, installed exact model tag/digest, HTTP response identity and completion, strict Zod contract, and exact source evidence. Only PASS opens evaluation. `npm run evaluate:ollama` enforces that gate again using native local HTTP, then runs the eight fixtures sequentially with the same production adapter and validation. It has no mock transport, remote model fallback, download command or database access. Ordinary CI runs only unit tests and offline browser tests.

Reports go to ignored `artifacts/evaluation-<timestamp>.json` and `artifacts/evaluation-latest.json`. They contain fixture IDs/hashes, model identity/digest, validation failure categories, latency and metric counts. Candidates are inspected in memory only. Neither source text, raw model output nor private error messages is saved. Reviewed metadata-only reports may be copied into this documentation directory for portfolio evidence.

## Human labeling policy

- Explicit required and preferred phrases determine those labels. Unstated priority stays unknown.
- Technologies mentioned as the current stack or as potentially useful stay unknown rather than mandatory.
- Ordinary responsibilities have unknown priority unless explicit priority wording is present.
- Negated-only skills are excluded. Conflicting positive and negative requirements remain unknown for human review.
- Embedded requests to change instructions or output invented requirements are excluded, even when those requests mention a technology or numeric years.
- Experience is represented only where a numeric requirement is explicitly stated. A job with no numeric experience requirement must not acquire one.
- Skill and technology are treated as one family for semantic matching. Experience, responsibility and constraint remain separate. A fixed alias list is the only permitted normalization beyond case/punctuation/whitespace normalization. There is no fuzzy matching, model judge or post-hoc relabeling.

## Metrics and denominators

- **Schema-valid response rate:** model candidates satisfying the strict application contract / attempted fixtures. JSON, HTTP, completion and identity failures remain separately categorized; an unavailable prerequisite is not a semantic extraction failure.
- **Exact evidence-support rate:** schema-valid candidate requirements whose source quote is an exact case-sensitive substring and contains the literal term / schema-valid candidate requirement count. This uses the same check as the application.
- **Precision:** one-to-one term/alias + family matches / schema-valid candidate count. Duplicate requirements count as extra predictions.
- **Recall:** those matches / all golden requirements in attempted fixtures. Schema failures contribute no matches, so they do not disappear from recall. Rejected but schema-valid candidates still undergo semantic scoring, with rejection recorded separately.
- **Required/preferred classification correctness:** correct priority labels / matched golden requirements, including the unknown class. Missing requirements remain visible in recall.
- **Numeric experience-year correctness:** correct numeric years for the matched area / golden numeric experience requirements. Missing years therefore count as incorrect. Unexpected experience predictions are separately counted.
- **No-experience correctness:** fixtures with no golden experience requirement and no predicted experience requirement / all such attempted fixtures.
- **False positives:** schema-valid predictions without a one-to-one golden match. **Unsupported claims:** requirements failing exact evidence support, plus predictions for explicitly forbidden negated/instruction-only terms. A source-backed semantic false positive may therefore be distinct from an unsupported quote.
- **Latency:** per-fixture wall-clock milliseconds, including inference and strict validation. Initial model loading is included when it occurs; this is not a warmed-up GPU benchmark.

Null rates mean there is no denominator; they never mean 0% or 100%. A validation PASS on one fixture is not an assertion of perfect semantic quality.

## Focused corrections

Preserve the first full-run report. When an observed error justifies an adapter/prompt correction, keep the same golden labels and evidence checks and rerun only affected IDs:

```sh
npm run evaluate:ollama -- --fixtures=gold-05-negation,gold-06-conflict
```

The report lists rerun and retained fixture IDs and each row's adapter hash/run ID. Partial reruns can merge only with the same dataset hash and model digest. A changed dataset or model requires an explicit fresh full run. Never claim all fixtures were rerun from a merged report.
