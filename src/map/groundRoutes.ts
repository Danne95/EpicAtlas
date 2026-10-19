import { LngLatBounds, Popup, type GeoJSONSource, type Map } from 'maplibre-gl';
import type { Feature, LineString } from 'geojson';
import type { GroundRouteProperties, RailCollection, RoadCollection, WaterCollection } from '../types/travel';
import type { TravelLayers } from './travelLayers';

export function addGroundRoutes(map: Map, data: RoadCollection | RailCollection | WaterCollection, groups: TravelLayers, mode: 'road' | 'rail' | 'water'): void {
  const group = mode === 'road' ? 'roads' : mode;
  const source = `travel-${group}`;
  const glow = `${group}-glow`, hit = `${group}-hit`;
  (map.getSource(source) as GeoJSONSource).setData(data);
  map.setLayoutProperty(source, 'line-join', 'round');
  map.setLayoutProperty(source, 'line-cap', 'round');
  map.setPaintProperty(source, 'line-width', ['interpolate', ['linear'], ['zoom'], 2, 0.55, 5, 0.9, 8, 1.6, 11, 2.5]);
  map.setPaintProperty(source, 'line-opacity', ['interpolate', ['linear'], ['zoom'], 2, 0.4, 5, 0.55, 8, 0.75, 11, 0.85]);
  if (mode === 'rail') map.setPaintProperty(source, 'line-dasharray', [3, 2]);
  map.addLayer({ id: glow, type: 'line', source, paint: {
    'line-color': mode === 'road' ? '#e7b881' : mode === 'rail' ? '#b1a4e8' : '#66d9ef',
    'line-width': ['interpolate', ['linear'], ['zoom'], 2, 1, 5, 2, 8, 5, 11, 8],
    'line-opacity': ['interpolate', ['linear'], ['zoom'], 2, 0, 5, 0.025, 8, 0.08, 11, 0.15],
    'line-blur': ['interpolate', ['linear'], ['zoom'], 2, 0.5, 8, 2, 11, 3],
  } }, source);
  map.addLayer({ id: hit, type: 'line', source, paint: { 'line-width': 14, 'line-opacity': 0 } });
  const popup = new Popup({ closeButton: true, closeOnClick: false, maxWidth: '280px' });
  const button = document.querySelector<HTMLButtonElement>(`#${mode}-view`);
  if (button) {
    button.textContent = `View ${mode} routes ↗`;
    button.hidden = data.features.length === 0;
  }

  function showRoute(feature: Feature<LineString, GroundRouteProperties<'road' | 'rail' | 'water'>>, coordinate: [number, number]): void {
    if (!groups.isVisible(group) || !groups.isRecordVisible(group, feature.properties.id)) return;
    const props = feature.properties;
    const content = document.createElement('div');
    const kind = document.createElement('p');
    kind.className = 'location-kind';
    kind.textContent = `${mode.toUpperCase()} ROUTE`;
    const title = document.createElement('h2');
    title.textContent = props.name || (props.from && props.to ? `${props.from} → ${props.to}` : `${mode} journey`);
    content.append(kind, title);
    for (const text of [props.distanceMeters === undefined ? undefined : `${Math.round(props.distanceMeters / 1000)} km`, props.date ? `Date: ${props.date}` : undefined, props.source ? `Geometry: ${props.source}` : undefined, props.geometryNote]) {
      if (!text) continue;
      const line = document.createElement('p');
      line.textContent = text;
      content.append(line);
    }
    popup.setLngLat(coordinate).setDOMContent(content).addTo(map);
  }

  map.on('mouseenter', hit, () => { if (groups.isVisible(group)) map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', hit, () => { map.getCanvas().style.cursor = ''; });
  map.on('click', hit, (event) => {
    const feature = data.features.find((route) => route.properties.id === event.features?.[0].properties.id);
    if (feature) showRoute(feature, [event.lngLat.lng, event.lngLat.lat]);
  });
  map.on('click', (event) => {
    if (!map.queryRenderedFeatures(event.point, { layers: [hit] }).length) popup.remove();
  });
  button?.addEventListener('click', () => {
    const matching = data.features.filter((route) => groups.isRecordVisible(group, route.properties.id));
    if (!groups.isVisible(group) || !matching.length) return;
    const bounds = new LngLatBounds();
    for (const feature of matching) for (const coordinate of feature.geometry.coordinates) bounds.extend(coordinate as [number, number]);
    map.fitBounds(bounds, {
      padding: window.innerWidth < 700 ? { top: 280, bottom: 110, left: 25, right: 25 } : { top: 110, bottom: 90, left: 330, right: 230 },
      maxZoom: 7, duration: 800,
    });
    const route = matching[0];
    showRoute(route, route.geometry.coordinates[Math.floor(route.geometry.coordinates.length / 2)] as [number, number]);
  });
  groups.register(group, [glow, source, hit], (visible) => {
    if (button) button.hidden = !visible || !data.features.some((route) => groups.isRecordVisible(group, route.properties.id));
    if (!visible) { popup.remove(); map.getCanvas().style.cursor = ''; }
  }, () => {
    popup.remove(); map.getCanvas().style.cursor = '';
    if (button) button.hidden = !groups.isVisible(group) || !data.features.some((route) => groups.isRecordVisible(group, route.properties.id));
  });
}
