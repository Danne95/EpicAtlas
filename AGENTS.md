# EpicAtlas project guidance

Read `docs/README.md` for project context. Work in focused steps and run checks relevant to the change.

`npm run check` covers browser/server/configuration types. `npm test` uses synthetic local workspaces/providers; `npm run test:tools` checks offline tools with Python. Never exercise destructive workflows against the user's real travel or installed maps during checks.

Places are city outlines, not coordinate dots. Preserve legacy point records, but require a selected polygon boundary for new or edited places. Keep geocoder searches explicit and cache downloaded boundaries privately.
Detailed regional basemaps are disabled. Saving or viewing a city must not download or activate street/building assets. Global geography installation is an explicit tool action.

## Private data

- Treat all user-supplied travel entries, source routes, exports, downloaded map assets, and region recipes as private.
- Store personal inputs, generated route files, backups and recipes under ignored `private/` or an explicitly supplied private directory. Never put real personal data in source code, documentation, committed fixtures, or UI examples.
- Travel entries belong in `private/travel/workspace.json`, accessed through the local atlas server; never add a bundled personal dataset or a demo fallback. Browser storage is only a preserved legacy migration source.
- Installed downloaded maps belong in ignored `public/maps/`. Keep dev/preview map serving separate from build output; never copy these assets or `private/` into `dist/`.
- Serve only the four runtime world GeoJSON datasets through `/maps/world/`. Regional artifacts and provenance can contain private paths/references; do not expose them through generic static serving.
- Preserve saved files and legacy browser data when changing application behavior. An unreadable workspace must remain untouched until the user explicitly restores a backup.
- Before any requested public repository push or deployment, inspect the actual staged files/build artifacts for private data. Ignore rules do not remove previously tracked files.
