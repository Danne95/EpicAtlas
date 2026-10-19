import type { Map as AtlasMap } from 'maplibre-gl';
import type { LocationCollection } from '../types/travel';
import { matchPlaceCountries, validateCountries } from '../data/countries';
import { loadGeography } from '../data/loader';
import type { TravelLayers } from './travelLayers';

export async function setupCountryHighlights(map: AtlasMap, locations: LocationCollection, groups: TravelLayers): Promise<void> {
  const toggle = document.querySelector<HTMLInputElement>('#country-highlights')!;
  const status = document.querySelector<HTMLElement>('#country-highlight-status')!;
  try {
    const countries = validateCountries(await loadGeography('countries.geojson'));
    const matches = matchPlaceCountries(locations, countries);
    map.addSource('country-highlights', { type: 'geojson', data: countries, tolerance: 0.1, maxzoom: 12 });
    // Place highlights beneath the existing world borders and all personal travel layers.
    map.addLayer({ id: 'country-highlight-fill', type: 'fill', source: 'country-highlights', layout: { visibility: 'none' }, paint: { 'fill-color': '#9ed8c8', 'fill-opacity': 0.045, 'fill-outline-color': 'rgba(0,0,0,0)' } }, 'coastline');
    map.addLayer({ id: 'country-highlight-outline', type: 'line', source: 'country-highlights', layout: { visibility: 'none', 'line-join': 'round' }, paint: { 'line-color': '#9ed8c8', 'line-width': 1, 'line-opacity': 0.42 } }, 'coastline');
    function update(): void {
      const places = locations.features.filter(place => groups.isRecordVisible('locations', place.properties.id));
      const ids = [...new Set(places.flatMap(place => matches.get(place.properties.id) ? [matches.get(place.properties.id)!] : []))];
      const unmatched = places.filter(place => !matches.get(place.properties.id)).length;
      for (const id of ['country-highlight-fill', 'country-highlight-outline']) {
        map.setFilter(id, ['in', ['get', 'id'], ['literal', ids]]);
        map.setLayoutProperty(id, 'visibility', toggle.checked && groups.isVisible('locations') ? 'visible' : 'none');
      }
      status.textContent = `${ids.length} countr${ids.length === 1 ? 'y' : 'ies'}${unmatched ? ` · ${unmatched} unmatched place${unmatched === 1 ? '' : 's'}` : ''}${!groups.isVisible('locations') ? ' · places hidden' : ''}`;
    }
    toggle.disabled = false;
    toggle.addEventListener('change', update);
    const unsubscribe = groups.subscribe('locations', update);
    map.once('remove', () => { unsubscribe(); toggle.removeEventListener('change', update); });
    update();
  } catch {
    toggle.checked = false;
    toggle.disabled = true;
    status.textContent = 'Country shapes unavailable · install with the local world tool.';
  }
}
