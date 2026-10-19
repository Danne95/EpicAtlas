# Local route import

The editor also supports reviewed road/rail suggestions and approximate water connections from named stops; see [TRAVEL_EDITOR.md](TRAVEL_EDITOR.md). File import is the alternative for actual recorded paths or routes unavailable through the routing service.

`tools/import-route.py`, a Python 3.10+ standard-library importer. It accepts local GPX, KML, and WGS84 GeoJSON and writes the road/rail/water FeatureCollection format. It makes no network requests and does not require a routing engine.

## Commands

From the project root, choose a mode and stable ID prefix, and keep inputs and outputs private:

```powershell
python tools/import-route.py private/routes/journey.gpx --mode road --id journey --output private/routes/normalized/journey.geojson
```

KML and GeoJSON use the same options. No sample route files are bundled. Review imported geometry before saving it to your personal workspace.

## Supported input

| Format | Imported paths |
| --- | --- |
| GPX | Every `trk/trkseg` and `rte`, in document order; track/route names retained |
| KML | Placemark LineStrings, including MultiGeometry, and Google `gx:Track` coordinates, including MultiTrack |
| GeoJSON | LineString, MultiLineString, Feature, FeatureCollection, and nested GeometryCollection |

GPX uses longitude/latitude attributes; KML uses longitude then latitude; GeoJSON requires WGS84 `[longitude, latitude]`. See the [GPX schema](https://www.topografix.com/GPX/1/1/), [KML reference](https://developers.google.com/kml/documentation/kmlreference), and [GeoJSON specification](https://www.rfc-editor.org/rfc/rfc7946) for source format definitions. `--format` overrides unrecognized file extensions. KMZ, projected coordinates, legacy GeoJSON CRS declarations, polygons, and XML DTD/entity declarations are unsupported. Standalone waypoints are ignored; a waypoint-only input fails because it contains no route geometry.

## Normalization rules

- Select `--mode road` or `--mode rail` or `--mode water` explicitly. Input geometry does not determine the travel mode.
- Each source segment becomes a separate LineString feature; gaps never receive connecting lines. MultiLineStrings are flattened into separate features.
- Output IDs are `PREFIX-001`, `PREFIX-002`, and so on, in parsed segment order. The same input/options produce the same IDs; choose different prefixes for distinct imports. Reordering input changes segment IDs.
- Coordinates must be finite numbers within longitude/latitude ranges. Segments with fewer than two positions or only one distinct position fail the entire import before output is written.
- Altitude and per-point times are omitted from the 2D output. Consecutive duplicate positions are collapsed. Antimeridian crossings are split at ±180 with linearly interpolated boundary points, avoiding a false line across the world; those extra parts receive separate IDs.
- Optional `name`, `from`, `to`, `date`, and `source` text can be overridden for all features through CLI options. GeoJSON text fields are retained when no override is given. GPX/KML names are retained. Missing source becomes a format/filename note, without an absolute personal file path.
- Date remains optional text, matching the app's current schema. Point timestamps do not silently become a journey date. Source IDs/modes, arbitrary properties, source distances, and extensions are omitted. No distance, road alignment, or map matching is invented.
- Collection `demo` defaults to `false`. The standalone tool retains `--demo` as a metadata option for illustrative outputs; it does not activate any demo view in the atlas. The editor imports reviewed features as personal records. Each feature has `mode`, a unique `id`, and an explanatory `geometryNote` matching workspace validation.

## Review and use

The importer writes a new file and refuses existing output paths. It validates the entire input before creating the output; a failed ordinary write removes the incomplete new file. It does not append, merge, or replace the app's installed collections. Review the resulting geometry and retain source attribution/license alongside derived data as appropriate.

The travel editor imports reviewed normalized files into the private file-backed personal workspace. Choose Road, Rail or Water before selecting the file; its mode must match the imported features. Close the editor or choose Show my travel to apply saved data to the map. Keep private source files and backups in ignored `private/` or outside the project. See [TRAVEL_EDITOR.md](TRAVEL_EDITOR.md).

For cruises and boat journeys, choose Water in the editor. Find and select departure/arrival ports, optionally add intermediate stops, then preview and review the connection before saving. Connections are calculated locally and may cross land; they do not follow shipping lanes. Import normalized GeoJSON for an exact recorded path. Select each imported record to add its name, departure/arrival ports and optional date. Water has its own cyan map layer and timeline filter.
