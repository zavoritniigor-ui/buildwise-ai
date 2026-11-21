import { useI18n } from "../i18n";
import type { RoomId } from "../house/model";
import { findItem } from "../knowledge";
import { StoreLinks } from "../StoreLinks";

/** What a person clicked in the house, as the scene reports it. */
export interface Selection {
  /** The item id in data/items.yaml. */
  item: string;
  /** The object's name in the 3D model, so the scene can highlight it. */
  object: string;
  room: RoomId;
  /** Width, depth and height in the model, in centimetres. */
  size: [number, number, number];
}

/** The panel for an object in the house: what it is, what to check before
 * buying it, and the retailers' own search. */
export function ItemSheet({ selection, onClose }: { selection: Selection; onClose: () => void }) {
  const { t, d, language } = useI18n();
  const item = findItem(selection.item);
  if (!item) return null;
  const name = d(item.name);
  const dims = selection.size.map((n) => n.toLocaleString(language)).join(" × ");
  return (
    <aside className="sheet" aria-labelledby="sheet-title">
      <header>
        <div>
          <p className="sheet-kicker">
            {t.rooms[selection.room]} · {t.categories[item.category]}
          </p>
          <h1 id="sheet-title">{name}</h1>
        </div>
        <button type="button" className="icon" onClick={onClose} aria-label={t.close}>
          ×
        </button>
      </header>
      <p className="muted small">{t.itemSize(dims)}</p>
      <section className="item-advice">
        <h2>{t.beforeBuying}</h2>
        <p>{d(item.summary)}</p>
      </section>
      <section className="purchase" aria-label={t.storesTitle}>
        <h2>{t.storesTitle}</h2>
        <StoreLinks query={item.search} label={t.findIn(name)} />
        <p className="muted small">{t.storesNote}</p>
      </section>
    </aside>
  );
}
