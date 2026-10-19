import { Popup, type GeoJSONSource, type Map, type LngLat } from 'maplibre-gl';
import type { FeatureCollection, MultiLineString } from 'geojson';
import type { FlightData, FlightRecord } from '../types/travel';
import type { TravelLayers } from './travelLayers';
import { greatCircle } from './greatCircle';
import { FlightArcs } from './flightArcs';
import { projectionPaint } from './projectionPaint';

export function addFlights(map: Map, data: FlightData, groups: TravelLayers): void {
  const collection: FeatureCollection<MultiLineString> = {
    type: 'FeatureCollection',
    features: data.flights.map((flight) => ({ type: 'Feature', geometry: greatCircle(flight.from.coordinates, flight.to.coordinates), properties: { id: flight.id } })),
  };
  (map.getSource('travel-flights') as GeoJSONSource).setData(collection);
  map.setPaintProperty('travel-flights', 'line-width', ['interpolate', ['linear'], ['zoom'], 2, 0.5, 5, 0.8, 8, 1.2, 11, 1.7]);
  const surfaceOpacity = projectionPaint([[2, 0.35, 0], [4, 0.45, 0], [5, 0.5, 0.3], [6, 0.5667, 0.6], [8, 0.7, 0.7], [11, 0.85, 0.85]]);
  map.setPaintProperty('travel-flights', 'line-opacity', surfaceOpacity);
  map.addLayer({ id: 'flights-glow', type: 'line', source: 'travel-flights', paint: {
    'line-color': '#8fc9e8',
    'line-width': ['interpolate', ['linear'], ['zoom'], 2, 1, 5, 2, 8, 4, 11, 7],
    'line-opacity': ['interpolate', ['linear'], ['zoom'], 2, 0, 5, 0.02, 8, 0.06, 11, 0.12],
    'line-blur': ['interpolate', ['linear'], ['zoom'], 2, 0.5, 8, 2, 11, 3],
  } }, 'travel-flights');
  map.addLayer({ id: 'flights-hit', type: 'line', source: 'travel-flights', paint: { 'line-width': 14, 'line-opacity': 0 } });
  const arcs = new FlightArcs(data.flights, groups);
  map.addLayer(arcs);
  const popup = new Popup({ closeButton: true, closeOnClick: false, maxWidth: '280px' });
  const surfaceInteractive = () => map.getProjection()?.type !== 'globe' || map.getZoom() > 4;
  map.on('mouseenter', 'flights-hit', () => { if (groups.isVisible('flights') && surfaceInteractive()) map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', 'flights-hit', () => { map.getCanvas().style.cursor = ''; });
  map.on('click', 'flights-hit', (event) => {
    if (!groups.isVisible('flights') || !surfaceInteractive()) return;
    const flight = data.flights.find((record) => record.id === event.features?.[0].properties.id);
    if (!flight || !groups.isRecordVisible('flights', flight.id)) return;
    showFlight(flight, event.lngLat);
  });
  function showFlight(flight: FlightRecord, coordinates: LngLat): void {
    const content = document.createElement('div');
    const kind = document.createElement('p');
    kind.className = 'location-kind';
    kind.textContent = 'FLIGHT';
    const title = document.createElement('h2');
    title.textContent = `${flight.from.code} → ${flight.to.code}`;
    content.append(kind, title);
    for (const text of [flight.from.name, `to ${flight.to.name}`, flight.date ? `Date: ${flight.date}` : undefined, map.getProjection()?.type === 'globe' ? 'Illustrative great-circle arc · height is stylized' : 'Illustrative great-circle path']) {
      if (!text) continue;
      const line = document.createElement('p');
      line.textContent = text;
      content.append(line);
    }
    popup.setLngLat(coordinates).setDOMContent(content).addTo(map);
  }
  let arcHovered = false;
  map.on('mousemove', event => {
    const hovered = Boolean(arcs.pick(event.point));
    if (hovered) map.getCanvas().style.cursor = 'pointer';
    else if (arcHovered) map.getCanvas().style.cursor = '';
    arcHovered = hovered;
  });
  map.on('click', (event) => {
    const elevated = arcs.pick(event.point);
    if (elevated) showFlight(elevated, event.lngLat);
    else if (!surfaceInteractive() || !map.queryRenderedFeatures(event.point, { layers: ['flights-hit'] }).length) popup.remove();
  });
  groups.register('flights', ['flights-glow', 'travel-flights', 'flights-hit'], (visible) => {
    arcs.refresh();
    if (!visible) { popup.remove(); map.getCanvas().style.cursor = ''; }
  }, () => { arcs.refresh(); popup.remove(); map.getCanvas().style.cursor = ''; });
}
