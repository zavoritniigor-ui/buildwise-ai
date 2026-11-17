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

Each clickable surface is a separately named mesh: `floor__<room>`,
`shower__bathroom`, `walls__house`. The web app treats the model as a picture
and drives clicks from invisible planes placed from the same layout, so the
model can gain textures and furniture later without touching the interaction.

Planned next: CC0 textures (Poly Haven, ambientCG) and CC0 furniture, baked
lighting for a realistic look.
