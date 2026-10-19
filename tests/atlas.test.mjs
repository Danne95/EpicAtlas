import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer as httpServer, request as httpRequest } from 'node:http';
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build as bundle } from 'esbuild';
import { createServer, preview } from 'vite';

// All records and lookup responses below are synthetic. No installed user
// workspace, maps, browser history or external provider is used by these checks.
await mkdir(resolve('.verification'), { recursive: true });
const scratch = await mkdtemp(resolve('.verification/automated-'));
const runtime = join(scratch, 'runtime.mjs');
await bundle({ stdin: { contents: `
  export { createAtlasConfig } from './vite.config';
  export { emptyWorkspace, validateWorkspace } from './src/data/workspaceSchema';
  export { matchesDate, datePeriod } from './src/data/dates';
  export { chronologyFrames } from './src/data/chronology';
  export { waterConnection } from './src/data/waterJourney';
  export { validPoint, validPosition } from './src/data/coordinates';
`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', packages: 'external', outfile: runtime });
const { createAtlasConfig, emptyWorkspace, validateWorkspace, matchesDate, datePeriod, chronologyFrames, waterConnection, validPoint, validPosition } = await import(pathToFileURL(runtime));
after(async () => {
  assert.ok(scratch.startsWith(resolve('.verification') + sep));
  await rm(scratch, { recursive: true, force: true });
});

const city = { type: 'Feature', properties: { id: 'synthetic-city', name: 'Synthetic city', country: 'Synthetic country', visitedDate: '2001' }, geometry: { type: 'Polygon', coordinates: [[[1, 1], [2, 1], [2, 2], [1, 1]]] } };
const legacy = { type: 'Feature', properties: { id: 'synthetic-legacy', name: 'Synthetic old place' }, geometry: { type: 'Point', coordinates: [3, 3] } };
const marker = 'SYNTHETIC-PRIVATE-AUDIT-CANARY';
const write = async (root, path, value) => {
  const file = join(root, path);
  await mkdir(join(file, '..'), { recursive: true });
  await writeFile(file, value);
};
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'epicatlas-check-'));
  for (const name of ['private/sentinel.json', 'public/travel/old.json', 'tools/regions/recipe.json', '.verification/sentinel.json', 'public/maps/regions/test-provenance.json', 'public/maps/world/provenance.json']) await write(root, name, marker);
  await write(root, 'public/maps/world/land.geojson', JSON.stringify({ type: 'FeatureCollection', features: [] }));
  await write(root, 'private/maps/airports/catalogue.json', JSON.stringify({ airports: { AAA: [{ code: 'AAA', name: 'Synthetic A', coordinates: [1, 1] }] } }));
  await write(root, 'index.html', '<p>Synthetic test atlas</p>');
  await write(root, 'dist/index.html', '<p>Synthetic built atlas</p>');
  return root;
}
async function stop(server) {
  if (server.close) await server.close();
  else await new Promise((done, reject) => server.httpServer.close(error => error ? reject(error) : done()));
}
async function removeFixture(root) {
  assert.ok(root.startsWith(join(tmpdir(), 'epicatlas-check-')));
  await rm(root, { recursive: true, force: true });
}
async function serve(root, kind = 'dev') {
  const config = createAtlasConfig(root);
  config.configFile = false;
  config.logLevel = 'silent';
  // Port 0 is replaced by Vite's default; select an unused port first.
  const listener = httpServer();
  await new Promise(done => listener.listen(0, '127.0.0.1', done));
  const port = listener.address().port;
  await new Promise(done => listener.close(done));
  if (kind === 'preview') return preview({ ...config, preview: { ...config.preview, port, strictPort: true } });
  const server = await createServer({ ...config, server: { ...config.server, port, strictPort: true } });
  await server.listen();
  return server;
}
function address(server) { return `http://127.0.0.1:${server.httpServer.address().port}`; }
function statusWithHeaders(url, headers) {
  // Native fetch may normalize Host and browser-controlled metadata headers.
  return new Promise((done, reject) => {
    const request = httpRequest(url, { headers }, response => { response.resume(); done(response.statusCode); });
    request.on('error', reject); request.end();
  });
}

for (const kind of ['dev', 'preview']) {
  test(`${kind}: private files, downloaded sidecars and alternate file URLs are inaccessible`, async () => {
    const root = await fixture();
    let server;
    try {
      server = await serve(root, kind);
      const url = address(server);
      const paths = [
        '/private/sentinel.json', '/PRIVATE/sentinel.json', '/private/sentinel.json?raw',
        '/public/travel/old.json', '/tools/regions/recipe.json', '/.verification/sentinel.json',
        '/public/maps/regions/test-provenance.json', '/public/maps/regions/test-provenance.json?raw&import',
        '/public/maps/world/provenance.json', '/public%2fmaps/world/provenance.json',
        `/@fs/${join(root, 'private/sentinel.json').replaceAll('\\', '/')}`,
        `/@fs/${join(root, 'public/maps/world/provenance.json').replaceAll('\\', '/')}`,
        '/maps/regions/test-provenance.json', '/maps/regions/manifest.json', '/maps/world/provenance.json',
      ];
      for (const path of paths) {
        const response = await fetch(url + path);
        assert.equal((await response.text()).includes(marker), false, path);
      }
      assert.equal((await fetch(url + '/maps/regions/test-provenance.json')).status, 404);
      const range = await fetch(url + '/maps/world/land.geojson', { headers: { Range: 'bytes=0-15' } });
      assert.equal(range.status, 206);
      assert.equal((await range.arrayBuffer()).byteLength, 16);
      assert.equal((await fetch(url + '/maps/world/land.geojson', { headers: { Range: 'bytes=999999-' } })).status, 416);
      assert.equal((await fetch(url + '/maps/world/land.geojson', { method: 'HEAD' })).status, 200);
      assert.equal((await fetch(url + '/maps/world/land.geojson', { headers: { Origin: 'https://unrelated.example' } })).status, 403);
      for (const endpoint of ['/api/travel', '/api/cities', '/api/places', '/api/routes', '/api/airports?code=AAA']) {
        for (const headers of [{ Origin: 'https://unrelated.example' }, { 'Sec-Fetch-Site': 'cross-site' }, { Host: 'attacker.example:1234' }]) {
          assert.equal(await statusWithHeaders(url + endpoint, headers), 403, `${endpoint}: ${JSON.stringify(headers)}`);
        }
      }
      assert.equal((await fetch(url + '/api/travel', { headers: { Origin: url } })).status, 200);
    } finally { if (server) await stop(server); await removeFixture(root); }
  });
}

test('storage: polygon edits, preserved legacy points, explicit recovery, conflicts and backups', async () => {
  const root = await fixture();
  let server;
  try {
    server = await serve(root);
    let url = address(server) + '/api/travel';
    const get = async () => (await fetch(url)).json();
    const put = (data, revision, purpose = 'edit') => fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-Match': revision, 'X-EpicAtlas-Write': purpose }, body: JSON.stringify(data) });
    const file = join(root, 'private/travel/workspace.json');
    assert.equal((await get()).exists, false);
    const data = emptyWorkspace(); data.locations.features.push(structuredClone(legacy));
    assert.equal((await put(data, 'missing')).status, 400);
    assert.equal((await get()).exists, false);
    // Migration remains backward compatible with workspaces predating Water.
    delete data.water;
    assert.equal((await put(data, 'missing', 'migrate')).status, 200);
    data.water = emptyWorkspace().water;
    let saved = await get();
    assert.deepEqual(saved.data, data);
    assert.equal((await put(data, saved.revision, 'migrate')).status, 409);
    const editedPoint = structuredClone(data); editedPoint.locations.features[0].properties.name = 'Changed legacy place';
    assert.equal((await put(editedPoint, saved.revision)).status, 400);
    data.locations.features.push(structuredClone(city));
    data.water.features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: [[1, 1], [2, 2]] }, properties: { id: 'synthetic-water', mode: 'water', date: '2002' } });
    assert.equal((await put(data, saved.revision)).status, 200);
    assert.deepEqual(JSON.parse(await readFile(file + '.bak', 'utf8')).locations.features, [legacy]);
    assert.equal((await put(emptyWorkspace(), saved.revision)).status, 409);
    saved = await get();
    assert.equal((await put({ version: 99 }, saved.revision)).status, 400);
    await writeFile(file + '.lock', '');
    assert.equal((await put(data, saved.revision)).status, 409);
    await rm(file + '.lock');
    await stop(server); server = await serve(root, 'preview'); url = address(server) + '/api/travel';
    assert.deepEqual((await get()).data, data);
    await writeFile(file, '{broken-synthetic');
    const brokenResponse = await fetch(url); assert.equal(brokenResponse.status, 422);
    const broken = await brokenResponse.json();
    assert.equal((await put(emptyWorkspace(), broken.revision)).status, 422);
    assert.equal(await readFile(file, 'utf8'), '{broken-synthetic');
    assert.equal((await put(data, broken.revision, 'restore')).status, 200);
    assert.equal(await readFile(file + '.bak', 'utf8'), '{broken-synthetic');
    assert.deepEqual((await get()).data, data);
  } finally { if (server) await stop(server); await removeFixture(root); }
});

test('explicit lookups: minimal provider payloads, private caches and local airport resolution', async () => {
  const calls = [];
  const provider = httpServer((req, res) => {
    const url = new URL(req.url, 'http://localhost'); calls.push(url);
    res.setHeader('Content-Type', 'application/json');
    if (url.pathname === '/route') res.end(JSON.stringify({ features: [{ geometry: { type: 'LineString', coordinates: [[1, 1, 7], [2, 2, 8]] }, properties: { 'track-length': 100 } }] }));
    else res.end(JSON.stringify([{ name: 'Synthetic place', display_name: 'Synthetic place, Synthetic country', address: { country: 'Synthetic country' }, type: 'city', osm_type: 'relation', osm_id: 1, lon: '1', lat: '1', geojson: city.geometry }]));
  });
  await new Promise(done => provider.listen(0, '127.0.0.1', done));
  const providerURL = `http://127.0.0.1:${provider.address().port}`;
  const previousGeocoder = process.env.EPICATLAS_GEOCODER_URL, previousRouter = process.env.EPICATLAS_ROUTER_URL;
  process.env.EPICATLAS_GEOCODER_URL = providerURL + '/search'; process.env.EPICATLAS_ROUTER_URL = providerURL + '/route';
  const root = await fixture();
  let server;
  try {
    server = await serve(root);
    const url = address(server);
    const post = (path, data) => fetch(url + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    assert.equal(calls.length, 0);
    assert.equal((await post('/api/cities', null)).status, 400);
    for (const path of ['/api/cities', '/api/places', '/api/routes']) {
      assert.equal((await fetch(url + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken-synthetic' })).status, 400);
    }
    assert.equal((await post('/api/cities', { city: 'Synthetic place', country: 'Synthetic country', date: '2001' })).status, 400);
    const request = { city: 'Synthetic place', country: 'Synthetic country' };
    const first = await (await post('/api/cities', request)).json(); assert.equal(first.cached, false);
    assert.equal((await (await post('/api/cities', request)).json()).cached, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].searchParams.has('date'), false);
    assert.equal(calls[0].searchParams.get('city'), request.city);
    const route = { mode: 'road', points: [[1, 1], [2, 2]] };
    const result = await (await post('/api/routes', route)).json(); assert.equal(result.cached, false);
    assert.deepEqual(result.route.geometry.coordinates, route.points);
    assert.equal((await (await post('/api/routes', route)).json()).cached, true);
    assert.equal(calls.length, 2);
    assert.deepEqual([...calls[1].searchParams.keys()].sort(), ['alternativeidx', 'format', 'lonlats', 'profile']);
    assert.equal((await post('/api/routes', { ...route, date: '2001' })).status, 400);
    assert.equal((await fetch(url + '/api/airports?code=AAA')).status, 200);
    assert.equal((await fetch(url + '/api/airports?code=ZZZ')).status, 404);
    assert.equal(calls.length, 2);
    assert.ok((await readdir(join(root, 'private/maps/cities'))).some(name => /^[a-f0-9]{64}\.json$/.test(name)));
    assert.ok((await readdir(join(root, 'private/maps/routes'))).some(name => /^[a-f0-9]{64}\.json$/.test(name)));
  } finally {
    if (server) await stop(server);
    await new Promise(done => provider.close(done));
    if (previousGeocoder === undefined) delete process.env.EPICATLAS_GEOCODER_URL; else process.env.EPICATLAS_GEOCODER_URL = previousGeocoder;
    if (previousRouter === undefined) delete process.env.EPICATLAS_ROUTER_URL; else process.env.EPICATLAS_ROUTER_URL = previousRouter;
    await removeFixture(root);
  }
});

test('shared contracts: validation, partial dates, chronology and approximate water geometry', () => {
  for (const value of [[], [1], ['1', 2], [181, 0], [0, 91], [0, Infinity], [0, 0, NaN]]) {
    assert.equal(validPosition(value), false);
    assert.equal(validPoint(value), false);
  }
  assert.equal(validPosition([1, 2, 3]), true, 'Legacy line extra dimensions remain supported');
  assert.equal(validPoint([1, 2, 3]), false, 'City/airport/lookup points remain 2D');
  assert.equal(validPoint([-180, -90]), true);
  const data = emptyWorkspace(); data.locations.features.push(structuredClone(city));
  assert.deepEqual(validateWorkspace(data), data);
  data.locations.features.push(structuredClone(city)); assert.throws(() => validateWorkspace(data), /unique/);
  assert.equal(datePeriod('2023-02-29'), undefined);
  assert.equal(matchesDate('2001-02', { start: '2001-02-15', end: '2001-02-15', includeUndated: false }), true);
  assert.equal(matchesDate(undefined, { includeUndated: false }), false);
  assert.deepEqual(chronologyFrames(['2001', '2003-02'], { includeUndated: false }), ['2001-01-01', '2003-02-01', '2003-02-28']);
  const water = waterConnection([[1, 1], [2, 2]]); assert.ok(water.distanceMeters > 0);
  assert.throws(() => waterConnection([[179, 1], [-179, 2]]), /date line/);
});
