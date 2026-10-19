import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, open, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { Plugin } from 'vite';
import { validateBoundary, type CityResult } from '../src/data/cityBoundary';
import type { RoutePlace } from '../src/data/groundJourney';
import { validPoint } from '../src/data/coordinates';
import { isLocalRequest } from './localAccess';

export function citySearch(directory: string): Plugin {
  let searching = false, nextSearch = 0;
  const endpoint = process.env.EPICATLAS_GEOCODER_URL || 'https://nominatim.openstreetmap.org/search';
  const middleware = async (req: any, res: any, next: () => void) => {
    const pathname = req.url?.split('?')[0];
    const placeSearch = pathname === '/api/places';
    if (pathname !== '/api/cities' && !placeSearch) return next();
    res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
    const reply = (status: number, body: object) => { if (res.writableEnded) return; res.statusCode = status; res.end(JSON.stringify(body)); };
    if (!isLocalRequest(req)) { reply(403, { error: 'City search is available only to the local atlas.' }); return; }
    if (req.method !== 'POST' || req.headers['content-type'] !== 'application/json') { reply(400, { error: 'Use an explicit city search.' }); return; }
    try {
      let body = '';
      for await (const chunk of req) { body += chunk.toString(); if (body.length > 4096) { reply(413, { error: 'City search is too long.' }); return; } }
      let input;
      try { input = JSON.parse(body); }
      catch { reply(400, { error: 'City search requires valid JSON.' }); return; }
      const validInput = input && typeof input === 'object' && !Array.isArray(input) && (placeSearch
        ? Object.keys(input).every(key => key === 'query') && typeof input.query === 'string' && input.query.trim() && input.query.length <= 200
        : Object.keys(input).every(key => ['city', 'country'].includes(key)) && typeof input.city === 'string' && typeof input.country === 'string' && input.city.trim() && input.city.length <= 120 && input.country.length <= 120);
      if (!validInput) { reply(400, { error: 'Enter a city, station or address for the stop.' }); return; }
      const city = placeSearch ? input.query.trim() : input.city.trim(), country = placeSearch ? '' : input.country.trim();
      const qualifiedCity = !placeSearch && (city.includes(',') || /\b(community|municipal|municipality)\b/i.test(city));
      const key = createHash('sha256').update(JSON.stringify(placeSearch ? [endpoint, 'place', city.toLowerCase()] : qualifiedCity ? [endpoint, 'qualified-city', city.toLowerCase(), country.toLowerCase()] : [endpoint, city.toLowerCase(), country.toLowerCase()])).digest('hex');
      const file = join(directory, `${key}.json`);
      try {
        const results: any[] = JSON.parse(await readFile(file, 'utf8'));
        if (!Array.isArray(results)) throw new Error();
        for (const result of results) { if (placeSearch) { if (!validPoint(result.coordinates) || typeof result.label !== 'string' || typeof result.name !== 'string') throw new Error(); } else validateBoundary(result.geometry); }
        reply(200, { results, cached: true }); return;
      } catch { /* Missing/invalid cache can be replaced by an explicit lookup. */ }
      if (searching || Date.now() < nextSearch) { reply(429, { error: 'Please wait a moment before searching again.' }); return; }
      searching = true; nextSearch = Date.now() + 1100;
      try {
        await mkdir(directory, { recursive: true });
        const lockPath = join(directory, '.search.lock');
        let lock;
        try { lock = await open(lockPath, 'wx'); }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
          reply(429, { error: 'Another city lookup is in progress. Please wait a moment.' }); return;
        }
        const ratePath = join(directory, '.search-rate.json');
        try {
          let allowedAt = 0;
          try { allowedAt = JSON.parse(await readFile(ratePath, 'utf8')).next || 0; } catch { /* First lookup. */ }
          if (Date.now() < allowedAt) { reply(429, { error: 'Please wait a moment before searching again.' }); return; }
          await writeFile(ratePath, JSON.stringify({ next: Date.now() + 1100 }));
          const url = new URL(endpoint);
          url.search = new URLSearchParams({ ...(placeSearch ? { q: city } : { ...(qualifiedCity ? { q: [city, country].filter(Boolean).join(', ') } : { city, ...(country ? { country } : {}) }), polygon_geojson: '1', polygon_threshold: '0.0001' }), format: 'jsonv2', addressdetails: '1', limit: '5', 'accept-language': 'en' }).toString();
          const response = await fetch(url, { headers: { 'User-Agent': 'EpicAtlas/0.1 (local personal travel atlas; manual city-boundary lookup)', Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
          if (!response.ok) { reply(502, { error: 'City lookup is unavailable. Try again later; saved outlines still work offline.' }); return; }
          const data = await response.json();
          if (!Array.isArray(data)) throw new Error('Invalid lookup response.');
          const results: (CityResult | RoutePlace)[] = [];
          for (const item of data) {
            try {
              if (placeSearch) {
                const coordinates: [number, number] = [Number(item.lon), Number(item.lat)];
                if (!validPoint(coordinates) || !item.display_name) continue;
                results.push({ name: String(item.name || item.display_name.split(',')[0]), label: String(item.display_name), coordinates });
                continue;
              }
              const geometry = validateBoundary(item.geojson);
              if (!['city', 'town', 'village', 'municipality', 'administrative'].includes(item.type) && item.class !== 'boundary' && item.category !== 'boundary') continue;
              if (!['node', 'way', 'relation'].includes(item.osm_type) || !Number.isSafeInteger(item.osm_id)) continue;
              const label = String(item.display_name || '');
              if (!label) continue;
              results.push({ name: String(item.name || item.address?.city || item.address?.town || label.split(',')[0]), country: String(item.address?.country || country), label, osmId: `${item.osm_type}/${item.osm_id}`, geometry });
            } catch { /* A point-only result cannot fulfill a city outline. */ }
          }
          const temporary = file + '.tmp';
          await writeFile(temporary, JSON.stringify(results)); await rename(temporary, file);
          reply(200, { results, cached: false });
        } finally {
          try { await writeFile(ratePath, JSON.stringify({ next: Date.now() + 1100 })); }
          finally { await lock.close(); await unlink(lockPath); }
        }
      } finally { searching = false; nextSearch = Date.now() + 1100; }
    } catch { reply(502, { error: 'Could not find city boundaries. Check your connection and try again.' }); }
  };
  return {
    name: 'private-city-search',
    configureServer(server) { server.middlewares.use((req, res, next) => { void middleware(req, res, next); }); },
    configurePreviewServer(server) { server.middlewares.use((req, res, next) => { void middleware(req, res, next); }); },
  };
}
