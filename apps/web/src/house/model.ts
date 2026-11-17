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

export const WALL_HEIGHT = layout.wallHeight;
export const WALL_THICKNESS = layout.wallThickness;

export const ROOMS: readonly Room[] = layout.rooms.map((r) => ({
  id: r.id as RoomId,
  rect: { x: r.x, z: r.z, width: r.width, depth: r.depth },
  color: r.color,
  surfaces: r.surfaces as readonly SurfaceId[],
  shower: r.shower,
}));

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
