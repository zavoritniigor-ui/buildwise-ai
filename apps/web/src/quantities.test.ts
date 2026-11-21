import { expect, test } from "vitest";
import { findRoom, surfaceArea, surfacePerimeter } from "./house/model";
import { buildupForSurface } from "./knowledge";
import { mergePurchases, need, purchaseList } from "./quantities";

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
  expect(need(mortar, floor)).toMatchObject({ total: 39.4, packages: 2 });
});

test("the BW-001 bathroom floor shopping list", () => {
  const buildup = buildupForSurface("bathroom", "floor");
  if (!buildup) throw new Error("no build-up");
  const lines = Object.fromEntries(
    purchaseList(buildup, floor).map((l) => [l.quantity.search, l.need]),
  );
  expect(lines).toMatchObject({
    "plywood subfloor 5/8 tongue and groove": { total: 7.07 },
    "modified thinset mortar": { total: 13.7, packages: 1 },
    "Schluter DITRA": { total: 7.07 },
    "Schluter KERDI-BAND": { total: 12.1 },
    "unmodified thinset mortar": { total: 39.4, packages: 2 },
    "porcelain floor tile": { total: 7.07 },
    // 0.36 kg/m² x 6.42 m² (Polyblend Plus, 12 x 12 in tile, 1/8 in joints)
    "Polyblend Plus sanded grout": { total: 2.4, packages: 1 },
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

test("the same product on several surfaces is bought once, packages on the total", () => {
  const bathroom = findRoom("bathroom");
  const measure = (surface: "walls" | "ceiling") => ({
    area: surfaceArea(bathroom, surface),
    perimeter: surfacePerimeter(bathroom, surface),
  });
  const walls = buildupForSurface("bathroom", "walls", "painted-moisture-wall");
  const ceiling = buildupForSurface("bathroom", "ceiling");
  if (!walls || !ceiling) throw new Error("missing build-up");
  const merged = mergePurchases([
    purchaseList(walls, measure("walls")),
    purchaseList(ceiling, measure("ceiling")),
  ]);
  const paint = merged.filter((l) => l.quantity.search === "Benjamin Moore Aura Bath and Spa");
  expect(paint).toHaveLength(1);
  // (26.58 + 7.5) m² x 0.23 L = 7.84 L, that is 2.07 cans of 3.79 L, so 3 cans
  expect(paint[0]?.need.total).toBe(7.9);
  expect(paint[0]?.need.packages).toBe(3);
});
