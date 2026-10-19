import { createReadStream, realpathSync, statSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { isLocalRequest } from './localAccess';

// Only runtime geography is served. Provenance and regional sidecars can
// contain private paths/references and are never served.
export function localMaps(): Plugin {
  let directory: string;
  function serve(req: IncomingMessage, res: ServerResponse, next: () => void): void {
    const pathname = req.url?.split('?')[0] || '';
    if (!pathname.startsWith('/maps/')) return next();
    res.setHeader('Cache-Control', 'no-store');
    if (!isLocalRequest(req)) { res.statusCode = 403; res.end(); return; }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.statusCode = 405; res.end(); return; }
    if (!/^\/maps\/world\/(land|borders|coastline|countries)\.geojson$/.test(pathname)) {
      res.statusCode = 404; res.end(); return;
    }
    let file: string, size: number;
    try {
      file = realpathSync(resolve(directory, pathname.slice('/maps/'.length)));
      if (!file.startsWith(realpathSync(directory) + sep)) { res.statusCode = 404; res.end(); return; }
      const info = statSync(file);
      if (!info.isFile()) { res.statusCode = 404; res.end(); return; }
      size = info.size;
    } catch { res.statusCode = 404; res.end(); return; }
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Accept-Ranges', 'bytes');
    let start = 0, end = size - 1;
    if (req.headers.range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      if (match && (match[1] || match[2])) {
        start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
        end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
      }
      if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size || (!match[1] && Number(match[2]) === 0)) {
        res.statusCode = 416; res.setHeader('Content-Range', `bytes */${size}`); res.end(); return;
      }
      res.statusCode = 206; res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
    }
    res.setHeader('Content-Length', Math.max(0, end - start + 1));
    if (req.method === 'HEAD' || size === 0) { res.end(); return; }
    const stream = createReadStream(file, { start, end });
    stream.on('error', () => res.destroy());
    res.on('close', () => stream.destroy());
    stream.pipe(res);
  }
  return {
    name: 'local-private-maps',
    configResolved(config) { directory = resolve(config.root, 'public/maps'); },
    configureServer(server) { server.middlewares.use(serve); },
    configurePreviewServer(server) { server.middlewares.use(serve); },
  };
}
