import type { Attribute } from "../knowledge";
import { KNOWLEDGE } from "../knowledge";
import { Citation } from "./Citation";
import { keyLabel, valueLabel } from "./labels";

const STATUS_LABEL: Record<Attribute["status"], string> = {
  unverified: "unverified",
  ai_extracted: "awaiting review",
  human_verified: "verified",
  rejected: "rejected",
};

/** Which vocabulary an option attribute uses, from the rules that read it. */
const OPTION_VOCABULARY: Record<string, string> = Object.fromEntries(
  [
    ...KNOWLEDGE.assemblies.flatMap((a) => a.rules),
    ...Object.values(KNOWLEDGE.categories).flatMap((c) => c.rules),
  ]
    .filter((r) => r.material_attribute)
    .map((r) => [r.material_attribute, KNOWLEDGE.conditions[r.condition]?.options])
    .filter((pair): pair is [string, string] => typeof pair[1] === "string"),
);

export function AttributeList({ attributes }: { attributes: readonly Attribute[] }) {
  return (
    <dl className="attributes">
      {attributes.map((a) => (
        <div key={a.key} className="attribute">
          <dt>{keyLabel(a.key)}</dt>
          <dd>
            {valueLabel(a.value, OPTION_VOCABULARY[a.key], a.unit)}
            {a.note && <span className="note">{a.note}</span>}
            <span className="meta">
              <span className={`status status-${a.status}`}>{STATUS_LABEL[a.status]}</span>
              <Citation source={a.source} />
            </span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function Catalogue() {
  return (
    <div className="catalogue">
      <section aria-labelledby="cat-assemblies">
        <h3 id="cat-assemblies">Construction systems ({KNOWLEDGE.assemblies.length})</h3>
        {KNOWLEDGE.assemblies.map((a) => (
          <details key={a.slug} className="card">
            <summary>
              <strong>{a.name}</strong> <span className="muted">· {a.manufacturer.name}</span>
            </summary>
            <p>{a.description}</p>
            <AttributeList attributes={a.attributes} />
          </details>
        ))}
      </section>
      <section aria-labelledby="cat-products">
        <h3 id="cat-products">Product families ({KNOWLEDGE.families.length})</h3>
        {KNOWLEDGE.families.map((f) => (
          <details key={f.name} className="card">
            <summary>
              <strong>{f.name}</strong>{" "}
              <span className="muted">
                · {KNOWLEDGE.categories[f.category]?.name} · {f.variants.length} items
              </span>
            </summary>
            <AttributeList attributes={f.attributes} />
            <p className="muted">
              Items: {f.variants.map((v) => v.sku).join(", ")} (
              <Citation source={f.variants_source} />)
            </p>
          </details>
        ))}
      </section>
    </div>
  );
}
