/**
 * The house layout. Rooms come from layout.json, the single source of truth
 * shared with the Blender build script (tools/house-model), so the 3D model
 * and the areas measured here never diverge. Sizes are in metres; x runs east
 * and z south. The bathroom matches scenario BW-001: 3 x 2.5 m with a
 * 0.9 x 1.2 m curbless shower in the corner.
 */
import layout from "./layout.json";

export type RoomId = "living" | "kitchen" | "bedroom" | "hallway" | "bathroom";
export type SurfaceId = "floor" | "walls" | "shower";

export interface Rect {
  x: number;
  z: number;
  width: number;
  depth: number;
}

export interface Room {
  id: RoomId;
  rect: Rect;
  color: string;
  /** Surfaces a person can work on in this room, in the order offered. */
  surfaces: readonly SurfaceId[];
  /** A zone inside the room, such as the shower area. */
  shower?: Rect;
}

export type Side = "north" | "south" | "west" | "east";

/** A door, window or open passage in a wall, from layout.json. */
export interface Opening {
  id: string;
  kind: "door" | "window" | "opening";
  /** The room whose side holds the opening; centre is measured along that side. */
  room: RoomId;
  side: Side;
  centre: number;
  width: number;
  height: number;
  /** Height of the window's bottom above the floor; 0 for doors. */
  sill: number;
  /** For doors: the room the leaf opens into, and which end carries the hinges. */
  swing?: RoomId;
  hinge?: "start" | "end";
  style?: string;
}

/** A wall line: "h" runs east-west at z = coord, "v" north-south at x = coord. */
export interface Line {
  orient: "h" | "v";
  coord: number;
  from: number;
  to: number;
}

export const WALL_HEIGHT = layout.wallHeight;
export const WALL_THICKNESS = layout.wallThickness;

export const ROOMS: readonly Room[] = layout.rooms.map((r) => ({
  id: r.id as RoomId,
  rect: { x: r.x, z: r.z, width: r.width, depth: r.depth },
  color: r.color,
  surfaces: r.surfaces as readonly SurfaceId[],
  shower: r.shower,
}));

type RawOpening = Omit<Opening, "sill"> & { sill?: number };

export const OPENINGS: readonly Opening[] = (layout.openings as RawOpening[]).map((o) => ({
  ...o,
  sill: o.sill ?? 0,
}));

/** One side of a room as a wall line. */
export function sideLine(rect: Rect, side: Side): Line {
  const { x, z, width, depth } = rect;
  switch (side) {
    case "north":
      return { orient: "h", coord: z, from: x, to: x + width };
    case "south":
      return { orient: "h", coord: z + depth, from: x, to: x + width };
    case "west":
      return { orient: "v", coord: x, from: z, to: z + depth };
    case "east":
      return { orient: "v", coord: x + width, from: z, to: z + depth };
  }
}

const SIDES: readonly Side[] = ["north", "south", "west", "east"];
const close = (a: number, b: number) => Math.abs(a - b) < 1e-6;

/** Where an opening sits: its wall line, cut down to the opening's width. */
export function openingLine(opening: Opening): Line {
  const line = sideLine(findRoomIn(opening.room), opening.side);
  return {
    ...line,
    from: opening.centre - opening.width / 2,
    to: opening.centre + opening.width / 2,
  };
}

/** The openings in a room's walls, including those it shares with a neighbour. */
export function roomOpenings(room: Room): Opening[] {
  return OPENINGS.filter((o) => {
    const at = openingLine(o);
    return SIDES.some((side) => {
      const line = sideLine(room.rect, side);
      return (
        line.orient === at.orient &&
        close(line.coord, at.coord) &&
        line.from <= at.from + 1e-6 &&
        at.to <= line.to + 1e-6
      );
    });
  });
}

export const area = (rect: Rect) => Math.round(rect.width * rect.depth * 100) / 100;

export const centre = (rect: Rect): [number, number] => [
  rect.x + rect.width / 2,
  rect.z + rect.depth / 2,
];

export const FOOTPRINT: Rect = {
  x: 0,
  z: 0,
  width: Math.max(...ROOMS.map((r) => r.rect.x + r.rect.width)),
  depth: Math.max(...ROOMS.map((r) => r.rect.z + r.rect.depth)),
};

function findRoomIn(id: RoomId): Rect {
  const r = layout.rooms.find((room) => room.id === id);
  if (!r) throw new Error(`Unknown room ${id}`);
  return { x: r.x, z: r.z, width: r.width, depth: r.depth };
}

export function findRoom(id: RoomId): Room {
  const room = ROOMS.find((r) => r.id === id);
  if (!room) throw new Error(`Unknown room ${id}`);
  return room;
}

/**
 * Area a surface covers, in square metres. The shower is cut out of the floor;
 * walls are the full room height less the doors, windows and passages in them.
 */
export function surfaceArea(room: Room, surface: SurfaceId): number {
  if (surface === "shower") return room.shower ? area(room.shower) : 0;
  if (surface === "floor")
    return Math.round((area(room.rect) - (room.shower ? area(room.shower) : 0)) * 100) / 100;
  const perimeter = 2 * (room.rect.width + room.rect.depth);
  const holes = roomOpenings(room).reduce((sum, o) => sum + o.width * o.height, 0);
  return Math.round((perimeter * WALL_HEIGHT - holes) * 100) / 100;
}

/** Length of the floor/wall joint a surface runs along, in metres. */
export function surfacePerimeter(room: Room, surface: SurfaceId): number {
  const r = surface === "shower" && room.shower ? room.shower : room.rect;
  return Math.round(2 * (r.width + r.depth) * 100) / 100;
}

/** A baseboard run along a room's inner wall face, as [from, to] along a side. */
export interface Run {
  side: Side;
  from: number;
  to: number;
}

/**
 * Baseboard runs along a room's inner wall faces, skipping door and passage
 * openings and the walls of a shower. Mirrors baseboard_runs() in
 * tools/house-model/build_house.py, which builds them in 3D.
 */
export function baseboardRuns(room: Room): Run[] {
  const t = WALL_THICKNESS;
  const runs: Run[] = [];
  for (const side of SIDES) {
    const line = sideLine(room.rect, side);
    const gaps: [number, number][] = OPENINGS.filter((o) => o.kind !== "window")
      .map(openingLine)
      .filter((o) => o.orient === line.orient && close(o.coord, line.coord))
      .map((o) => [o.from, o.to]);
    const shower = room.shower;
    if (shower) {
      const s = { ...shower };
      const touches = {
        north: close(s.z, room.rect.z),
        south: close(s.z + s.depth, room.rect.z + room.rect.depth),
        west: close(s.x, room.rect.x),
        east: close(s.x + s.width, room.rect.x + room.rect.width),
      }[side];
      if (touches) gaps.push(line.orient === "h" ? [s.x, s.x + s.width] : [s.z, s.z + s.depth]);
    }
    let cursor = line.from + t / 2;
    const end = line.to - t / 2;
    for (const [g0, g1] of gaps.sort((a, b) => a[0] - b[0])) {
      if (g0 > cursor) runs.push({ side, from: cursor, to: Math.min(g0, end) });
      cursor = Math.max(cursor, g1);
    }
    if (end > cursor) runs.push({ side, from: cursor, to: end });
  }
  return runs;
}

/** The items (data/items.yaml) an opening is bought as. Mirrors
 * opening_items() in tools/house-model/build_house.py. */
export function openingItems(opening: Opening): string[] {
  if (opening.kind === "window") return ["window", "window_sill"];
  if (opening.kind === "opening") return ["door_casing"];
  return opening.style === "entry"
    ? ["entry_door", "entry_handleset"]
    : ["interior_door", "door_lever"];
}
