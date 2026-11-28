import { expect, test } from "vitest";
import {
  FANS,
  type Fan,
  checkLighting,
  checkVentilation,
  ductLength,
  maxDuctLength,
  ventilationAmounts,
} from "./ventilation";
import fixtures from "./house/fixtures.json";

const rules = (picks = {}, fans?: readonly Fan[]) =>
  checkVentilation(picks, fans).map((b) => b.rule);

test("the default fan, its duct and outlet meet the Quebec building code", () => {
  expect(checkVentilation()).toEqual([]);
  expect(rules({ "bathroom-fan": "broan-qtxeg080" })).toEqual([]);
});

test("Table 9.32.3.11.-A gives the duct length by pressure, diameter and airflow", () => {
  expect(maxDuctLength(25, 100, 25)).toBe(2);
  expect(maxDuctLength(62.5, 100, 25)).toBe(8);
  // a fan rated at 0.375 in. (93.75 Pa) reads the 62.5 Pa rows
  expect(maxDuctLength(93.75, 150, 25)).toBe(58);
  expect(maxDuctLength(20, 100, 25)).toBe(0);
});

test("a 50 cfm fan at 4 sones breaks the airflow and sound limits", () => {
  const broken = rules({ "bathroom-fan": "broan-688" });
  expect(broken).toContain("9.32.3.7.(4)");
  expect(broken).toContain("Table 9.32.3.10.-B");
});

const fan = FANS[0] as Fan;
const changed = (change: Partial<Fan>) => [{ ...fan, ...change }];

test("a flexible 4 in duct too long for the fan's pressure is caught", () => {
  const long = changed({
    duct: {
      ...fan.duct,
      points: [
        [7.75, 2.62, 5.15],
        [7.75, 2.75, 5.15],
        [7.75, 2.75, 30],
      ],
    },
  });
  expect(rules({}, long)).toContain("Table 9.32.3.11.-A");
});

test("an uninsulated attic duct, a duct ending indoors and a cap without damper break the code", () => {
  expect(rules({}, changed({ duct: { ...fan.duct, rsi: 0 } }))).toContain("9.32.3.11.(3)");
  const indoors = changed({
    duct: {
      ...fan.duct,
      points: [
        [7.75, 2.62, 5.15],
        [7.75, 2.75, 5.15],
        [8.5, 2.75, 5.15],
      ],
    },
  });
  expect(rules({}, indoors)).toContain("9.32.3.11.(2)");
  expect(rules({}, changed({ outlet: { ...fan.outlet, damper: false } }))).toContain(
    "9.32.3.13.(11)",
  );
  expect(rules({}, changed({ outlet: { ...fan.outlet, intakeDistance: 1 } }))).toContain(
    "9.32.3.13.(4)",
  );
});

test("every room has a switched light and the entrance an exterior light", () => {
  expect(checkLighting()).toEqual([]);
  const noOutdoor = fixtures.placements.filter((p) => p.piece !== "exterior_light");
  expect(checkLighting(noOutdoor).map((b) => b.rule)).toEqual(["9.34.2.1.(1)"]);
  const darkBath = fixtures.placements.filter(
    (p) => !(p.room === "bathroom" && p.piece === "ceiling_light"),
  );
  expect(checkLighting(darkBath).map((b) => b.room)).toEqual(["bathroom"]);
});

test("the fan needs its own switch in the room", () => {
  expect(rules({}, changed({ fixture: "no_such_fan" }))).toContain("9.32.3.7.(6)");
});

test("the bathroom duct, cap, clamps and tape are counted", () => {
  expect(ductLength(fan.duct)).toBeCloseTo(1.44, 2);
  expect(Object.fromEntries(ventilationAmounts(["bathroom"]))).toEqual({
    insulated_flex_duct_4: 1.44,
    exhaust_wall_cap_4: 1,
    duct_clamp: 2,
    foil_duct_tape: 1,
  });
  expect(ventilationAmounts(["kitchen"]).size).toBe(0);
});
