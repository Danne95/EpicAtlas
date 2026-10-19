# Preserved regional artifacts

Regional rendering is disabled. The browser neither loads a manifest/PMTiles archive nor offers a detail control. Saving/viewing a city uses only its selected boundary and installed world geography. The obsolete browser renderer was removed; existing files and explicit offline tools remain available.

## Preparation format

[build-region.py](../tools/build-region.py) extracts from an existing local Protomaps v4 PMTiles archive using go-pmtiles. Source archives and recipes belong under `private/` or an explicitly chosen private directory. Outputs normally live under ignored `public/maps/regions/`.

The version 1 manifest has a `packs` array. Entries include a unique `id`, `name`, safe `.pmtiles` filename, `profile: "protomaps-v4"`, ordered `[west, south, east, north]` bounds, integer `minZoom`/`maxZoom`, `sizeBytes`, `sha256`, source/version/date/attribution/license and `travelReferences`. Split antimeridian regions into separate packs.

Each bundle contains the archive, matching license/provenance sidecars and a manifest entry. Provenance records the private recipe, source path, checksums and tool version; reference IDs can reveal associations with travel. These files are local artifacts, not public website assets, and are not served by development/preview or copied into builds.

The builder checks source checksum, profile/layers, metadata, coverage, extraction budget and go-pmtiles verification before publishing. It refuses existing output IDs/files. Structural verification does not inspect every tile feature. See [tools/README.md](../tools/README.md) for commands and interruption limits.

## Cleanup

The explicit [plan/apply workflow](REGIONAL_CLEANUP.md) recomputes references from the complete workspace. Hidden/date-filtered records retain packs. Unlisted files and world geography remain outside removal. No cleanup runs on record deletion or ordinary application startup.
