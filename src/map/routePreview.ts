import { LngLatBounds, type GeoJSONSource, type Map } from 'maplibre-gl';
import type { LineString } from 'geojson';

export function setupRoutePreview(map: Map): void {
  const back = document.createElement('button'); back.type = 'button'; back.textContent = 'Back to route form'; back.hidden = true;
  document.querySelector('.intro')!.append(back);
  back.addEventListener('click', () => document.querySelector<HTMLButtonElement>('#edit-travel')!.click());
  const clear = () => {
    delete document.querySelector<HTMLDialogElement>('#travel-editor')!.dataset.routePreview;
    back.hidden = true;
    if (map.getLayer('route-preview-line')) map.removeLayer('route-preview-line');
    if (map.getSource('route-preview')) map.removeSource('route-preview');
  };
  window.addEventListener('epicatlas:clear-route-preview', clear);
  window.addEventListener('epicatlas:route-preview', event => {
    const { geometry, mode } = (event as CustomEvent<{ geometry: LineString; mode: 'road' | 'rail' | 'water' }>).detail;
    const data = { type: 'Feature' as const, properties: {}, geometry };
    if (!map.getSource('route-preview')) {
      map.addSource('route-preview', { type: 'geojson', data });
      map.addLayer({ id: 'route-preview-line', type: 'line', source: 'route-preview', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': mode === 'water' ? '#66d9ef' : mode === 'rail' ? '#b1a4e8' : '#e7b881', 'line-width': 4 } });
    } else { (map.getSource('route-preview') as GeoJSONSource).setData(data); map.setPaintProperty('route-preview-line', 'line-color', mode === 'water' ? '#66d9ef' : mode === 'rail' ? '#b1a4e8' : '#e7b881'); }
    const bounds = new LngLatBounds(); geometry.coordinates.forEach(point => bounds.extend(point as [number, number]));
    map.fitBounds(bounds, { padding: window.innerWidth < 700 ? { top: 260, bottom: 80, left: 20, right: 20 } : { top: 100, bottom: 80, left: 330, right: 220 }, maxZoom: 12, duration: 700 });
    back.hidden = false;
  });
}
