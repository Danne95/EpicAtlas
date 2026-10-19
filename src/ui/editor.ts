import { emptyWorkspace, readWorkspace, saveWorkspace, validateWorkspace, type Workspace } from '../data/workspace';
import { validateBoundary, type CityResult } from '../data/cityBoundary';
import { resolveAirport } from '../data/airports';
import type { FlightRecord } from '../types/travel';
import { setupGroundJourney } from './groundJourney';

type Kind = 'locations' | 'roads' | 'rail' | 'water' | 'flights';
export async function setupEditor(): Promise<void> {
  const dialog = document.querySelector<HTMLDialogElement>('#travel-editor')!;
  const status = dialog.querySelector<HTMLElement>('#editor-status')!;
  const form = dialog.querySelector<HTMLFormElement>('#record-form')!;
  const fields = dialog.querySelector<HTMLElement>('#record-fields')!;
  const kindInput = dialog.querySelector<HTMLSelectElement>('#record-kind')!;
  const list = dialog.querySelector<HTMLElement>('#saved-records')!;
  let data = emptyWorkspace(), blocked = false, editing: string | undefined;
  let route: Workspace['roads']['features'][number] | Workspace['rail']['features'][number] | Workspace['water']['features'][number] | undefined;
  let restore: Workspace | undefined;
  let selectedCity: CityResult | undefined;
  let existingFlight: FlightRecord | undefined;
  const openButton = document.querySelector<HTMLButtonElement>('#edit-travel')!;
  openButton.disabled = true;
  let loadError = '';
  try { data = await readWorkspace(); } catch (error) { blocked = true; loadError = error instanceof Error ? error.message : 'Could not read the travel file.'; }
  const say = (message: string) => { status.textContent = message; };
  const clearDownload = () => {
    const link = dialog.querySelector<HTMLAnchorElement>('#backup-download')!;
    if (link.href.startsWith('blob:')) URL.revokeObjectURL(link.href);
    link.removeAttribute('href'); link.hidden = true;
  };
  const kind = (): Kind => kindInput.value as Kind;
  const download = (value: unknown) => {
    const link = dialog.querySelector<HTMLAnchorElement>('#backup-download')!;
    if (link.href.startsWith('blob:')) URL.revokeObjectURL(link.href);
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
    link.href = url; link.download = `epicatlas-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`; link.hidden = false;
  };
  const commit = async (next: Workspace, message: string) => {
    if (blocked) throw new Error('Saved data could not be read. Restore a valid backup before making changes.');
    await saveWorkspace(next); data = next; clearDownload(); renderList(); resetForm(); say(`${message} Saved to your travel file. Close the editor to see your updated map.`);
  };
  let busy = false;
  const attempt = async (action: () => void | Promise<void>) => {
    if (busy) return;
    busy = true;
    const controls = [...dialog.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>('input, button, select')];
    const disabled = controls.map(control => control.disabled);
    controls.forEach(control => { control.disabled = true; });
    try { await action(); } catch (error) { say(error instanceof Error ? error.message : 'Could not save travel.'); }
    finally {
      controls.forEach((control, i) => { control.disabled = disabled[i]; });
      busy = false;
      updateSaveButton();
    }
  };
  function field(name: string, label: string, value = '', required = false): void {
    const wrapper = document.createElement('label'); wrapper.textContent = label;
    const input = document.createElement('input'); input.name = name; input.type = 'text'; input.value = value; input.required = required;
    wrapper.append(input); fields.append(wrapper);
  }
  function resetForm(): void {
    window.dispatchEvent(new Event('epicatlas:clear-route-preview'));
    editing = undefined; route = undefined; selectedCity = undefined; renderForm();
  }
  function updateSaveButton(): void {
    (dialog.querySelector('#save-record') as HTMLButtonElement).disabled = blocked || (kind() === 'locations' && !selectedCity) || ((kind() === 'roads' || kind() === 'rail' || kind() === 'water') && !route);
  }
  function renderForm(record?: any): void {
    existingFlight = kind() === 'flights' ? record : undefined;
    fields.replaceChildren();
    dialog.querySelector('#save-record')!.textContent = 'Save record';
    if (kind() === 'locations') {
      const p = record?.properties;
      selectedCity = record && record.geometry.type !== 'Point' ? { name: p.name, country: p.country || '', label: p.name, osmId: p.osmId || '', geometry: record.geometry } : undefined;
      field('name', 'City name', p?.name, true); field('country', 'Country', p?.country);
      fields.querySelector<HTMLInputElement>('[name="name"]')!.placeholder = 'City, region (when names repeat)';
      const search = document.createElement('button'); search.type = 'button'; search.textContent = 'Find city'; search.disabled = blocked;
      const feedback = document.createElement('p'); feedback.id = 'city-search-status'; feedback.setAttribute('role', 'status');
      feedback.textContent = selectedCity ? 'Saved city outline ready.' : record ? 'This older place has no boundary. Find its city to add an outline.' : 'Enter a city and country, then choose its outline.';
      const results = document.createElement('div'); results.id = 'city-results';
      fields.append(search, feedback, results);
      const attribution = document.createElement('p');
      attribution.append('Online lookup sends only city and country. Boundaries: ');
      const source = document.createElement('a'); source.href = 'https://www.openstreetmap.org/copyright'; source.target = '_blank'; source.rel = 'noopener noreferrer'; source.textContent = '© OpenStreetMap contributors';
      attribution.append(source); fields.append(attribution);
      for (const name of ['name', 'country']) fields.querySelector<HTMLInputElement>(`[name="${name}"]`)!.addEventListener('input', () => {
        selectedCity = undefined; results.replaceChildren(); feedback.textContent = 'Find the city to select its outline.'; updateSaveButton();
      });
      search.addEventListener('click', () => {
        const city = fields.querySelector<HTMLInputElement>('[name="name"]')!.value.trim();
        const country = fields.querySelector<HTMLInputElement>('[name="country"]')!.value.trim();
        if (!city) { feedback.textContent = 'Enter a city name first.'; return; }
        void attempt(async () => {
          feedback.textContent = 'Finding city outlines…'; results.replaceChildren();
          const response = await fetch(`${import.meta.env.BASE_URL}api/cities`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ city, country }) });
          const answer = await response.json();
          if (!response.ok) { feedback.textContent = answer.error || 'City search unavailable.'; return; }
          if (!Array.isArray(answer.results)) throw new Error('Invalid city search results.');
          feedback.textContent = answer.results.length ? 'Choose the matching boundary; check its region carefully. Only places with available outlines are listed:' : 'No city boundary found. Include its region, or try its community/municipality name. A point cannot be used as an outline.';
          for (const result of answer.results as CityResult[]) {
            validateBoundary(result.geometry);
            const choose = document.createElement('button'); choose.type = 'button'; choose.textContent = result.label;
            choose.addEventListener('click', () => {
              selectedCity = result;
              fields.querySelector<HTMLInputElement>('[name="name"]')!.value = result.name;
              fields.querySelector<HTMLInputElement>('[name="country"]')!.value = result.country;
              feedback.textContent = `Outline selected: ${result.name}. Save record to add it to your atlas.`;
              results.replaceChildren(); updateSaveButton();
            });
            results.append(choose);
          }
        });
      });
      field('date', 'Visit date (optional text)', p?.visitedDate);
    } else if (kind() === 'flights') {
      for (const end of ['from', 'to'] as const) {
        field(`${end}-code`, `${end === 'from' ? 'Departure' : 'Arrival'} airport code`, record?.[end]?.code, true);
        const input = fields.querySelector<HTMLInputElement>(`[name="${end}-code"]`)!;
        input.maxLength = 3; input.autocomplete = 'off'; input.style.textTransform = 'uppercase';
        const name = document.createElement('p'); name.setAttribute('role', 'status');
        name.textContent = record?.[end]?.name || 'Airport name and position are found automatically.';
        fields.append(name);
        input.addEventListener('blur', async () => {
          const code = input.value.trim().toUpperCase(); input.value = code;
          name.textContent = code ? 'Looking up airport…' : 'Enter a three-letter IATA code.';
          if (!code) return;
          try { const airport = await resolveAirport(code, record?.[end]); if (input.value === code) name.textContent = airport.name; }
          catch (error) { if (input.value === code) name.textContent = error instanceof Error ? error.message : 'Airport not found.'; }
        });
      }
      field('date', 'Flight date (optional text)', record?.date);
    } else {
      const p = record?.properties;
      if (!editing) {
        const mode = kind() === 'roads' ? 'road' : kind() === 'water' ? 'water' : 'rail';
        setupGroundJourney(fields, mode, value => { route = value as typeof route; updateSaveButton(); });
        field('name', 'Journey name (optional)'); field('date', 'Journey date (optional text)');
      } else {
        field('name', 'Journey name', p?.name); field('from', 'From', p?.from); field('to', 'To', p?.to);
        field('date', 'Journey date (optional text)', p?.date); field('source', 'Geometry source', p?.source);
      }
    }
    updateSaveButton();
  }
  function renderList(): void {
    list.replaceChildren();
    for (const group of ['locations', 'roads', 'rail', 'water', 'flights'] as const) {
      const records = group === 'flights' ? data.flights.flights : data[group].features;
      for (const record of records) {
        const p = 'properties' in record ? record.properties : record;
        const row = document.createElement('div'); row.className = 'saved-record';
        const edit = document.createElement('button'); edit.type = 'button';
        edit.textContent = `${group === 'locations' ? 'Place' : group === 'flights' ? 'Flight' : group === 'roads' ? 'Road' : group === 'water' ? 'Water' : 'Rail'} · ${'name' in p && p.name ? p.name : 'from' in record ? `${record.from.code} → ${record.to.code}` : p.id}`;
        edit.addEventListener('click', () => { window.dispatchEvent(new Event('epicatlas:clear-route-preview')); kindInput.value = group; editing = p.id; route = group === 'roads' || group === 'rail' || group === 'water' ? record as typeof route : undefined; renderForm(record); form.scrollIntoView({ block: 'nearest' }); });
        const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Delete'; remove.setAttribute('aria-label', `Delete ${edit.textContent}`);
        remove.addEventListener('click', () => attempt(async () => {
          const next = structuredClone(data);
          if (group === 'flights') next.flights.flights = next.flights.flights.filter((item) => item.id !== p.id);
          else next[group].features = next[group].features.filter((item) => item.properties.id !== p.id) as any;
          await commit(next, 'Record deleted.');
        })); row.append(edit, remove); list.append(row);
      }
    }
    if (!list.childElementCount) list.textContent = 'No saved personal travel yet.';
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const values = new FormData(form);
    void attempt(async () => {
      const next = structuredClone(data), group = kind();
      const value = (key: string) => String(values.get(key) || '').trim();
      const id = editing || `${group}-${crypto.randomUUID()}`;
      if (group === 'locations') {
        if (!selectedCity) throw new Error('Find and select a city outline before saving.');
        const record = { type: 'Feature' as const, geometry: structuredClone(selectedCity.geometry), properties: { id, name: value('name'), country: value('country'), visitedDate: value('date'), osmId: selectedCity.osmId, source: 'OpenStreetMap / Nominatim' } };
        next.locations.features = [...next.locations.features.filter((item) => item.properties.id !== id), record];
      } else if (group === 'flights') {
        const [from, to] = await Promise.all([resolveAirport(value('from-code'), existingFlight?.from), resolveAirport(value('to-code'), existingFlight?.to)]);
        next.flights.flights = [...next.flights.flights.filter((item) => item.id !== id), { id, from, to, date: value('date') }];
      } else {
        if (!route) throw new Error('Preview and review the route first, or import route geometry.');
        const updated = structuredClone(route);
        updated.properties.id = id;
        if (editing) for (const key of ['name', 'from', 'to', 'date', 'source'] as const) updated.properties[key] = value(key);
        else { if (value('name')) updated.properties.name = value('name'); updated.properties.date = value('date'); }
        next[group].features = [...next[group].features.filter((item) => item.properties.id !== id), updated] as any;
      }
      await commit(next, editing ? 'Record updated.' : 'Record added.');
    });
  });
  kindInput.addEventListener('change', resetForm);
  dialog.querySelector('#new-record')!.addEventListener('click', resetForm);
  openButton.addEventListener('click', () => { dialog.showModal(); delete dialog.dataset.routePreview; say(blocked ? loadError : 'Changes save automatically to your travel file on this device.'); });
  dialog.querySelector('#close-editor')!.addEventListener('click', () => dialog.close());
  dialog.querySelector('#show-personal')!.addEventListener('click', () => attempt(() => { if (blocked) throw new Error('Restore a valid backup first.'); window.location.reload(); }));
  dialog.querySelector('#export-travel')!.addEventListener('click', () => attempt(() => { if (blocked) throw new Error('Cannot export unreadable saved travel. Restore your backup first.'); download(data); say('Backup ready. Choose Download backup to save a copy.'); }));
  dialog.querySelector('#copy-travel')!.addEventListener('click', async () => {
    try {
      if (blocked) throw new Error('Cannot copy unreadable saved travel. Restore your backup first.');
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      say('Backup copied. Paste into a text file and save it with a .json extension.');
    } catch { say('Clipboard access failed. Use Export backup and Download backup.'); }
  });
  dialog.querySelector<HTMLInputElement>('#route-import')!.addEventListener('change', async (event) => {
    const input = event.target as HTMLInputElement, file = input.files?.[0]; if (!file) return;
    try {
      if (kind() !== 'roads' && kind() !== 'rail' && kind() !== 'water') throw new Error('Choose Road, Rail or Water before importing a route.');
      const group = kind() as 'roads' | 'rail' | 'water', imported = JSON.parse((await file.text()).replace(/^\uFEFF/, ''));
      if (imported.type !== 'FeatureCollection' || !Array.isArray(imported.features) || !imported.features.length) throw new Error('Import a normalized route FeatureCollection from the local route tool.');
      const next = structuredClone(data);
      next[group].features.push(...imported.features);
      await attempt(async () => { await commit(next, `${imported.features.length} route segments imported.`); });
    } catch (error) { say(error instanceof Error ? error.message : 'Could not import route.'); } finally { input.value = ''; }
  });
  dialog.querySelector<HTMLInputElement>('#backup-import')!.addEventListener('change', async (event) => {
    const input = event.target as HTMLInputElement, file = input.files?.[0]; restore = undefined;
    const button = dialog.querySelector<HTMLButtonElement>('#restore-travel')!; button.hidden = true;
    try { if (!file) return; restore = validateWorkspace(JSON.parse((await file.text()).replace(/^\uFEFF/, '')));
      const count = restore.locations.features.length + restore.roads.features.length + restore.rail.features.length + restore.water.features.length + restore.flights.flights.length;
      say(`Backup validated: ${count} records. Replace saved travel to restore this copy.`); button.hidden = false;
    } catch (error) { say(error instanceof Error ? error.message : 'Invalid backup.'); } finally { input.value = ''; }
  });
  dialog.querySelector('#restore-travel')!.addEventListener('click', () => attempt(async () => { if (!restore) return; await saveWorkspace(restore, 'restore'); data = restore; blocked = false; restore = undefined; clearDownload(); dialog.querySelector<HTMLButtonElement>('#restore-travel')!.hidden = true; renderList(); resetForm(); say('Backup restored to your travel file. Close the editor to see your updated map.'); }));
  renderList(); resetForm();
  openButton.disabled = false;
}
