# Timeline filtering

Open **Timeline** from the map. It applies to the saved personal dataset across locations, roads, rail, water and flights.

## Controls

- Enter a year and choose **Use year** for January 1 through December 31.
- Set optional start/end dates and choose **Apply timeline**. Empty start means no lower limit; empty end means no upper limit. Both endpoints are inclusive.
- **Include undated / unrecognized dates** controls records without a supported date. It starts enabled; apply the filter or use a year after changing it.
- **All history** clears dates/year and includes undated records. Category switches retain their current state.
- A reversed range reports an error and keeps the previously applied filter. Inputs edited without applying do not change the map.

Timeline matching counts describe date matches before category visibility switches. A matched record in a disabled category is still hidden. Filters reset to all history on reload or when Show my travel refreshes the page; display state is not part of the travel backup.

## Date interpretation

`src/data/dates.ts` recognizes trimmed Gregorian calendar text in these exact formats:

| Stored date | Meaning |
| --- | --- |
| `YYYY-MM-DD` | That day |
| `YYYY-MM` | The entire calendar month |
| `YYYY` | The entire year |
| Missing, empty, invalid, free-form, or timestamp text | Undated/unrecognized for filtering |

Years are 0001–9999. Months/days and leap years are checked without timezone conversions or permissive JavaScript date parsing. Partial dates match when their represented period overlaps the selected range; they do not acquire an invented exact day. For example, `2024-06` matches June 15, 2024, while `2024-07` does not. Invalid `2023-02-29` is unrecognized. Original stored text is retained for editing and labels.

Locations use `visitedDate`; every journey uses `date`. No journey date is inferred from geometry, point timestamps, source metadata, or endpoints.

## Map behavior

`src/ui/timeline.ts` tracks the dates of loaded records and selects matching IDs. `TravelLayers` applies those IDs to every main, glow, and hit layer in the category; independently selected layer visibility remains intact. New layers/data inherit the current filter if they finish loading later.

Place lists hide excluded records. The Water view button hides when no segment matches and frames only matching geometry otherwise. All route categories filter geometry, hit areas and popups. Changing a date filter dismisses existing popups and clears pointer cursors. Travel source geometry and saved files remain unchanged. Regional rendering is disabled; the explicit cleanup tool still considers every stored record, including hidden travel.

## Chronology playback

Choose **Play** to reveal cumulative history within the selected range. The dialog closes so the map is visible; a floating bar shows the current date/step and offers pause/resume and Restart playback. Open Timeline again to change speed or seek using Chronology position.

- Frames are sorted unique dated-event boundaries plus the selected range boundaries. Empty gaps are skipped; this is event playback, not a constant number of calendar days per second.
- Slow advances every 1.5 seconds, Normal every 0.8 seconds, and Fast every 0.25 seconds. Changing speed reschedules a running timer.
- A partial year/month appears when its period first overlaps the cumulative range. That boundary does not assert an exact journey day. Undated records remain visible throughout if inclusion is enabled.
- Seeking pauses playback. Restart pauses and returns to the first frame. Play resumes from a paused frame or restarts a completed sequence. Playback stops at its last frame; a single dated frame completes immediately.
- Applying a year/range or All history stops and clears playback. Editing range fields pauses it; applying is still explicit. A range with no recognized dated travel reports a message instead of starting a timer.
- Background tabs and page exit pause timers. Reload/dataset changes reset playback. Late-loaded travel invalidates the event sequence and retains the selected date range.
- Category switches remain independent. Playback changes only timeline filtering, not travel records, personal storage, geometry, camera position, or regional references.

`src/data/chronology.ts` builds event frames from existing calendar periods. `src/ui/timeline.ts` owns the timer, base range, position, speed and control state. Manual range fields retain the chosen playback bounds while the current cumulative end advances separately.
