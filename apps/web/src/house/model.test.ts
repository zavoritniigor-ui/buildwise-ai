import { expect, test } from "vitest";
import { FOOTPRINT, ROOMS, area, findRoom, surfaceArea, wallSegments } from "./model";

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

test("shared walls are drawn once", () => {
  const keys = wallSegments().map((s) => s.join(","));
  expect(new Set(keys).size).toBe(keys.length);
});
