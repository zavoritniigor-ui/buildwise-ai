import { useI18n } from "../i18n";
import type { Buildup } from "../knowledge";
import { type Measure, purchaseList } from "../quantities";
import { StoreLinks } from "../StoreLinks";

/** Everything to buy for one surface, with the retailers' own search links. */
export function PurchaseList({ buildup, measure }: { buildup: Buildup; measure: Measure }) {
  const { t, d, language } = useI18n();
  const fmt = (n: number) => n.toLocaleString(language, { maximumFractionDigits: 2 });
  return (
    <section className="purchase" aria-label={t.purchaseTitle}>
      <h2>{t.purchaseTitle}</h2>
      <ul className="purchase-lines">
        {purchaseList(buildup, measure).map((line) => {
          const unit = t.units[line.quantity.unit];
          const name = d(line.name);
          return (
            <li key={`${line.quantity.search}-${line.quantity.unit}`} className="purchase-line">
              <span className="purchase-name">{name}</span>
              <span className="purchase-amount">
                {fmt(line.need.total)} {unit}
                {line.quantity.package && line.need.packages !== undefined && (
                  <>
                    {" · "}
                    {t.packages(
                      line.need.packages,
                      t.packageKind[line.quantity.package.kind],
                      `${fmt(line.quantity.package.size)} ${unit}`,
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
      <p className="muted small">{t.purchaseNote}</p>
    </section>
  );
}
