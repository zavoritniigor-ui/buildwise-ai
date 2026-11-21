import { useI18n } from "../i18n";
import type { RoomId } from "../house/model";
import { inventory, surfacePurchases } from "../inventory";
import { RUNS, checkPlumbing } from "../plumbing";
import { StoreLinks } from "../StoreLinks";
import { KNOWLEDGE, type ProductPicks, citationUrl } from "../knowledge";

/** Everything a room, or the whole house, needs, counted from the model, with
 * the retailers' own search for each line. */
export function InventorySheet({
  rooms,
  title,
  kicker,
  choices,
  picks,
  onClose,
}: {
  rooms: readonly RoomId[];
  title: string;
  kicker: string;
  /** chosen build-up per "room.surface"; the default where none is chosen */
  choices: Readonly<Record<string, string>>;
  picks: ProductPicks;
  onClose: () => void;
}) {
  const { t, d, language } = useI18n();
  const fmt = (n: number) => n.toLocaleString(language, { maximumFractionDigits: 2 });
  const materials = surfacePurchases(rooms, choices, picks);
  const breaches = checkPlumbing();
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
      {materials.length > 0 && (
        <>
          <h2 className="list-section">{t.surfaceMaterials}</h2>
          <ul className="purchase-lines">
            {materials.map((line) => {
              const unit = t.units[line.quantity.unit];
              const name = d(line.name);
              const pack = line.quantity.package;
              return (
                <li key={`${line.quantity.search}|${line.quantity.unit}`} className="purchase-line">
                  <span className="purchase-name">{name}</span>
                  <span className="purchase-amount">
                    {fmt(line.need.total)} {unit}
                    {pack && line.need.packages !== undefined && (
                      <>
                        {" · "}
                        {t.packages(
                          line.need.packages,
                          t.packageKind[pack.kind],
                          `${fmt(pack.size)} ${unit}`,
                        )}
                      </>
                    )}
                    {line.quantity.basis === "estimate" && (
                      <span className="basis basis-estimate"> {t.basis.estimate}</span>
                    )}
                  </span>
                  <StoreLinks query={line.quantity.search} label={t.findIn(name)} />
                </li>
              );
            })}
          </ul>
        </>
      )}
      <h2 className="list-section">{t.fixturesTitle}</h2>
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
      {RUNS.some((r) => rooms.includes(r.room as RoomId)) && (
        <>
          <p className={breaches.length ? "code-status code-breach" : "code-status code-ok"}>
            {breaches.length ? t.codeBreaches(breaches.length) : t.codeOk}
          </p>
          <p className="muted small">
            {t.plumbingNote} {KNOWLEDGE.documents["qc-plumbing-2020"]?.title}:{" "}
            {[112, 124, 125, 131, 134, 135, 137].map((page, i) => (
              <span key={page}>
                {i > 0 && ", "}
                <a
                  className="citation"
                  href={citationUrl({ document: "qc-plumbing-2020", page })}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t.page(page)}
                </a>
              </span>
            ))}
            .
          </p>
        </>
      )}
      <p className="muted small">{t.inventoryNote}</p>
    </aside>
  );
}
