/**
 * The plumbing rough-in (house/plumbing.json), counted from its geometry and
 * checked against the Quebec Construction Code, Chapter III Plumbing (the
 * National Plumbing Code of Canada 2020 with Quebec amendments). Page numbers
 * are those of that PDF (document qc-plumbing-2020).
 *
 * Counting:
 * - pipe: the developed length of every run, per pipe size;
 * - elbows: one at every bend, except where another run joins (that is a tee);
 * - tees: one where a run starts or ends part-way along another run;
 * - supports (Table 2.3.4.5, p. 112), on every nominally horizontal stretch:
 *   ABS at both ends, at every change of direction and at most 1.2 m apart;
 *   PEX at both ends and at most 0.8 m apart along the stretch;
 * - crimp rings: one per PEX pipe end in an elbow, tee or stub-out;
 * - the fittings at the fixtures listed in the data.
 */
import plumbing from "./house/plumbing.json";
import type { RoomId } from "./house/model";

export type Point = readonly [number, number, number];

export interface Run {
  id: string;
  room: string;
  system: string;
  pipe: string;
  points: readonly Point[];
}

export interface Fixture {
  id: string;
  kind: "lavatory" | "shower" | "water_closet";
  room: string;
  /** nominal pipe size of the trap, inches */
  trapNps: number;
  /** hydraulic load, Table 2.4.9.3 (p. 125) */
  fixtureUnits: number;
  run: string;
  /** vertex of the run at the trap outlet */
  trap: number;
  /** vertex of the run where its vent connects (a vent pipe or the stack) */
  vent: number;
  /** height of the fixture's flood level rim, m */
  floodRim?: number;
  /** water closets depend on siphonic action: Sentences 2.5.6.3.(2) and (3) */
  siphonic?: boolean;
}

interface PipeSpec {
  radius: number;
  elbow: string;
  tee: string;
  support: string;
}

const toPoint = ([x = 0, y = 0, z = 0]: readonly number[]): Point => [x, y, z];

export const RUNS: readonly Run[] = plumbing.runs.map((r) => ({
  ...r,
  points: r.points.map(toPoint),
}));
export const FIXTURES = plumbing.fixtures as readonly Fixture[];
const PIPES = plumbing.pipes as Record<string, PipeSpec>;
const SPACING = plumbing.supportSpacing as Record<string, number>;
const EPS = 1e-6;
const INCH = 0.0254;

const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const across = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[2] - b[2]);
/** Nominally horizontal: runs more along the floor than up or down. */
const level = (a: Point, b: Point) => Math.abs(a[1] - b[1]) < across(a, b);

/** Nominal size of a pipe item, inches: abs_pipe_1_1_2 -> 1.5, pex_pipe_3_4 -> 0.75. */
export function pipeNps(pipe: string): number {
  const parts = pipe.split("_").slice(2).map(Number);
  if (parts.length === 1) return parts[0] ?? 0;
  if (parts.length === 2) return (parts[0] ?? 0) / (parts[1] ?? 1);
  return (parts[0] ?? 0) + (parts[1] ?? 0) / (parts[2] ?? 1);
}

/** Whether p lies on segment a-b, away from both of its ends. */
function inside(p: Point, a: Point, b: Point): boolean {
  const d = distance(a, b);
  return (
    Math.abs(distance(a, p) + distance(p, b) - d) < EPS &&
    distance(a, p) > EPS &&
    distance(p, b) > EPS
  );
}

/** Whether p lies on a run anywhere except at that run's two ends. */
function onRun(p: Point, run: Run): boolean {
  const pts = run.points;
  return pts.some((a, i) => {
    const b = pts[i + 1];
    if (b && inside(p, a, b)) return true;
    return i > 0 && i < pts.length - 1 && distance(p, a) < EPS;
  });
}

const segments = (points: readonly Point[]) =>
  points.slice(1).map((b, i) => [points[i] as Point, b] as const);

/** Consecutive nominally horizontal segments, as lists of points. */
function stretches(run: Run): Point[][] {
  const out: Point[][] = [];
  let current: Point[] = [];
  for (const [a, b] of segments(run.points)) {
    if (level(a, b)) {
      if (current.length === 0) current.push(a);
      current.push(b);
    } else if (current.length) {
      out.push(current);
      current = [];
    }
  }
  if (current.length) out.push(current);
  return out;
}

function supports(run: Run, spec: PipeSpec): number {
  const spacing = SPACING[spec.support] ?? 1;
  const abs = run.pipe.startsWith("abs_");
  let count = 0;
  for (const stretch of stretches(run)) {
    const parts = segments(stretch);
    if (abs) {
      // both ends and every change of direction, then intermediates
      count += stretch.length;
      for (const [a, b] of parts) count += Math.ceil(distance(a, b) / spacing - EPS) - 1;
    } else {
      const length = parts.reduce((sum, [a, b]) => sum + distance(a, b), 0);
      count += Math.ceil(length / spacing - EPS) + 1;
    }
  }
  return count;
}

export function plumbingAmounts(rooms: readonly RoomId[]): Map<string, number> {
  const amounts = new Map<string, number>();
  const add = (id: string, n: number) => {
    if (n > 0) amounts.set(id, (amounts.get(id) ?? 0) + n);
  };
  const runs = RUNS.filter((r) => rooms.includes(r.room as RoomId));
  const joined = (run: Run, p: Point) =>
    runs.some(
      (other) =>
        other !== run &&
        [other.points[0], other.points[other.points.length - 1]].some(
          (end) => end !== undefined && distance(end, p) < EPS,
        ),
    );
  let rings = 0;
  for (const run of runs) {
    const spec = PIPES[run.pipe];
    if (!spec) throw new Error(`Unknown pipe ${run.pipe}`);
    const pex = run.pipe.startsWith("pex_");
    add(
      run.pipe,
      segments(run.points).reduce((sum, [a, b]) => sum + distance(a, b), 0),
    );
    const elbows = run.points.slice(1, -1).filter((p) => !joined(run, p)).length;
    add(spec.elbow, elbows);
    if (pex) rings += 2 * elbows;
    for (const end of [run.points[0], run.points[run.points.length - 1]]) {
      if (!end) continue;
      const main = runs.find((other) => other !== run && onRun(end, other));
      if (!main) continue;
      const mainSpec = PIPES[main.pipe];
      if (mainSpec) add(mainSpec.tee, 1);
      if (main.pipe.startsWith("pex_")) rings += 3;
    }
    add(spec.support, supports(run, spec));
  }
  for (const fitting of plumbing.fittings) {
    if (!rooms.includes(fitting.room as RoomId)) continue;
    add(fitting.item, fitting.count);
    if (fitting.item === "pex_stub_elbow") rings += fitting.count;
  }
  add("pex_crimp_ring", rings);
  return amounts;
}

/** Pipe radius in metres, for drawing. */
export const pipeRadius = (pipe: string) => PIPES[pipe]?.radius ?? 0.01;

// ---- code checks -------------------------------------------------------------

/** Minimum fixture outlet pipe, Table 2.4.9.3 (p. 125); the shower discharges 9.5 to 20 L/min. */
const MIN_OUTLET: Record<Fixture["kind"], number> = { lavatory: 1.25, shower: 2, water_closet: 3 };
/** Maximum trap arm length by trap size, Table 2.5.6.3 (p. 135). */
const MAX_TRAP_ARM: Record<string, number> = {
  "1.25": 1.5,
  "1.5": 1.8,
  "2": 2.4,
  "3": 3.6,
  "4": 9.8,
};
/** Maximum hydraulic load on a wet vent serving one storey, Table 2.5.8.1.-A (p. 137). */
const MAX_WET_VENT_LOAD: Record<string, number> = {
  "1.25": 1,
  "1.5": 2,
  "2": 5,
  "3": 18,
  "4": 120,
};

export interface Breach {
  rule: string;
  page: number;
  detail: string;
}

/** Turning angle at b between segments a-b and b-c, in degrees. */
function turn(a: Point, b: Point, c: Point): number {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [c[0] - b[0], c[1] - b[1], c[2] - b[2]];
  const dot = (u[0] ?? 0) * (v[0] ?? 0) + (u[1] ?? 0) * (v[1] ?? 0) + (u[2] ?? 0) * (v[2] ?? 0);
  const cos = dot / (Math.hypot(...u) * Math.hypot(...v));
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}

/** Every breach of the code in the rough-in; an empty list means it complies. */
export function checkPlumbing(runs: readonly Run[] = RUNS, fixtures = FIXTURES): Breach[] {
  const breaches: Breach[] = [];
  const find = (id: string) => runs.find((r) => r.id === id);

  // 2.4.8.1.(1), p. 124: drains NPS 3 or less fall at least 1 in 50 along the flow
  for (const run of runs.filter((r) => r.system === "drain" && pipeNps(r.pipe) <= 3)) {
    for (const [a, b] of segments(run.points)) {
      const fall = a[1] - b[1];
      const run_ = across(a, b);
      if (run_ > EPS && fall < run_ / 50 - EPS)
        breaches.push({
          rule: "2.4.8.1.(1)",
          page: 124,
          detail: `${run.id}: slope ${(fall / run_).toFixed(4)} under 1/50`,
        });
    }
  }

  for (const fixture of fixtures) {
    const run = find(fixture.run);
    if (!run) {
      breaches.push({ rule: "data", page: 0, detail: `${fixture.id}: no run ${fixture.run}` });
      continue;
    }
    // Table 2.4.9.3, p. 125: minimum fixture outlet pipe
    if (pipeNps(run.pipe) < MIN_OUTLET[fixture.kind])
      breaches.push({
        rule: "Table 2.4.9.3",
        page: 125,
        detail: `${fixture.id}: ${run.pipe} smaller than NPS ${MIN_OUTLET[fixture.kind]}`,
      });

    const arm = run.points.slice(fixture.trap, fixture.vent + 1);
    const length = segments(arm).reduce((sum, [a, b]) => sum + distance(a, b), 0);
    const turns = arm.slice(1, -1).reduce((sum, b, i) => {
      const a = arm[i];
      const c = arm[i + 2];
      return a && c ? sum + turn(a, b, c) : sum;
    }, 0);
    const first = arm[0];
    const last = arm[arm.length - 1];
    if (!first || !last) continue;

    // Table 2.5.6.3, p. 135: maximum trap arm length
    const max = MAX_TRAP_ARM[String(fixture.trapNps)] ?? 0;
    if (length > max + EPS)
      breaches.push({
        rule: "Table 2.5.6.3",
        page: 135,
        detail: `${fixture.id}: trap arm ${length.toFixed(2)} m over ${max} m`,
      });

    if (fixture.siphonic) {
      // 2.5.6.3.(2) and (3), p. 134: water closets
      if (turns > 225 + EPS)
        breaches.push({
          rule: "2.5.6.3.(2)",
          page: 134,
          detail: `${fixture.id}: trap arm turns ${turns.toFixed(0)}° over 225°`,
        });
      const vertical = Math.abs(first[1] - last[1]);
      const horizontal = segments(arm).reduce((sum, [a, b]) => sum + across(a, b), 0);
      if (vertical > 1 + EPS || horizontal > 3 + EPS)
        breaches.push({
          rule: "2.5.6.3.(3)",
          page: 134,
          detail: `${fixture.id}: vent ${vertical.toFixed(2)} m down, ${horizontal.toFixed(2)} m across`,
        });
    } else {
      // 2.5.6.3.(1), p. 134: other traps
      if (length < 2 * fixture.trapNps * INCH - EPS)
        breaches.push({
          rule: "2.5.6.3.(1)(a)",
          page: 134,
          detail: `${fixture.id}: trap arm shorter than twice its size`,
        });
      const fall = first[1] - last[1];
      if (fall > pipeNps(run.pipe) * INCH + EPS)
        breaches.push({
          rule: "2.5.6.3.(1)(b)",
          page: 134,
          detail: `${fixture.id}: trap arm falls ${fall.toFixed(3)} m, more than its diameter`,
        });
      if (turns > 135 + EPS)
        breaches.push({
          rule: "2.5.6.3.(1)(c)",
          page: 134,
          detail: `${fixture.id}: trap arm turns ${turns.toFixed(0)}° over 135°`,
        });
    }

    // 2.5.6.4.(1), p. 135: a separate vent rises above the flood level rim first
    if (fixture.floodRim !== undefined) {
      const vent = runs.find(
        (r) => r.system === "vent" && r.points[0] && distance(r.points[0], last) < EPS,
      );
      const rise = vent ? Math.max(...vent.points.map((p) => p[1])) : -Infinity;
      if (!vent || rise <= fixture.floodRim)
        breaches.push({
          rule: "2.5.6.4.(1)",
          page: 135,
          detail: `${fixture.id}: vent does not rise above the flood level rim`,
        });
    }
  }

  // 2.5.2.1 and Table 2.5.8.1.-A, pp. 131 and 137: the stack wet-vents the
  // fixtures that join it; water closets join downstream of all the others
  for (const stack of runs.filter((r) => r.system === "drain" && r.id === "stack")) {
    const joins = fixtures
      .map((f) => {
        const run = find(f.run);
        const end = run?.points[run.points.length - 1];
        return end && onRun(end, stack) ? { fixture: f, height: end[1] } : null;
      })
      .filter((j) => j !== null);
    const closets = joins.filter((j) => j.fixture.kind === "water_closet");
    const others = joins.filter((j) => j.fixture.kind !== "water_closet");
    if (closets.length > 2)
      breaches.push({ rule: "2.5.2.1.(1)(b)", page: 131, detail: "more than 2 water closets" });
    for (const closet of closets) {
      if (others.some((o) => o.height <= closet.height))
        breaches.push({
          rule: "2.5.2.1.(1)(d)",
          page: 131,
          detail: `${closet.fixture.id} is not downstream of every other fixture`,
        });
    }
    // 2.5.8.1.(2): the most downstream fixture is left out of the load
    const lowest = Math.min(...joins.map((j) => j.height));
    const load = joins
      .filter((j) => j.height > lowest)
      .reduce((sum, j) => sum + j.fixture.fixtureUnits, 0);
    const max = MAX_WET_VENT_LOAD[String(pipeNps(stack.pipe))] ?? 0;
    if (load > max)
      breaches.push({
        rule: "Table 2.5.8.1.-A",
        page: 137,
        detail: `wet vent load ${load} fixture units over ${max}`,
      });
  }
  return breaches;
}
