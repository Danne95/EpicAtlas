# Travel data model

Locations accept Polygon/MultiPolygon city boundaries in addition to preserved legacy Points. New records are created from explicitly selected city search results, with optional `osmId` and `source` text. Polygon rings must be closed, contain valid longitude/latitude pairs and have nonzero area. Point records are retained for recovery and conversion but are not rendered as dots. Selected boundary geometry is stored with the travel record; candidate boundaries remain in the ignored local lookup cache.

Coordinates are WGS84 `[longitude, latitude]`. Contracts live in `src/types/travel.ts`; workspace validation is in `src/data/workspaceSchema.ts`, sharing coordinate rules from `src/data/coordinates.ts`. City/airport/lookup points require exactly two numbers. Legacy saved lines may retain finite extra dimensions; the route importer normalizes them to 2D.

## Workspace version 1

Backups contain `version: 1`, `locations`, `roads`, `rail`, `water` and `flights`. Older version 1 backups without `water` acquire an empty Water collection in memory; reading alone does not rewrite the file. Personal collections retain the compatibility marker `demo: false`; there is no demo renderer or dataset. IDs are nonempty and globally unique within a workspace. New editor records use category-prefixed UUIDs; imported segment IDs are retained. Empty collections are valid.

| Collection | Geometry / required fields | Optional metadata |
| --- | --- | --- |
| `locations` | Polygon/MultiPolygon FeatureCollection; preserved legacy Points; properties `id`, `name` | `country`, `visitedDate`, `osmId`, `source` |
| `roads` | LineString FeatureCollection; `id`, `mode: road` | `name`, `from`, `to`, `date`, `source`, `distanceMeters`, `geometryNote` |
| `rail` | Same as roads with `mode: rail` | Same as roads |
| `water` | Same as roads with `mode: water` | Same as roads |
| `flights` | Object with `demo` and `flights` array; records have `id`, `from`, `to` | `date` |

Flight endpoints contain `code`, `name`, `coordinates`. Ground endpoints are free-form labels, not location references. Each segment is an independent record.

## Validation

Coordinates must be finite and within geographic ranges. Ground lines need at least two positions. Optional distance must be finite and nonnegative; optional metadata is text. Validation precedes persistence/restore so invalid records cannot partly save.

Flights store endpoints; locally sampled great-circle geometry splits at the antimeridian. Antipodal endpoints require a waypoint and are rejected. Curves are illustrative, not actual aircraft tracks. Globe arcs have stylized visual height based on angular distance; altitude is not stored or inferred from travel records.

Imported route geometry is retained after normalization; the importer does not infer alignment, distance or dates. The editor also saves reviewed BRouter road/rail suggestions with the provider's distance/source, or local approximate water connections with calculated distance. Suggested paths are not recorded traces; water connections do not follow shipping lanes or avoid land. Source and `geometryNote` record that distinction. No journey date is inferred. See [ROUTE_IMPORTS.md](ROUTE_IMPORTS.md).

The server checks ordinary edits against the previous workspace: a Point can remain unchanged, be deleted or become a polygon; new/edited places must be polygons. Full validated restore and first-file legacy migration preserve older point records. Restore is a replacement, not a merge.

## Dates and references

Dates remain optional text. Valid `YYYY`, `YYYY-MM`, `YYYY-MM-DD` represent calendar periods; other text is unrecognized/undated. Partial periods match inclusive overlapping ranges. See [TIMELINE.md](TIMELINE.md).

Every stored record retains regional references, even while hidden. Cleanup recalculates geometry coverage rather than trusting manifest IDs. See [REGIONAL_CLEANUP.md](REGIONAL_CLEANUP.md), [TRAVEL_EDITOR.md](TRAVEL_EDITOR.md) for storage and [MAP_DATA.md](MAP_DATA.md) for example provenance.
