"""Build the BuildWise house as a glTF binary (.glb) with Blender.

Run headless:

    blender --background --python tools/house-model/build_house.py -- \
        --layout apps/web/src/house/layout.json \
        --out apps/web/src/house/house.glb

The geometry comes from layout.json, the same file the web app reads, so the
model and the areas measured in the app never diverge. Surfaces carry CC0 PBR
textures from ambientCG (see textures.json); they are downloaded into .cache/
on first run and embedded in the .glb.

Each surface a person can click is a separately named mesh:

    floor__<room>     one per room
    shower__bathroom  the curbless shower zone
    walls__house      the low dollhouse walls (one mesh)

The web app treats the model as a picture only and places invisible hit-planes
from the same layout.json, so this script never has to know about clicks.

Coordinates: the layout's plan (x east, z south) maps to Blender (x, -z, up);
Blender's Y-up glTF export then gives three.js (x, up, z), matching model.ts.
Textures are mapped so one unit of UV is one metre, with the tile size baked in,
so the repeat is at real-world scale and survives the glTF export as plain UVs.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import zipfile
from pathlib import Path

import bmesh  # type: ignore[import-not-found]
import bpy  # type: ignore[import-not-found]
from mathutils import Matrix  # type: ignore[import-not-found]

HERE = Path(__file__).resolve().parent
CACHE = HERE / ".cache"
TEXTURES = json.loads((HERE / "textures.json").read_text(encoding="utf-8"))

FLOOR_THICKNESS = 0.08
SHOWER_THICKNESS = 0.03
WALL_LOW = 0.95  # dollhouse height: readable from above, does not block the camera
TEXTURE_SIZE = 512  # downscaled from 1K: plenty for this view, keeps the .glb small


def args_after_dashes() -> list[str]:
    return sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []


def texture_dir(asset: str) -> Path:
    """The extracted texture folder, downloaded from ambientCG if missing."""
    folder = CACHE / asset
    if not folder.exists():
        folder.mkdir(parents=True, exist_ok=True)
        archive = CACHE / f"{asset}.zip"
        url = f"https://ambientcg.com/get?file={asset}_{TEXTURES['resolution']}-{TEXTURES['format']}.zip"
        print(f"downloading {asset} from ambientCG")
        subprocess.run(["curl", "-s", "-L", "-o", str(archive), url], check=True)
        with zipfile.ZipFile(archive) as zf:
            zf.extractall(folder)
        archive.unlink()
    return folder


def load_image(path: Path, non_color: bool) -> bpy.types.Image:
    image = bpy.data.images.load(str(path), check_existing=True)
    image.colorspace_settings.name = "Non-Color" if non_color else "sRGB"
    if max(image.size) > TEXTURE_SIZE:
        image.scale(TEXTURE_SIZE, TEXTURE_SIZE)
    return image


def maps(asset: str) -> dict[str, Path]:
    folder = texture_dir(asset)
    found: dict[str, Path] = {}
    for path in folder.iterdir():
        name = path.name.lower()
        if name.endswith("_color.jpg"):
            found["color"] = path
        elif name.endswith("_normalgl.jpg"):
            found["normal"] = path
        elif name.endswith("_roughness.jpg"):
            found["roughness"] = path
    return found


def textured_material(role: str) -> bpy.types.Material:
    """A PBR material whose colour, roughness and normal come from the CC0 set.

    The mesh UVs already carry metres, so a Mapping node scales them by 1/tile
    to reach a real-world repeat. The glTF exporter bakes that into the UVs.
    """
    config = TEXTURES["sets"][role]
    cached = maps(config["asset"])
    tile = config["tile"]

    mat = bpy.data.materials.new(f"mat_{role}")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.8

    tex_coord = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (1.0 / tile, 1.0 / tile, 1.0 / tile)
    links.new(tex_coord.outputs["UV"], mapping.inputs["Vector"])

    def image_node(kind: str, non_color: bool) -> bpy.types.ShaderNode:
        node = nodes.new("ShaderNodeTexImage")
        node.image = load_image(cached[kind], non_color)
        links.new(mapping.outputs["Vector"], node.inputs["Vector"])
        return node

    if "color" in cached:
        links.new(image_node("color", False).outputs["Color"], bsdf.inputs["Base Color"])
    if "roughness" in cached:
        links.new(image_node("roughness", True).outputs["Color"], bsdf.inputs["Roughness"])
    if "normal" in cached:
        normal_map = nodes.new("ShaderNodeNormalMap")
        links.new(image_node("normal", True).outputs["Color"], normal_map.inputs["Color"])
        links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def cube_uvs(bm: bmesh.types.BMesh) -> None:
    """Project each face onto its dominant axis, one UV unit per metre. Local
    vertex coordinates already carry real sizes, so the scale is in metres."""
    uv = bm.loops.layers.uv.verify()
    for face in bm.faces:
        axis = max(range(3), key=lambda i: abs(face.normal[i]))
        pick = {0: (1, 2), 1: (0, 2), 2: (0, 1)}[axis]
        for loop in face.loops:
            co = loop.vert.co
            loop[uv].uv = (co[pick[0]], co[pick[1]])


def to_blender(x: float, z: float, up: float) -> tuple[float, float, float]:
    return (x, -z, up)


def box(name: str, centre: tuple[float, float, float], size: tuple[float, float, float], mat: bpy.types.Material):
    """A box mesh whose vertices carry its size (clean identity transform), with
    metre-scaled UVs and the given material."""
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for vert in bm.verts:
        vert.co.x *= size[0]
        vert.co.y *= size[1]
        vert.co.z *= size[2]
    cube_uvs(bm)
    bm.to_mesh(mesh)
    bm.free()
    obj.location = centre
    mesh.materials.append(mat)
    return obj


def rect_centre(rect: dict[str, float]) -> tuple[float, float]:
    return rect["x"] + rect["width"] / 2, rect["z"] + rect["depth"] / 2


def wall_segments(rooms: list[dict]) -> list[tuple[float, float, float, float]]:
    """Each shared edge once, matching model.ts wallSegments()."""
    seen: set[str] = set()
    segments: list[tuple[float, float, float, float]] = []
    for room in rooms:
        x, z, w, d = room["x"], room["z"], room["width"], room["depth"]
        for edge in (
            (x, z, x + w, z),
            (x + w, z, x + w, z + d),
            (x, z + d, x + w, z + d),
            (x, z, x, z + d),
        ):
            key = ",".join(f"{n:.2f}" for n in edge)
            if key not in seen:
                seen.add(key)
                segments.append(edge)
    return segments


def build(layout: dict) -> None:
    rooms = layout["rooms"]
    wall_thickness = layout["wallThickness"]
    materials = {role: textured_material(role) for role in TEXTURES["sets"]}

    for room in rooms:
        rect = {"x": room["x"], "z": room["z"], "width": room["width"], "depth": room["depth"]}
        cx, cz = rect_centre(rect)
        box(
            f"floor__{room['id']}",
            to_blender(cx, cz, -FLOOR_THICKNESS / 2),
            (rect["width"], rect["depth"], FLOOR_THICKNESS),
            materials[TEXTURES["rooms"][room["id"]]],
        )
        shower = room.get("shower")
        if shower:
            sx, sz = rect_centre(shower)
            box(
                f"shower__{room['id']}",
                to_blender(sx, sz, SHOWER_THICKNESS / 2),
                (shower["width"], shower["depth"], SHOWER_THICKNESS),
                materials[TEXTURES["shower"]],
            )

    # All low walls as one merged mesh.
    walls_mesh = bpy.data.meshes.new("walls__house")
    walls_obj = bpy.data.objects.new("walls__house", walls_mesh)
    bpy.context.scene.collection.objects.link(walls_obj)
    wbm = bmesh.new()
    for x1, z1, x2, z2 in wall_segments(rooms):
        horizontal = abs(z1 - z2) < 1e-9
        length = abs(x2 - x1) if horizontal else abs(z2 - z1)
        size = (length + wall_thickness, wall_thickness, WALL_LOW) if horizontal else (
            wall_thickness,
            length + wall_thickness,
            WALL_LOW,
        )
        bx, bz, by = to_blender((x1 + x2) / 2, (z1 + z2) / 2, WALL_LOW / 2)
        matrix = Matrix.Translation((bx, bz, by)) @ Matrix.Diagonal((*size, 1.0))
        bmesh.ops.create_cube(wbm, size=1.0, matrix=matrix)
    cube_uvs(wbm)
    wbm.to_mesh(walls_mesh)
    wbm.free()
    walls_mesh.materials.append(materials[TEXTURES["walls"]])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--layout", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    options = parser.parse_args(args_after_dashes())

    layout = json.loads(options.layout.read_text(encoding="utf-8"))

    bpy.ops.wm.read_factory_settings(use_empty=True)
    build(layout)

    options.out.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(options.out),
        export_format="GLB",
        use_selection=False,
        export_yup=True,
        export_apply=True,
        export_image_format="AUTO",
    )
    print(f"wrote {options.out}")


if __name__ == "__main__":
    main()
