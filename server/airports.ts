import { readFile } from 'node:fs/promises';
import type { Plugin } from 'vite';
import type { FlightAirport } from '../src/types/travel';
import { isLocalRequest } from './localAccess';

export function airportLookup(file: string): Plugin {
  let catalogue: Record<string, FlightAirport[]> | undefined;
  const middleware = async (req: any, res: any, next: () => void) => {
    const url = new URL(req.url || '/', 'http://localhost');
    if (url.pathname !== '/api/airports') return next();
    res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
    const reply = (status: number, body: object) => { res.statusCode = status; res.end(JSON.stringify(body)); };
    if (!isLocalRequest(req)) { reply(403, { error: 'Airport lookup is available only to the local atlas.' }); return; }
    const code = (url.searchParams.get('code') || '').trim().toUpperCase();
    if (req.method !== 'GET' || !/^[A-Z]{3}$/.test(code)) { reply(400, { error: 'Enter a three-letter IATA airport code.' }); return; }
    try {
      catalogue ??= JSON.parse(await readFile(file, 'utf8')).airports;
      const results = catalogue?.[code];
      if (!Array.isArray(results) || !results.length) { reply(404, { error: `Airport code ${code} was not found. Check the three-letter IATA code.` }); return; }
      if (results.length !== 1) { reply(409, { error: `Airport code ${code} matches more than one airport in the catalogue. Please check the code before saving.` }); return; }
      reply(200, { airport: results[0] });
    } catch { reply(503, { error: 'The local airport catalogue is unavailable. Install it with tools/install-airports.py and try again.' }); }
  };
  return { name: 'local-airport-lookup', configureServer(server) { server.middlewares.use((req, res, next) => { void middleware(req, res, next); }); }, configurePreviewServer(server) { server.middlewares.use((req, res, next) => { void middleware(req, res, next); }); } };
}
