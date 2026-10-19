import type { FlightData, LocationCollection, RoadCollection, RailCollection, WaterCollection } from '../types/travel';
import { greatCircle } from '../map/greatCircle';
import { validateBoundary } from './cityBoundary';
import { validPoint, validPosition } from './coordinates';

export interface Workspace {
  version: 1;
  locations: LocationCollection;
  roads: RoadCollection;
  rail: RailCollection;
  water: WaterCollection;
  flights: FlightData;
}


export function emptyWorkspace(): Workspace {
  return { version: 1, locations: { type: 'FeatureCollection', demo: false, features: [] },
    roads: { type: 'FeatureCollection', demo: false, features: [] },
    water: { type: 'FeatureCollection', demo: false, features: [] },
    rail: { type: 'FeatureCollection', demo: false, features: [] }, flights: { demo: false, flights: [] } };
}

export function validateWorkspace(value: unknown): Workspace {
  if (!value || typeof value !== 'object') throw new Error('Backup must be a travel workspace.');
  const original = value as Workspace;
  const data = Object.prototype.hasOwnProperty.call(original, 'water') ? original : { ...original, water: emptyWorkspace().water };
  if (data.version !== 1) throw new Error('Unsupported workspace version.');
  const ids = new Set<string>();
  const id = (value: unknown) => {
    if (typeof value !== 'string' || !value.trim() || ids.has(value)) throw new Error('Every record needs a unique nonempty ID across the workspace.');
    ids.add(value);
  };
  const text = (props: object, keys: string[]) => {
    const p = props as Record<string, unknown>;
    if (keys.some((key) => p[key] !== undefined && typeof p[key] !== 'string')) throw new Error('Optional record metadata must be text.');
  };
  for (const group of ['locations', 'roads', 'rail', 'water'] as const) {
    const collection = data[group];
    if (collection?.type !== 'FeatureCollection' || collection.demo !== false || !Array.isArray(collection.features)) throw new Error('Personal collections need features and demo: false.');
    for (const feature of collection.features) {
      if (feature?.type !== 'Feature' || !feature.properties || typeof feature.properties !== 'object') throw new Error('Invalid travel feature.');
      const props = feature.properties;
      id(props.id);
      if (group === 'locations') {
        if (!('name' in props) || typeof props.name !== 'string' || !props.name.trim()) throw new Error('Locations need a name.');
        if (feature.geometry?.type === 'Point') {
          if (!validPoint(feature.geometry.coordinates)) throw new Error('Invalid legacy location coordinates.');
        } else validateBoundary(feature.geometry);
        text(props, ['country', 'visitedDate', 'osmId', 'source']);
      } else {
        if (feature.geometry?.type !== 'LineString' || !Array.isArray(feature.geometry.coordinates) || feature.geometry.coordinates.length < 2 || !feature.geometry.coordinates.every(validPosition) || !('mode' in props) || props.mode !== (group === 'roads' ? 'road' : group)) throw new Error('Routes need matching mode and valid LineString coordinates.');
        text(props, ['name', 'from', 'to', 'date', 'source', 'geometryNote']);
        if ('distanceMeters' in props && (typeof props.distanceMeters !== 'number' || !Number.isFinite(props.distanceMeters) || props.distanceMeters < 0)) throw new Error('Invalid route distance.');
      }
    }
  }
  if (data.flights?.demo !== false || !Array.isArray(data.flights.flights)) throw new Error('Invalid flight collection.');
  for (const flight of data.flights.flights) {
    id(flight?.id);
    for (const airport of [flight.from, flight.to]) {
      if (!airport || typeof airport.code !== 'string' || !airport.code.trim() || typeof airport.name !== 'string' || !airport.name.trim() || !validPoint(airport.coordinates)) throw new Error('Flights need airport codes, names and valid coordinates.');
    }
    text(flight, ['date']);
    greatCircle(flight.from.coordinates, flight.to.coordinates);
  }
  return data;
}


