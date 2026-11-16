# Focused extraction correction — 2026-11-16

Reference implementation: `fd1ccf62fd0ed1673a91a76e1759d1ac8105fc7f`. The original eight golden descriptions, answers, aliases and all `docs/verification/` baseline reports are preserved unchanged.

## Measured outcome

**The predeclared target was met in one 13-call batch. AI extraction is frozen after this measurement; no additional prompt tuning or model calls were performed.** [Complete metadata and hashes](quality-correction/results.json).

| Original set           | Verified baseline | Corrected reviewed set |
| ---------------------- | ----------------- | ---------------------- |
| Application acceptance | 4/8               | 8/8                    |
| Precision              | 24/27 (88.9%)     | 28/28 (100%)           |
| Recall                 | 24/28 (85.7%)     | 28/28 (100%)           |
| Priority accuracy      | 21/24 (87.5%)     | 28/28 (100%)           |
| Numeric experience     | 0/1               | 1/1                    |
| Unsupported candidates | 1                 | 0                      |
| False positives        | 3                 | 0                      |

Five affected fixtures were actually rerun. Gold-01, gold-04 and gold-07 are retained historical results, explicitly marked in the metadata; this is not a claim of eight new executions with the candidate.

| Unseen holdout         | Exact baseline adapter | Corrected adapter |
| ---------------------- | ---------------------- | ----------------- |
| Application acceptance | 0/4                    | 4/4               |
| Precision              | 11/14 (78.6%)          | 12/12 (100%)      |
| Recall                 | 11/13 (84.6%)          | 12/13 (92.3%)     |
| Priority accuracy      | 8/11 (72.7%)           | 12/12 (100%)      |
| Numeric experience     | 0/1                    | 1/1               |
| Unsupported candidates | 1                      | 0                 |
| False positives        | 3                      | 0                 |

All generated responses on both holdout sides had a scoreable baseline shape and exact source quotes. Baseline failures were deterministic semantic/evidence rejections; the candidate had no generation-contract or semantic rejections in this batch. A passing application response can still be incomplete: the candidate omitted Flask from “preferred, not required” in hold-02. The validator accepts that explicitly supported preference, as its independent regression test verifies. This remaining omission is a model-generation limitation, not a rejection defect. It is retained in recall, not repaired or removed from the golden labels.

| Fixture                         | Baseline latency            | Corrected latency |
| ------------------------------- | --------------------------- | ----------------- |
| gold-02 years                   | 44.40 s (retained baseline) | 86.20 s           |
| gold-03 responsibilities        | 24.17 s (retained baseline) | 29.09 s           |
| gold-05 negation                | 47.87 s (retained baseline) | 34.15 s           |
| gold-06 contradictions          | 39.44 s (retained baseline) | 42.66 s           |
| gold-08 priorities              | 50.79 s (retained baseline) | 39.47 s           |
| hold-01 numeric duty            | 49.70 s                     | 43.72 s           |
| hold-02 negation/preference     | 26.04 s                     | 22.82 s           |
| hold-03 contradiction/tool      | 34.73 s                     | 32.82 s           |
| hold-04 priorities/instructions | 27.14 s                     | 31.97 s           |

These are actual CPU wall-clock latencies, including validation and any loading/prefix work. There was one observation per adapter/fixture, no resampling and no latency-based selection. This small suite is not a statistical generalization guarantee. Exact evidence checks, visible rejection, human corrections and explicit draft approval remain necessary.

## Correction and safety boundary

The application still performs one Ollama `/api/chat` inference per extraction, using `qwen3:4b`, the same digest and inference limits. No record migration, scheduled re-extraction, semantic repair or draft modification is introduced.

- **Numeric experience:** the generation-only Zod discriminated union puts the existing rule into JSON Schema: only `experience` can carry non-null `minYears`. The shared persisted/API shape stays compatible. An invalid skill-plus-years response is rejected, never converted to experience. The source must support both area and numeric years in the relevant sentence.
- **Negation:** negated-only mentions are rejected even when labeled unknown. Explicitly preferred but not mandatory is distinguishable from a negated preference. These are validation decisions; the candidate is never rewritten.
- **Contradictions:** a conflicting positive/negative statement requires unknown priority and a quote containing both opposing statements. A one-sided quote cannot establish acceptance.
- **Duties and priorities:** priority evidence is checked in sentences/semicolon clauses containing the actual term. An unrelated location/skill requirement cannot make a duty mandatory. Exact quotes, literal terms, duplicate checks, instruction rejection, model identity and human review remain enabled.
- **Generation guidance:** one separate example demonstrates numeric experience, excluded negation, unresolved contradiction, preferred tooling and an ordinary duty. Its technologies and place occur in neither evaluation set. The same generation schema is also supplied in the prompt to ground field meanings. There is still only one model request.

The local scope checks are conservative lexical rules, not a general language-understanding or prompt-injection guarantee. Ambiguous cross-clause scope can still require human assessment. Previously accepted records are not revalidated on reads; changed extraction rules do not rewrite stored requirements, statuses, dates or approvals.

## Predeclared live budget and holdout

Offline unit tests must pass before running:

```sh
npm run evaluate:quality
```

The script verifies only local version/inventory metadata before generation. It does not rerun installation, download a model, repeat the old verification fixture, read SQLite, call hosted models or retry a failed fixture.

One batch has a maximum of **13 actual inference calls**:

1. Corrected adapter once on gold-02, gold-03, gold-05, gold-06 and gold-08. Gold-03 is included because responsibility extraction changed.
2. Retain gold-01, gold-04 and gold-07 with their original run IDs, model/dataset identity and exact historical adapter hashes; these are not claimed as reruns.
3. Four separately authored, unseen synthetic holdouts, each once on the exact baseline adapter and once on the corrected adapter. Baseline source is loaded from the reference Git commit into ignored temporary artifacts. This produces an actual holdout comparator rather than assuming no regression.

Holdout labels are authored and fixed before any live call. They cover different technologies, numbers, duties and locations; one includes an embedded instruction. The scoring function `lib/extraction-metrics.ts` remains byte-for-byte unchanged. The shared summary function is tested against every field of the committed baseline summaries. Both holdout sides use identical scoring.

Target: at least 7/8 original outputs passing application validation, plus no holdout regression in accepted count, precision, recall, priority accuracy, numeric experience accuracy, no-invented-experience cases or unsupported candidates. The batch stops after these measurements. Missing the target is recorded as a semantic limitation; it does not trigger another prompt revision or another inference loop.

## Evidence and hash interpretation

The report records each call's actual latency, completion/validation checks, rejection category, short synthetic prediction labels and numeric/priority fields. It never saves source descriptions, source quotes, résumé data or raw model responses. Failed candidates are included in semantic metrics when their base JSON shape is scoreable.

The original scoring shape is intentionally frozen for comparability. The strengthened generation contract may reject a kind/years combination that still has a scoreable baseline shape; that failure is separately labeled `output_schema`. Source/priority/negation/contradiction failures are `evidence_rejected`. Neither is silently repaired.

New adapter hashes are SHA-256 over a sorted mapping of relevant source paths to source-content SHA-256 values, including prompt, contract and validators. `adapterFileHash` separately records `lib/ollama.ts`. Historical retained rows keep their original single-file hash scheme, explicitly labeled. Dataset, holdout, scorer and model digests are recorded independently. Candidate source hashes are checked during the batch to prevent mixing edits with a running evaluation.

Reports are written to ignored `artifacts/quality-correction-<timestamp>.json`; reviewed metadata is committed separately after the run. Existing baseline evidence and private workspace databases are never overwritten.

## Review forms and preservation checks

After the predeclared quality target passed, extraction source files were frozen at the report's exact hashes. The next authorized step replaces both JSON-only editors with labeled fields, fieldset legends, native validation, explicit numeric entry and add/remove controls. Users can expand the job description beside evidence review. Kind changes cannot silently discard entered years; users clear the number first. Every profile edit clears verification, and saving still requires renewed human confirmation and the original server-side evidence checks.

The UI does not migrate, re-extract, auto-save or rewrite existing records. An isolated SQLite regression seeds a previously accepted negated/unknown requirement and an approved draft, reopens the database, and compares jobs, drafts and events byte-for-byte after reads and a rejected attempted save. Approved text, approval state, timestamps and non-stale state remain unchanged. The private workspace database was never opened for this task.

Offline Chromium acceptance covers the real UI → API → isolated SQLite flow with the new forms: imports, numeric requirements, cancellation without saving, verified profile years, rejection of unsupported years, renewed confirmation, fit contributions, status, draft approval, actual clipboard access, CSV export, reload recovery and narrow layouts. Native label associations and keyboard tab/activation are checked. These browser tests do not claim additional live inference; the original live workflow report is retained at its own baseline. The opt-in live acceptance script's selectors are updated for the forms, but its fresh full-evaluation guard is preserved and it was not executed during this correction.

Final local checks: TypeScript, all **58 Vitest tests**, the production Next.js build and all **3 Chromium scenarios** passed. Desktop requirement review and the 390-pixel profile form were visually inspected. The exact evaluated extraction source hashes were rechecked after the UI changes; they match the committed report. No further live model calls were made.
