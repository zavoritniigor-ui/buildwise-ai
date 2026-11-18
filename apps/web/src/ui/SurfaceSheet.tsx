import { useI18n } from "../i18n";
import { type RoomId, type SurfaceId, findRoom, surfaceArea } from "../house/model";
import { buildupForSurface } from "../knowledge";
import { BuildupView } from "./Buildup";

/** The panel shown when a person has clicked a surface: its area and the
 * proposed build-up with materials. */
export function SurfaceSheet({
  room,
  surface,
  onClose,
}: {
  room: RoomId;
  surface: SurfaceId;
  onClose: () => void;
}) {
  const { t, language } = useI18n();
  const buildup = buildupForSurface(room, surface);
  const area = surfaceArea(findRoom(room), surface);
  return (
    <aside className="sheet" aria-labelledby="sheet-title">
      <header>
        <div>
          <p className="sheet-kicker">{t.rooms[room]}</p>
          <h1 id="sheet-title">{t.surfaces[surface]}</h1>
        </div>
        <button type="button" className="icon" onClick={onClose} aria-label={t.close}>
          ×
        </button>
      </header>
      <p className="sheet-area">
        {t.area(area.toLocaleString(language, { maximumFractionDigits: 2 }))}
      </p>
      {surface === "walls" && <p className="muted small">{t.wallsNote}</p>}
      {buildup ? <BuildupView buildup={buildup} /> : <p className="placeholder">{t.noBuildup}</p>}
      <p className="muted small">{t.dataNote}</p>
    </aside>
  );
}
