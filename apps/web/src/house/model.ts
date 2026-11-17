/**
 * A simple single-storey house for the planner. Sizes are in metres; x runs
 * east and z south. The bathroom matches scenario BW-001: 3 x 2.5 m with a
 * 0.9 x 1.2 m curbless shower in the corner.
 */
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

export const WALL_HEIGHT = 2.6;
export const WALL_THICKNESS = 0.12;

export const ROOMS: readonly Room[] = [
  {
    id: "living",
    rect: { x: 0, z: 0, width: 5.5, depth: 4.5 },
    color: "#e9dcc6",
    surfaces: ["floor", "walls"],
  },
  {
    id: "kitchen",
    rect: { x: 5.5, z: 0, width: 3.5, depth: 4.5 },
    color: "#dfe6d4",
    surfaces: ["floor", "walls"],
  },
  {
    id: "bedroom",
    rect: { x: 0, z: 4.5, width: 4, depth: 2.5 },
    color: "#e5dde9",
    surfaces: ["floor", "walls"],
  },
  {
    id: "hallway",
    rect: { x: 4, z: 4.5, width: 2, depth: 2.5 },
    color: "#ece7df",
    surfaces: ["floor", "walls"],
  },
  {
    id: "bathroom",
    rect: { x: 6, z: 4.5, width: 3, depth: 2.5 },
    color: "#d6e5ec",
    surfaces: ["floor", "shower", "walls"],
    shower: { x: 8.1, z: 4.5, width: 0.9, depth: 1.2 },
  },
];

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

export function findRoom(id: RoomId): Room {
  const room = ROOMS.find((r) => r.id === id);
  if (!room) throw new Error(`Unknown room ${id}`);
  return room;
}

/** Floor area a surface covers, in square metres. The shower is part of the floor. */
export function surfaceArea(room: Room, surface: SurfaceId): number {
  if (surface === "shower") return room.shower ? area(room.shower) : 0;
  if (surface === "floor")
    return Math.round((area(room.rect) - (room.shower ? area(room.shower) : 0)) * 100) / 100;
  const perimeter = 2 * (room.rect.width + room.rect.depth);
  return Math.round(perimeter * WALL_HEIGHT * 100) / 100;
}

/**
 * Wall segments as [x1, z1, x2, z2]. Each shared edge appears once, so the
 * walls between rooms are not drawn twice.
 */
export function wallSegments(rooms: readonly Room[] = ROOMS): [number, number, number, number][] {
  const seen = new Set<string>();
  const segments: [number, number, number, number][] = [];
  for (const { rect } of rooms) {
    const { x, z, width, depth } = rect;
    const edges: [number, number, number, number][] = [
      [x, z, x + width, z],
      [x + width, z, x + width, z + depth],
      [x, z + depth, x + width, z + depth],
      [x, z, x, z + depth],
    ];
    for (const edge of edges) {
      const key = edge.map((n) => n.toFixed(2)).join(",");
      if (!seen.has(key)) {
        seen.add(key);
        segments.push(edge);
      }
    }
  }
  return segments;
}
