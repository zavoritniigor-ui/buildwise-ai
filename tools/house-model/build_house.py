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

    floor__<room>                    one per room
    shower__bathroom                 the curbless shower zone
    wall__<h|v>_<mm>__<n>            full-height walls, one per wall line, with
                                     holes for the doors and windows
    wall__<h|v>_<mm>__<id>_frame     window frames and glass, door frames
    wall__<h|v>_<mm>__<id>_leaf      door leaves, standing open
    furniture__<room>__<piece>_<n>   furniture and fixtures (furniture.json)

The web app treats the model as a picture only and places invisible hit-planes
from the same layout.json, so this script never has to know about clicks. It
reads the wall line from the names to cut away the walls nearest the camera.

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


def box(
    name: str,
    centre: tuple[float, float, float],
    size: tuple[float, float, float],
    mat: bpy.types.Material,
):
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


FRAME = 0.05  # window and door frame profile
LEAF_THICKNESS = 0.04
DOOR_OPEN_DEGREES = 80


def srgb_to_linear(channel: float) -> float:
    return channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4


def flat_material(name: str, spec: dict) -> bpy.types.Material:
    """A plain PBR material: colour, roughness, metalness and optional transparency."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    hex_colour = spec["color"].lstrip("#")
    rgb = [srgb_to_linear(int(hex_colour[i : i + 2], 16) / 255) for i in (0, 2, 4)]
    bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
    bsdf.inputs["Roughness"].default_value = spec.get("roughness", 0.5)
    bsdf.inputs["Metallic"].default_value = spec.get("metallic", 0.0)
    if "alpha" in spec:
        bsdf.inputs["Alpha"].default_value = spec["alpha"]
        mat.surface_render_method = "BLENDED"
    return mat


class Parts:
    """Collects boxes, cylinders and spheres into one mesh, one material slot
    per material, so each piece of furniture or joinery is a single object."""

    def __init__(self) -> None:
        self.bm = bmesh.new()
        self.slots: list[bpy.types.Material] = []

    def _slot(self, mat: bpy.types.Material) -> int:
        if mat not in self.slots:
            self.slots.append(mat)
        return self.slots.index(mat)

    def add(self, shape: str, centre, size, mat: bpy.types.Material, bevel: float = 0.0) -> None:
        """centre and size are Blender (x, y, up); centre is the shape's middle."""
        matrix = Matrix.Translation(centre) @ Matrix.Diagonal((*size, 1.0))
        before = set(self.bm.faces)
        if shape == "box":
            geom = bmesh.ops.create_cube(self.bm, size=1.0, matrix=matrix)
            bevel = min(bevel, min(size) / 2.5)
            if bevel > 0:
                edges = list({e for v in geom["verts"] for e in v.link_edges})
                bmesh.ops.bevel(
                    self.bm,
                    geom=edges,
                    offset=bevel,
                    offset_type="OFFSET",
                    segments=2,
                    profile=0.5,
                    affect="EDGES",
                )
        elif shape == "cylinder":
            bmesh.ops.create_cone(
                self.bm,
                cap_ends=True,
                segments=32,
                radius1=0.5,
                radius2=0.5,
                depth=1.0,
                matrix=matrix,
            )
        elif shape == "sphere":
            bmesh.ops.create_uvsphere(
                self.bm, u_segments=24, v_segments=14, radius=0.5, matrix=matrix
            )
        else:
            raise ValueError(f"unknown shape {shape}")
        slot = self._slot(mat)
        for face in set(self.bm.faces) - before:
            face.material_index = slot
            face.smooth = shape != "box"

    def object(self, name: str, location=(0.0, 0.0, 0.0), rotation_z: float = 0.0):
        mesh = bpy.data.meshes.new(name)
        cube_uvs(self.bm)
        self.bm.to_mesh(mesh)
        self.bm.free()
        for mat in self.slots:
            mesh.materials.append(mat)
        obj = bpy.data.objects.new(name, mesh)
        obj.location = location
        obj.rotation_euler = (0.0, 0.0, rotation_z)
        bpy.context.scene.collection.objects.link(obj)
        return obj


def plan_box(parts: Parts, x0, x1, z0, z1, y0, y1, mat, bevel: float = 0.0) -> None:
    """A box given by its plan extents and heights."""
    parts.add(
        "box",
        to_blender((x0 + x1) / 2, (z0 + z1) / 2, (y0 + y1) / 2),
        (abs(x1 - x0), abs(z1 - z0), abs(y1 - y0)),
        mat,
        bevel,
    )


# ---- walls, doors and windows -------------------------------------------------


def side_line(room: dict, side: str) -> tuple[str, float]:
    """A room side as a wall line: ("h", z) runs east-west, ("v", x) north-south."""
    return {
        "north": ("h", room["z"]),
        "south": ("h", room["z"] + room["depth"]),
        "west": ("v", room["x"]),
        "east": ("v", room["x"] + room["width"]),
    }[side]


def wall_lines(rooms: list[dict]) -> dict[tuple[str, float], list[tuple[float, float]]]:
    """Every wall line with its merged extents, so a wall shared by rooms of
    different sizes is built once and an opening in it is a real hole."""
    spans: dict[tuple[str, float], list[tuple[float, float]]] = {}
    for room in rooms:
        x, z, w, d = room["x"], room["z"], room["width"], room["depth"]
        for key, span in (
            (("h", round(z, 3)), (x, x + w)),
            (("h", round(z + d, 3)), (x, x + w)),
            (("v", round(x, 3)), (z, z + d)),
            (("v", round(x + w, 3)), (z, z + d)),
        ):
            spans.setdefault(key, []).append(span)
    merged: dict[tuple[str, float], list[tuple[float, float]]] = {}
    for key, items in spans.items():
        out: list[list[float]] = []
        for a, b in sorted(items):
            if out and a <= out[-1][1] + 1e-6:
                out[-1][1] = max(out[-1][1], b)
            else:
                out.append([a, b])
        merged[key] = [(a, b) for a, b in out]
    return merged


def line_box(parts: Parts, line, a0, a1, y0, y1, n0, n1, mat, bevel: float = 0.0) -> None:
    """A box along a wall line: a0..a1 along it, n0..n1 across it."""
    orient, coord = line
    if orient == "h":
        plan_box(parts, a0, a1, coord + n0, coord + n1, y0, y1, mat, bevel)
    else:
        plan_box(parts, coord + n0, coord + n1, a0, a1, y0, y1, mat, bevel)


def line_name(line) -> str:
    """Names carry the wall line in millimetres (glTF names drop dots); the web
    app reads it to cut away the walls between the camera and the room."""
    orient, coord = line
    return f"wall__{orient}_{round(coord * 1000)}"


def build_walls(layout: dict, wall_mat, mats: dict) -> None:
    height = layout["wallHeight"]
    t = layout["wallThickness"]
    rooms = {room["id"]: room for room in layout["rooms"]}
    openings: dict[tuple[str, float], list[dict]] = {}
    for opening in layout.get("openings", []):
        orient, coord = side_line(rooms[opening["room"]], opening["side"])
        openings.setdefault((orient, round(coord, 3)), []).append(opening)

    for line, spans in wall_lines(layout["rooms"]).items():
        holes = sorted(openings.get(line, []), key=lambda o: o["centre"])
        for index, (start, end) in enumerate(spans):
            parts = Parts()
            cursor = start - t / 2
            for o in holes:
                a0, a1 = o["centre"] - o["width"] / 2, o["centre"] + o["width"] / 2
                if not (start <= a0 and a1 <= end):
                    continue
                sill = o.get("sill", 0.0)
                head = sill + o["height"]
                line_box(parts, line, cursor, a0, 0, height, -t / 2, t / 2, wall_mat)
                if sill > 0:
                    line_box(parts, line, a0, a1, 0, sill, -t / 2, t / 2, wall_mat)
                line_box(parts, line, a0, a1, head, height, -t / 2, t / 2, wall_mat)
                cursor = a1
            line_box(parts, line, cursor, end + t / 2, 0, height, -t / 2, t / 2, wall_mat)
            parts.object(f"{line_name(line)}__{index}")

        for o in holes:
            build_opening(line, o, rooms, t, mats)


def build_opening(line, o: dict, rooms: dict, t: float, mats: dict) -> None:
    a0, a1 = o["centre"] - o["width"] / 2, o["centre"] + o["width"] / 2
    sill = o.get("sill", 0.0)
    head = sill + o["height"]
    frame = Parts()
    trim = mats["frame_white"]
    if o["kind"] == "window":
        n0, n1 = -0.04, 0.04
        line_box(frame, line, a0, a0 + FRAME, sill, head, n0, n1, trim)
        line_box(frame, line, a1 - FRAME, a1, sill, head, n0, n1, trim)
        line_box(frame, line, a0, a1, sill, sill + FRAME, n0, n1, trim)
        line_box(frame, line, a0, a1, head - FRAME, head, n0, n1, trim)
        if o["width"] >= 1.5:
            mid = o["centre"]
            line_box(frame, line, mid - FRAME / 2, mid + FRAME / 2, sill, head, n0, n1, trim)
        line_box(
            frame,
            line,
            a0 - 0.04,
            a1 + 0.04,
            sill - 0.025,
            sill,
            -t / 2 - 0.035,
            t / 2 + 0.035,
            trim,
        )
        line_box(
            frame,
            line,
            a0 + FRAME,
            a1 - FRAME,
            sill + FRAME,
            head - FRAME,
            -0.005,
            0.005,
            mats["glass"],
        )
    else:
        # door and open passage: two jambs and a head, wrapped around the wall
        n0, n1 = -t / 2 - 0.012, t / 2 + 0.012
        line_box(frame, line, a0, a0 + 0.03, 0, head, n0, n1, trim)
        line_box(frame, line, a1 - 0.03, a1, 0, head, n0, n1, trim)
        line_box(frame, line, a0, a1, head - 0.03, head, n0, n1, trim)
    frame.object(f"{line_name(line)}__{o['id']}_frame")
    if o["kind"] == "door":
        build_leaf(line, o, rooms, a0 + 0.03, a1 - 0.03, head - 0.03, mats)


def build_leaf(line, o: dict, rooms: dict, a0: float, a1: float, head: float, mats: dict) -> None:
    """The door leaf, standing open into the room it swings into."""
    import math

    orient, coord = line
    hinge_a, free_a = (a0, a1) if o["hinge"] == "start" else (a1, a0)
    along = 1.0 if free_a > hinge_a else -1.0
    swing = rooms[o["swing"]]
    sx, sz = rect_centre(swing)
    across = 1.0 if ((sz if orient == "h" else sx) - coord) > 0 else -1.0
    angle = math.radians(DOOR_OPEN_DEGREES)
    # leaf direction in plan (x, z)
    da, dn = math.cos(angle) * along, math.sin(angle) * across
    dx, dz = (da, dn) if orient == "h" else (dn, da)
    hx, hz = (hinge_a, coord) if orient == "h" else (coord, hinge_a)
    length = abs(a1 - a0) - 0.005
    leaf_mat = mats["door_entry"] if o.get("style") == "entry" else mats["door_white"]

    parts = Parts()
    # local frame: x along the leaf from the hinge, y across, z up
    parts.add(
        "box",
        (length / 2, 0, 0.01 + (head - 0.02) / 2),
        (length, LEAF_THICKNESS, head - 0.02),
        leaf_mat,
        0.004,
    )
    for side in (-1, 1):
        parts.add("box", (length - 0.07, side * 0.035, 1.0), (0.12, 0.02, 0.02), mats["chrome"])
        parts.add(
            "cylinder", (length - 0.07, side * 0.025, 1.0), (0.05, 0.02, 0.05), mats["chrome"]
        )
    # plan direction (dx, dz) is Blender (dx, -dz)
    parts.object(
        f"{line_name(line)}__{o['id']}_leaf",
        location=to_blender(hx, hz, 0.0),
        rotation_z=math.atan2(-dz, dx),
    )


# ---- furniture -------------------------------------------------------------------


def build_furniture(furniture: dict, mats: dict) -> None:
    import math

    counts: dict[str, int] = {}
    for place in furniture["placements"]:
        piece = furniture["pieces"][place["piece"]]
        parts = Parts()
        for part in piece:
            u, v = part["at"]
            w, d, h = part["size"]
            # local plan (u, v) -> Blender (u, -v)
            parts.add(
                part["shape"],
                (u, -v, part["y"] + h / 2),
                (w, d, h),
                mats[part["material"]],
                part.get("bevel", 0.0),
            )
        n = counts.get(place["piece"], 0)
        counts[place["piece"]] = n + 1
        x, z = place["at"]
        parts.object(
            f"furniture__{place['room']}__{place['piece']}_{n}",
            location=to_blender(x, z, 0.0),
            rotation_z=-math.radians(place["rotate"]),
        )


JOINERY = {
    "frame_white": {"color": "#f4f4f1", "roughness": 0.45},
    "door_white": {"color": "#efece6", "roughness": 0.4},
    "door_entry": {"color": "#3d4b57", "roughness": 0.35},
}


def build(layout: dict, furniture: dict) -> None:
    rooms = layout["rooms"]
    materials = {role: textured_material(role) for role in TEXTURES["sets"]}
    flat = {
        name: flat_material(f"mat_{name}", spec)
        for name, spec in {**furniture["materials"], **JOINERY}.items()
    }

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

    build_walls(layout, materials[TEXTURES["walls"]], flat)
    build_furniture(furniture, flat)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--layout", required=True, type=Path)
    parser.add_argument(
        "--furniture", type=Path, help="defaults to furniture.json next to the layout"
    )
    parser.add_argument("--out", required=True, type=Path)
    options = parser.parse_args(args_after_dashes())

    layout = json.loads(options.layout.read_text(encoding="utf-8"))
    furniture_path = options.furniture or options.layout.with_name("furniture.json")
    furniture = json.loads(furniture_path.read_text(encoding="utf-8"))

    bpy.ops.wm.read_factory_settings(use_empty=True)
    build(layout, furniture)

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
