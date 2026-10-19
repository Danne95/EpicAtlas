import { datePeriod, matchesDate, type DateRange } from '../data/dates';
import { chronologyFrames } from '../data/chronology';
import { travelGroups, type TravelGroup, type TravelLayers } from '../map/travelLayers';

interface DatedRecord { id: string; date?: string; }
export function createTimeline(groups: TravelLayers, setStatus: (group: TravelGroup, text: string) => void) {
  const dialog = document.querySelector<HTMLDialogElement>('#timeline-dialog')!;
  const start = dialog.querySelector<HTMLInputElement>('#timeline-start')!;
  const end = dialog.querySelector<HTMLInputElement>('#timeline-end')!;
  const year = dialog.querySelector<HTMLInputElement>('#timeline-year')!;
  const include = dialog.querySelector<HTMLInputElement>('#timeline-undated')!;
  const status = dialog.querySelector<HTMLElement>('#timeline-status')!;
  const badge = document.querySelector<HTMLElement>('#timeline-summary')!;
  const records = new Map<TravelGroup, { items: DatedRecord[]; noun: string }>();
  let range: DateRange = { includeUndated: true };
  const play = dialog.querySelector<HTMLButtonElement>('#chronology-play')!;
  const mapPlay = document.querySelector<HTMLButtonElement>('#chronology-map-play')!;
  const mapControls = document.querySelector<HTMLElement>('#chronology-map')!;
  const progress = dialog.querySelector<HTMLInputElement>('#chronology-progress')!;
  const playbackStatus = dialog.querySelector<HTMLElement>('#chronology-status')!;
  const mapDate = document.querySelector<HTMLElement>('#chronology-map-date')!;
  const speed = dialog.querySelector<HTMLSelectElement>('#chronology-speed')!;
  let frames: string[] = [], index = 0, timer: number | undefined;
  let base: DateRange | undefined;
  function updatePlayback(): void {
    const running = timer !== undefined;
    play.textContent = running ? 'Pause' : 'Play'; mapPlay.textContent = running ? 'Pause playback' : 'Play playback';
    progress.disabled = !frames.length; progress.max = String(Math.max(0, frames.length - 1)); progress.value = String(index);
    mapControls.hidden = !frames.length;
    const text = frames.length ? `${frames[index]} · ${index + 1}/${frames.length} · ${running ? 'Playing' : index === frames.length - 1 ? 'Complete' : 'Paused'}` : 'Choose a range, then Play. Undated records follow the inclusion option.';
    playbackStatus.textContent = text; mapDate.textContent = text;
  }
  function pause(): void { if (timer !== undefined) window.clearInterval(timer); timer = undefined; updatePlayback(); }
  function showFrame(): void { range = { ...base!, end: frames[index] }; apply(); updatePlayback(); }
  function schedule(): void {
    timer = window.setInterval(() => {
      if (index < frames.length - 1) index++;
      showFrame();
      if (index === frames.length - 1) pause();
    }, Number(speed.value));
    updatePlayback();
  }
  function resetPlayback(): void {
    pause();
    if (!frames.length) return;
    index = 0; showFrame();
  }
  function apply(): void {
    const active = !!range.start || !!range.end || !range.includeUndated;
    let matched = 0, total = 0, unknown = 0;
    for (const group of travelGroups) {
      const data = records.get(group);
      if (!data) continue;
      const matching = data.items.filter((record) => matchesDate(record.date, range));
      groups.setRecordFilter(group, active ? matching.map((record) => record.id) : undefined);
      matched += matching.length; total += data.items.length;
      unknown += data.items.filter((record) => !datePeriod(record.date)).length;
      setStatus(group, `${active ? `${matching.length} of ` : ''}${data.items.length} ${data.noun}${data.items.length === 1 ? '' : 's'}`);
    }
    const selection = range.start || range.end ? `${range.start || 'Beginning'} → ${range.end || 'Latest'}` : range.includeUndated ? 'All history' : 'Dated history';
    badge.textContent = active ? `Timeline: ${selection} · ${matched}/${total} match` : 'Timeline: all history';
    status.textContent = `${selection}. ${matched} of ${total} records match; category switches still apply. ${unknown} have undated or unrecognized dates.`;
  }
  function selection(): DateRange {
    if ((start.value && (!datePeriod(start.value) || start.value.length !== 10)) || (end.value && (!datePeriod(end.value) || end.value.length !== 10))) throw new Error('Choose valid calendar dates.');
    if (start.value && end.value && start.value > end.value) throw new Error('Start date must be on or before end date. The previous filter is still active.');
    return { start: start.value || undefined, end: end.value || undefined, includeUndated: include.checked };
  }
  function readRange(): void {
    const next = selection();
    pause(); frames = []; base = undefined; index = 0;
    range = next;
    apply();
    updatePlayback();
  }
  const attempt = (action: () => void) => { try { action(); } catch (error) { status.textContent = error instanceof Error ? error.message : 'Could not apply timeline.'; } };
  function togglePlayback(): void {
    if (timer !== undefined) { pause(); return; }
    const next = selection();
    if (!frames.length || JSON.stringify(next) !== JSON.stringify(base)) {
      const nextFrames = chronologyFrames([...records.values()].flatMap((data) => data.items.map((record) => record.date)), next);
      if (!nextFrames.length) throw new Error('No recognized dated travel in this range. Apply timeline to view undated records.');
      frames = nextFrames; base = next; index = 0;
    } else if (index === frames.length - 1) index = 0;
    showFrame();
    if (frames.length > 1) schedule();
    dialog.close();
  }
  play.addEventListener('click', () => attempt(togglePlayback));
  mapPlay.addEventListener('click', () => attempt(togglePlayback));
  dialog.querySelector('#chronology-reset')!.addEventListener('click', resetPlayback);
  document.querySelector('#chronology-map-reset')!.addEventListener('click', resetPlayback);
  progress.addEventListener('input', () => { const position = Number(progress.value); pause(); index = position; showFrame(); });
  speed.addEventListener('change', () => { if (timer !== undefined) { pause(); schedule(); } });
  for (const input of [start, end, year, include]) input.addEventListener('input', pause);
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  window.addEventListener('pagehide', pause);
  dialog.querySelector('form')!.addEventListener('submit', (event) => { event.preventDefault(); attempt(readRange); });
  dialog.querySelector('#timeline-use-year')!.addEventListener('click', () => attempt(() => {
    if (!year.reportValidity() || !year.value) throw new Error('Enter a year from 1 to 9999.');
    const value = String(Number(year.value)).padStart(4, '0');
    start.value = `${value}-01-01`; end.value = `${value}-12-31`; readRange();
  }));
  dialog.querySelector('#timeline-reset')!.addEventListener('click', () => { start.value = ''; end.value = ''; year.value = ''; include.checked = true; readRange(); });
  const button = document.querySelector<HTMLButtonElement>('#open-timeline')!;
  button.disabled = false;
  button.addEventListener('click', () => dialog.showModal());
  dialog.querySelector('#close-timeline')!.addEventListener('click', () => dialog.close());
  apply();
  updatePlayback();
  return { setRecords(group: TravelGroup, items: DatedRecord[], noun: string): void {
    pause(); if (base) range = base; frames = []; index = 0; base = undefined;
    // A late-loaded category invalidates an old playback sequence but retains the selected range.
    records.set(group, { items, noun }); apply(); updatePlayback();
  } };
}
