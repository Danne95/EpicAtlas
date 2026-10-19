import { emptyWorkspace, validateWorkspace, type Workspace } from './workspaceSchema';
export { emptyWorkspace, validateWorkspace, type Workspace } from './workspaceSchema';

let revision: string | undefined;
let loaded: Promise<Workspace> | undefined;
const endpoint = `${import.meta.env.BASE_URL}api/travel`;

async function request(options?: RequestInit): Promise<any> {
  let response: Response;
  try { response = await fetch(endpoint, { cache: 'no-store', ...options }); }
  catch { throw new Error('Local file storage is unavailable. Start the atlas server and reload; changes have not been saved.'); }
  let result;
  try { result = await response.json(); }
  catch { throw new Error('This page needs the local atlas server to save travel files.'); }
  if (typeof result.revision === 'string' && !options) revision = result.revision;
  if (!response.ok) throw new Error(result.error || 'Could not access the local travel file.');
  return result;
}

export function readWorkspace(): Promise<Workspace> {
  loaded ??= (async () => {
    const saved = await request();
    const data = validateWorkspace(saved.data);
    if (!saved.exists) {
      // Retain the old browser copy. Migrate only if there is no file yet.
      let browserCopy: string | null = null;
      try { browserCopy = localStorage.getItem('epicatlas.travel.v1'); } catch { /* Storage may be disabled; disk storage still works. */ }
      let initial = emptyWorkspace();
      if (browserCopy !== null) {
        try { initial = validateWorkspace(JSON.parse(browserCopy)); }
        catch { throw new Error('Existing browser travel could not be read. Restore a valid backup before creating the travel file; the browser copy has been kept.'); }
      }
      await saveWorkspace(initial, 'migrate');
      return initial;
    }
    return data;
  })();
  return loaded.then(data => structuredClone(data));
}

export async function saveWorkspace(data: Workspace, purpose: 'edit' | 'restore' | 'migrate' = 'edit'): Promise<void> {
  validateWorkspace(data);
  if (!revision) throw new Error('The travel file is unavailable. Reload before saving.');
  const saved = await request({ method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-Match': revision, 'X-EpicAtlas-Write': purpose }, body: JSON.stringify(data) });
  revision = saved.revision;
  loaded = Promise.resolve(structuredClone(data));
  window.dispatchEvent(new Event('epicatlas:workspace-saved'));
}

// Refresh stale views without interrupting an open form or a file save.
export function watchWorkspaceChanges(): void {
  let pending = false;
  const channel = typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel('epicatlas.travel');
  const refresh = () => {
    if (pending && !document.querySelector('dialog[open], #travel-editor[data-route-preview]')) window.location.reload();
  };
  window.addEventListener('epicatlas:workspace-saved', () => {
    pending = true;
    channel?.postMessage({ revision });
    refresh();
  });
  if (channel) channel.onmessage = event => {
    if (typeof event.data?.revision === 'string' && event.data.revision !== revision) { pending = true; refresh(); }
  };
  document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('close', refresh));
  let checking = false;
  const check = async () => {
    if (!revision || checking || document.visibilityState === 'hidden') return;
    checking = true;
    try {
      // Explicit GET leaves this window's write revision intact until reload.
      const saved = await request({ method: 'GET' });
      if (saved.revision !== revision) { pending = true; refresh(); }
    } catch { /* Preserve the current view and form while storage is unavailable. */ }
    finally { checking = false; }
  };
  window.addEventListener('focus', () => { void check(); });
  document.addEventListener('visibilitychange', () => { void check(); });
}
