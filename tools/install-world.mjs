import { mkdir, readFile, writeFile, rename, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Explicit installation only; saving travel never runs this downloader.
const root = fileURLToPath(new URL('../', import.meta.url));
const destination = resolve(root, 'public/maps/world');
const countriesOnly = process.argv.includes('--countries-only');
if (process.argv.slice(2).some(argument => argument !== '--countries-only')) throw new Error('Usage: node tools/install-world.mjs [--countries-only]');
const sources = countriesOnly ? { countries: 'ne_10m_admin_0_countries' } : {
  land: 'ne_10m_land',
  coastline: 'ne_10m_coastline',
  borders: 'ne_10m_admin_0_boundary_lines_land',
  countries: 'ne_10m_admin_0_countries',
};
let previousMetadata;
try {
  previousMetadata = JSON.parse(await readFile(join(destination, 'provenance.json'), 'utf8'));
  if (!Array.isArray(previousMetadata.assets)) throw new Error('Invalid world provenance; existing metadata was kept.');
} catch (error) { if (error.code !== 'ENOENT') throw error; }
const staged = [];
let omittedBorders = new Set();
try {
  const overrides = JSON.parse(await readFile(resolve(root, 'private/maps/world-overrides.json'), 'utf8'));
  if (!Array.isArray(overrides.omittedBorderGeometryHashes) || !overrides.omittedBorderGeometryHashes.every(value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value))) throw new Error('Invalid private world overrides');
  omittedBorders = new Set(overrides.omittedBorderGeometryHashes);
} catch (error) { if (error.code !== 'ENOENT') throw error; }
for (const [name, dataset] of Object.entries(sources)) {
  const url = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/${dataset}.geojson`;
  const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`Could not download ${dataset}: ${response.status}`);
  const data = await response.json();
  if (data.type !== 'FeatureCollection' || !Array.isArray(data.features) || !data.features.length) throw new Error(`Invalid ${dataset}`);
  const types = name === 'land' || name === 'countries' ? ['Polygon', 'MultiPolygon'] : ['LineString', 'MultiLineString'];
  let positions = 0;
  function validate(coordinates) {
    if (!Array.isArray(coordinates) || !coordinates.length) throw new Error('Empty geometry');
    if (typeof coordinates[0] === 'number') {
      if (coordinates.length !== 2 || !coordinates.every(Number.isFinite) || Math.abs(coordinates[0]) > 180 || Math.abs(coordinates[1]) > 90) throw new Error('Invalid world coordinate');
      positions++;
    } else coordinates.forEach(validate);
  }
  const features = data.features.filter(feature => name !== 'borders' || !omittedBorders.has(createHash('sha256').update(JSON.stringify(feature.geometry)).digest('hex'))).map((feature, index) => {
    if (!types.includes(feature.geometry?.type)) throw new Error(`Unexpected ${dataset} geometry`);
    validate(feature.geometry.coordinates);
    // Retain boundary classifications for future styling, but omit bulky labels.
    let properties = name === 'borders' ? { featurecla: feature.properties.featurecla } : {};
    if (name === 'countries') {
      const names = [...new Set(['ADMIN', 'NAME', 'NAME_LONG', 'FORMAL_EN', 'NAME_EN', 'BRK_NAME'].map(key => feature.properties[key]).filter(value => typeof value === 'string' && value.trim()))];
      const codes = [...new Set(['ISO_A2', 'ISO_A2_EH', 'ISO_A3', 'ISO_A3_EH', 'ADM0_A3'].map(key => feature.properties[key]).filter(value => typeof value === 'string' && value !== '-99' && value.trim()))];
      if (!names.length) throw new Error('Country is missing its name.');
      const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
      for (const polygon of polygons) for (const ring of polygon) if (ring.length < 4 || ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1]) throw new Error('Unclosed country polygon.');
      properties = { id: `${feature.properties.ADM0_A3 || codes[0] || 'country'}-${index}`, name: names[0], names, codes };
    }
    return { type: 'Feature', properties, geometry: feature.geometry };
  });
  const bytes = JSON.stringify({ type: 'FeatureCollection', features });
  staged.push({ name, bytes, url, sha256: createHash('sha256').update(bytes).digest('hex'), features: features.length, positions });
}
// Validate every download before replacing any installed file.
await mkdir(destination, { recursive: true });
const backup = resolve(root, 'private/maps/world-backups', new Date().toISOString().replace(/[:.]/g, '-'));
await mkdir(backup, { recursive: true });
try { await copyFile(join(destination, 'provenance.json'), join(backup, 'provenance.json')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
for (const item of staged) {
  const target = join(destination, `${item.name}.geojson`);
  try { await copyFile(target, join(backup, `${item.name}.geojson`)); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  await writeFile(target + '.tmp', item.bytes);
  await rename(target + '.tmp', target);
  console.log(`${item.name}: ${item.features} features, ${item.positions} coordinates, ${item.bytes.length} bytes`);
}
const installedAt = new Date().toISOString();
const replacements = staged.map(({ bytes, ...item }) => ({ ...item, installedAt }));
const metadata = { ...previousMetadata, installedAt, source: 'Natural Earth 1:10m', license: 'Public domain', assets: [...(previousMetadata?.assets ?? []).filter(item => !staged.some(replacement => replacement.name === item.name)), ...replacements] };
await writeFile(join(destination, 'provenance.json.tmp'), JSON.stringify(metadata, null, 2));
await rename(join(destination, 'provenance.json.tmp'), join(destination, 'provenance.json'));
