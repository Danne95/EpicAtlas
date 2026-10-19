import { greatCircle } from '../map/greatCircle';
import { validateSuggestion, type RouteSuggestion } from './groundJourney';
import { validPoint } from './coordinates';

/** Approximate connections only: no shipping network or land avoidance. */
export function waterConnection(stops: [number, number][]): RouteSuggestion {
  if (stops.length < 2 || stops.length > 10 || !stops.every(validPoint)) throw new Error('Select departure, arrival and up to eight stops.');
  const coordinates: number[][] = [];
  let distanceMeters = 0;
  for (let i = 1; i < stops.length; i++) {
    const from = stops[i - 1], to = stops[i];
    const radians = Math.PI / 180;
    const h = Math.sin((to[1] - from[1]) * radians / 2) ** 2 + Math.cos(from[1] * radians) * Math.cos(to[1] * radians) * Math.sin((to[0] - from[0]) * radians / 2) ** 2;
    distanceMeters += 6371000 * 2 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, h))));
    const lines = greatCircle(from, to).coordinates;
    if (lines.length !== 1) throw new Error('This connection crosses the date line. Import a split route for this journey.');
    coordinates.push(...(i === 1 ? lines[0] : lines[0].slice(1)));
  }
  return validateSuggestion({ geometry: { type: 'LineString', coordinates }, distanceMeters, source: 'Approximate port connections (calculated locally)' });
}
