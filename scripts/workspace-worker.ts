import {
  createBackup,
  inspectBackup,
  restoreBackup,
  workspaceFingerprint,
} from '../lib/backup-core.ts';

// Only the local server supplies these paths. Never accept paths from an HTTP client.
const [action, workspace, candidate, expected] = process.argv.slice(2);
try {
  const result =
    action === 'backup'
      ? await createBackup(workspace, candidate)
      : action === 'inspect'
        ? { backup: inspectBackup(candidate), currentFingerprint: workspaceFingerprint(workspace) }
        : action === 'restore'
          ? restoreBackup(workspace, candidate, expected)
          : (() => {
              throw new Error('Unknown workspace operation');
            })();
  process.stdout.write(JSON.stringify(result));
} catch (error) {
  // No native diagnostics, paths, payloads or personal data reach logs/responses.
  const changed =
    error instanceof Error && error.message.startsWith('Workspace changed after preview');
  process.stdout.write(
    JSON.stringify({
      error: changed
        ? 'Workspace changed after preview. Preview the backup again before replacing data.'
        : 'Backup is corrupt, incompatible, or exceeds workspace limits. Current data was not replaced.',
    }),
  );
  process.exitCode = 1;
}
