# Design decisions

## Current contracts

- Vite, TypeScript and MapLibre provide a bundled local browser application and localhost APIs. The lockfile fixes dependency versions.
- The atlas and globe share one map; switching projection never acquires assets or writes travel.
- City places use selected Polygon/MultiPolygon boundaries. Legacy points survive migration/backup/restore without rendering dots and require conversion before editing.
- Personal travel lives in `private/travel/workspace.json`, empty by default, with validated saves/restores, conflict checks and a previous-version backup.
- Dates are optional text. Recognized calendar periods use inclusive overlap; playback reveals cumulative event history. Filters are session state only.
- Flights store endpoints and derive illustrative geometry locally. Road/rail suggestions are explicitly requested and reviewed; imported segments preserve gaps. Water connections are calculated locally and can cross land.
- All network acquisition is explicit: geocoder search, routing preview, world installation or airport-catalogue installation. Successful lookup geometry is cached privately.
- Runtime world geography has a narrow local allowlist. Download metadata, regional manifests/provenance, recipes and travel are excluded from direct file serving and builds.
- Offline regional preparation/cleanup remain explicit tools. Cleanup recomputes coverage from all stored travel, including water and hidden/undated records; uncertainty retains packs and world geography is excluded.

## Superseded approaches and rationale

The staged map/detail/editor/cleanup/timeline plan is background. Later decisions control the supported system:

- **Regional detail by viewport/zoom:** disabled in favor of world geography plus saved travel. The unreachable browser loader, styles, manifest validator and PMTiles reader were removed; offline artifact tools remain to preserve existing workflows/assets.
- **Coordinate dots for places:** replaced with explicit city-boundary selection. Keeping legacy records prevents data loss while conversion remains user-directed.
- **Browser-local travel and demo views:** replaced with one private disk workspace. Browser storage remains only as a preserved migration source; there is no bundled travel fallback.
- **Manual flight coordinates / import-only ground entry:** the editor now resolves airport codes offline and offers reviewed road/rail suggestions and approximate water connections. Exact normalized file import remains supported.
- **Development diary as current instructions:** operating contracts live in the focused guides, remaining work in [ROADMAP.md](ROADMAP.md), and audit evidence/limits in [DEVELOPMENT_LOG.md](DEVELOPMENT_LOG.md). Old phase/pause instructions do not limit a later authorized task.

These choices preserve local ownership and offline viewing without promising navigation-grade reconstruction of historical travel.
