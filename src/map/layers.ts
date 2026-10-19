import type { StyleSpecification } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';

// Travel layers are added above this independent world basemap.
export function worldStyle(land: FeatureCollection, borders: FeatureCollection, coastline: FeatureCollection): StyleSpecification {
  return {
    version: 8,
    sky: {
      'sky-color': '#000000',
      'horizon-color': '#000000',
      'sky-horizon-blend': 0.2,
      'atmosphere-blend': 0,
    },
    sources: {
      'world-land': { type: 'geojson', data: land, tolerance: 0.1, maxzoom: 12 },
      'world-borders': { type: 'geojson', data: borders, tolerance: 0.1, maxzoom: 12 },
      'world-coastline': { type: 'geojson', data: coastline, tolerance: 0.1, maxzoom: 12 },
    },
    layers: [
      { id: 'ocean', type: 'background', paint: { 'background-color': '#050a10' } },
      { id: 'land', type: 'fill', source: 'world-land', paint: { 'fill-color': '#100b07', 'fill-outline-color': '#100b07' } },
      { id: 'coastline', type: 'line', source: 'world-coastline', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#484037', 'line-width': 0.75, 'line-opacity': 0.55 } },
      { id: 'borders', type: 'line', source: 'world-borders', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#53493f', 'line-width': 0.75, 'line-opacity': 0.5 } },
    ],
  };
}
