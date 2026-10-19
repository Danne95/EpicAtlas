# Consolidation audit and validation

Audit date: 2026-10-17. This is the current validation record, not an active phase plan. Operating instructions are in [README.md](../README.md) and the focused guides.

## Scope and intended design

Reviewed root guidance, the documentation set, configuration, dependencies, application/server modules and offline tools. Available roadmap/decision/handoff documents supplied the staged-plan context; no separate original plan document was present at the project root.

Later explicit decisions take precedence: file-backed personal travel, selected city polygons, explicit acquisition and disabled regional rendering. Supported workflows include city/road/rail/water/flight editing, reviewed suggestions, normalized imports, backups, shared 2D/globe views, country highlighting and timeline/playback. No personal history was copied into source or fixtures.

## Findings and cleanup

| Finding | Resolution and source |
| --- | --- |
| Downloaded provenance/metadata could be read through development file URLs; the map handler also exposed regional JSON. Regional provenance can include recipe paths and travel reference IDs. | [Configuration](../vite.config.ts) denies direct access to the public folder; [localMaps](../server/localMaps.ts) serves only four runtime world files. Regional artifacts/provenance are inaccessible in dev/preview, and map requests use the shared local-access rule. |
| City-polygon and unreadable-file restrictions depended on the editor. An ordinary PUT could otherwise introduce point places or replace a bad workspace using its revision. | [Storage](../server/travelStorage.ts) enforces edit/restore/migrate intent under the write lock. Ordinary edits preserve unchanged points or convert/delete them; explicit restore retains recovery compatibility. First-file migration cannot replace an existing file. [Client](../src/data/workspace.ts) and [editor](../src/ui/editor.ts) send the operation marker. |
| Four API handlers duplicated host/origin/cross-site checks. | One [local request rule](../server/localAccess.ts), also used for map files. This is a localhost trust boundary, not account authentication. |
| Finite WGS84 coordinate rules were repeated across workspace, city, country, route and airport validation; the editor retained unused manual-coordinate field handling. | One [coordinate validator](../src/data/coordinates.ts) retains strict 2D points and legacy line extra dimensions, covered by range/type/dimension tests. Removed the unreachable numeric field branch. |
| The regional renderer was unreachable after its controls/startup wiring were removed. | Removed the browser loader/style, manifest validator/types, regional CSS and PMTiles dependency/transitive reader dependency. Offline preparation/cleanup entry points and installed assets were preserved. |
| Demo-only presentation was unreachable after schema validation required personal collections. Startup also wrapped already loaded data in artificial promises and repeated status logic. | Removed demo labels/branches, simplified [startup](../src/main.ts) to one category initialization path and shared timeline status, and removed three forwarding-only route modules. The legacy `demo: false` marker remains in stored contracts; the standalone importer retains its optional metadata flag. |
| Server/configuration code was omitted from the standard type check; the maintained test command was absent. | [Type configuration](../tsconfig.json) now covers client/server/config, with explicit Node types. [Package scripts](../package.json) expose check/test/tool-test/build commands and declare the bundler used by tests directly. |
| Invalid city/place/routing request bodies could be reported as provider outages. | [City lookup](../server/citySearch.ts) and [routing](../server/groundRouting.ts) reject malformed input with 400 before provider calls. |
| Dependency audit reported the indexed-source-map denial-of-service advisory in `source-map-js 1.2.1`. | Compatible lockfile patch to 1.2.2. Final package-manager audit returned zero known advisories; this is not a general security proof. |
| Documents mixed disabled detail with active workflows, omitted Water in several contracts, duplicated remaining-work lists and contained obsolete handoff/phase instructions. | Updated setup, configuration, all five record types, exposure rules and component responsibilities. Merged BACKLOG into [ROADMAP](ROADMAP.md), separated superseded choices in [DECISIONS](DECISIONS.md), and replaced the diary with this validation record. |

## Verified privacy properties

- Disposable sentinel files were inaccessible through direct, case-varied, raw/import, encoded and `/@fs/` paths in development/preview. Provenance and regional map URLs were refused; permitted runtime world range/HEAD reads still worked.
- All five API endpoints rejected unrelated origins, cross-site metadata and forged non-local hosts. Same-origin local access succeeded.
- Lookup tests used a localhost mock provider: city requests contained only lookup fields; route requests contained stop positions/profile and format controls. Cache reuse made no further provider request. Airport resolution stayed local.
- The actual build contained only `index.html` and three application assets: no workspace, map downloads, recipes, provenance, exports or source maps. Distinctive current workspace IDs/names were checked against shareable source/docs/tests/build without printing the values; no matches were found. This does not detect every possible encoding, transformation or short personal string.
- Fingerprints of all pre-existing files under `private/`, `public/maps/` and legacy `tools/regions/` matched before/after. Existing saved travel, backups, caches, recipes and installed geography were not changed. Audit checkpoints/evidence were added only under ignored `private/consolidation-audit/`.
- Ignore-rule samples were checked with a disposable Git metadata directory. The project itself has no Git repository, so actual tracked/staged files and repository history could not be audited. Any future initialization/public push still requires inspecting its actual index/artifacts.
- Historical ignored `.verification/` material was preserved; it is not the maintained suite and its older scripts can target superseded behavior. It is denied browser file access.

## Validation results

| Check | Result |
| --- | --- |
| Clean locked installation | `npm ci --offline` passed using cached packages |
| Types/build | `npm run build` passed, including client/server/config type checks |
| Unused symbols and module graph | TypeScript unused-local/parameter checks passed; all 37 application/server/config TypeScript modules were reachable from current entry points |
| [JavaScript suite](../tests/atlas.test.mjs), [client migration suite](../tests/workspace.test.mjs) | `npm test`: 10 passed |
| [Offline tool suite](../tests/test_tools.py) | `npm run test:tools`: 2 passed, including all three import modes, dateline/gap preservation, overwrite refusal, Water retention, stale plans and world preservation |
| Browser workflow | Headless Chrome on a separate synthetic atlas: all five entry types, saved-map refresh, categories/countries, 2D/globe, timeline/playback, actual JSON download, delete and restore from that downloaded file passed |
| Browser assets/layout | No page errors, external browser asset requests or regional requests; refreshed desktop and 390px mobile screenshots inspected |
| CLI help | Route import, regional builder and cleanup help commands passed |
| Dependency audit | Zero known advisories reported for the final lockfile |
| Artifact/private-data/link checks | Passed; no private values printed |

Browser checks used the production preview and local mock providers. Development and preview boundaries were separately exercised by the automated suite. The earlier canceled-download limitation is resolved for this automated Chrome environment; other browsers/devices still need their own backup check.

## Remaining limits and decisions

- Real geocoder/router availability and live provider response changes were not rechecked; mocks exercised the implemented protocol without sending personal queries. World/airport downloads and real regional extraction/removal were not rerun, preserving installed assets.
- This pass did not repeat every historical graphics edge case, large-workspace stress test or crash/fault-injection scenario. Locks, flushed replacements and conservative cleanup remain bounded mechanisms, not crash-proof multi-file transactions.
- Files are local and unencrypted; the local process/device trust assumptions remain. Static remote hosting does not supply the file API.
- The MapLibre application chunk still triggers Vite's size warning.
- No unresolved design decision blocks the documented local workflows. Optional extensions remain in [ROADMAP.md](ROADMAP.md). No push or deployment was performed.
