# Local travel editor

Open **Edit travel** from the map. Personal records save automatically to `private/travel/workspace.json` on this device through the local atlas server. New workspaces are empty; there is no demo view.

## Add and edit

- **Place:** enter a city and country, choose **Find city**, select the matching boundary, then **Save record**. No coordinates are needed. The visit date remains optional.
- **Flight:** departure and arrival three-letter IATA codes plus an optional date. Names and coordinates resolve from the private offline airport catalogue; the form requires no manual coordinates. Unknown or ambiguous codes are rejected without changing saved travel. Editing a saved flight's date preserves its existing endpoint data. Great-circle geometry is generated locally; unsupported antipodal endpoints are rejected.
- **Road / Rail:** choose the mode, enter departure and arrival cities/addresses (stations recommended for rail), then use **Find place** and select each match. Add optional intermediate stops in travel order. Choose **Preview route**, review the sketch or **View route on world map**, then return with **Back to route form**. Tick **This suggested path matches my journey**, add an optional name/date, and **Save record**. Close the editor to refresh saved travel. Changing a stop invalidates the old preview. Normalized GeoJSON import remains available for exact recorded paths; saved segments can be selected to edit their metadata.
- **Water:** find/select departure and arrival ports and optional stops, preview the locally calculated connection, then review it before saving. It can cross land and does not follow shipping lanes. Import a normalized recorded track for exact geometry. Water has its own cyan layer and timeline dates.

- Select saved records to edit them. **Save record** saves a new entry or updates the selected record. **Clear form** clears the fields and starts a new entry without saving. **Delete** removes a record from the saved file. Separate imported segments preserve gaps.

Road previews use BRouter's `car-fast` profile; rail previews use its `rail` profile. These are suggested network paths, not historical GPS traces or train timetables. Some connections cannot be routed; no straight-line fallback is saved. Find place sends only the entered place name to Nominatim; road/rail Preview route sends ordered stop coordinates and the routing profile to BRouter. Dates and journey names remain local. Successful lookup/road/rail results are cached privately for reuse and saved geometry renders offline. Water preview is calculated locally. Explicit place search shares the city geocoder's cache/throttle; there is no autocomplete. Only route geometry is acquired, not street/building map packs.

Changes save before success is reported. **Show my travel** reloads the map from the file. Invalid imports and duplicate IDs cannot partly save. A failed save retains the prior file and the current form. Dates are optional text, allowing approximate years or months without invented precision.

## File storage and privacy

`src/data/workspaceSchema.ts` defines and validates the version 1 workspace. `src/data/workspace.ts` is the browser client; `server/travelStorage.ts` provides the localhost file API in both Vite dev and preview.

- `private/travel/workspace.json`: complete saved workspace.
- `private/travel/workspace.json.bak`: previous file, replaced on the next successful save.
- `workspace.json.lock` and temporary files: transient write protection. A leftover lock after a forced interruption requires inspection before removal.

The ignored `private/` directory is excluded from Git and builds. Files are not publicly served. Travel is accessed only through the local atlas API; unrelated web origins are refused. All browsers and ports using this project directory share the same physical file. Clearing browser data does not clear travel. Moving to another device requires copying the file or restoring an export.

The server enforces normal-edit versus restore/migration rules as well as schema validation. A normal save cannot overwrite an unreadable workspace or create/edit a legacy point place. Full validated restore is explicit; legacy migration is allowed only if no disk file exists. Local request checks are shared by every API and the world-map handler; there are no account logins or storage encryption against other device users/processes.

Writes validate the full workspace, use a flushed temporary file and rename, and check a file revision under a lock to reject concurrent stale saves. The previous file is copied to the backup before replacement. The API accepts workspaces up to 25 MB. Keep separate periodic backups for protection against device loss; the one previous-version copy is not a full history.

On first use, if no travel file exists, a valid legacy `epicatlas.travel.v1` browser workspace is copied to disk automatically. Its browser copy is retained. An existing disk file takes precedence. Unreadable disk or legacy data is never silently overwritten: ordinary edits are blocked until the user explicitly restores a validated backup. The unreadable disk file is retained as the previous-version backup during that restore.

Run the local atlas server for editing. A separately hosted static site has no access to this file API and cannot save travel on the device through this workflow.

## City outlines

The city picker requests OpenStreetMap administrative/municipal boundary polygons through Nominatim. A city outline represents the returned boundary, not its built-up footprint. Some settlements have no polygon; the picker reports that limitation and never substitutes a dot. Legacy Point records are retained in backups but are not drawn; edit them and find their city to add a boundary without losing the visit date or record ID.

Only city and country are sent in an explicitly triggered lookup. Dates and saved travel are not sent. The local server caches candidate polygons under ignored `private/maps/cities/`; the selected geometry, OSM identity and source are saved inside the private travel workspace. Saved outlines render offline and obey category, date and playback filters. The place list frames the full boundary on selection.

The [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/) requires attribution, identified requests, caching, no autocomplete and at most one request per second. The proxy enforces a shared lookup lock and rate limit; typing alone makes no request. Set `EPICATLAS_GEOCODER_URL` before starting the server to switch to a compatible search provider. First-time lookup requires network access; cached lookups and saved geometry do not. Forced interruption during lookup may leave `private/maps/cities/.search.lock`; inspect it before removal if no search is running.

## Configuration

Set service URLs in the server process environment before startup. `EPICATLAS_GEOCODER_URL` overrides the Nominatim-compatible search endpoint; `EPICATLAS_ROUTER_URL` overrides the BRouter-compatible routing endpoint. PowerShell uses `$env:EPICATLAS_ROUTER_URL = 'https://your-compatible-provider.example/route'`. These are server settings, not browser `VITE_` variables. Merely starting the server makes no provider request. Choosing another endpoint changes the cache key and the recipient of explicit query/stop data; UI attribution remains Nominatim/BRouter/OpenStreetMap, so use compatible services with appropriate source attribution.

The local catalogue at `private/maps/airports/catalogue.json` is installed explicitly with `python tools/install-airports.py`. Entry and rendering then work offline; flights never invoke an airport download automatically. Install world geography separately with `node tools/install-world.mjs`.

## Export and restore

1. **Export backup**, then **Download backup**, saves an additional complete JSON copy.
2. **Copy backup** is available if downloads are blocked; save the copied text as JSON.
3. Choose a workspace backup. Validation reports the record count without changing the saved file.
4. **Replace saved travel with backup** explicitly replaces the full workspace, preserving the previous disk file as `workspace.json.bak`. This is replacement, not merge.
5. **Show my travel** displays restored records.

Exports omit map assets and display/filter state. Store exports, source routes and recipes in `private/` or outside the project.

## Regional cleanup

Use a fresh export or the complete current `private/travel/workspace.json` as input to the explicit [cleanup workflow](REGIONAL_CLEANUP.md). Do not edit travel while planning/applying cleanup. Hidden or date-filtered records retain their maps.
