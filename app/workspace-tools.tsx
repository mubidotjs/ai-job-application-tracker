'use client';
import { useRef, useState } from 'react';

type Preview = {
  token: string;
  backup: {
    jobs: number;
    profiles: number;
    drafts: number;
    approvedDrafts: number;
    history: number;
    schemaVersion: number;
  };
};
export function WorkspaceTools({ disabled }: { disabled: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const locked = useRef(false);
  const picker = useRef<HTMLInputElement>(null);
  async function run(label: string, work: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(label);
    setError('');
    setNotice('');
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Workspace operation failed.');
    } finally {
      locked.current = false;
      setBusy('');
    }
  }
  function reset() {
    setFile(null);
    setPreview(null);
    setConfirmed(false);
    setError('');
    if (picker.current) picker.current.value = '';
  }
  async function request(action: string, body?: File, token?: string) {
    const response = await fetch(`/api/workspace?action=${action}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        ...(token
          ? { 'X-Rolecraft-Preview': token, 'X-Rolecraft-Confirm': 'replace-workspace' }
          : {}),
      },
      body,
      signal: AbortSignal.timeout(65000),
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Workspace operation failed.');
    }
    return response;
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR LOCAL WORKSPACE</div>
          <h1>Keep a copy. Restore with care.</h1>
          <p>Protect the evidence, progress and decisions you have saved.</p>
        </div>
      </div>
      <div className="banner warning">
        <div>
          <strong>Backups contain sensitive plaintext personal information.</strong>
          <p>
            Résumé text, notes and drafts are included. No encryption is provided. Store files
            securely, keep them out of Git, and restore only your own trusted backups. Files stay in
            your browser and this local application; nothing goes to cloud storage.
          </p>
        </div>
      </div>
      {error && (
        <div className="banner error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="banner success" role="status">
          {notice}
        </div>
      )}
      {busy && <p role="status">{busy}… Please keep this page open.</p>}
      <div className="profile-grid">
        <section className="panel">
          <div className="panel-content">
            <h2>Back up workspace</h2>
            <p>
              A complete snapshot of jobs, résumé profiles, reviewed requirements, draft approvals,
              tracking, history and migration metadata.
            </p>
            <p className="field-help">
              The app safely includes committed changes while the workspace is in use. Maximum
              backup size: 32 MiB. Save a backup before restoring another one.
            </p>
            <button
              className="button primary"
              disabled={disabled || !!busy}
              onClick={() =>
                run('Creating backup', async () => {
                  const response = await request('backup');
                  const url = URL.createObjectURL(await response.blob());
                  const link = document.createElement('a');
                  link.href = url;
                  link.download = 'rolecraft-workspace.sqlite';
                  document.body.appendChild(link);
                  link.click();
                  link.remove();
                  setTimeout(() => URL.revokeObjectURL(url), 30000);
                  setNotice(
                    'Backup download prepared. Keep this plaintext file in a secure place.',
                  );
                })
              }
            >
              Download workspace backup
            </button>
          </div>
        </section>
        <section className="panel">
          <div className="panel-content">
            <h2>Restore workspace</h2>
            <p>
              Preview a compatible Rolecraft backup before replacing anything. Close other workspace
              tabs first.
            </p>
            <fieldset className="review-form" disabled={disabled || !!busy}>
              <legend className="sr-only">Choose and confirm a workspace restore</legend>
              <label htmlFor="workspace-backup-file">Backup file (SQLite, up to 32 MiB)</label>
              <input
                id="workspace-backup-file"
                ref={picker}
                type="file"
                accept=".sqlite,.db,application/octet-stream"
                onChange={(event) => {
                  const selected = event.target.files?.[0] || null;
                  setPreview(null);
                  setConfirmed(false);
                  setNotice('');
                  setError('');
                  if (selected && selected.size > 32 * 1024 * 1024) {
                    setError('Backup exceeds 32 MiB.');
                    setFile(null);
                  } else setFile(selected);
                }}
              />
              {!preview && (
                <button
                  className="button secondary backup-preview"
                  disabled={!file}
                  onClick={() =>
                    run('Checking backup integrity', async () => {
                      const response = await request('preview', file!);
                      setPreview(await response.json());
                    })
                  }
                >
                  Preview restore
                </button>
              )}
              {preview && (
                <div className="restore-preview">
                  <h3>Backup checked · schema version {preview.backup.schemaVersion}</h3>
                  <p>
                    {preview.backup.jobs} jobs · {preview.backup.profiles} profiles ·{' '}
                    {preview.backup.drafts} drafts ({preview.backup.approvedDrafts} approved) ·{' '}
                    {preview.backup.history} history entries
                  </p>
                  <p>
                    <strong>This replaces all current workspace records.</strong> It does not merge
                    them. Identifiers, timestamps, approvals and recorded provenance are preserved.
                    Preview expires in five minutes; any intervening workspace change requires a new
                    preview.
                  </p>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                    />
                    I understand this replaces all saved workspace data.
                  </label>
                  <div className="action-row">
                    <button className="button secondary" onClick={reset}>
                      Cancel restore
                    </button>
                    <button
                      className="button destructive"
                      disabled={!confirmed}
                      onClick={() =>
                        run('Restoring workspace', async () => {
                          try {
                            await request('restore', file!, preview.token);
                            window.location.assign('/?restored=1'); // Drop all stale editors after replacement.
                          } finally {
                            setPreview(null);
                            setConfirmed(false);
                          }
                        })
                      }
                    >
                      Replace workspace with this backup
                    </button>
                  </div>
                </div>
              )}
              {!preview && file && (
                <button className="text-button" onClick={reset}>
                  Clear selected backup
                </button>
              )}
            </fieldset>
            <p className="field-help">
              An invalid file cannot replace data. Interrupted restores recover to a complete state;
              reload before retrying if the result is uncertain. A restore never sends applications
              or reruns AI extraction.
            </p>
          </div>
        </section>
      </div>
    </>
  );
}
