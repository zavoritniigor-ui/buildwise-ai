"""Build the BuildWise house as a glTF binary (.glb) with Blender.

Run headless:

    blender --background --python tools/house-model/build_house.py -- \
        --layout apps/web/src/house/layout.json \
        --out apps/web/src/house/house.glb

The geometry comes from layout.json, the same file the web app reads, so the
model and the areas measured in the app never diverge. Each surface a person
can click is a separately named mesh:

    floor__<room>     one per room
    shower__bathroom  the curbless shower zone
    walls__house      the low dollhouse walls (one mesh)

The web app treats the model as a picture only and places invisible hit-planes
from the same layout.json, so this script never has to know about clicks.

Coordinates: the layout's plan (x east, z south) maps to Blender (x, -z, up);
Blender's Y-up glTF export then gives three.js (x, up, z), matching model.ts.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import bmesh  # type: ignore[import-not-found]
import bpy  # type: ignore[import-not-found]
from mathutils import Matrix  # type: ignore[import-not-found]

FLOOR_THICKNESS = 0.08
SHOWER_THICKNESS = 0.03
WALL_LOW = 0.95  # dollhouse height: readable from above, does not block the camera
WALL_COLOR = "#f3efe8"
SHOWER_COLOR = "#bcd6e0"


def args_after_dashes() -> list[str]:
    return sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []


def srgb_to_linear(channel: float) -> float:
    return channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4


def material(name: str, hex_color: str, roughness: float = 0.85) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    rgb = tuple(srgb_to_linear(int(hex_color[i : i + 2], 16) / 255) for i in (1, 3, 5))
    bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    return mat


def to_blender(x: float, z: float, up: float) -> tuple[float, float, float]:
    return (x, -z, up)


def box(name: str, centre: tuple[float, float, float], size: tuple[float, float, float], mat: bpy.types.Material):
    """A box mesh whose vertices already carry its size, so the object has a
    clean identity transform (no scale baked into the object)."""
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for vert in bm.verts:
        vert.co.x *= size[0]
        vert.co.y *= size[1]
        vert.co.z *= size[2]
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

    for room in rooms:
        rect = {"x": room["x"], "z": room["z"], "width": room["width"], "depth": room["depth"]}
        cx, cz = rect_centre(rect)
        box(
            f"floor__{room['id']}",
            to_blender(cx, cz, -FLOOR_THICKNESS / 2),
            (rect["width"], rect["depth"], FLOOR_THICKNESS),
            material(f"floor_{room['id']}", room["color"]),
        )
        shower = room.get("shower")
        if shower:
            sx, sz = rect_centre(shower)
            box(
                f"shower__{room['id']}",
                to_blender(sx, sz, SHOWER_THICKNESS / 2),
                (shower["width"], shower["depth"], SHOWER_THICKNESS),
                material(f"shower_{room['id']}", SHOWER_COLOR, roughness=0.4),
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
    wbm.to_mesh(walls_mesh)
    wbm.free()
    walls_mesh.materials.append(material("walls", WALL_COLOR, roughness=0.9))


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
    )
    print(f"wrote {options.out}")


if __name__ == "__main__":
    main()
