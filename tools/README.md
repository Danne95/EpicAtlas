# Development tools

## Airport catalogue

Run `python tools/install-airports.py` explicitly to install public-domain OurAirports data under ignored `private/maps/airports/catalogue.json`. Flights resolve three-letter IATA codes locally; no flight routes or dates are transmitted. Catalogue installation needs internet, while entry and rendering work offline afterward.

## World geography

Run `node tools/install-world.mjs` explicitly to install Natural Earth 1:10m land, coastlines, border lines and country polygons. Use `node tools/install-world.mjs --countries-only` to install country highlighting shapes while preserving the existing geography and its provenance. Downloads go only to ignored `public/maps/world/`; previous files and provenance are backed up privately and source hashes recorded locally. This tool requires internet. Saving locations never runs it or installs detailed regional maps.

## Regional cleanup

`cleanup-regions.py` previews unused regional packs using a current exported personal workspace with all saved personal records. Explicit apply removes eligible archives/sidecars with manifest entries after checking the preview is still current. World map data is excluded. See [REGIONAL_CLEANUP.md](../docs/REGIONAL_CLEANUP.md) for commands, coverage rules, and recovery limits.

## Route import

`import-route.py` converts local GPX, KML, and WGS84 GeoJSON into road/rail/water FeatureCollections. Separate segments remain separate; coordinates and metadata are validated before a new output file is created. See [ROUTE_IMPORTS.md](../docs/ROUTE_IMPORTS.md) for commands, supported formats, and review/storage guidance. Python 3.10+ is its only dependency.

## Regional preparation (offline artifacts only)

Regional rendering has been removed from the app. These tools remain available for explicit preparation or cleanup of existing assets; preparing an archive does not enable browser detail. Regional manifests/provenance are private artifacts and are not served or built.

`build-region.py` prepares regional detail from an existing **local Protomaps v4 PMTiles archive**. It selects intersecting tiles and zoom levels through the official go-pmtiles CLI. It uses Python's standard library and makes no network requests. Download source archives and the CLI separately before preparation.

## Requirements

- Python 3.10 or newer; no pip packages.
- [go-pmtiles CLI](https://docs.protomaps.com/pmtiles/cli). Version 1.31.2 was used in the earlier preparation checks; install an OS-appropriate binary from the official linked releases.
- A clustered PMTiles version 3 MVT archive with the layers required by the preserved Protomaps v4 preparation profile.

Install go-pmtiles separately and pass its path with `--pmtiles`, or put it on PATH.

## Prepare a private region

Create a version 1 recipe in `private/regions/` with ID/name, `profile: "protomaps-v4"`, local `sourceFile` and `sourceSha256`, requested `bounds`, `minZoom`, `maxZoom`, `maxBytes`, provenance (`source`, `sourceVersion`, `preparedDate`), `attribution`, `license`, `licenseUrl`, and `travelReferences` IDs. Use a local source archive covering the full requested bounds and zooms. No example archive is installed.

```powershell
python tools/build-region.py private/regions/my-region.json --source private/maps/source.pmtiles --pmtiles C:/Tools/pmtiles.exe --output-dir public/maps/regions
```

## Outputs and checks

- `ID.pmtiles`: local regional geometry archive.
- `ID-LICENSE.txt`: attribution, terms, source, extraction changes, and CLI version.
- `ID-provenance.json`: recipe, input/output hashes, CLI version, addressed tile count, and output header.
- `manifest.json`: app-compatible version 1 manifest, including size/hash and coverage.

Before publishing output, the tool checks the source checksum, profile/layers, metadata version, coverage, extraction size, output header, and archive structure via `pmtiles verify`. Structural verification does not inspect every MVT feature. Bounds select whole intersecting tiles, rather than clipping individual features or filtering OSM tags.

Preparation uses a temporary directory under the destination. Completed artifacts are published before the manifest; ordinary failures roll them back. Existing pack IDs/files are refused, and existing unrelated manifest entries are retained. A destination lock prevents simultaneous builds by this tool. If the process is forcibly stopped, inspect staged/orphaned files and the lock before retrying; publication is not a crash-proof multi-file transaction.

## Preserve a reviewed local bundle

For a new ID, run the same command with `--output-dir public/maps/regions`. The tool adds its manifest entry and artifacts without replacing existing packs. Inspect the output files locally; the current app does not display regional detail. To replace an existing ID, prepare it in a fresh directory first and review the output before explicitly replacing its archive, license, provenance, and manifest entry together. Provenance includes recipe paths and travel reference IDs; preserve it privately alongside the archive.

Never target `public/maps/world`. The tool refuses destinations under a directory named `world`. Basemap preparation does not edit travel records or perform unused-pack cleanup. See [REGIONAL_CLEANUP.md](../docs/REGIONAL_CLEANUP.md) for removal.
