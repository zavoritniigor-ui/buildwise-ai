import { useI18n } from "../i18n";
import { type Buildup, KNOWLEDGE, type Quantity, type SourceRef, citationUrl } from "../knowledge";
import { type Measure, need } from "../quantities";

function Citation({ source }: { source: SourceRef }) {
  const { t } = useI18n();
  return (
    <a className="citation" href={citationUrl(source)} target="_blank" rel="noopener noreferrer">
      {KNOWLEDGE.documents[source.document]?.title}, {t.page(source.page)}
    </a>
  );
}

/** "2.12 kg per m² · 13.7 kg for 6.42 m² · 1 × bag of 22.68 kg" with its basis. */
function QuantityLine({ quantity, measure }: { quantity: Quantity; measure: Measure }) {
  const { t, language } = useI18n();
  const fmt = (n: number) => n.toLocaleString(language, { maximumFractionDigits: 2 });
  const unit = t.units[quantity.unit];
  const result = need(quantity, measure);
  const rate =
    quantity.per === "area" ? t.perArea : quantity.per === "perimeter" ? t.perMetre : t.perEach;
  const scope =
    quantity.per === "area"
      ? t.forArea(fmt(measure.area))
      : quantity.per === "perimeter"
        ? t.forLength(fmt(measure.perimeter))
        : "";
  return (
    <span className="quantity">
      <span className="quantity-rate">
        {fmt(quantity.amount)} {unit} {rate}
      </span>
      <span className="quantity-total">
        ={" "}
        <strong>
          {fmt(result.total)} {unit}
        </strong>{" "}
        {scope}
        {quantity.package && result.packages !== undefined && (
          <>
            {" · "}
            {t.packages(
              result.packages,
              t.packageKind[quantity.package.kind],
              `${fmt(quantity.package.size)} ${unit}`,
            )}
          </>
        )}
      </span>
      <span className={`basis basis-${quantity.basis}`}>
        {t.basis[quantity.basis]}
        {quantity.waste > 0 && ` · ${t.waste(fmt(quantity.waste * 100))}`}
      </span>
      {quantity.source && <Citation source={quantity.source} />}
    </span>
  );
}

/**
 * The "sandwich": a surface's proposed layers, shown from the finished surface
 * at the top down to the structure, each with how much it takes per m² and for
 * this surface. Layer text comes from the knowledge base, translated.
 */
export function BuildupView({ buildup, measure }: { buildup: Buildup; measure: Measure }) {
  const { t, d } = useI18n();
  const layers = [...buildup.layers].reverse();
  return (
    <section className="buildup" aria-label={t.buildup}>
      <h2>{t.buildup}</h2>
      <p className="buildup-title">{d(buildup.title)}</p>
      <p className="muted small">{d(buildup.summary)}</p>
      <ol className="layers" aria-label={t.buildupNote}>
        {layers.map((layer, index) => (
          <li key={index} className={`layer role-${layer.role}`}>
            <span className="layer-role">{t.roles[layer.role]}</span>
            <span className="layer-body">
              <span className="layer-label">{d(layer.label)}</span>
              {layer.material && <span className="layer-material">{d(layer.material)}</span>}
              {layer.source && <Citation source={layer.source} />}
              {layer.quantity && <QuantityLine quantity={layer.quantity} measure={measure} />}
            </span>
          </li>
        ))}
      </ol>
      <p className="muted small">{t.buildupNote}</p>
    </section>
  );
}
