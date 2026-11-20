import { expect, test } from "vitest";
import { findRoom, surfaceArea, surfacePerimeter } from "./house/model";
import { buildupForSurface } from "./knowledge";
import { need, purchaseList } from "./quantities";

const bathroom = findRoom("bathroom");
const floor = {
  area: surfaceArea(bathroom, "floor"),
  perimeter: surfacePerimeter(bathroom, "floor"),
};

test("the bathroom floor measures 6.42 m² with 11 m of floor/wall joint", () => {
  expect(floor).toEqual({ area: 6.42, perimeter: 11 });
});

test("quantities round up and count whole packages", () => {
  const mortar = {
    per: "area" as const,
    amount: 6.13,
    unit: "kg" as const,
    waste: 0,
    basis: "manufacturer" as const,
    package: { size: 22.68, kind: "bag" as const },
    search: "unmodified thinset mortar",
  };
  // 6.13 kg/m² x 6.42 m² = 39.35 kg -> 39.4 kg -> 2 bags of 22.68 kg
  expect(need(mortar, floor)).toEqual({ total: 39.4, packages: 2 });
});

test("the BW-001 bathroom floor shopping list", () => {
  const buildup = buildupForSurface("bathroom", "floor");
  if (!buildup) throw new Error("no build-up");
  const lines = Object.fromEntries(
    purchaseList(buildup, floor).map((l) => [l.quantity.search, l.need]),
  );
  expect(lines).toEqual({
    "plywood subfloor 5/8 tongue and groove": { total: 7.07 },
    "modified thinset mortar": { total: 13.7, packages: 1 },
    "Schluter DITRA": { total: 7.07 },
    "Schluter KERDI-BAND": { total: 12.1 },
    "unmodified thinset mortar": { total: 39.4, packages: 2 },
    "porcelain floor tile": { total: 7.07 },
    "sanded grout": { total: 3.3 },
  });
});

test("a shower takes exactly one tray and one drain", () => {
  const buildup = buildupForSurface("bathroom", "shower");
  if (!buildup) throw new Error("no build-up");
  const shower = {
    area: surfaceArea(bathroom, "shower"),
    perimeter: surfacePerimeter(bathroom, "shower"),
  };
  const counts = purchaseList(buildup, shower).filter((l) => l.quantity.unit === "pcs");
  expect(counts.map((l) => l.need.total)).toEqual([1, 1]);
});
