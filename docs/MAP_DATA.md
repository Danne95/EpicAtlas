# Map sources and licenses

## Global overview

Local Natural Earth 1:10m assets provide finer world geography; ocean is a background layer. A separate coastline source draws only real coastlines, avoiding internal seams between land polygons. These are overview datasets, not street-level or survey geometry.

| Asset | Source |
| --- | --- |
| `public/maps/world/land.geojson` | [Natural Earth land](https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_land.geojson) |
| `public/maps/world/coastline.geojson` | [Natural Earth coastline](https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_coastline.geojson) |
| `public/maps/world/borders.geojson` | [Natural Earth boundary lines](https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_boundary_lines_land.geojson) |
| `public/maps/world/countries.geojson` | [Natural Earth country polygons](https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson), with names/codes retained for matching saved places |

Natural Earth is public domain under its [terms of use](https://www.naturalearthdata.com/about/terms-of-use/). Upstream URLs may change; ignored local assets are runtime inputs and are excluded from build output. World assets are excluded from cleanup.

## Personal travel and regional detail

No demo travel or detailed regional assets are bundled. Personal entries remain in the ignored `private/travel/workspace.json` file. Keep route sources, licenses and exported backups in `private/` or outside the repository. Regional rendering is removed: saving or viewing a place does not fetch street/building tiles or install regional packs. Only explicit lookup/preview and tool installation actions contact data providers.

Install or update world geography explicitly with `node tools/install-world.mjs`. It validates all four downloads before installation, backs up previous geography under `private/maps/world-backups/`, and writes source URLs, installation date and hashes to ignored `public/maps/world/provenance.json`. Use `node tools/install-world.mjs --countries-only` to add/update country polygons without replacing installed land, coastlines or border lines. Provenance entries for the other assets and private boundary overrides are preserved. The app only loads installed country shapes locally; enabling highlights never invokes the downloader.

City boundaries are explicitly searched through Nominatim using city/country only, then cached in ignored `private/maps/cities/`. Selected outlines are stored as GeoJSON polygons in the private workspace with OSM object IDs and source metadata. Nominatim returns OSM administrative geometry where available; no boundary means no city record can be created by search. See the [usage policy](https://operations.osmfoundation.org/policies/nominatim/) and [OpenStreetMap attribution/ODbL terms](https://www.openstreetmap.org/copyright). Saved outline rendering has no remote dependency.

## Runtime

Explicit ground-journey searches resolve points through Nominatim; BRouter generates `car-fast` road or `rail` network suggestions. Both rely on OpenStreetMap with attribution. Place results share the private city-search cache and rate lock; route geometry is cached under `private/maps/routes/`, separately from installed basemaps. Only stop names/coordinates and routing mode leave the device for these explicit actions; visit dates and saved history are not sent. Route previews and saved routes request no detailed map tiles. Source geometry is a suggestion for review, not proof of the route taken.

MapLibre JavaScript, CSS and worker are bundled locally; the worker uses Vite's `?worker&url` integration. No remote style, tiles, glyphs, sprites or fonts are configured. The app serves only the four runtime world GeoJSON assets over localhost; installed provenance and all regional artifacts remain inaccessible to the browser. Source acquisition and installation are separate from offline viewing.

## Airport catalogue and water

`python tools/install-airports.py` explicitly downloads [OurAirports data](https://ourairports.com/data/) from its published CSV feed into ignored `private/maps/airports/catalogue.json`, retaining its source hash and public-domain classification. Airport-code lookups read only that local catalogue. Existing saved flight endpoints remain usable without it.

Water connections use the same local spherical geometry as flight paths between selected ports, without a shipping network or land avoidance. No sea-routing provider is contacted. Exact user-imported tracks retain their own source/license obligations.
