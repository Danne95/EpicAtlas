/** WGS84 longitude/latitude, with optional finite extra dimensions. */
export function validPosition(value: unknown): value is number[] {
  return Array.isArray(value) && value.length >= 2 && value.every(Number.isFinite)
    && Math.abs(value[0]) <= 180 && Math.abs(value[1]) <= 90;
}

/** City/airport/lookup geometry is strictly two-dimensional. */
export function validPoint(value: unknown): value is [number, number] {
  return validPosition(value) && value.length === 2;
}
