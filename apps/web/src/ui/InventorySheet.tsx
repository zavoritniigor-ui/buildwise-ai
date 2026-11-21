import { useI18n } from "../i18n";
import type { RoomId } from "../house/model";
import { inventory } from "../inventory";
import { StoreLinks } from "../StoreLinks";

/** Everything a room, or the whole house, needs, counted from the model, with
 * the retailers' own search for each line. */
export function InventorySheet({
  rooms,
  title,
  kicker,
  onClose,
}: {
  rooms: readonly RoomId[];
  title: string;
  kicker: string;
  onClose: () => void;
}) {
  const { t, d, language } = useI18n();
  const fmt = (n: number) => n.toLocaleString(language, { maximumFractionDigits: 2 });
  return (
    <aside className="sheet" aria-labelledby="sheet-title">
      <header>
        <div>
          <p className="sheet-kicker">{kicker}</p>
          <h1 id="sheet-title">{title}</h1>
        </div>
        <button type="button" className="icon" onClick={onClose} aria-label={t.close}>
          ×
        </button>
      </header>
      <ul className="purchase-lines">
        {inventory(rooms).map(({ item, amount }) => {
          const name = d(item.name);
          return (
            <li key={item.id} className="purchase-line">
              <span className="purchase-name">{name}</span>
              <span className="purchase-amount">
                {item.measure === "length" ? t.metres(fmt(amount)) : t.pieces(fmt(amount))}
                <span className="muted"> · {t.categories[item.category]}</span>
              </span>
              <StoreLinks query={item.search} label={t.findIn(name)} />
            </li>
          );
        })}
      </ul>
      <p className="muted small">{t.inventoryNote}</p>
    </aside>
  );
}
