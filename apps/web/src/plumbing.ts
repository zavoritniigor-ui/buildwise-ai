/**
 * The plumbing rough-in counted from its geometry (house/plumbing.json):
 *
 * - pipe: the length of every run, per pipe size;
 * - elbows: one at every bend of a run, except where another run joins it;
 * - tees: one where a run starts or ends part-way along another run;
 * - supports: horizontal segments get one support per started spacing, the
 *   spacing being the maximum the National Plumbing Code of Canada 2020 allows
 *   (Table 2.3.4.5, PDF page 96: ABS 1.2 m, PEX 0.8 m);
 * - crimp rings: one per PEX pipe end in an elbow, tee or stub-out;
 * - fittings at the fixtures, as listed in the data.
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

interface PipeSpec {
  radius: number;
  elbow: string;
  tee: string;
  support: string;
}

export const RUNS: readonly Run[] = plumbing.runs.map((r) => ({
  ...r,
  points: r.points.map(([x = 0, y = 0, z = 0]) => [x, y, z] as const),
}));
const PIPES = plumbing.pipes as Record<string, PipeSpec>;
const SPACING = plumbing.supportSpacing as Record<string, number>;
const EPS = 1e-6;

const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Whether p lies on segment a-b, away from both of its ends. */
function inside(p: Point, a: Point, b: Point): boolean {
  const d = distance(a, b);
  return (
    Math.abs(distance(a, p) + distance(p, b) - d) < EPS &&
    distance(a, p) > EPS &&
    distance(p, b) > EPS
  );
}

/** Whether p lies on another run anywhere except at that run's two ends. */
function onRun(p: Point, run: Run): boolean {
  const pts = run.points;
  return pts.some((a, i) => {
    const b = pts[i + 1];
    if (b && inside(p, a, b)) return true;
    // an interior vertex of the run also takes a tee
    return i > 0 && i < pts.length - 1 && distance(p, a) < EPS;
  });
}

const segments = (run: Run) =>
  run.points.slice(1).map((b, i) => [run.points[i] as Point, b] as const);

export function plumbingAmounts(rooms: readonly RoomId[]): Map<string, number> {
  const amounts = new Map<string, number>();
  const add = (id: string, n: number) => {
    if (n > 0) amounts.set(id, (amounts.get(id) ?? 0) + n);
  };
  const runs = RUNS.filter((r) => rooms.includes(r.room as RoomId));
  let rings = 0;
  for (const run of runs) {
    const spec = PIPES[run.pipe];
    if (!spec) throw new Error(`Unknown pipe ${run.pipe}`);
    const pex = run.pipe.startsWith("pex_");
    add(
      run.pipe,
      segments(run).reduce((sum, [a, b]) => sum + distance(a, b), 0),
    );
    // a bend where another run joins is the tee itself, not an elbow
    const joined = (p: Point) =>
      runs.some(
        (other) =>
          other !== run &&
          [other.points[0], other.points[other.points.length - 1]].some(
            (end) => end !== undefined && distance(end, p) < EPS,
          ),
      );
    const elbows = run.points.slice(1, -1).filter((p) => !joined(p)).length;
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
    const spacing = SPACING[spec.support] ?? 1;
    for (const [a, b] of segments(run)) {
      if (Math.abs(a[1] - b[1]) < EPS) add(spec.support, Math.ceil(distance(a, b) / spacing - EPS));
    }
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
