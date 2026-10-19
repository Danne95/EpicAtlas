# Setup, privacy and development

A local personal travel atlas: glowing city outlines, road, rail, water and flight journeys on a dark 2D map or switchable 3D globe. Date filters and cumulative playback reveal your history. A new workspace is empty; no personal dataset or demo fallback is bundled.

## Setup and run

Requires Node.js 20.19+ or 22.12+ (including newer supported Node releases), npm, and Python 3.10+ for the optional offline tools. From this folder:

```powershell
npm ci
node tools/install-world.mjs
python tools/install-airports.py
npm run dev
```

Dependency installation and these explicit geography/catalogue downloads require internet. The world installer supplies land, coastline, borders and optional country-highlighting shapes; the airport catalogue is needed to resolve new flight codes. Installation never runs when saving or viewing travel. See [sources and licenses](MAP_DATA.md).

Open the printed localhost URL and keep the server running. Installed maps and saved travel render offline. First-time city/place lookup and road/rail preview need internet; successful requests are cached privately. Direct file opening is unsupported.

### Double-click launch on Windows

After setup, double-click the **EpicAtlas** desktop shortcut or `Start EpicAtlas.cmd` in this folder. The launcher starts the local server at `http://127.0.0.1:5173/` and opens your default browser. Keep the **EpicAtlas - close to stop** window open while using the atlas; close that window to stop the server. Closing the browser alone does not stop it.

The launcher never installs dependencies or downloads maps. Missing requirements and startup errors stay visible in its window. If port 5173 is already occupied, check whether your atlas is already open at that address; otherwise close the other server before trying again. If you move the project folder, update the desktop shortcut to point to the launcher in its new location.

For a production build and local preview:

```powershell
npm run build
npm run preview -- --port 4173
```

Preview includes the same local file API as development. A static host alone cannot provide this storage workflow. Build output contains the browser application, excluding downloaded maps, travel and server code.

## Use

- **Edit travel:** select a city outline; enter flight airport codes; create reviewed road/rail suggestions or approximate water connections; or import normalized route geometry. Save record writes automatically to disk. Close the editor to refresh the map; **Show my travel** also reloads it.
- **Backups:** Export backup / Download backup or Copy backup creates an extra JSON copy. Restore is a validated, explicit replacement of the complete workspace.
- **Explore:** independent category switches, optional Countries with places, 2D/3D projection and zoom controls. Timeline filters supported calendar periods and plays cumulative dated events.
- **Regional detail:** disabled. The browser does not load street/building tiles, regional manifests or archives. Existing preparation/cleanup tools remain available explicitly.

Read the [documentation index](README.md) for operational details and [tool commands](../tools/README.md) for imports and asset management.

## Private and public boundaries

| Location | Classification and permitted access |
| --- | --- |
| `private/travel/workspace.json` | Personal travel, accessed only through the restricted localhost API |
| `private/travel/workspace.json.bak` | Previous saved file; an additional recovery copy, not full history |
| `private/maps/` | Private lookup/route caches, offline catalogue, geography backups and optional overrides; no direct file serving |
| Other `private/` folders | Original routes, exports, recipes and audit checkpoints; no serving or build inclusion |
| `public/maps/` | Private installed downloads. Only four runtime world GeoJSON files are served locally through `/maps/world/`; provenance and regional assets are not served |
| Source, docs and `dist/` | Shareable application material; must contain no real travel, downloaded maps, recipes or backups |

The folder name `public` does not mean published online. Vite's default public-folder serving/copying is disabled. Development also denies direct filesystem access to private inputs and installed downloads; a narrow map handler serves runtime geography. The server binds to loopback and restricts APIs/map requests by host, origin and cross-site metadata. This is local access control, without account authentication or encryption against other users/processes on the device.

City/place searches explicitly send the entered names to the configured geocoder. Road/rail previews explicitly send ordered stop coordinates and the routing profile to the configured router. Dates, journey names and the saved workspace are not included. Downloads have normal network metadata such as the client's IP address.

Keep personal inputs and exported backups under ignored `private/` or an explicitly chosen private directory. Browser storage is retained only for legacy migration; an unreadable workspace remains untouched until explicit restore. Before any public push/deployment, inspect actual tracked/staged files and generated artifacts; ignore rules cannot remove already tracked data.

## Development checks

```powershell
npm run check
npm test
npm run test:tools
npm run build
```

The type check covers browser code, server code and configuration. Tests use disposable synthetic workspaces and local mock providers, without reading your travel file or contacting real lookup services. Python is needed only for `test:tools`. Validation scope and remaining limits are recorded in [the consolidation audit](DEVELOPMENT_LOG.md).
