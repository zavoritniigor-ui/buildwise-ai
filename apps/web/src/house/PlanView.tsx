import { useI18n } from "../i18n";
import type { HouseSceneProps } from "./HouseScene";
import {
  FOOTPRINT,
  OPENINGS,
  type Opening,
  ROOMS,
  WALL_THICKNESS,
  area,
  centre,
  findRoom,
  openingLine,
} from "./model";

/** A plan symbol: a window as a glazed strip, a door as its leaf and swing arc. */
function OpeningMark({ opening }: { opening: Opening }) {
  const line = openingLine(opening);
  const h = line.orient === "h";
  const t = WALL_THICKNESS;
  if (opening.kind === "window") {
    const [x, y, w, d] = h
      ? [line.from, line.coord - t / 2, line.to - line.from, t]
      : [line.coord - t / 2, line.from, t, line.to - line.from];
    return <rect x={x} y={y} width={w} height={d} className="plan-window" />;
  }
  if (opening.kind !== "door" || !opening.swing) return null;
  const width = line.to - line.from;
  const hingeAt = opening.hinge === "end" ? line.to : line.from;
  const freeAt = opening.hinge === "end" ? line.from : line.to;
  const [sx, sz] = centre(findRoom(opening.swing).rect);
  const into = ((h ? sz : sx) - line.coord > 0 ? 1 : -1) * width;
  const pt = (along: number, across: number) =>
    h ? `${along} ${line.coord + across}` : `${line.coord + across} ${along}`;
  // SVG arcs run clockwise (y down) when the turn from leaf to wall is positive
  const [lx, lz, fx, fz] = h ? [0, into, freeAt - hingeAt, 0] : [into, 0, 0, freeAt - hingeAt];
  const sweep = lx * fz - lz * fx > 0 ? 1 : 0;
  return (
    <path
      d={`M ${pt(hingeAt, 0)} L ${pt(hingeAt, into)} A ${width} ${width} 0 0 ${sweep} ${pt(freeAt, 0)}`}
      className="plan-door"
    />
  );
}

/**
 * A flat, clickable floor plan. It stands in for the 3D view when the browser
 * cannot run WebGL, with the same rooms and surfaces.
 */
export default function PlanView({ room, surface, onRoom, onSurface }: HouseSceneProps) {
  const { t, language } = useI18n();
  const selected = room ? findRoom(room) : null;
  const pad = 0.4;
  const box = selected ? selected.rect : FOOTPRINT;
  const viewBox = `${box.x - pad} ${box.z - pad} ${box.width + 2 * pad} ${box.depth + 2 * pad}`;
  const fmt = (n: number) => n.toLocaleString(language, { maximumFractionDigits: 2 });

  return (
    <svg className="plan" viewBox={viewBox} role="img" aria-label={t.house}>
      {(selected ? [selected] : ROOMS).map((r) => {
        const [cx, cz] = centre(r.rect);
        const active = selected && surface === "floor";
        return (
          <g key={r.id}>
            <rect
              x={r.rect.x}
              y={r.rect.z}
              width={r.rect.width}
              height={r.rect.depth}
              className={`plan-room${active ? " active" : ""}`}
              style={{ fill: active ? undefined : r.color }}
              onClick={() => (selected ? onSurface("floor") : onRoom(r.id))}
            >
              <title>{selected ? t.surfaces.floor : t.rooms[r.id]}</title>
            </rect>
            {!selected && (
              <text x={cx} y={cz} className="plan-label" textAnchor="middle">
                <tspan x={cx}>{t.rooms[r.id]}</tspan>
                <tspan x={cx} dy="0.4" className="plan-area">
                  {t.area(fmt(area(r.rect)))}
                </tspan>
              </text>
            )}
          </g>
        );
      })}
      {OPENINGS.map((o) => (
        <OpeningMark key={o.id} opening={o} />
      ))}
      {selected?.shower && (
        <rect
          x={selected.shower.x}
          y={selected.shower.z}
          width={selected.shower.width}
          height={selected.shower.depth}
          className={`plan-shower${surface === "shower" ? " active" : ""}`}
          onClick={() => onSurface("shower")}
        >
          <title>{t.surfaces.shower}</title>
        </rect>
      )}
      {selected && (
        <rect
          x={selected.rect.x}
          y={selected.rect.z}
          width={selected.rect.width}
          height={selected.rect.depth}
          className={`plan-walls${surface === "walls" ? " active" : ""}`}
          onClick={() => onSurface("walls")}
        >
          <title>{t.surfaces.walls}</title>
        </rect>
      )}
    </svg>
  );
}
