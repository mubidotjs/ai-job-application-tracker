# Final local product acceptance — November 16, 2026

Reference baseline: `e17ade3cf05f66fb380852f1496dac5d6f3ab2f0`. This final hardening keeps AI extraction frozen and does not rerun live model verification or evaluation. No installation, model download, cloud resource, remote inference or deployment is part of this work.

| Check                             | Observed local result                                                    |
| --------------------------------- | ------------------------------------------------------------------------ |
| TypeScript                        | PASS                                                                     |
| Complete Vitest suite             | PASS — 74 tests in 10 files                                              |
| Backup/recovery regressions       | PASS — 15 cases, all synthetic                                           |
| Complete Chromium suite           | PASS — 5 scenarios                                                       |
| Production build                  | PASS                                                                     |
| Frozen extraction/data hashes     | PASS — exact evaluated source content, normalizing checkout line endings |
| Desktop/mobile screenshot capture | PASS — five actual Chromium viewport captures                            |
| Backup/restore                    | PASS                                                                     |
| Final local product acceptance    | PASS                                                                     |
| Portfolio demonstration           | READY                                                                    |

Backup tests exercise committed WAL data and concurrent writes, all six workspace tables, raw row ordering and migration metadata, approved draft text/state, context fingerprints, tracking and reviewed/original Ollama provenance. Restoration is verified after connection restart. Rejection cases include corruption, truncation, excess size, foreign schema objects, missing indexes, incompatible migration versions, malformed profile data, broken foreign keys, stale/expired previews and changed files. Both a thrown pre-commit failure and abrupt child-process exit recover the complete prior state. Historical accepted claims are preserved without applying newer semantic checks. Confirmation is single-use, and extraction/restore cannot overlap.

Chromium covers the existing import/duplicate/profile/requirements/fit/status/draft/clipboard/export/persistence journey and evidence forms. The new local recovery journey performs a genuine SQLite backup download, preview, cancellation and confirmed replacement, compares restored state with the original, and confirms invalid files and unauthorized requests cannot replace it. Keyboard tabs, mobile overflow and visible CPU-inference/timeout behavior are checked. Timeout/double-click coverage intercepts the model boundary explicitly; it makes no live model call or live-inference claim.

All databases used for testing and capture are isolated, invented workspaces. The private workspace was not opened or modified. Existing golden answers, model digest, prompt, contracts, inference adapter, validators, scorer and historical verification reports remain unchanged. The first 20 demo jobs are the unchanged committed fixtures. Screenshot capture seeds a new database, uses human/demo extraction provenance and a fictional profile, binds only to loopback, then closes its owned server. [Capture metadata](demo-capture.json) records dimensions and image hashes; the images were visually reviewed.

The previously documented genuine local inference and live application workflow remain PASS at their recorded baselines. This final product acceptance is an offline application/recovery acceptance, not an additional live AI evaluation. The original set's 8/8 combined acceptance and independent holdout's 4/4 acceptance retain their exact evidence and limitations, including one omitted Flask preference and the small synthetic sample.

No outstanding critical local defect was found in these checks. Deliberate limits remain: a single local server process, plaintext SQLite and backups, 32 MiB backup files, explicit human evidence/approval decisions and probabilistic extraction. Abrupt parent/OS crashes can leave sensitive temporary files for local cleanup; an uncertain restore response requires reloading to inspect the committed state. No multi-user or internet-facing hosting is supported.

For a public portfolio, the recommendation is a **separate static read-only synthetic showcase** with bundled invented records and fixed labeled outputs, without an API, private SQLite, résumé entry, backups, local Ollama or remote inference. No hosting implementation was performed. See the [reproducible walkthrough](portfolio-walkthrough.md) and [backup/recovery procedure](workspace-backups.md).

The delivery report links the published commit and its exact-SHA CI result. CI runs type checking, the complete offline test suites and the production build with no Ollama dependency.
