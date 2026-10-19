import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { isDeepStrictEqual } from 'node:util';
import { isLocalRequest } from './localAccess';
import { emptyWorkspace, validateWorkspace } from '../src/data/workspaceSchema';

const maxBytes = 25 * 1024 * 1024;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

export function travelStorage(file: string): Plugin {
  async function current() {
    try {
      const contents = await readFile(file, 'utf8');
      return { revision: hash(contents), contents, exists: true };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      return { revision: 'missing', contents: '', exists: false };
    }
  }
  async function handle(req: IncomingMessage, res: ServerResponse, next: () => void) {
    if (req.url?.split('?')[0] !== '/api/travel') return next();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    const reply = (code: number, data: object) => { res.statusCode = code; res.end(JSON.stringify(data)); };
    // Only the local app can read/write personal travel, including under DNS rebinding.
    if (!isLocalRequest(req)) {
      reply(403, { error: 'Travel storage is available only to the local atlas.' }); return;
    }
    try {
      if (req.method === 'GET') {
        const saved = await current();
        try {
          const data = saved.exists ? validateWorkspace(JSON.parse(saved.contents.replace(/^\uFEFF/, ''))) : emptyWorkspace();
          reply(200, { data, revision: saved.revision, exists: saved.exists });
        } catch {
          reply(422, { revision: saved.revision, error: 'The travel file could not be read. Restore a valid backup to recover it; the existing file has been kept.' });
        }
        return;
      }
      if (req.method !== 'PUT') { reply(405, { error: 'Unsupported travel storage method.' }); return; }
      if (req.headers['content-type'] !== 'application/json' || !req.headers['if-match']) {
        reply(400, { error: 'A JSON workspace and current revision are required.' }); return;
      }
      const purpose = req.headers['x-epicatlas-write'] || 'edit';
      if (!['edit', 'restore', 'migrate'].includes(String(purpose))) {
        reply(400, { error: 'Unsupported travel save operation.' }); return;
      }
      const chunks: Buffer[] = [];
      let bytes = 0;
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > maxBytes) { reply(413, { error: 'Travel file exceeds the 25 MB limit.' }); return; }
        chunks.push(Buffer.from(chunk));
      }
      let data;
      try { data = validateWorkspace(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reply(400, { error: 'Invalid travel workspace. The existing file has been kept.' }); return; }
      await mkdir(dirname(file), { recursive: true });
      const lockPath = `${file}.lock`;
      let lock;
      try { lock = await open(lockPath, 'wx'); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        reply(409, { error: 'The travel file is being saved by another window. Please retry.' }); return;
      }
      const temp = join(dirname(file), `.workspace-${randomUUID()}.tmp`);
      try {
        const saved = await current();
        if (saved.revision !== req.headers['if-match']) {
          reply(409, { error: 'Saved travel changed in another window or on disk. Reload before editing to keep those changes.' }); return;
        }
        if (purpose === 'migrate' && saved.exists) {
          reply(409, { error: 'Legacy migration is available only before a travel file exists.' }); return;
        }
        if (purpose === 'edit') {
          let previous;
          try { previous = saved.exists ? validateWorkspace(JSON.parse(saved.contents.replace(/^\uFEFF/, ''))) : emptyWorkspace(); }
          catch { reply(422, { error: 'The travel file could not be read. Explicitly restore a valid backup; the existing file has been kept.' }); return; }
          const previousPlaces = new Map(previous.locations.features.map(place => [place.properties.id, place]));
          for (const place of data.locations.features) {
            if (place.geometry.type === 'Point' && !isDeepStrictEqual(place, previousPlaces.get(place.properties.id))) {
              reply(400, { error: 'New or edited places require a selected city polygon. Existing legacy points can only be preserved, deleted or converted.' }); return;
            }
          }
        }
        const contents = JSON.stringify(data, null, 2) + '\n';
        // Keep the previous file for recovery, including an unreadable file restored explicitly.
        if (saved.exists) {
          const backup = await open(`${file}.bak`, 'w');
          try { await backup.writeFile(saved.contents); await backup.sync(); }
          finally { await backup.close(); }
        }
        const output = await open(temp, 'wx');
        try { await output.writeFile(contents); await output.sync(); }
        finally { await output.close(); }
        await rename(temp, file);
        reply(200, { revision: hash(contents) });
      } finally {
        await unlink(temp).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
        await lock.close();
        await unlink(lockPath);
      }
    } catch {
      if (!res.writableEnded) reply(500, { error: 'Could not access the travel file on this device. Changes were not confirmed saved.' });
    }
  }
  return {
    name: 'local-travel-file',
    configureServer(server) { server.middlewares.use((req, res, next) => { void handle(req, res, next); }); },
    configurePreviewServer(server) { server.middlewares.use((req, res, next) => { void handle(req, res, next); }); },
  };
}
