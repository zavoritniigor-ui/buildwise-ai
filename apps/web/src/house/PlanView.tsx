import { useI18n } from "../i18n";
import type { HouseSceneProps } from "./HouseScene";
import { FOOTPRINT, ROOMS, area, centre, findRoom } from "./model";

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
