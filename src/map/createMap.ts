import { Map, setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type { FeatureCollection } from 'geojson';
import { worldStyle } from './layers';

setWorkerUrl(workerUrl);

export function resetWorldView(map: Map, animate = true): void {
  const narrow = window.innerWidth < 700;
  const padding = narrow ? { top: 160, bottom: 220, left: 20, right: 20 } : { top: 100, bottom: 150, left: 40, right: 260 };
  if (map.getProjection()?.type === 'globe') {
    const { clientWidth: width, clientHeight: height } = map.getContainer();
    const diameter = Math.max(100, Math.min(width - padding.left - padding.right, height - padding.top - padding.bottom));
    map.easeTo({
      center: [10, 22],
      zoom: Math.log2(diameter * Math.PI * Math.cos(22 * Math.PI / 180) / 512),
      bearing: 0, pitch: 0, padding,
      duration: animate ? 900 : 0,
    });
    return;
  }
  map.fitBounds([[-170, -56], [175, 76]], {
    padding,
    duration: animate ? 900 : 0,
  });
}

export function setGlobeView(map: Map, globe: boolean): void {
  // Change only the projection: all sources, travel filters and interactions stay attached.
  map.stop();
  const center = map.getCenter();
  const zoom = map.getZoom();
  map.setMinZoom(globe ? -2 : 0);
  map.setProjection({ type: globe ? 'globe' : 'mercator' });
  map.getContainer().style.backgroundColor = globe ? '#000000' : '#050a10';
  map.setGlobalStateProperty('globe-view', globe);
  if (globe) { map.dragRotate.enable(); map.touchPitch.enable(); }
  else { map.dragRotate.disable(); map.touchPitch.disable(); }
  map.jumpTo({ center, zoom: Math.max(globe ? -2 : 0, zoom), bearing: 0, pitch: 0 });
}

export function createMap(land: FeatureCollection, borders: FeatureCollection, coastline: FeatureCollection): Map {
  const map = new Map({
    container: 'map',
    style: worldStyle(land, borders, coastline),
    center: [10, 22],
    zoom: 1.5,
    minZoom: 0,
    maxZoom: 18,
    attributionControl: false,
    renderWorldCopies: false,
    dragRotate: false,
    pitchWithRotate: true,
    touchPitch: false,
  });
  map.touchZoomRotate.disableRotation();
  resetWorldView(map, false);
  return map;
}
