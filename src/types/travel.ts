import type { FeatureCollection, LineString, Point, Polygon, MultiPolygon } from 'geojson';

export interface LocationProperties {
  id: string;
  name: string;
  country?: string;
  visitedDate?: string;
  osmId?: string;
  source?: string;
}

export type LocationCollection = FeatureCollection<Point | Polygon | MultiPolygon, LocationProperties> & { demo: false };

export interface FlightAirport {
  code: string;
  name: string;
  coordinates: [number, number];
}

export interface FlightRecord {
  id: string;
  from: FlightAirport;
  to: FlightAirport;
  date?: string;
}

export interface FlightData { demo: false; flights: FlightRecord[]; }

export interface GroundRouteProperties<Mode extends 'road' | 'rail' | 'water'> {
  id: string;
  mode: Mode;
  name?: string;
  from?: string;
  to?: string;
  date?: string;
  source?: string;
  distanceMeters?: number;
  geometryNote?: string;
}
export type RoadProperties = GroundRouteProperties<'road'>;
export type RoadCollection = FeatureCollection<LineString, RoadProperties> & { demo: false };
export type RailProperties = GroundRouteProperties<'rail'>;
export type RailCollection = FeatureCollection<LineString, RailProperties> & { demo: false };

export type WaterProperties = GroundRouteProperties<'water'>;
export type WaterCollection = FeatureCollection<LineString, WaterProperties> & { demo: false };
