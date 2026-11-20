import { useState } from "react";
import { useI18n } from "../i18n";
import {
  type RoomId,
  type SurfaceId,
  findRoom,
  surfaceArea,
  surfacePerimeter,
} from "../house/model";
import { buildupForSurface } from "../knowledge";
import { BuildupView } from "./Buildup";
import { PurchaseList } from "./PurchaseList";

/** The panel shown when a person has clicked a surface: its area, the
 * proposed build-up with quantities, and the shopping list. */
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
  const [shopping, setShopping] = useState(false);
  const buildup = buildupForSurface(room, surface);
  const place = findRoom(room);
  const measure = {
    area: surfaceArea(place, surface),
    perimeter: surfacePerimeter(place, surface),
  };
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
        {t.area(measure.area.toLocaleString(language, { maximumFractionDigits: 2 }))}
      </p>
      {surface === "walls" && <p className="muted small">{t.wallsNote}</p>}
      {buildup ? (
        <>
          <button
            type="button"
            className="primary"
            aria-expanded={shopping}
            onClick={() => setShopping((open) => !open)}
          >
            {shopping ? t.hidePurchase : t.collect}
          </button>
          {shopping && <PurchaseList buildup={buildup} measure={measure} />}
          <BuildupView buildup={buildup} measure={measure} />
        </>
      ) : (
        <p className="placeholder">{t.noBuildup}</p>
      )}
      <p className="muted small">{t.dataNote}</p>
    </aside>
  );
}
