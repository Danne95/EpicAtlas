import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { build } from 'esbuild';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const bundled = await build({ entryPoints: ['src/data/workspace.ts'], bundle: true, write: false, format: 'esm', platform: 'browser', define: { 'import.meta.env.BASE_URL': '"/"' } });
let sequence = 0;
await mkdir(resolve('.verification'), { recursive: true });
const scratch = await mkdtemp(resolve('.verification/client-'));
after(async () => {
  assert.ok(scratch.startsWith(resolve('.verification') + sep));
  await rm(scratch, { recursive: true, force: true });
});
async function clientScenario({ exists = false, disk, legacy = null, unreadable = false }, run) {
  const original = { fetch: globalThis.fetch, localStorage: globalThis.localStorage, window: globalThis.window };
  const requests = [];
  globalThis.window = new EventTarget();
  globalThis.localStorage = { getItem: () => legacy };
  globalThis.fetch = async (_url, options) => {
    requests.push({ method: 'GET', ...options });
    if (!options?.method) return new Response(JSON.stringify(unreadable ? { error: 'Unreadable synthetic file', revision: 'current' } : { exists, data: disk, revision: exists ? 'current' : 'missing' }), { status: unreadable ? 422 : 200 });
    return new Response(JSON.stringify({ revision: 'next' }), { status: 200 });
  };
  try {
    const file = join(scratch, `workspace-${sequence++}.mjs`);
    await writeFile(file, bundled.outputFiles[0].text);
    const client = await import(pathToFileURL(file));
    await run(client, requests);
    assert.equal(globalThis.localStorage.getItem(), legacy, 'Legacy browser data must be kept');
  } finally { Object.assign(globalThis, original); }
}

// The fixture has never belonged to a traveler; it deliberately predates Water.
const empty = { version: 1, locations: { type: 'FeatureCollection', demo: false, features: [] }, roads: { type: 'FeatureCollection', demo: false, features: [] }, rail: { type: 'FeatureCollection', demo: false, features: [] }, flights: { demo: false, flights: [] } };

test('client: valid legacy browser data migrates once and keeps its original copy', async () => {
  const old = structuredClone(empty);
  old.locations.features.push({ type: 'Feature', properties: { id: 'synthetic-old', name: 'Synthetic old place' }, geometry: { type: 'Point', coordinates: [1, 1] } });
  await clientScenario({ disk: empty, legacy: JSON.stringify(old) }, async (client, requests) => {
    const data = await client.readWorkspace();
    assert.equal(data.locations.features[0].geometry.type, 'Point');
    assert.deepEqual(data.water, client.emptyWorkspace().water);
    assert.equal(requests[1].headers['X-EpicAtlas-Write'], 'migrate');
    assert.equal(requests.length, 2);
    data.locations.features.length = 0;
    assert.equal((await client.readWorkspace()).locations.features.length, 1, 'Callers receive separate copies');
  });
});

test('client: a fresh workspace is empty and normal saves remain edits', async () => {
  await clientScenario({ disk: empty }, async (client, requests) => {
    assert.deepEqual(await client.readWorkspace(), client.emptyWorkspace());
    await client.saveWorkspace(client.emptyWorkspace());
    assert.equal(requests[2].headers['X-EpicAtlas-Write'], 'edit');
    assert.equal(requests[2].headers['If-Match'], 'next');
  });
});

test('client: existing disk data takes precedence over unreadable browser data', async () => {
  await clientScenario({ exists: true, disk: empty, legacy: '{broken-synthetic' }, async (client, requests) => {
    assert.deepEqual(await client.readWorkspace(), client.emptyWorkspace());
    assert.equal(requests.length, 1);
  });
});

test('client: unreadable legacy data is not replaced with an empty file', async () => {
  await clientScenario({ disk: empty, legacy: '{broken-synthetic' }, async (client, requests) => {
    await assert.rejects(client.readWorkspace(), /browser travel could not be read/);
    assert.equal(requests.length, 1);
  });
});

test('client: an unreadable disk file can be recovered only through explicit restore', async () => {
  await clientScenario({ exists: true, unreadable: true }, async (client, requests) => {
    await assert.rejects(client.readWorkspace(), /Unreadable/);
    assert.equal(requests.length, 1);
    await client.saveWorkspace(client.emptyWorkspace(), 'restore');
    assert.equal(requests[1].headers['X-EpicAtlas-Write'], 'restore');
    assert.equal(requests[1].headers['If-Match'], 'current');
  });
});
