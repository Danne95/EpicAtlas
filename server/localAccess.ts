import type { IncomingMessage } from 'node:http';

// Localhost is the trust boundary; there are no remote accounts or sessions.
export function isLocalRequest(req: IncomingMessage): boolean {
  const host = req.headers.host || '';
  return /^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(host)
    && (!req.headers.origin || req.headers.origin === `http://${host}`)
    && req.headers['sec-fetch-site'] !== 'cross-site';
}
