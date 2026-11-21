import { expect, test } from "vitest";
import { FIXTURES, RUNS, type Run, checkPlumbing, pipeNps, plumbingAmounts } from "./plumbing";

const bathroom = () => Object.fromEntries(plumbingAmounts(["bathroom"]));

test("the bathroom rough-in complies with the Quebec plumbing code", () => {
  expect(checkPlumbing()).toEqual([]);
});

test("pipe sizes are read from the item ids", () => {
  expect(pipeNps("abs_pipe_3")).toBe(3);
  expect(pipeNps("abs_pipe_1_1_2")).toBe(1.5);
  expect(pipeNps("pex_pipe_3_4")).toBe(0.75);
});

test("pipe lengths are measured along every run, slopes included", () => {
  const a = bathroom();
  // stack 3.2 + toilet drain 0.25 + 0.4 + 0.365 (with their 1/50 falls)
  expect(a.abs_pipe_3).toBeCloseTo(4.215, 3);
  // shower 0.15 + 0.88 + 0.14
  expect(a.abs_pipe_2).toBeCloseTo(1.17, 3);
  // vanity 0.1 + 0.63 + 1.4 + 2.25 + 0.1, vent 2.3 + 2.25 + 1.5
  expect(a.abs_pipe_1_1_2).toBeCloseTo(10.532, 3);
  expect(a.pex_pipe_3_4).toBeCloseTo(5.25, 3);
  expect(a.pex_pipe_1_2).toBeCloseTo(6.93, 3);
});

test("an elbow at every bend and a tee where a run joins another", () => {
  const a = bathroom();
  expect(a.abs_elbow_3).toBe(2);
  expect(a.abs_elbow_2).toBe(2);
  expect(a.abs_elbow_1_1_2).toBe(5);
  expect(a.pex_elbow_3_4).toBe(2);
  expect(a.pex_elbow_1_2).toBe(2);
  expect(a.abs_sanitary_tee).toBe(5);
  expect(a.pex_tee).toBe(5);
});

test("supports follow Table 2.3.4.5 on every horizontal stretch", () => {
  const a = bathroom();
  // ABS at ends, bends and every 1.2 m: toilet 3, shower 3, vanity 2 + 6, vent 5
  expect(a.abs_pipe_hanger).toBe(19);
  // PEX at ends and every 0.8 m: cold main 5, hot main 4, toilet 4
  expect(a.pex_pipe_clip).toBe(13);
  // and the stack rests on a clamp at its base (2.3.4.4)
  expect(a.riser_clamp).toBe(1);
  expect(a.pex_crimp_ring).toBe(27);
});

const replace = (id: string, points: Run["points"]) =>
  RUNS.map((r) => (r.id === id ? { ...r, points } : r));

test("a drain laid flat breaks the minimum slope", () => {
  const flat = replace("shower_drain", [
    [8.86, 0, 5.12],
    [8.86, -0.15, 5.12],
    [8.86, -0.15, 6.0],
    [9.0, -0.15, 6.0],
  ]);
  expect(checkPlumbing(flat).map((b) => b.rule)).toContain("2.4.8.1.(1)");
});

test("a trap arm that is too long or falls too far is caught", () => {
  const long = replace("vanity_drain", [
    [6.75, 0.5, 2.6],
    [6.75, 0.45, 4.5],
    [6.75, -0.18, 4.5],
    [6.75, -0.209, 5.9],
    [9.0, -0.255, 5.9],
    [9.0, -0.258, 6.0],
  ]);
  const rules = checkPlumbing(long).map((b) => b.rule);
  expect(rules).toContain("Table 2.5.6.3");
  expect(rules).toContain("2.5.6.3.(1)(b)");
});

test("a water closet must join the stack downstream of the other fixtures", () => {
  const high = replace("toilet_drain", [
    [8.635, 0, 6.4],
    [8.635, -0.05, 6.4],
    [8.635, -0.058, 6.0],
    [9.0, -0.066, 6.0],
  ]);
  expect(checkPlumbing(high).map((b) => b.rule)).toContain("2.5.2.1.(1)(d)");
});

test("an undersized shower drain breaks Table 2.4.9.3", () => {
  const small = RUNS.map((r) => (r.id === "shower_drain" ? { ...r, pipe: "abs_pipe_1_1_2" } : r));
  expect(checkPlumbing(small, FIXTURES).map((b) => b.rule)).toContain("Table 2.4.9.3");
});

test("fixture fittings come with the bathroom only", () => {
  expect(bathroom().closet_flange).toBe(1);
  expect(bathroom().shutoff_valve).toBe(3);
  expect(plumbingAmounts(["kitchen"]).size).toBe(0);
});
