import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';
import { loadGeography } from './data/loader';
import { createMap, resetWorldView, setGlobeView } from './map/createMap';
import { addLocations } from './map/locations';
import { createTravelLayers, travelGroups, type TravelGroup } from './map/travelLayers';
import { createFilters } from './ui/filters';
import { addFlights } from './map/flights';
import { addGroundRoutes } from './map/groundRoutes';
import { setupEditor } from './ui/editor';
import { emptyWorkspace, readWorkspace, watchWorkspaceChanges } from './data/workspace';
import { createTimeline } from './ui/timeline';
import { setupRoutePreview } from './map/routePreview';
import { setupCountryHighlights } from './map/countries';

const status = document.querySelector<HTMLElement>('#map-status')!;
const errorPanel = document.querySelector<HTMLElement>('#map-error')!;
const errorMessage = document.querySelector<HTMLElement>('#error-message')!;
const worldButton = document.querySelector<HTMLButtonElement>('#world-view')!;
const globeButton = document.querySelector<HTMLButtonElement>('#globe-view')!;
worldButton.disabled = true;
globeButton.disabled = true;
const zoomPlus = document.querySelector<HTMLButtonElement>('#zoom-plus')!;
const zoomMinus = document.querySelector<HTMLButtonElement>('#zoom-minus')!;

function showError(message: string): void {
  status.hidden = false;
  status.textContent = 'Map unavailable';
  errorMessage.textContent = message;
  errorPanel.hidden = false;
}

document.querySelector('#retry')!.addEventListener('click', () => window.location.reload());

async function start(): Promise<void> {
  try {
    let personal = emptyWorkspace();
    try {
      personal = await readWorkspace();
      const count = personal.locations.features.length + personal.roads.features.length + personal.rail.features.length + personal.water.features.length + personal.flights.flights.length;
      const travelStatus = document.querySelector<HTMLElement>('#travel-view-status')!;
      travelStatus.textContent = count ? 'Showing my saved travel' : '';
      travelStatus.hidden = count === 0;
    } catch {
      document.querySelector('#travel-view-status')!.textContent = 'Saved travel unavailable · open editor to restore a backup.';
    }
    const [land, borders, coastline] = await Promise.all([loadGeography('land.geojson'), loadGeography('borders.geojson'), loadGeography('coastline.geojson')]);
    const map = createMap(land, borders, coastline);
    map.on('error', (event) => {
      showError(event.error.message);
    });
    map.once('load', () => {
      const groups = createTravelLayers(map);
      const filters = createFilters(groups);
      const timeline = createTimeline(groups, (group, text) => filters.setStatus(group, text));
      setupRoutePreview(map);
      const render: Record<TravelGroup, () => void> = {
        locations: () => {
          addLocations(map, personal.locations, groups);
          void setupCountryHighlights(map, personal.locations, groups);
        },
        roads: () => addGroundRoutes(map, personal.roads, groups, 'road'),
        rail: () => addGroundRoutes(map, personal.rail, groups, 'rail'),
        water: () => addGroundRoutes(map, personal.water, groups, 'water'),
        flights: () => addFlights(map, personal.flights, groups),
      };
      for (const group of travelGroups) {
        try {
          render[group]();
          const records = group === 'locations'
            ? personal.locations.features.map(item => ({ id: item.properties.id, date: item.properties.visitedDate }))
            : group === 'flights'
              ? personal.flights.flights.map(item => ({ id: item.id, date: item.date }))
              : personal[group].features.map(item => ({ id: item.properties.id, date: item.properties.date }));
          const noun = group === 'locations' ? 'place' : group === 'flights' ? 'flight' : group === 'roads' ? 'route' : 'journey';
          timeline.setRecords(group, records, noun);
        } catch (error) {
          filters.setStatus(group, 'Unavailable');
          const message = error instanceof Error ? error.message : 'Could not display saved travel.';
          document.querySelector<HTMLElement>(`.layer-${group}`)!.title = message;
          if (group === 'locations') {
            document.querySelector('#location-count')!.textContent = 'Locations unavailable';
            document.querySelector('#location-list')!.textContent = message;
          }
        }
      }
    });
    map.once('idle', () => {
      if (!errorPanel.hidden) return;
      status.textContent = '';
      status.hidden = true;
      worldButton.disabled = false;
      globeButton.disabled = false;
      updateZoomControls();
    });
    function updateZoomControls(): void {
      zoomPlus.disabled = worldButton.disabled || map.getZoom() >= map.getMaxZoom();
      zoomMinus.disabled = worldButton.disabled || map.getZoom() <= map.getMinZoom();
    }
    map.on('zoomend', updateZoomControls);
    zoomPlus.addEventListener('click', () => map.zoomIn());
    zoomMinus.addEventListener('click', () => map.zoomOut());
    worldButton.addEventListener('click', () => resetWorldView(map));
    globeButton.addEventListener('click', () => {
      const globe = map.getProjection()?.type !== 'globe';
      setGlobeView(map, globe);
      globeButton.setAttribute('aria-pressed', String(globe));
      document.querySelector<HTMLElement>('#map')!.setAttribute('aria-label', globe ? 'Interactive 3D globe' : 'Interactive 2D world map');
      document.querySelector<HTMLElement>('#projection-status')!.textContent = globe ? '3D globe · right-drag to tilt' : '2D map';
    });
  } catch (error) {
    showError(error instanceof Error ? error.message : 'Could not open the local world map.');
  }
}

watchWorkspaceChanges();
void setupEditor();
void start();
