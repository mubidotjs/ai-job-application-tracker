# Local workspace backup and restore

Open **Backup & restore** in the workspace navigation. This works entirely between your browser and the local Rolecraft server. No cloud storage, telemetry, remote inference or application sending is involved.

## Back up

Select **Download workspace backup** and save the `.sqlite` file securely. The file includes every workspace table: jobs and tracking, reviewed requirements and original inference provenance, résumé profiles, drafts and approvals, history, duplicate decisions and the migration ledger. It is a full snapshot, not a CSV export. No table is silently truncated.

Backups contain **sensitive plaintext personal information**. Rolecraft provides no backup encryption or cryptographic authenticity guarantee. Restore only your own trusted backups. Keep them out of Git, shared folders and public demonstrations. Your browser and operating system control the download destination and any folder synchronization. SQLite free pages may retain previously deleted content; treat the entire file as sensitive.

The server uses Node's [SQLite online backup API](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html#sqlitebackupsourceDb-path-options). It accounts for committed WAL data and permits concurrent activity. SQLite explains its consistent snapshot behavior in the [backup API documentation](https://www.sqlite.org/backup.html). Copying only an open workspace's main file is not this procedure.

## Restore

1. Download a backup of the current workspace first. Close other workspace tabs and wait for any extraction to finish.
2. Choose a Rolecraft `.sqlite` backup and select **Preview restore**. This does not replace records.
3. Inspect the counts and compatibility result. To cancel, select **Cancel restore**; the current workspace stays unchanged.
4. Confirm **I understand this replaces all saved workspace data**, then select **Replace workspace with this backup**. This replaces rather than merges records.
5. Wait for confirmation. The page reloads to discard stale editors. Inspect jobs, tracking and any approved drafts before continuing.

Preview authorizations are random, single-use, expire after five minutes, and bind both the selected file's SHA-256 and the current workspace contents. Changing either requires a new preview. The server requires same-origin loopback access and explicit replacement confirmation independently of the interface.

## Validation and recovery

The implementation accepts SQLite files up to **32 MiB** and schema version **1**, with the exact known schema (allowing Windows/Unix line endings). It rejects extra tables, views, triggers, changed definitions, incompatible migration versions, broken foreign keys, corruption, invalid record structures and excess row/field sizes. These are structural archive checks; historical AI claims are not re-extracted, semantically reclassified or repaired. Existing extraction contracts and evidence validators remain frozen.

Uploaded file names and path parameters are never used as filesystem paths. Each local request uses a server-created private temporary directory with a fixed internal filename. Preview files are deleted after that request; the browser retains the selected file for confirmation. At most one backup operation runs at a time. A child process provides a **25-second deadline**, a **192 MiB JavaScript heap cap**, a **64 MiB SQLite allocation cap**, disabled extensions, defensive mode, untrusted-schema mode and bounded SQL limits. Temporary plaintext files are removed on ordinary completion and handled failures; an abrupt parent-process or OS crash can leave a private OS temporary directory for OS/user cleanup.

Restore reads validated rows and preserves raw values, physical row identifiers, identifiers, timestamps, context fingerprints, approvals and provenance. It never executes SQL supplied by the file. It checks the current workspace fingerprint under `BEGIN IMMEDIATE`, replaces all six tables through prepared statements, verifies the resulting snapshot, and commits with `synchronous=FULL`. It neither renames the live database nor replaces an open WAL file. Other writes wait on SQLite's lock; application requests are paused during restore. Run one Rolecraft server process per workspace.

A rejection or pre-commit failure leaves the prior workspace intact. An abrupt interruption is recovered by SQLite to a complete transaction state. If interruption occurs around commit and the HTTP result is uncertain, **reload and inspect the workspace before retrying**; do not assume the replacement failed. The original downloaded backup remains available. A busy/timeout error is visible and does not trigger an automatic retry. The size/resource limits deliberately fail visibly for an oversized workspace; there is no partial backup or restore.

## Synthetic verification

Tests cover WAL data and concurrent writes; exact round-trip of all six tables; preserved physical ordering, approved draft text/state, tracking, reviewed and original Ollama provenance; connection restart; corrupt/truncated/oversized files; foreign schema objects and versions; malformed stored data; legacy accepted claims; stale previews; file-bound and single-use authorizations; extraction/restore exclusion; transactional failure and abrupt child exit before commit. Browser tests exercise actual download, preview, cancellation, confirmation, replacement, corruption rejection, size limits and origin protection. Every database in these checks is synthetic and isolated.
