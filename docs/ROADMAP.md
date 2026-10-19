# Remaining work and optional extensions

The supported system includes 2D/globe rendering, file-backed city/road/rail/water/flight editing, reviewed suggestions, exact route imports, backup recovery and timeline/playback. Regional rendering is disabled; preparation and conservative cleanup tools remain.

Current verification evidence and limits are in [DEVELOPMENT_LOG.md](DEVELOPMENT_LOG.md). Before relying on backups in a different browser/device, confirm downloading and restoring a disposable export there. No personal-history population is part of the source project.

## Deferred until needed

- Group independent segments into one journey.
- Larger-data storage, synchronization, encryption or desktop packaging.
- Offline routing engines or GPS service imports.
- Additional regional preparation profiles or raw OSM tile generation; these would not re-enable browser detail automatically.
- More exact ground coverage and stronger interrupted-cleanup/installation recovery.
- Geographic labels with local font assets.
- An equal-area map projection.

There is no required phase sequence or automatic continuation. The user's current request controls scope.
