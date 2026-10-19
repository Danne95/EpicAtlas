import type { Feature, LineString } from 'geojson';
import type { GroundRouteProperties } from '../types/travel';
import { waterConnection } from '../data/waterJourney';
import { validateSuggestion, type RoutePlace, type RouteSuggestion } from '../data/groundJourney';
import { validPoint } from '../data/coordinates';

type GroundFeature = Feature<LineString, GroundRouteProperties<'road' | 'rail' | 'water'>>;
export function setupGroundJourney(fields: HTMLElement, mode: 'road' | 'rail' | 'water', onReady: (route?: GroundFeature) => void): void {
  const root = document.createElement('section'); root.className = 'ground-journey'; fields.append(root);
  const privacy = document.createElement('p');
  privacy.textContent = mode === 'water' ? 'Find place sends its name to Nominatim. Water previews connect selected ports locally; they do not follow shipping lanes or avoid land. Add stops to describe your journey, or import its exact track. Dates stay local.' : 'Find place sends its name to Nominatim. Preview route sends selected stop positions to BRouter. Dates stay local. Saved paths work offline.';
  root.append(privacy);
  const stops = document.createElement('div'); root.append(stops);
  const via = document.createElement('div');
  const points: { input: HTMLInputElement; selected?: RoutePlace }[] = [];
  const message = document.createElement('p'); message.setAttribute('role', 'status');
  const preview = document.createElement('div'); preview.className = 'route-preview';
  const reviewLabel = document.createElement('label'); reviewLabel.className = 'route-review'; reviewLabel.hidden = true;
  const review = document.createElement('input'); review.type = 'checkbox'; reviewLabel.append(review, mode === 'water' ? ' I have reviewed this approximate connection between my ports' : ' This suggested path matches my journey');
  let suggestion: RouteSuggestion | undefined, busy = false;
  const ready = (value?: GroundFeature) => { if (fields.contains(root)) onReady(value); };
  const invalidate = () => { window.dispatchEvent(new Event('epicatlas:clear-route-preview')); suggestion = undefined; review.checked = false; reviewLabel.hidden = true; preview.replaceChildren(); ready(); };
  function updateReady(): void {
    if (!suggestion || !review.checked) { ready(); return; }
    const ordered = [points[0], ...points.slice(2), points[1]].map(point => point.selected!);
    ready({ type: 'Feature', geometry: structuredClone(suggestion.geometry), properties: { id: 'pending-route', mode, from: ordered[0].label, to: ordered.at(-1)!.label, name: `${ordered[0].name} → ${ordered.at(-1)!.name}`, distanceMeters: suggestion.distanceMeters, source: suggestion.source, geometryNote: mode === 'water' ? `User-reviewed approximate port connection; no sea routing or land avoidance.${ordered.length > 2 ? ` Via: ${ordered.slice(1, -1).map(stop => stop.label).join('; ')}` : ''}` : `User-reviewed suggested ${mode === 'rail' ? 'rail-network' : 'road'} path; not a recorded trace${ordered.length > 2 ? `. Via: ${ordered.slice(1, -1).map(stop => stop.label).join('; ')}` : '.'}` } });
  }
  review.addEventListener('change', updateReady);
  async function job(action: () => Promise<void>): Promise<void> {
    if (busy) return;
    busy = true;
    const controls = [...root.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button')];
    const disabled = controls.map(control => control.disabled); controls.forEach(control => { control.disabled = true; });
    try { await action(); } catch (error) { message.textContent = error instanceof Error ? error.message : 'Lookup unavailable. Nothing has been saved.'; }
    finally { busy = false; controls.forEach((control, index) => { control.disabled = disabled[index]; }); }
  }
  function addPoint(label: string, parent: HTMLElement, removable = false): void {
    const row = document.createElement('div'); row.className = 'journey-stop';
    const wrapper = document.createElement('label'); wrapper.textContent = label;
    const input = document.createElement('input'); input.type = 'text'; input.required = true;
    input.placeholder = mode === 'water' ? 'Port or coastal city, country' : mode === 'rail' ? 'Station or city, country' : 'City or address, country'; input.maxLength = 200;
    wrapper.append(input);
    const find = document.createElement('button'); find.type = 'button'; find.textContent = 'Find place';
    const results = document.createElement('div'); results.className = 'stop-results';
    const state: typeof points[number] = { input }; points.push(state);
    input.addEventListener('input', () => { state.selected = undefined; results.replaceChildren(); invalidate(); message.textContent = 'Find and select this stop again before previewing.'; });
    find.addEventListener('click', () => { void job(async () => {
      const query = input.value.trim(); if (!query) throw new Error('Enter a place name first.');
      message.textContent = 'Finding places…'; results.replaceChildren();
      const response = await fetch(`${import.meta.env.BASE_URL}api/places`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
      const answer = await response.json(); if (!response.ok) throw new Error(answer.error || 'Place lookup unavailable.');
      if (!fields.contains(root) || input.value.trim() !== query) return;
      if (!Array.isArray(answer.results)) throw new Error('Invalid place results.');
      message.textContent = answer.results.length ? 'Choose the matching place.' : 'No place found. Try adding its country or a station name.';
      for (const place of answer.results as RoutePlace[]) {
        if (!validPoint(place.coordinates) || typeof place.label !== 'string' || typeof place.name !== 'string') continue;
        const choose = document.createElement('button'); choose.type = 'button'; choose.textContent = place.label;
        choose.addEventListener('click', () => { state.selected = place; input.value = place.label; results.replaceChildren(); invalidate(); message.textContent = `${label} selected. Find the other stops, then preview the route.`; });
        results.append(choose);
      }
    }); });
    row.append(wrapper, find, results);
    if (removable) {
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Remove stop';
      remove.addEventListener('click', () => { points.splice(points.indexOf(state), 1); row.remove(); invalidate(); }); row.append(remove);
    }
    parent.append(row);
  }
  addPoint('Departure', stops); addPoint('Arrival', stops); root.append(via);
  const add = document.createElement('button'); add.type = 'button'; add.textContent = 'Add intermediate stop';
  add.addEventListener('click', () => { if (points.length >= 10) { message.textContent = 'Up to eight intermediate stops are supported.'; return; } invalidate(); addPoint('Intermediate stop', via, true); });
  const generate = document.createElement('button'); generate.type = 'button'; generate.textContent = 'Preview route';
  generate.addEventListener('click', () => { void job(async () => {
    if (points.some(point => !point.selected)) throw new Error('Find and select departure, arrival and every intermediate stop first.');
    invalidate(); message.textContent = `Preparing a suggested ${mode} path…`;
    const ordered = [points[0], ...points.slice(2), points[1]];
    if (mode === 'water') suggestion = waterConnection(ordered.map(point => point.selected!.coordinates));
    else {
    const response = await fetch(`${import.meta.env.BASE_URL}api/routes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, points: ordered.map(point => point.selected!.coordinates) }) });
    const answer = await response.json(); if (!response.ok) throw new Error(answer.error || 'Route preview unavailable.');
    if (!fields.contains(root)) return;
    suggestion = validateSuggestion(answer.route);
    }
    renderPreview(preview, suggestion, mode);
    const view = document.createElement('button'); view.type = 'button'; view.textContent = 'View route on world map';
    view.addEventListener('click', () => { const editor = document.querySelector<HTMLDialogElement>('#travel-editor')!; editor.dataset.routePreview = 'true'; window.dispatchEvent(new CustomEvent('epicatlas:route-preview', { detail: { mode, geometry: suggestion!.geometry } })); editor.close(); });
    preview.append(view);
    reviewLabel.hidden = false;
    message.textContent = `${Math.round(suggestion.distanceMeters / 1000)} km ${mode === 'water' ? 'approximate port connection (may cross land)' : `suggested ${mode} path`}. Review it, then tick the box to enable Save record.${mode === 'rail' ? ' This follows the mapped rail network, not a timetable or a particular train service.' : ''}`;
  }); });
  const actions = document.createElement('div'); actions.className = 'journey-actions'; actions.append(add, generate);
  root.append(actions, message, preview, reviewLabel);
  const attribution = document.createElement('p'); const source = document.createElement('a'); source.href = 'https://brouter.de/brouter-web/'; source.target = '_blank'; source.rel = 'noopener noreferrer'; source.textContent = 'BRouter';
  const osm = document.createElement('a'); osm.href = 'https://www.openstreetmap.org/copyright'; osm.target = '_blank'; osm.rel = 'noopener noreferrer'; osm.textContent = '© OpenStreetMap contributors'; if (mode !== 'water') attribution.append(source, ' / '); attribution.append(osm); root.append(attribution);
}

function renderPreview(container: HTMLElement, route: RouteSuggestion, mode: 'road' | 'rail' | 'water'): void {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', '0 0 600 240'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', `Suggested ${mode} route preview`);
  const positions = route.geometry.coordinates;
  const meanLatitude = positions.reduce((sum, p) => sum + p[1], 0) / positions.length;
  const projected = positions.map(p => [p[0] * Math.cos(meanLatitude * Math.PI / 180), -p[1]]);
  const [west, north, east, south] = projected.reduce((bounds, p) => [Math.min(bounds[0], p[0]), Math.min(bounds[1], p[1]), Math.max(bounds[2], p[0]), Math.max(bounds[3], p[1])], [Infinity, Infinity, -Infinity, -Infinity]);
  const scale = Math.min(560 / Math.max(east - west, 0.00001), 200 / Math.max(south - north, 0.00001));
  const toScreen = (p: number[]) => [300 + (p[0] - (west + east) / 2) * scale, 120 + (p[1] - (north + south) / 2) * scale];
  const path = document.createElementNS(ns, 'path'); path.setAttribute('d', projected.map((p, i) => `${i ? 'L' : 'M'}${toScreen(p).join(',')}`).join(' '));
  path.setAttribute('fill', 'none'); path.setAttribute('stroke', mode === 'water' ? '#66d9ef' : mode === 'rail' ? '#b1a4e8' : '#e7b881'); path.setAttribute('stroke-width', '3'); path.setAttribute('stroke-linejoin', 'round');
  svg.append(path);
  for (const [label, point] of [['Departure', projected[0]], ['Arrival', projected.at(-1)!]] as const) {
    const [x, y] = toScreen(point); const circle = document.createElementNS(ns, 'circle'); circle.setAttribute('cx', String(x)); circle.setAttribute('cy', String(y)); circle.setAttribute('r', '5'); circle.setAttribute('fill', '#d9fff1'); svg.append(circle);
    const title = document.createElementNS(ns, 'title'); title.textContent = label; circle.append(title);
  }
  container.replaceChildren(svg);
}
