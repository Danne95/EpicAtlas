# EpicAtlas
 
**Every trip you've taken, on one map.**
 
Light up the cities you've visited, connect them with your flights, drives and train rides, then replay your whole travel history on a dark world map or a 3D globe. It runs on your own computer, so your travels stay yours.
 
<!-- Add a screenshot here: ![EpicAtlas screenshot](docs/screenshot.png) -->
 
## What you get
 
- **Glowing cities.** Every place you've been lights up on the map.
- **Every way of travelling.** Flights, road trips, trains and boats, each in its own color.
- **Flat map or 3D globe.** Switch between them and zoom in anywhere.
- **Timeline playback.** Press play and watch your map fill in trip by trip, or look back at a single year.
- **Dates optional.** Only remember the year? That's enough.
- **Bring your own routes.** Import routes you've already recorded.
Your atlas starts empty, so everything on it is yours.
 
## Add a trip
 
1. Open **Edit travel** and pick a city or a journey type.
2. Search for a city, type in airport codes, or choose your stops.
3. Add a date if you like and click **Save record**.
4. Close the editor and see it on the map.
## Private by design
 
Your atlas is a file on your computer. No account, no cloud. Once it's set up, everything works offline except city search and road or rail suggestions. Export a backup whenever you want a spare copy or a move to a new machine.
 
## Get started
 
You'll need Node.js 20.19+ (or 22.12+), npm and Python 3.10+.
 
```
npm ci
node tools/install-world.mjs
python tools/install-airports.py
npm run dev
```
 
Open the localhost address it prints and you're in.
 
On Windows, after that first setup you can just double-click `Start EpicAtlas.cmd`. Close the **EpicAtlas - close to stop** window when you're done.
 
## Learn more
 
Built with TypeScript, [Vite](https://vite.dev) and [MapLibre GL JS](https://maplibre.org/).

- [All documentation](docs/README.md)
- [Adding places, journeys and backups](docs/TRAVEL_EDITOR.md)
- [Looking back with the timeline](docs/TIMELINE.md)
- [Bringing in recorded routes](docs/ROUTE_IMPORTS.md)
- [Setup, privacy and development](docs/SETUP.md)

