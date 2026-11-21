import { expect, test } from "vitest";
import { plumbingAmounts } from "./plumbing";

const bathroom = () => Object.fromEntries(plumbingAmounts(["bathroom"]));

test("pipe lengths are measured along every run", () => {
  const a = bathroom();
  // stack 3.2 + toilet drain 0.25 + 0.4 + 0.365
  expect(a.abs_pipe_3).toBeCloseTo(4.215);
  // shower drain 0.18 + 0.88 + 0.14
  expect(a.abs_pipe_2).toBeCloseTo(1.2);
  // vanity trap arm 0.1, drain 0.57 + 1.4 + 2.25 + 0.1, vent 2.3 + 2.25 + 1.5
  expect(a.abs_pipe_1_1_2).toBeCloseTo(10.47);
  // cold main 0.25 + 2.55, hot main 0.25 + 2.2
  expect(a.pex_pipe_3_4).toBeCloseTo(5.25);
  // vanity 0.7 + 0.7, shower 1.15 + 1.15, shower riser 0.95, toilet 1.68 + 0.25 + 0.35
  expect(a.pex_pipe_1_2).toBeCloseTo(6.93);
});

test("an elbow at every bend and a tee where a run joins another", () => {
  const a = bathroom();
  expect(a.abs_elbow_3).toBe(2);
  expect(a.abs_elbow_2).toBe(2);
  expect(a.abs_elbow_1_1_2).toBe(5);
  expect(a.pex_elbow_3_4).toBe(2);
  expect(a.pex_elbow_1_2).toBe(2);
  // toilet, shower, vanity drains and both vent ends join the stack or a drain
  expect(a.abs_sanitary_tee).toBe(5);
  // vanity hot and cold, shower hot and cold, toilet leave the mains
  expect(a.pex_tee).toBe(5);
});

test("supports at the code's maximum spacing on horizontal runs", () => {
  const a = bathroom();
  // ABS every 1.2 m: toilet 1+1, shower 1+1, vanity trap arm 1 + 2+2+1, vent 2+2
  expect(a.abs_pipe_hanger).toBe(14);
  // PEX every 0.8 m: cold main 4, hot main 3, toilet 3+1
  expect(a.pex_pipe_clip).toBe(11);
  // 2 per elbow (4), 3 per tee (5), 1 per stub-out (4)
  expect(a.pex_crimp_ring).toBe(27);
});

test("fixture fittings come with the bathroom only", () => {
  expect(bathroom().closet_flange).toBe(1);
  expect(bathroom().shutoff_valve).toBe(3);
  expect(plumbingAmounts(["kitchen"]).size).toBe(0);
});
