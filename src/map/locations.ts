import { Popup, type Map } from 'maplibre-gl';
import type { LocationCollection, LocationProperties } from '../types/travel';
import type { TravelLayers } from './travelLayers';
import { boundaryBounds } from '../data/cityBoundary';
import { CityWalls } from './cityWalls';

export function addLocations(map: Map, locations: LocationCollection, groups: TravelLayers): void {
  map.addSource('travel-locations', { type: 'geojson', tolerance: 0, maxzoom: 18, data: { ...locations, features: locations.features.filter(feature => feature.geometry.type !== 'Point') } });
  map.addLayer({
    id: 'locations-fill', type: 'fill', source: 'travel-locations',
    paint: { 'fill-color': '#9de6ce', 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 2, 0, 5, 0.015, 8, 0.045, 11, 0.08] },
  });
  map.addLayer({
    id: 'locations-glow', type: 'line', source: 'travel-locations',
    paint: {
      'line-width': ['interpolate', ['linear'], ['zoom'], 2, 1, 5, 2, 8, 5, 11, 9],
      'line-color': '#9de6ce',
      'line-opacity': ['interpolate', ['linear'], ['zoom'], 2, 0, 5, 0.04, 8, 0.16, 11, 0.3],
      'line-blur': ['interpolate', ['linear'], ['zoom'], 2, 0.5, 8, 2, 11, 3],
    },
  });
  map.addLayer({ id: 'locations-outline', type: 'line', source: 'travel-locations', paint: {
    'line-color': ['interpolate', ['linear'], ['zoom'], 2, '#9de6ce', 11, '#d9fff1'],
    'line-width': ['interpolate', ['linear'], ['zoom'], 2, 0.55, 5, 0.8, 8, 1.2, 11, 1.8],
    'line-opacity': ['interpolate', ['linear'], ['zoom'], 2, 0.4, 5, 0.55, 8, 0.75, 11, 0.95],
  } });
  const walls = new CityWalls(locations, groups);
  map.addLayer(walls);
  map.addLayer({ id: 'locations-hit', type: 'fill', source: 'travel-locations', paint: { 'fill-opacity': 0 } });

  let pinned = false;
  const popup = new Popup({ closeButton: true, closeOnClick: false, maxWidth: '240px', offset: 15 });
  popup.on('close', () => { pinned = false; });

  function showLocation(coordinates: [number, number], props: LocationProperties): void {
    if (!groups.isVisible('locations') || !groups.isRecordVisible('locations', props.id)) return;
    const content = document.createElement('div');
    const eyebrow = document.createElement('p');
    eyebrow.className = 'location-kind';
    eyebrow.textContent = 'LOCATION';
    const title = document.createElement('h2');
    title.textContent = props.name;
    content.append(eyebrow, title);
    for (const value of [props.country, props.visitedDate ? `Visited: ${props.visitedDate}` : undefined]) {
      if (!value) continue;
      const line = document.createElement('p');
      line.textContent = value;
      content.append(line);
    }
    popup.setLngLat(coordinates).setDOMContent(content).addTo(map);
  }

  map.on('mouseenter', 'locations-hit', (event) => {
    if (!groups.isVisible('locations')) return;
    map.getCanvas().style.cursor = 'pointer';
    const feature = event.features?.[0];
    if (!pinned && feature) showLocation([event.lngLat.lng, event.lngLat.lat], feature.properties as LocationProperties);
  });
  map.on('mouseleave', 'locations-hit', () => {
    map.getCanvas().style.cursor = '';
    if (!pinned) popup.remove();
  });
  map.on('click', 'locations-hit', (event) => {
    const feature = event.features?.[0];
    if (!feature) return;
    showLocation([event.lngLat.lng, event.lngLat.lat], feature.properties as LocationProperties);
    pinned = true;
  });
  map.on('click', (event) => {
    if (!map.queryRenderedFeatures(event.point, { layers: ['locations-hit'] }).length) popup.remove();
  });

  const list = document.querySelector<HTMLElement>('#location-list')!;
  list.replaceChildren();
  for (const feature of locations.features) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.recordId = feature.properties.id;
    button.textContent = feature.properties.name + (feature.geometry.type === 'Point' ? ' · boundary needed' : '');
    button.addEventListener('click', () => {
      if (feature.geometry.type === 'Point') { document.querySelector('#travel-view-status')!.textContent = 'Open Edit travel and find this city to add its outline.'; document.querySelector<HTMLElement>('#travel-view-status')!.hidden = false; return; }
      const bounds = boundaryBounds(feature.geometry);
      const coordinates: [number, number] = [(bounds[0][0] + bounds[1][0]) / 2, (bounds[0][1] + bounds[1][1]) / 2];
      showLocation(coordinates, feature.properties);
      pinned = true;
      map.fitBounds(bounds, { padding: { top: 100, bottom: 80, left: window.innerWidth < 700 ? 25 : 320, right: window.innerWidth < 700 ? 25 : 220 }, maxZoom: 12, duration: 800 });
    });
    list.append(button);
  }
  document.querySelector('#location-count')!.textContent = `${locations.features.length} place${locations.features.length === 1 ? '' : 's'}`;
  groups.register('locations', ['locations-fill', 'locations-glow', 'locations-outline', 'locations-hit'], (visible) => {
    walls.refresh();
    document.querySelector<HTMLElement>('.places')!.hidden = !visible;
    if (!visible) {
      popup.remove();
      map.getCanvas().style.cursor = '';
    }
  }, () => {
    walls.refresh();
    popup.remove(); map.getCanvas().style.cursor = '';
    for (const button of list.querySelectorAll<HTMLButtonElement>('button')) button.hidden = !groups.isRecordVisible('locations', button.dataset.recordId!);
    const matching = locations.features.filter((feature) => groups.isRecordVisible('locations', feature.properties.id)).length;
    document.querySelector('#location-count')!.textContent = `${matching} of ${locations.features.length} places`;
  });
}
