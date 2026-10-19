import type { Map as MapLibreMap } from 'maplibre-gl';

export const travelGroups = ['locations', 'roads', 'rail', 'water', 'flights'] as const;
export type TravelGroup = typeof travelGroups[number];

export class TravelLayers {
  private groups: Record<TravelGroup, { visible: boolean; ids: string[]; onVisibility?: (visible: boolean) => void }> = {
    locations: { visible: true, ids: [] }, roads: { visible: true, ids: [] },
    rail: { visible: true, ids: [] }, water: { visible: true, ids: [] }, flights: { visible: false, ids: [] },
  };

  constructor(private map: MapLibreMap) {}
  private recordFilters = new Map<TravelGroup, Set<string>>();
  private filterCallbacks = new Map<TravelGroup, () => void>();
  private subscribers = new Map<TravelGroup, Set<() => void>>();

  subscribe(group: TravelGroup, callback: () => void): () => void {
    const callbacks = this.subscribers.get(group) ?? new Set<() => void>();
    callbacks.add(callback);
    this.subscribers.set(group, callbacks);
    return () => { callbacks.delete(callback); };
  }

  register(group: TravelGroup, ids: string[], onVisibility?: (visible: boolean) => void, onFilter?: () => void): void {
    Object.assign(this.groups[group], { ids, onVisibility });
    this.setVisible(group, this.groups[group].visible);
    if (onFilter) this.filterCallbacks.set(group, onFilter);
    this.setRecordFilter(group, this.recordFilters.get(group) ? [...this.recordFilters.get(group)!] : undefined);
  }

  isRecordVisible(group: TravelGroup, id: string): boolean { return !this.recordFilters.has(group) || this.recordFilters.get(group)!.has(id); }

  setRecordFilter(group: TravelGroup, ids?: string[]): void {
    if (ids === undefined) this.recordFilters.delete(group); else this.recordFilters.set(group, new Set(ids));
    for (const layer of this.groups[group].ids) if (this.map.getLayer(layer)) this.map.setFilter(layer, ids === undefined ? null : ['in', ['get', 'id'], ['literal', ids]]);
    this.filterCallbacks.get(group)?.();
    this.subscribers.get(group)?.forEach(callback => callback());
  }

  isVisible(group: TravelGroup): boolean { return this.groups[group].visible; }

  setVisible(group: TravelGroup, visible: boolean): void {
    const state = this.groups[group];
    state.visible = visible;
    for (const id of state.ids) {
      if (this.map.getLayer(id)) this.map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
    }
    state.onVisibility?.(visible);
    this.subscribers.get(group)?.forEach(callback => callback());
  }
}

export function createTravelLayers(map: MapLibreMap): TravelLayers {
  const groups = new TravelLayers(map);
  const colors = { roads: '#e7b881', rail: '#b1a4e8', water: '#66d9ef', flights: '#8fc9e8' };
  for (const group of ['roads', 'rail', 'water', 'flights'] as const) {
    const id = `travel-${group}`;
    map.addSource(id, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id, type: 'line', source: id, paint: { 'line-color': colors[group], 'line-width': 2, 'line-opacity': 0.85 } });
    groups.register(group, [id]);
  }
  return groups;
}
