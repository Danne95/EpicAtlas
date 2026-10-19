import type { FeatureCollection } from 'geojson';

export async function loadGeography(file: string): Promise<FeatureCollection> {
  const response = await fetch(`${import.meta.env.BASE_URL}maps/world/${file}`);
  if (!response.ok) throw new Error(`Could not load local map file: ${file}`);
  const data: unknown = await response.json();
  if (!data || typeof data !== 'object' || !('type' in data) || data.type !== 'FeatureCollection' || !('features' in data) || !Array.isArray(data.features)) {
    throw new Error(`Invalid geographic data in ${file}`);
  }
  return data as FeatureCollection;
}

