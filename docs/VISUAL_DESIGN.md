# Map and layer design

Near-black navy water (`#050a10`), near-black earthy-brown land (`#100b07`) and faint warm-neutral borders keep glowing travel prominent. Natural Earth 1:10m geography provides smoother coastlines and finer borders. Coastline geometry is separate from land fills to avoid polygon seam outlines. Detailed regional streets and buildings are disabled.

A pressed-state 2D map / 3D globe toggle sits above Zoom out. Space is pitch black, with no atmospheric haze. In 3D, city boundaries rise as translucent mint walls, including inner rings, with open interiors and no roofs or point markers. Wall height is stylized for visibility at world scale and decreases as the user zooms in. Ground outline brightness and glow remain the original styling in both projections. Flights are elevated great-circle ribbons with a blue-to-lilac glow and pale core. Distance controls stylized radial height, tapering to the surface at both endpoints; the globe occludes hidden arcs and walls. Raised arcs fade into the surface paths between zoom levels 4 and 6. Zoom out fits the globe between the controls; switching projections keeps the current focus. The active view is announced through a status message.

| Layer | Appearance | Interaction |
| --- | --- | --- |
| Locations | Mint city boundary, soft outline glow, faint interior fill | Polygon hit areas and selectable city list |
| Roads | Amber line | Route details |
| Rail | Dashed lilac line | Route details |
| Water | Cyan connection or imported track | Route details and approximate-geometry note |
| Flights | Curved geographic arc | Endpoint/date details |

Category switches control geometry, hit areas, labels and related controls independently. Timeline adds date matching without changing switches. Hidden features do not intercept interaction. Popups treat record text as text, not HTML.

Native form controls support editing, with chronology controls in the bottom-left strip and timeline dialog. There is no regional map renderer. Geographic labels would require future local font assets.

The bottom-right display dock groups the projection switch, decrease/increase zoom and Zoom out. Its collapsible Map layers section contains all category switches and Countries with places; navigation remains accessible when layers are collapsed. Map layers starts expanded, and collapsing it preserves selections. Editing and saved places stay at the upper left. Timeline, active dates and travel status sit at the bottom left above the unchanged attribution; playback expands inside the same strip. Narrow layouts keep the strip and dock side by side. Zoom out resets to the overview of the selected projection.

Countries with places starts off and draws a restrained mint outline and faint fill below travel geometry in either projection. Only saved places matching the timeline qualify, including preserved legacy places without rendering dots. Hiding Locations hides the country highlights. Country names/codes are matched against installed metadata; missing names use only unambiguous geographic matching. Unresolved places are counted in the option status. No country labels or country walls are added. Missing/invalid country data disables only the option, with no online fallback.

In 3D, right-drag to tilt the map and inspect boundary-wall height; touch devices support two-finger pitch. Switching back to 2D resets the tilt and disables those gestures.
