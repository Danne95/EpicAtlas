# Cleanup unused regional detail

`tools/cleanup-regions.py`, a Python 3.10+ standard-library CLI. It previews references and removes reviewed unused regional archives and their manifest entries. It never downloads replacement data or includes the global world map in removal.

## Workflow

1. In **Edit travel**, export the complete current workspace. Use Download backup, or Copy backup and save the contents as a `.json` file. Keep it outside regional assets.
2. Create a preview with the command below. Previewing is read-only for installed map assets.
3. Review which packs are marked `KEEP` or `UNUSED` in the console and plan JSON.
4. Apply that same plan with the same workspace and directories. Do not edit travel/map files while cleanup runs. If saved travel has changed, use the current workspace or export it again and generate a new plan first.
5. Inspect the resulting manifest/artifacts. Regional rendering is disabled, so cleanup does not change the current map display and needs no browser build.

```powershell
python tools/cleanup-regions.py plan --workspace private/travel/workspace.json --plan private/regions/cleanup-plan.json
python tools/cleanup-regions.py apply --workspace private/travel/workspace.json --plan private/regions/cleanup-plan.json
```

The default regional directory is the project's `public/maps/regions`. Optional `--regions-dir` supports other installations and synthetic test fixtures; use the same explicit directory for plan and apply. Destinations must resolve to a `maps/regions` directory. Directories named `world` are refused before writes. Plan paths must be outside regional assets and must be new files. Plans and console output contain private workspace paths/reference IDs; keep plans and captured logs under `private/` or an explicitly chosen private directory.

Use the complete current `private/travel/workspace.json` file or a fresh export of all saved personal records. Do not edit the file or browser workspace between planning and applying cleanup. Current schema treats every present record as active; deletion removes it. Map checkboxes, timeline visibility do not release a pack. An empty personal workspace is valid; there are no bundled demo references.

## Coverage and conservative retention

- Locations retain a pack when their point lies inside or on its bounds.
- City polygons conservatively retain packs overlapping their full bounding envelope, including packs entirely inside the city. Legacy Points use the point rule above. Holes do not release packs automatically.
- Road/rail/water segments retain packs whose bounds overlap their coordinate envelopes. This is conservative: a diagonal envelope may retain a pack the exact line misses. Date-line segments use full-longitude coverage when their interpretation is uncertain; ±180 aliases are recognized.
- Flights use the same shorter spherical great-circle arc as the app. The tool checks endpoints and analytical intersections with latitude/longitude rectangle edges. A flight crossing a region retains it even when both airports lie outside. Very short arcs use conservative segment envelopes; near-antipodal ambiguous arcs retain all packs.
- Boundary contact uses a small numerical tolerance. Existing `travelReferences` are not trusted for eligibility; associations are recomputed from geometry.

Uncertain overlaps retain detail rather than risk removing required data. More exact ground-route intersection is an optional later optimization.

## Removal boundaries

The tool considers only manifest-listed `.pmtiles` archives and their matching `STEM-LICENSE.txt` / `STEM-provenance.json` sidecars. Unlisted files are preserved. Referenced packs are preserved. `maps/world/`, source downloads, personal workspace files, other project documents, and travel input files are outside removal. Symbolic-link/outside-directory archive or sidecar targets are refused.

Each archive must match its manifest size, SHA-256, PMTiles v3 MVT header, bounds, and zooms. A missing/corrupt/mismatched file blocks cleanup for review. The preview records input, manifest, archive and sidecar hashes. Apply recomputes the full plan under the same lock used by the region builder and refuses stale/modified plans. This catches changed disk inputs; it cannot detect browser edits that have not been exported.

Unused archives/sidecars move into a temporary directory under regions before the updated manifest is atomically published. Ordinary failures before manifest publication roll staged files back. After publication the staged unused files are deleted, and remaining manifest reference IDs are refreshed. If there are no unused packs, apply changes nothing.

Forced termination, permission errors during purge, or concurrent external file edits are not crash-proof transactions. Inspect `.cleanup-stage-*` and `.region-build.lock` before recovery; before manifest commit, staged files may need restoring, while after commit they are unused artifacts awaiting purge. The tool reports a purge failure explicitly. Keep source packs or backups if you need to recover intentionally removed detail.
