import { travelGroups, type TravelGroup, type TravelLayers } from '../map/travelLayers';

export function createFilters(groups: TravelLayers) {
  const container = document.querySelector('#layer-controls')!;
  const statuses = new Map<TravelGroup, HTMLElement>();
  for (const group of travelGroups) {
    const label = document.createElement('label');
    label.className = `layer-option layer-${group}`;
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = groups.isVisible(group);
    const text = document.createElement('span');
    const name = document.createElement('span');
    name.className = 'layer-name';
    name.textContent = group[0].toUpperCase() + group.slice(1);
    const status = document.createElement('span');
    status.className = 'layer-count';
    status.textContent = group === 'locations' ? 'Loading places…' : 'No routes yet';
    statuses.set(group, status);
    text.append(name, status);
    label.append(checkbox, text);
    checkbox.addEventListener('change', () => groups.setVisible(group, checkbox.checked));
    container.append(label);
  }
  document.querySelector('#layer-loading')!.remove();
  return { setStatus(group: TravelGroup, text: string): void { statuses.get(group)!.textContent = text; } };
}
