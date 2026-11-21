# House model (Blender → glTF)

Builds `apps/web/src/house/house.glb` from `apps/web/src/house/layout.json`.
The layout is the single source of truth, shared with the web app, so the 3D
model and the areas it measures never diverge.

## Build

Blender 4.5 LTS, run headless:

```bash
blender --background --python tools/house-model/build_house.py -- \
  --layout apps/web/src/house/layout.json \
  --out apps/web/src/house/house.glb
```

The generated `.glb` is committed, so the app and CI need no Blender; only
rerun this after changing the layout or the script.

## What it makes

- `floor__<room>`, `shower__bathroom`: the floors, with CC0 textures.
- `wall__<h|v>_<mm>__<n>`: full-height walls, one per wall line (shared walls
  built once), with real holes for the doors, windows and passages listed in
  `layout.json` under `openings`.
- `wall__…__<id>_frame` and `wall__…__<id>_leaf`: window frames with glass,
  door frames and door leaves standing open into the room they swing into.
- `fixture__<room>__<piece>_<n>__<item>`: what the builder installs, from
  `fixtures.json` (kitchen cabinets and sink, bathroom fixtures, receptacles,
  switches, lights, alarms, heaters, thermostats, fans, the panel), and the
  baseboards along each room. No loose furniture: the app is for building
  and renovating.

Every fixture and joinery object carries glTF extras: `item` (an id in
`data/items.yaml`) and `room` or `opening`. A click on it in the app opens that
item: what to check before buying and the retailers' own search. Parts of a
piece can name their own item (the faucet on a sink cabinet, the handles on a
door), so each is clicked on its own. Floors keep their invisible hit-planes. It reads the wall line from each `wall__`
name to lower the walls between the camera and the room in view.

`model.test.ts` checks that every opening fits its wall and every fixture
stands inside its room, so a bad edit fails before it is rendered.
