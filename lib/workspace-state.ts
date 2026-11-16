// Shared between route bundles in this single-process local application.
const host = globalThis as typeof globalThis & {
  rolecraftWorkspace?: { restoring: boolean; extracting: boolean };
};
const state = (host.rolecraftWorkspace ??= { restoring: false, extracting: false });
export function assertWorkspaceAvailable() {
  if (state.restoring)
    throw new Error('Workspace restore is in progress. Wait, then reload this page.');
}
export function startExtraction() {
  assertWorkspaceAvailable();
  if (state.extracting)
    throw new Error('A local extraction is already running. Please wait for it to finish.');
  state.extracting = true;
  return () => {
    state.extracting = false;
  };
}
export function startRestore() {
  assertWorkspaceAvailable();
  if (state.extracting)
    throw new Error('Wait for local extraction to finish before restoring a workspace.');
  state.restoring = true;
  return () => {
    state.restoring = false;
  };
}
