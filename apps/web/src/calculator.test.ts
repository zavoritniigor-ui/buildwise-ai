import { expect, test } from "vitest";
import { areas, electrical, plumbing, surfaceMaterials } from "./calculator";

const dry = { length: 4, width: 3, height: 2.4, doors: 1, windows: 1 };
const bath = { length: 3, width: 2.5, height: 2.4, doors: 1, windows: 1 };

test("areas come from the room size less a door and a window", () => {
  // walls: 14 m x 2.4 m less 0.76 x 2.03 and 1.2 x 1.2
  expect(areas(dry)).toEqual({
    floor: 12,
    ceiling: 12,
    walls: 30.62,
    perimeter: 14,
    baseboard: 13.24,
  });
  expect(areas(bath).walls).toBe(23.42);
});

const line = (lines: ReturnType<typeof surfaceMaterials>, search: string) =>
  lines.find((l) => l.quantity.search === search);

test("a dry room's walls and ceiling in sheets, pails, rolls and cans", () => {
  const lines = surfaceMaterials("dry", dry);
  // 30.62 m² of walls and 12 m² of ceiling, + 10 % → 46.89 m², 16 sheets of 2.97 m²
  const board = line(lines, "Sheetrock drywall 1/2 4x8");
  expect(board?.need.total).toBe(46.89);
  expect(board?.need.packages).toBe(16);
  // 0.21 L/m² x 42.62 m² = 8.95 L → 3 cans of 3.79 L
  const paint = line(lines, "Benjamin Moore Regal Select");
  expect(paint?.need.total).toBe(9);
  expect(paint?.need.packages).toBe(3);
  // 0.36 L/m² → 15.4 L, one 17 L pail; tape 1.13 m/m² → 48.2 m, one 76.2 m roll
  expect(line(lines, "Sheetrock all purpose lite joint compound")?.need.packages).toBe(1);
  expect(line(lines, "drywall joint tape")?.need.total).toBe(48.2);
  // screws: 10 per m² of wall and 12 per m² of ceiling
  expect(line(lines, "drywall screws 1 1/4")?.need.total).toBe(451);
});

test("choosing a technology changes the list", () => {
  const kerdi = surfaceMaterials("bathroom", bath);
  const durock = surfaceMaterials("bathroom", bath, { walls: "tiled-wall-cement-board" });
  expect(line(kerdi, "Schluter KERDI-BOARD")).toBeDefined();
  expect(line(durock, "Schluter KERDI-BOARD")).toBeUndefined();
  expect(line(durock, "RedGard waterproofing membrane")?.need.packages).toBeGreaterThan(0);
});

test("electrical estimate for a dry room", () => {
  const e = Object.fromEntries(electrical("dry", dry).map((r) => [r.item, r.amount]));
  // 14 m of wall → 4 receptacles; 1 switch, 1 light; 6 boxes
  expect(e).toEqual({
    duplex_receptacle: 4,
    light_switch: 1,
    ceiling_light: 1,
    electrical_box: 6,
    // loop 14 m + 6 drops of 2.4 m + 5 m home run = 33.4 → 34 m
    nmd90_cable: 34,
  });
});

test("bathroom plumbing scales pipe with the perimeter, keeps the fittings", () => {
  const same = Object.fromEntries(plumbing("bathroom", bath).map((r) => [r.item, r.amount]));
  expect(same.closet_flange).toBe(1);
  expect(same.abs_pipe_3).toBeCloseTo(4.22, 2);
  const big = Object.fromEntries(
    plumbing("bathroom", { ...bath, length: 6 }).map((r) => [r.item, r.amount]),
  );
  // perimeter 17 instead of 11
  expect(big.abs_pipe_3).toBeCloseTo((4.2152 * 17) / 11, 1);
  expect(big.closet_flange).toBe(1);
  expect(plumbing("dry", dry)).toEqual([]);
});
