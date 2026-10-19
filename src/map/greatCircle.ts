import type { MultiLineString } from 'geojson';

type Coordinate = [number, number];

/** Geographic great-circle interpolation, split at the antimeridian for 2D rendering. */
export function greatCircle(from: Coordinate, to: Coordinate): MultiLineString {
  const radians = Math.PI / 180;
  const vector = ([lon, lat]: Coordinate) => [Math.cos(lat * radians) * Math.cos(lon * radians), Math.cos(lat * radians) * Math.sin(lon * radians), Math.sin(lat * radians)];
  const a = vector(from), b = vector(to);
  const angle = Math.acos(Math.max(-1, Math.min(1, a.reduce((sum, value, i) => sum + value * b[i], 0))));
  if (angle < 1e-8) return { type: 'MultiLineString', coordinates: [[from, to]] };
  if (Math.PI - angle < 1e-7) throw new Error('An exactly antipodal flight needs an intermediate waypoint to choose its path.');
  const lines: Coordinate[][] = [[from]];
  for (let i = 1; i <= 128; i++) {
    const t = i / 128;
    const first = Math.sin((1 - t) * angle) / Math.sin(angle);
    const second = Math.sin(t * angle) / Math.sin(angle);
    const p = a.map((value, j) => value * first + b[j] * second);
    const next: Coordinate = i === 128 ? to : [Math.atan2(p[1], p[0]) / radians, Math.atan2(p[2], Math.hypot(p[0], p[1])) / radians];
    const current = lines[lines.length - 1];
    const previous = current[current.length - 1];
    if (Math.abs(next[0] - previous[0]) > 180) {
      const boundary = previous[0] >= 0 ? 180 : -180;
      const unwrapped = next[0] + (boundary === 180 ? 360 : -360);
      const fraction = (boundary - previous[0]) / (unwrapped - previous[0]);
      const latitude = previous[1] + fraction * (next[1] - previous[1]);
      current.push([boundary, latitude]);
      lines.push([[-boundary, latitude], next]);
    } else current.push(next);
  }
  return { type: 'MultiLineString', coordinates: lines };
}
