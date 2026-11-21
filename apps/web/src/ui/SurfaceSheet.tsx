import { useState } from "react";
import { useI18n } from "../i18n";
import {
  type RoomId,
  type SurfaceId,
  findRoom,
  surfaceArea,
  surfacePerimeter,
} from "../house/model";
import { buildupForSurface, buildupsForSurface } from "../knowledge";
import { BuildupView } from "./Buildup";
import { PurchaseList } from "./PurchaseList";

/** The panel shown when a person has clicked a surface: its area, the
 * proposed build-up with quantities, and the shopping list. */
export function SurfaceSheet({
  room,
  surface,
  chosen,
  onChoose,
  onClose,
}: {
  room: RoomId;
  surface: SurfaceId;
  /** the build-up the person picked for this surface, if any */
  chosen?: string;
  onChoose: (buildup: string) => void;
  onClose: () => void;
}) {
  const { t, d, language } = useI18n();
  const [shopping, setShopping] = useState(false);
  const options = buildupsForSurface(room, surface);
  const buildup = buildupForSurface(room, surface, chosen);
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
      {options.length > 1 && buildup && (
        <fieldset className="technology">
          <legend>{t.technology}</legend>
          {options.map((option) => (
            <label key={option.id}>
              <input
                type="radio"
                name="technology"
                value={option.id}
                checked={option.id === buildup.id}
                onChange={() => onChoose(option.id)}
              />
              <span>{d(option.title)}</span>
            </label>
          ))}
        </fieldset>
      )}
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
