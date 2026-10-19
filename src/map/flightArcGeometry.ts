import type { FlightRecord as Flight } from '../types/travel';
import { greatCircle } from './greatCircle';

export type Vector3 = [number, number, number];
export interface ArcPoint { position: Vector3; progress: number }

/** Unit-sphere coordinates matching MapLibre's globe, with a stylized radial lift. */
export function flightArcPoints(flight: Flight): ArcPoint[] {
  const positions = greatCircle(flight.from.coordinates, flight.to.coordinates).coordinates.flat().map(([lon, lat]): Vector3 => {
    const longitude = lon * Math.PI / 180, latitude = lat * Math.PI / 180;
    return [Math.sin(longitude) * Math.cos(latitude), Math.sin(latitude), Math.cos(longitude) * Math.cos(latitude)];
  });
  const distances = [0];
  for (let i = 1; i < positions.length; i++) {
    const dot = positions[i].reduce((sum, value, axis) => sum + value * positions[i - 1][axis], 0);
    distances.push(distances[i - 1] + Math.acos(Math.max(-1, Math.min(1, dot))));
  }
  const distance = distances.at(-1)!;
  const peak = Math.min(0.24, distance * 0.12);
  return positions.map((position, i) => {
    const progress = distance > 1e-7 ? distances[i] / distance : i / (positions.length - 1);
    const lift = i === 0 || i === positions.length - 1 ? 0 : peak * Math.pow(Math.sin(Math.PI * progress), 1.3);
    return { position: position.map(value => value * (1 + lift)) as Vector3, progress };
  });
}

/** True when the sightline reaches the point before intersecting the opaque globe. */
export function arcPointVisible(point: Vector3, camera: Vector3): boolean {
  const ray = point.map((value, axis) => value - camera[axis]);
  const distance = Math.hypot(...ray);
  const direction = ray.map(value => value / distance);
  const b = camera.reduce((sum, value, axis) => sum + value * direction[axis], 0);
  const c = camera.reduce((sum, value) => sum + value * value, -1);
  const discriminant = b * b - c;
  const hit = discriminant >= 0 ? -b - Math.sqrt(discriminant) : -1;
  return hit <= 0 || hit >= distance - 1e-4;
}
