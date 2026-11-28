/**
 * Mechanical exhaust (house/ventilation.json) and lighting outlets
 * (house/fixtures.json), counted and checked against the Quebec Construction
 * Code, Chapter I Building (the National Building Code of Canada 2020 with
 * Quebec amendments). Page numbers are those of that PDF (document
 * qc-building-2020).
 *
 * The fan is the one the person picked (or the default); its HVI ratings come
 * from its manufacturer's data sheet (data/products.yaml).
 */
import fixtures from "./house/fixtures.json";
import layout from "./house/layout.json";
import ventilation from "./house/ventilation.json";
import type { RoomId } from "./house/model";
import { type ItemProduct, type ProductPicks, chosenItemProduct, findItem } from "./knowledge";
import type { Point } from "./plumbing";

export const BUILDING_CODE = "qc-building-2020";

export interface Breach {
  rule: string;
  page: number;
  detail: string;
  /** the room the breach is in */
  room?: string;
}

interface Duct {
  item: string;
  flexible: boolean;
  rsi: number;
  unheated: boolean;
  points: readonly Point[];
}

export interface Fan {
  id: string;
  room: string;
  /** the fixtures.json piece of the fan */
  fixture: string;
  duct: Duct;
  outlet: { item: string; damper: boolean; intakeDistance: number | null; soffit: boolean };
}

const toPoint = ([x = 0, y = 0, z = 0]: readonly number[]): Point => [x, y, z];

export const FANS: readonly Fan[] = ventilation.fans.map((f) => ({
  ...f,
  duct: { ...f.duct, points: f.duct.points.map(toPoint) },
}));

/** 9.32.3.7.(4), p. 1072: a bathroom fan exhausts at least 25 L/s. */
export const REQUIRED_FLOW = 25;
/** Table 9.32.3.10.-B, p. 1074: bathroom fans, rated to HVI 915. */
export const MAX_SONES = 3.5;
/** L/s in one cfm. */
const CFM = 0.471947;
/** The code's own equivalence in Table 9.32.3.10.-A: 25 Pa = 0.1 in. of water. */
const PA_PER_INCH = 250;

const AIRFLOWS = [7, 15, 25, 35, 50, 75, 100] as const;
/**
 * Table 9.32.3.11.-A, pp. 1075-1076: maximum length of duct, m, by the fan's
 * external static pressure (Pa), the duct diameter (mm) and the airflow column
 * (L/s, as AIRFLOWS).
 */
const DUCT_TABLE: Record<number, Record<number, readonly number[]>> = {
  25: {
    75: [6, 1, 0, 0, 0, 0, 0],
    100: [25, 6, 2, 1, 0, 0, 0],
    125: [60, 17, 6, 3, 1, 0, 0],
    150: [60, 42, 16, 8, 4, 2, 1],
    175: [60, 60, 34, 18, 9, 4, 2],
    200: [60, 60, 60, 35, 18, 8, 5],
  },
  50: {
    75: [16, 4, 1, 0, 0, 0, 0],
    100: [60, 16, 6, 3, 1, 0, 0],
    125: [60, 47, 18, 9, 5, 2, 1],
    150: [60, 60, 44, 23, 12, 5, 3],
    175: [60, 60, 60, 49, 25, 12, 7],
    200: [60, 60, 60, 60, 48, 22, 13],
  },
  62.5: {
    75: [22, 5, 2, 1, 0, 0, 0],
    100: [60, 21, 8, 4, 2, 1, 0],
    125: [60, 60, 24, 12, 6, 3, 1],
    150: [60, 60, 58, 31, 15, 7, 4],
    175: [60, 60, 60, 60, 33, 15, 9],
    200: [60, 60, 60, 60, 60, 29, 17],
  },
  100: {
    75: [38, 9, 3, 1, 0, 0, 0],
    100: [60, 36, 14, 7, 3, 1, 1],
    125: [60, 60, 41, 22, 11, 5, 3],
    150: [60, 60, 60, 53, 27, 12, 7],
    175: [60, 60, 60, 60, 57, 27, 15],
    200: [60, 60, 60, 60, 60, 51, 30],
  },
  150: {
    75: [59, 14, 5, 2, 1, 0, 0],
    100: [60, 57, 22, 11, 6, 2, 1],
    125: [60, 60, 60, 34, 17, 8, 4],
    150: [60, 60, 60, 60, 42, 20, 11],
    175: [60, 60, 60, 60, 60, 42, 24],
    200: [60, 60, 60, 60, 60, 60, 46],
  },
};
const PRESSURES = Object.keys(DUCT_TABLE)
  .map(Number)
  .sort((a, b) => a - b);
const DIAMETERS = [75, 100, 125, 150, 175, 200] as const;

/**
 * The maximum length of a duct, m, for a fan rated at `pressure` Pa: the
 * table's column at or below that pressure (the fan is rated at least there)
 * and the airflow column at or above `flow`. Zero where the table gives none.
 */
export function maxDuctLength(pressure: number, diameter: number, flow: number): number {
  const p = [...PRESSURES].reverse().find((x) => x <= pressure + 1e-9);
  const column = AIRFLOWS.findIndex((x) => x >= flow - 1e-9);
  if (p === undefined || column < 0) return 0;
  return DUCT_TABLE[p]?.[diameter]?.[column] ?? 0;
}

const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export const ductLength = (duct: Duct) =>
  duct.points.slice(1).reduce((sum, p, i) => sum + distance(duct.points[i] ?? p, p), 0);

/**
 * Whether a duct of this length and diameter can carry the required airflow
 * from a fan rated at this pressure. 9.32.3.11.(11): a flexible duct may be
 * sized with the next larger diameter, or as a duct twice as long.
 */
function ductFits(pressure: number, diameter: number, length: number, flexible: boolean): boolean {
  if (!flexible) return length <= maxDuctLength(pressure, diameter, REQUIRED_FLOW);
  const next = DIAMETERS.find((d) => d > diameter);
  return (
    2 * length <= maxDuctLength(pressure, diameter, REQUIRED_FLOW) ||
    (next !== undefined && length <= maxDuctLength(pressure, next, REQUIRED_FLOW))
  );
}

export interface FanRating {
  setting?: number;
  inWg: number;
  cfm: number;
  sones?: number;
}

/** The fan picked for a slot's fan item, with its ratings. */
export function chosenFan(picks: ProductPicks = {}): ItemProduct | undefined {
  const slot = findItem("bathroom_exhaust_fan")?.slot;
  return slot ? chosenItemProduct(slot, picks) : undefined;
}

/** The sound rating of a fan at a rating point: its own, else its setting's at 0.1 in. */
function sonesAt(ratings: readonly FanRating[], rating: FanRating): number | undefined {
  if (rating.sones !== undefined) return rating.sones;
  const rated = ratings.filter((r) => r.setting === rating.setting && r.sones !== undefined);
  return rated.length ? Math.min(...rated.map((r) => r.sones ?? Infinity)) : undefined;
}

/** The house's outer walls, from the rooms' extent. */
function houseBounds() {
  const rooms = layout.rooms;
  return {
    minX: Math.min(...rooms.map((r) => r.x)),
    maxX: Math.max(...rooms.map((r) => r.x + r.width)),
    minZ: Math.min(...rooms.map((r) => r.z)),
    maxZ: Math.max(...rooms.map((r) => r.z + r.depth)),
  };
}

/** Checks each fan, its duct and outlet with the picked fan's ratings. */
export function checkVentilation(
  picks: ProductPicks = {},
  fans: readonly Fan[] = FANS,
  product: ItemProduct | undefined = chosenFan(picks),
): Breach[] {
  const breaches: Breach[] = [];
  const rate = product?.fan;
  for (const fan of fans) {
    const where = `${fan.id}`;
    const push = (b: Breach) => breaches.push({ ...b, room: fan.room });
    if (!rate) {
      push({ rule: "data", page: 0, detail: `${where}: no fan ratings` });
      continue;
    }
    const ratings = rate.ratings as readonly FanRating[];
    const flows = ratings.map((r) => ({ ...r, flow: r.cfm * CFM, pressure: r.inWg * PA_PER_INCH }));
    // 9.32.3.7.(4), p. 1072: at least 25 L/s, at a static pressure the table covers
    const enough = flows.filter(
      (r) => r.flow >= REQUIRED_FLOW - 1e-9 && r.pressure >= (PRESSURES[0] ?? 25) - 1e-9,
    );
    if (enough.length === 0)
      push({
        rule: "9.32.3.7.(4)",
        page: 1072,
        detail: `${where}: at most ${Math.max(...flows.map((r) => r.flow)).toFixed(1)} L/s, under ${REQUIRED_FLOW}`,
      });
    // Table 9.32.3.11.-A, pp. 1075-1076: the duct carries 25 L/s at the fan's pressure
    const length = ductLength(fan.duct);
    const fits = enough.filter((r) => ductFits(r.pressure, rate.duct, length, fan.duct.flexible));
    if (enough.length > 0 && fits.length === 0)
      push({
        rule: "Table 9.32.3.11.-A",
        page: 1075,
        detail: `${where}: ${length.toFixed(2)} m of ${rate.duct} mm duct is too long for the fan`,
      });
    // Table 9.32.3.10.-B, p. 1074: no louder than 3.5 sones where it meets the code
    const operating = fits.length ? fits : enough.length ? enough : flows;
    const quietest = Math.min(...operating.map((r) => sonesAt(ratings, r) ?? Infinity));
    if (quietest > MAX_SONES)
      push({
        rule: "Table 9.32.3.10.-B",
        page: 1074,
        detail: `${where}: ${Number.isFinite(quietest) ? quietest : "unrated"} sones, over ${MAX_SONES}`,
      });
    // 9.32.3.7.(6), p. 1072: a manual switch in the room served
    const switched = fixtures.placements.some(
      (p) =>
        p.room === fan.room &&
        p.piece === "switch" &&
        (p as { controls?: string }).controls === fan.fixture,
    );
    if (!switched)
      push({ rule: "9.32.3.7.(6)", page: 1072, detail: `${where}: no switch in the room` });
    // 9.32.3.11.(3), p. 1075: insulated to RSI 0.74 through unheated space
    if (fan.duct.unheated && fan.duct.rsi < 0.74)
      push({ rule: "9.32.3.11.(3)", page: 1075, detail: `${where}: duct RSI under 0.74` });
    // 9.32.3.11.(2), p. 1075: the duct ends outdoors, not in an enclosed space
    const end = fan.duct.points[fan.duct.points.length - 1];
    const b = houseBounds();
    const outside =
      end !== undefined &&
      (end[0] >= b.maxX || end[0] <= b.minX || end[2] >= b.maxZ || end[2] <= b.minZ);
    if (!outside)
      push({ rule: "9.32.3.11.(2)", page: 1075, detail: `${where}: does not reach outdoors` });
    // 9.32.3.13.(11) and (8), p. 1078: a backdraft damper, 100 mm above the ground
    if (!fan.outlet.damper)
      push({ rule: "9.32.3.13.(11)", page: 1078, detail: `${where}: no backdraft damper` });
    if (end !== undefined && end[1] < 0.1)
      push({ rule: "9.32.3.13.(8)", page: 1078, detail: `${where}: outlet under 100 mm` });
    // 9.32.3.13.(4) and (5), p. 1077: 1.8 m from intakes and vented soffits
    if (fan.outlet.intakeDistance !== null && fan.outlet.intakeDistance < 1.8)
      push({ rule: "9.32.3.13.(4)", page: 1077, detail: `${where}: intake within 1.8 m` });
    if (fan.outlet.soffit)
      push({ rule: "9.32.3.13.(5)", page: 1077, detail: `${where}: outlet in a soffit` });
  }
  return breaches;
}

interface Placement {
  room: string;
  piece: string;
  controls?: string;
  exterior?: boolean;
}

/**
 * 9.34.2.2.(1), p. 1089: a lighting outlet with fixture, controlled by a wall
 * switch, in every room of the dwelling; 9.34.2.1.(1), p. 1089: an exterior
 * light at every entrance, switched from inside.
 */
export function checkLighting(placements: readonly Placement[] = fixtures.placements): Breach[] {
  const breaches: Breach[] = [];
  const isLight = (piece: string) => {
    const item = fixtures.pieces[piece as keyof typeof fixtures.pieces]?.item;
    return item !== undefined && findItem(item)?.category === "lighting";
  };
  for (const room of layout.rooms) {
    const here = placements.filter((p) => p.room === room.id);
    const lights = here.filter((p) => isLight(p.piece) && !p.exterior);
    const switches = here.filter((p) => p.piece === "switch" && !p.controls);
    if (lights.length === 0 || switches.length === 0)
      breaches.push({
        rule: "9.34.2.2.(1)",
        page: 1089,
        room: room.id,
        detail: `${room.id}: ${lights.length ? "no wall switch" : "no light fixture"}`,
      });
  }
  for (const entry of layout.openings.filter((o) => (o as { style?: string }).style === "entry")) {
    const here = placements.filter((p) => p.room === entry.room);
    const light = here.find((p) => p.exterior && isLight(p.piece));
    const switched = light && here.some((p) => p.piece === "switch" && p.controls === light.piece);
    if (!switched)
      breaches.push({
        rule: "9.34.2.1.(1)",
        page: 1089,
        room: entry.room,
        detail: `${entry.id}: ${light ? "exterior light not switched inside" : "no exterior light"}`,
      });
  }
  return breaches;
}

/**
 * What the ducts take: the length of each duct, a wall cap and two clamps per
 * fan, and a roll of foil tape for the joints (9.32.3.11.(8), p. 1075).
 */
export function ventilationAmounts(rooms: readonly RoomId[]): Map<string, number> {
  const amounts = new Map<string, number>();
  const add = (id: string, n: number) => amounts.set(id, (amounts.get(id) ?? 0) + n);
  for (const fan of FANS) {
    if (!rooms.includes(fan.room as RoomId)) continue;
    add(fan.duct.item, Math.round(ductLength(fan.duct) * 100) / 100);
    add(fan.outlet.item, 1);
    add(ventilation.sealing.clamp, 2);
    add(ventilation.sealing.tape, 1);
  }
  return amounts;
}
