/**
 * Quick estimate for any room from its size: the surfaces' materials from the
 * chosen build-ups (manufacturer rates, in sheets, pails, rolls and cans), the
 * baseboard, an electrical rough-in and, for a bathroom, the plumbing.
 *
 * Openings are taken at the example house's sizes: interior doors 0.76 x 2.03 m
 * and windows 1.2 x 1.2 m. The electrical and plumbing parts are estimates and
 * are flagged as such in the app.
 */
import { type Buildup, KNOWLEDGE, type ProductPicks, applyProducts } from "./knowledge";
import { type PurchaseLine, mergePurchases, purchaseList } from "./quantities";
import { plumbingAmounts } from "./plumbing";

export type RoomType = "dry" | "kitchen" | "bathroom";
export type CalcSurface = "floor" | "walls" | "ceiling";

export interface RoomSize {
  length: number;
  width: number;
  height: number;
  doors: number;
  windows: number;
}

export const DOOR = { width: 0.76, height: 2.03 };
export const WINDOW = { width: 1.2, height: 1.2 };

/** The build-ups each kind of room offers per surface; the first is the default. */
export const ROOM_TYPES: Record<RoomType, Record<CalcSurface, readonly string[]>> = {
  dry: {
    floor: ["dry-floor-wood", "tiled-floor-wood"],
    walls: ["painted-wall"],
    ceiling: ["painted-ceiling"],
  },
  kitchen: {
    floor: ["tiled-floor-wood", "dry-floor-wood"],
    walls: ["painted-wall", "painted-moisture-wall"],
    ceiling: ["painted-ceiling"],
  },
  bathroom: {
    floor: ["wet-floor-wood", "wet-floor-cement-board", "wet-floor-mapeguard"],
    walls: [
      "tiled-wet-wall",
      "tiled-wall-cement-board",
      "tiled-wall-mapeguard",
      "painted-moisture-wall",
    ],
    ceiling: ["painted-moisture-ceiling"],
  },
};

export interface Areas {
  floor: number;
  ceiling: number;
  walls: number;
  /** floor/wall joint, m */
  perimeter: number;
  /** wall length less the door widths, m */
  baseboard: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function areas(size: RoomSize): Areas {
  const { length, width, height, doors, windows } = size;
  const perimeter = 2 * (length + width);
  const openings = doors * DOOR.width * DOOR.height + windows * WINDOW.width * WINDOW.height;
  return {
    floor: round2(length * width),
    ceiling: round2(length * width),
    walls: round2(Math.max(0, perimeter * height - openings)),
    perimeter: round2(perimeter),
    baseboard: round2(Math.max(0, perimeter - doors * DOOR.width)),
  };
}

const buildup = (id: string): Buildup | undefined => KNOWLEDGE.buildups.find((b) => b.id === id);

/** The build-ups a room type offers for a surface. */
export function options(type: RoomType, surface: CalcSurface): Buildup[] {
  return ROOM_TYPES[type][surface].flatMap((id) => buildup(id) ?? []);
}

/** The surfaces' materials, merged across floor, walls and ceiling. */
export function surfaceMaterials(
  type: RoomType,
  size: RoomSize,
  chosen: Partial<Record<CalcSurface, string>> = {},
  picks: ProductPicks = {},
): PurchaseLine[] {
  const a = areas(size);
  const lists = (["floor", "walls", "ceiling"] as const).map((surface) => {
    const offered = options(type, surface);
    const pick = offered.find((b) => b.id === chosen[surface]) ?? offered[0];
    return pick
      ? purchaseList(applyProducts(pick, picks), { area: a[surface], perimeter: a.perimeter })
      : [];
  });
  return mergePurchases(lists);
}

export interface Estimate {
  item: string;
  amount: number;
}

/**
 * Electrical rough-in estimate: a receptacle for every 3.6 m of wall (so that
 * no point along the floor line is more than 1.8 m from one), a switch per
 * door, a ceiling light per 15 m² of floor, a box per device, and NMD90 cable
 * for a loop round the room, a drop to every device and a 5 m home run.
 */
export function electrical(type: RoomType, size: RoomSize): Estimate[] {
  const a = areas(size);
  const receptacles = Math.max(1, Math.ceil(a.perimeter / 3.6));
  const switches = Math.max(1, size.doors);
  const lights = Math.max(1, Math.ceil(a.floor / 15));
  const gfci = type === "bathroom" ? 1 : type === "kitchen" ? 2 : 0;
  const fans = type === "bathroom" ? 1 : 0;
  const devices = receptacles + gfci + switches + lights + fans;
  const cable = a.perimeter + devices * size.height + 5;
  return [
    { item: "duplex_receptacle", amount: receptacles },
    { item: "gfci_receptacle", amount: gfci },
    { item: "light_switch", amount: switches },
    { item: "ceiling_light", amount: lights },
    { item: "bathroom_exhaust_fan", amount: fans },
    { item: "electrical_box", amount: devices },
    { item: "nmd90_cable", amount: Math.ceil(cable) },
  ].filter((e) => e.amount > 0);
}

/** Perimeter of the code-checked example bathroom (3 x 2.5 m), m. */
const EXAMPLE_BATHROOM_PERIMETER = 11;
const LENGTH_ITEMS = /_pipe_|^nmd90/;
const SCALED_COUNTS = /hanger|clip|crimp_ring/;

/**
 * Bathroom plumbing estimate: the example bathroom's rough-in (which passes the
 * Quebec plumbing code), with pipe lengths and supports scaled by the ratio of
 * the room's perimeter to the example's; fixture fittings stay as they are.
 */
export function plumbing(type: RoomType, size: RoomSize): Estimate[] {
  if (type !== "bathroom") return [];
  const ratio = areas(size).perimeter / EXAMPLE_BATHROOM_PERIMETER;
  return [...plumbingAmounts(["bathroom"])].map(([item, amount]) => ({
    item,
    amount: LENGTH_ITEMS.test(item)
      ? round2(amount * ratio)
      : SCALED_COUNTS.test(item)
        ? Math.ceil(amount * ratio)
        : amount,
  }));
}

/** The build-ups the room uses with the current technology choices. */
export function chosenBuildups(
  type: RoomType,
  chosen: Partial<Record<CalcSurface, string>> = {},
): Buildup[] {
  return (["floor", "walls", "ceiling"] as const).flatMap((surface) => {
    const offered = options(type, surface);
    const pick = offered.find((b) => b.id === chosen[surface]) ?? offered[0];
    return pick ? [pick] : [];
  });
}
