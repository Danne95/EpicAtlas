import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, open, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { Plugin } from 'vite';
import { validateSuggestion } from '../src/data/groundJourney';
import { validPoint } from '../src/data/coordinates';
import { isLocalRequest } from './localAccess';

export function groundRouting(directory: string): Plugin {
  const endpoint = process.env.EPICATLAS_ROUTER_URL || 'https://brouter.de/brouter';
  const middleware = async (req: any, res: any, next: () => void) => {
    if (req.url?.split('?')[0] !== '/api/routes') return next();
    res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
    const reply = (status: number, body: object) => { if (!res.writableEnded) { res.statusCode = status; res.end(JSON.stringify(body)); } };
    if (!isLocalRequest(req)) { reply(403, { error: 'Routing is available only to the local atlas.' }); return; }
    if (req.method !== 'POST' || req.headers['content-type'] !== 'application/json') { reply(400, { error: 'Use Preview route to request a path.' }); return; }
    try {
      let body = '';
      for await (const chunk of req) { body += chunk.toString(); if (body.length > 8192) { reply(413, { error: 'Too many route stops.' }); return; } }
      let input;
      try { input = JSON.parse(body); }
      catch { reply(400, { error: 'Route preview requires valid JSON.' }); return; }
      if (!input || Object.keys(input).some(key => !['mode', 'points'].includes(key)) || !['road', 'rail'].includes(input.mode) || !Array.isArray(input.points) || input.points.length < 2 || input.points.length > 10 || !input.points.every(validPoint)) { reply(400, { error: 'Select departure, arrival and up to eight stops.' }); return; }
      const profile = input.mode === 'rail' ? 'rail' : 'car-fast';
      const key = createHash('sha256').update(JSON.stringify([endpoint, profile, input.points])).digest('hex');
      const file = join(directory, `${key}.json`);
      try { const route = validateSuggestion(JSON.parse(await readFile(file, 'utf8'))); reply(200, { route, cached: true }); return; } catch { /* Explicit preview can replace invalid cache. */ }
      await mkdir(directory, { recursive: true });
      const lockPath = join(directory, '.routing.lock');
      let lock;
      try { lock = await open(lockPath, 'wx'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; reply(429, { error: 'Another route is being prepared. Please wait and retry.' }); return; }
      try {
        const url = new URL(endpoint);
        url.search = new URLSearchParams({ lonlats: input.points.map((point: number[]) => point.join(',')).join('|'), profile, alternativeidx: '0', format: 'geojson' }).toString();
        const response = await fetch(url, { signal: AbortSignal.timeout(60000), headers: { 'User-Agent': 'EpicAtlas/0.1 (manual road and rail route preview)', Accept: 'application/json' } });
        if (!response.ok) { reply(502, { error: 'No suggested path was returned. Try nearby stations/addresses or add an intermediate stop. Imported routes remain available.' }); return; }
        const body = await response.text();
        if (body.length > 20 * 1024 * 1024) throw new Error('Route response too large');
        const result = JSON.parse(body);
        const paths = result.features?.filter((feature: any) => feature.geometry?.type === 'LineString');
        if (paths?.length !== 1) throw new Error('Expected one continuous route');
        const path = paths[0];
        const route = validateSuggestion({ geometry: { type: 'LineString', coordinates: path.geometry.coordinates.map((p: number[]) => p.slice(0, 2)) }, distanceMeters: Number(path.properties['track-length']), source: `BRouter / OpenStreetMap (${profile})` });
        await writeFile(file + '.tmp', JSON.stringify(route)); await rename(file + '.tmp', file);
        reply(200, { route, cached: false });
      } finally { await lock.close(); await unlink(lockPath); }
    } catch { reply(502, { error: 'Could not prepare a route. Check your connection or try closer stops. Nothing has been saved.' }); }
  };
  return { name: 'private-ground-routing', configureServer(server) { server.middlewares.use((req, res, next) => { void middleware(req, res, next); }); }, configurePreviewServer(server) { server.middlewares.use((req, res, next) => { void middleware(req, res, next); }); } };
}
