import type { LineString } from 'geojson';
import { validPoint } from './coordinates';

export interface RoutePlace { name: string; label: string; coordinates: [number, number]; }
export interface RouteSuggestion { geometry: LineString; distanceMeters: number; source: string; }
export function validateSuggestion(value: unknown): RouteSuggestion {
  const route = value as RouteSuggestion;
  const points = route?.geometry?.coordinates;
  if (route?.geometry?.type !== 'LineString' || !Array.isArray(points) || points.length < 2 || points.length > 100000 || !points.every(validPoint) || !points.some(p => p[0] !== points[0][0] || p[1] !== points[0][1]) || !Number.isFinite(route.distanceMeters) || route.distanceMeters <= 0 || typeof route.source !== 'string') throw new Error('The routing service returned an invalid path. Nothing has been saved.');
  if (points.slice(1).some((p, i) => Math.abs(p[0] - points[i][0]) > 180)) throw new Error('This path crosses the date line. Use a split route import for this journey.');
  return route;
}
