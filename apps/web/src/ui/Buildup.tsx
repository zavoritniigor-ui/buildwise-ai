import { useI18n } from "../i18n";
import { type Buildup, KNOWLEDGE, citationUrl } from "../knowledge";

/**
 * The "sandwich": a surface's proposed layers, shown from the finished surface
 * at the top down to the structure. Layer text comes from the knowledge base
 * and is translated through the snapshot.
 */
export function BuildupView({ buildup }: { buildup: Buildup }) {
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
              {layer.source && (
                <a
                  className="citation"
                  href={citationUrl(layer.source)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {KNOWLEDGE.documents[layer.source.document]?.title}, {t.page(layer.source.page)}
                </a>
              )}
            </span>
          </li>
        ))}
      </ol>
      <p className="muted small">{t.buildupNote}</p>
    </section>
  );
}
