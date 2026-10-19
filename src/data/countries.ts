import type { FeatureCollection, Polygon, MultiPolygon, Position } from 'geojson';
import type { LocationCollection } from '../types/travel';
import { validPoint } from './coordinates';

export interface CountryProperties { id: string; name: string; names: string[]; codes: string[] }
export type CountryCollection = FeatureCollection<Polygon | MultiPolygon, CountryProperties>;

export function validateCountries(value: unknown): CountryCollection {
  const data = value as CountryCollection;
  if (data?.type !== 'FeatureCollection' || !Array.isArray(data.features) || !data.features.length) throw new Error('Invalid country shapes.');
  const ids = new Set<string>();
  for (const feature of data.features) {
    const props = feature.properties;
    if (feature.type !== 'Feature' || !props || typeof props.id !== 'string' || !props.id || ids.has(props.id) || typeof props.name !== 'string' || !props.name || !Array.isArray(props.names) || !props.names.length || !Array.isArray(props.codes) || ![...props.names, ...props.codes].every(item => typeof item === 'string' && item.length > 0)) throw new Error('Invalid country metadata.');
    ids.add(props.id);
    const geometry = feature.geometry;
    if (!geometry || !['Polygon', 'MultiPolygon'].includes(geometry.type) || !Array.isArray(geometry.coordinates)) throw new Error('Invalid country geometry.');
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    if (!polygons.length) throw new Error('Empty country geometry.');
    for (const polygon of polygons) {
      if (!Array.isArray(polygon) || !polygon.length) throw new Error('Empty country polygon.');
      for (const ring of polygon) {
        if (!Array.isArray(ring) || ring.length < 4 || !ring.every(validPoint)) throw new Error('Invalid country coordinates.');
        if (ring[0][0] !== ring.at(-1)![0] || ring[0][1] !== ring.at(-1)![1]) throw new Error('Unclosed country ring.');
      }
    }
  }
  return data;
}

const normalize = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const aliases: Record<string, string> = { uk: 'gb', greatbritain: 'gb', unitedstates: 'us', usa: 'us' };

function inRing(point: Position, ring: Position[]): boolean {
  // Unwrap rings before testing, so antimeridian islands do not cover the opposite hemisphere.
  const points: Position[] = [[ring[0][0], ring[0][1]]];
  for (let i = 1; i < ring.length; i++) {
    const previous = points[i - 1][0];
    const x = previous + (((ring[i][0] - previous + 540) % 360 + 360) % 360 - 180);
    points.push([x, ring[i][1]]);
  }
  let west = Infinity, east = -Infinity;
  for (const p of points) { west = Math.min(west, p[0]); east = Math.max(east, p[0]); }
  const middle = (west + east) / 2;
  const x = point[0] + 360 * Math.round((middle - point[0]) / 360), y = point[1];
  let inside = false;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const cross = (x - a[0]) * (b[1] - a[1]) - (y - a[1]) * (b[0] - a[0]);
    if (Math.abs(cross) < 1e-10 && x >= Math.min(a[0], b[0]) - 1e-10 && x <= Math.max(a[0], b[0]) + 1e-10 && y >= Math.min(a[1], b[1]) - 1e-10 && y <= Math.max(a[1], b[1]) + 1e-10) return true;
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

function contains(points: Position[], geometry: Polygon | MultiPolygon): boolean {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return points.every(point => polygons.some(polygon => inRing(point, polygon[0]) && !polygon.slice(1).some(hole => inRing(point, hole))));
}

/** Resolve once in memory; filtering later uses place IDs without modifying saved records. */
export function matchPlaceCountries(locations: LocationCollection, countries: CountryCollection): Map<string, string | undefined> {
  const lookup = new Map<string, Set<string>>();
  for (const country of countries.features) for (const label of [country.properties.name, ...country.properties.names, ...country.properties.codes]) {
    const key = normalize(label), ids = lookup.get(key) ?? new Set<string>();
    ids.add(country.properties.id); lookup.set(key, ids);
  }
  const result = new Map<string, string | undefined>();
  for (const place of locations.features) {
    let ids: string[];
    if (place.properties.country?.trim()) {
      const key = normalize(place.properties.country);
      ids = [...(lookup.get(aliases[key] ?? key) ?? [])];
    } else {
      const g = place.geometry;
      const rings = g.type === 'Polygon' ? [g.coordinates[0]] : g.type === 'MultiPolygon' ? g.coordinates.map(polygon => polygon[0]) : [];
      const points = g.type === 'Point' ? [g.coordinates] : rings.flatMap(ring => ring.filter((_, i) => i % Math.max(1, Math.ceil((ring.length - 1) / 8)) === 0));
      ids = countries.features.filter(country => contains(points, country.geometry)).map(country => country.properties.id);
    }
    result.set(place.properties.id, ids.length === 1 ? ids[0] : undefined);
  }
  return result;
}
