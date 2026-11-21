import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { KNOWLEDGE } from "../knowledge";
import furniture from "./furniture.json";
import {
  FOOTPRINT,
  OPENINGS,
  ROOMS,
  WALL_THICKNESS,
  area,
  findRoom,
  openingLine,
  roomOpenings,
  sideLine,
  surfaceArea,
} from "./model";

test("the bathroom is the BW-001 bathroom", () => {
  const bathroom = findRoom("bathroom");
  expect(area(bathroom.rect)).toBe(7.5);
  expect(bathroom.shower && area(bathroom.shower)).toBe(1.08);
  expect(surfaceArea(bathroom, "floor")).toBe(6.42);
  expect(surfaceArea(bathroom, "shower")).toBe(1.08);
});

test("rooms fill the footprint without overlapping", () => {
  const total = ROOMS.reduce((sum, r) => sum + area(r.rect), 0);
  expect(total).toBeCloseTo(FOOTPRINT.width * FOOTPRINT.depth);
});

test("the shower lies inside the bathroom", () => {
  const { rect, shower } = findRoom("bathroom");
  expect(shower).toBeDefined();
  if (!shower) return;
  expect(shower.x).toBeGreaterThanOrEqual(rect.x);
  expect(shower.z).toBeGreaterThanOrEqual(rect.z);
  expect(shower.x + shower.width).toBeLessThanOrEqual(rect.x + rect.width);
  expect(shower.z + shower.depth).toBeLessThanOrEqual(rect.z + rect.depth);
});

test("bathroom walls are the full height less the door and the window", () => {
  const bathroom = findRoom("bathroom");
  expect(roomOpenings(bathroom).map((o) => o.id)).toEqual(["bathroom_door", "bathroom_south"]);
  // 11 m x 2.6 m, less the 0.76 x 2.03 door and the 0.8 x 0.6 window
  expect(surfaceArea(bathroom, "walls")).toBe(26.58);
});

test("a shared opening counts in both rooms", () => {
  expect(roomOpenings(findRoom("living")).map((o) => o.id)).toContain("kitchen_opening");
  expect(roomOpenings(findRoom("kitchen")).map((o) => o.id)).toContain("kitchen_opening");
});

test("every opening fits its wall, below the ceiling, without overlapping another", () => {
  for (const o of OPENINGS) {
    const side = sideLine(findRoom(o.room).rect, o.side);
    const at = openingLine(o);
    expect(at.from, o.id).toBeGreaterThanOrEqual(side.from + WALL_THICKNESS / 2);
    expect(at.to, o.id).toBeLessThanOrEqual(side.to - WALL_THICKNESS / 2);
    expect(o.sill + o.height, o.id).toBeLessThan(2.6);
    for (const other of OPENINGS) {
      const b = openingLine(other);
      if (other === o || b.orient !== at.orient || b.coord !== at.coord) continue;
      expect(at.to <= b.from || b.to <= at.from, `${o.id} / ${other.id}`).toBe(true);
    }
  }
});

test("every door opens into a room on its own wall", () => {
  for (const door of OPENINGS.filter((o) => o.kind === "door")) {
    expect(door.swing, door.id).toBeDefined();
    if (!door.swing) continue;
    expect(roomOpenings(findRoom(door.swing)), door.id).toContain(door);
  }
});

test("every piece of furniture stands inside its room", () => {
  const inset = WALL_THICKNESS / 2 - 1e-6;
  for (const place of furniture.placements) {
    const { rect } = findRoom(place.room as Parameters<typeof findRoom>[0]);
    const piece = furniture.pieces[place.piece as keyof typeof furniture.pieces];
    expect(piece, place.piece).toBeDefined();
    const parts = piece.parts;
    expect(place.rotate % 90, place.piece).toBe(0);
    const turn = (place.rotate / 90) % 2 === 1;
    const cos = Math.round(Math.cos((place.rotate * Math.PI) / 180));
    const sin = Math.round(Math.sin((place.rotate * Math.PI) / 180));
    for (const part of parts) {
      const [u = 0, v = 0] = part.at;
      const [w = 0, d = 0] = part.size;
      const [px = 0, pz = 0] = place.at;
      const x = px + u * cos - v * sin;
      const z = pz + u * sin + v * cos;
      const [hw, hd] = turn ? [d / 2, w / 2] : [w / 2, d / 2];
      const where = `${place.room}/${place.piece}`;
      expect(x - hw, where).toBeGreaterThanOrEqual(rect.x + inset);
      expect(x + hw, where).toBeLessThanOrEqual(rect.x + rect.width - inset);
      expect(z - hd, where).toBeGreaterThanOrEqual(rect.z + inset);
      expect(z + hd, where).toBeLessThanOrEqual(rect.z + rect.depth - inset);
    }
  }
});

test("every object in the 3D model is an item of the knowledge base", () => {
  const glb = readFileSync(join(import.meta.dirname, "house.glb"));
  const length = glb.readUInt32LE(12);
  const gltf = JSON.parse(glb.subarray(20, 20 + length).toString("utf8")) as {
    nodes: { name: string; extras?: { item?: string; room?: string; opening?: string } }[];
  };
  const known = new Set(KNOWLEDGE.items.map((i) => i.id));
  const tagged = gltf.nodes.filter((n) => n.extras?.item);
  expect(tagged.length).toBeGreaterThan(50);
  for (const node of gltf.nodes) {
    // only floors, the shower zone and plain walls are surfaces rather than items
    if (/^(floor|shower)__|^wall__[hv]_\d+__\d+$/.test(node.name)) continue;
    expect(node.extras?.item, node.name).toBeDefined();
    expect(known.has(node.extras?.item ?? ""), node.name).toBe(true);
    const where = node.extras?.room ?? node.extras?.opening;
    expect(where, node.name).toBeDefined();
  }
  // every item is used somewhere in the house
  const used = new Set(tagged.map((n) => n.extras?.item));
  expect([...known].filter((id) => !used.has(id))).toEqual([]);
});
