# Architecture

Vite bundles TypeScript, MapLibre, its worker and CSS. One MapLibre map switches between Mercator and globe projections while retaining the camera focus, travel categories and timeline. There is no remote map style, tile service, font or sprite configured.

## Responsibilities

| Area | Responsibility |
| --- | --- |
| `src/main.ts` | Load the workspace/geography, initialize rendering and connect controls |
| `src/types/travel.ts` | Shared personal-record contracts |
| `src/data/workspaceSchema.ts` | Workspace validation, empty default and backward-compatible missing Water collection |
| `src/data/coordinates.ts` | Shared finite WGS84 coordinate checks with strict 2D point validation |
| `src/data/workspace.ts` | Local API client, legacy browser migration and safe refresh after changes |
| `server/travelStorage.ts` | Revision checks, edit/restore/migration rules, write lock, flushed replacement and previous-file backup |
| `server/localAccess.ts` | Shared localhost host/origin/cross-site request rule |
| `server/localMaps.ts`, `vite.config.ts` | Four-file world geography allowlist, byte ranges, filesystem restrictions and build exclusion |
| `server/citySearch.ts`, `src/data/cityBoundary.ts` | Explicit city/place lookup, validated polygons and private cache |
| `server/groundRouting.ts`, `src/data/groundJourney.ts`, `src/ui/groundJourney.ts` | Named stops, reviewed road/rail suggestions and private cache |
| `src/data/waterJourney.ts` | Local approximate port connections, without shipping-network routing |
| `server/airports.ts`, `src/data/airports.ts` | Offline airport-code lookup; preserve existing flight endpoints when editing |
| `src/map/routePreview.ts` | Temporary reviewed-route preview without storage writes |
| `src/map/travelLayers.ts`, `src/ui/filters.ts` | Shared category/date visibility and additive subscriptions |
| `src/map/locations.ts`, `groundRoutes.ts`, `flights.ts` | Saved geometry, safe text popups and interaction |
| `src/map/cityWalls.ts`, `flightArcs.ts`, `flightArcGeometry.ts` | Globe boundary sheets and elevated illustrative flight ribbons/picking |
| `src/data/countries.ts`, `src/map/countries.ts` | Local country-shape validation, unambiguous place matching and optional highlights |
| `src/data/dates.ts`, `chronology.ts`, `src/ui/timeline.ts` | Calendar periods, event frames and playback timer |
| `src/ui/editor.ts` | Record forms, validated imports, export/copy and explicit full restore |
| `tools/` | Explicit asset installation, route normalization, regional preparation and reviewed cleanup |

## Main flow

Startup reads and validates the private workspace through `/api/travel`. If the file is absent, valid legacy browser data is copied to disk or an empty workspace is created. The browser copy is retained. Existing disk data takes precedence. An unreadable file/legacy copy blocks ordinary editing; the map can still show available world geography without overwriting the bad data.

All five travel categories initialize from the same validated workspace. Category switches and timeline IDs jointly control geometry, hit layers, lists, globe walls/arcs and country highlights. These are session state; they never change stored records.

Save validates the full workspace in both client and server, checks its revision under a write lock, flushes a temporary file, retains the previous file as `workspace.json.bak` and renames the replacement. Ordinary edits may retain unchanged legacy points, delete them or convert them to polygons; they cannot create/edit point places. Explicit migration is allowed only while no file exists. Explicit restore can replace unreadable data and preserve old point records. The operation marker expresses intent; it is not a separate authentication mechanism.

Successful saves notify other tabs using BroadcastChannel. Focus/visibility checks also detect file revision changes. Refresh waits for an open dialog or route preview to finish. Closing the editor or Show my travel applies the saved workspace.

## Data and service boundaries

| Boundary | Permitted exposure |
| --- | --- |
| `/api/travel` | Complete personal workspace to the local app; GET and revision-checked PUT only |
| `/api/cities`, `/api/places` | Explicit city/country or place query to the configured geocoder; no dates or saved history |
| `/api/routes` | Explicit ordered stop coordinates/profile to the configured router; no journey names or dates |
| `/api/airports` | One code resolved from a local catalogue; no external request |
| `/maps/world/{land,borders,coastline,countries}.geojson` | Installed runtime geography to the local browser, including HEAD/range reads |
| Other installed maps, provenance, recipes and private files | No browser file endpoint; never copied into `dist/` |
| Export/copy | Full personal workspace to a user-selected file or clipboard; treat it as private |

All API and map handlers share the local request rule. Development/preview bind to loopback. There are no remote user accounts, encrypted storage or protection against another trusted process on the same device. Static deployment alone does not implement the local API.

`private/`, `public/maps/` and legacy `tools/regions/` are ignored. Vite disables public-folder serving/copying, denies direct development file access to those folders, and serves only runtime geography through its dedicated handler. Provenance can contain paths/reference IDs even when its underlying geography came from public sources; it remains local.

Regional browser modules and the PMTiles runtime dependency were removed after regional display was disabled. The Python preparation/cleanup entry points and installed assets remain. No regional manifest/archive is requested by the app. See [REGIONAL_PACKS.md](REGIONAL_PACKS.md).
