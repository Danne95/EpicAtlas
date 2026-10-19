import type { Polygon, MultiPolygon, Position } from 'geojson';
import { validPoint } from './coordinates';

export interface CityResult {
  name: string;
  country: string;
  label: string;
  osmId: string;
  geometry: Polygon | MultiPolygon;
}

export function validateBoundary(value: unknown): Polygon | MultiPolygon {
  const geometry = value as Polygon | MultiPolygon;
  if (!geometry || !['Polygon', 'MultiPolygon'].includes(geometry.type) || !Array.isArray(geometry.coordinates)) throw new Error('A city needs a complete polygon boundary.');
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  if (!polygons.length) throw new Error('The city boundary is empty.');
  let count = 0;
  for (const polygon of polygons) {
    if (!Array.isArray(polygon) || !polygon.length) throw new Error('The city boundary is empty.');
    for (const ring of polygon) {
      if (!Array.isArray(ring) || ring.length < 4) throw new Error('Invalid city boundary ring.');
      for (const p of ring) {
        if (!validPoint(p)) throw new Error('Invalid city boundary coordinates.');
        if (++count > 250000) throw new Error('City boundary is too large.');
      }
      if (ring[0][0] !== ring.at(-1)![0] || ring[0][1] !== ring.at(-1)![1]) throw new Error('City boundary rings must be closed.');
      const area = ring.slice(1).reduce((sum, p, i) => sum + ring[i][0] * p[1] - p[0] * ring[i][1], 0);
      if (Math.abs(area) < 1e-12) throw new Error('City boundary ring has no area.');
    }
  }
  return geometry;
}

export function boundaryBounds(geometry: Polygon | MultiPolygon): [[number, number], [number, number]] {
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  for (const polygon of polygons) for (const ring of polygon) for (const p of ring as Position[]) {
    west = Math.min(west, p[0]); south = Math.min(south, p[1]); east = Math.max(east, p[0]); north = Math.max(north, p[1]);
  }
  return [[west, south], [east, north]];
}
