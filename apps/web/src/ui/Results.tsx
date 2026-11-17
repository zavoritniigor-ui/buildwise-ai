import { checkAssembly, checkVariant } from "../check";
import type { Assessment, Trust, Verdict } from "../engine";
import type { Job } from "../knowledge";
import { KNOWLEDGE } from "../knowledge";
import { StoreLinks } from "../StoreLinks";
import { Findings } from "./Findings";
import { fieldId } from "./JobForm";
import { conditionLabel } from "./labels";
import { VerdictBadge } from "./Verdict";

const ORDER: Record<Verdict, number> = { compatible: 0, unknown: 1, incompatible: 2 };

function focusField(condition: string) {
  document.getElementById(fieldId(condition))?.focus();
}

function Questions({ missing }: { missing: readonly string[] }) {
  if (missing.length === 0) return null;
  return (
    <p className="questions">
      To decide, tell us:{" "}
      {missing.map((c) => (
        <button key={c} type="button" className="chip" onClick={() => focusField(c)}>
          {conditionLabel(c)}
        </button>
      ))}
    </p>
  );
}

const sizeOf = (dimensions: Record<string, number>) =>
  ["width_mm", "length_mm", "thickness_mm", "height_mm"]
    .filter((k) => k in dimensions)
    .map((k) => dimensions[k])
    .join(" × ") + (Object.keys(dimensions).length ? " mm" : "");

export function Results({ job, trust }: { job: Job; trust: Trust }) {
  const assemblies = KNOWLEDGE.assemblies
    .map((assembly) => ({ assembly, result: checkAssembly(assembly, job, trust) }))
    .sort((a, b) => ORDER[a.result.verdict] - ORDER[b.result.verdict]);

  const families = KNOWLEDGE.families.map((family) => {
    const variants = family.variants.map((variant) => ({
      variant,
      result: checkVariant(family, variant, job, trust),
    }));
    const best = variants.reduce<Verdict>(
      (acc, v) => (ORDER[v.result.verdict] < ORDER[acc] ? v.result.verdict : acc),
      "incompatible",
    );
    return { family, variants, best };
  });
  families.sort((a, b) => ORDER[a.best] - ORDER[b.best]);

  const all: Assessment[] = [
    ...assemblies.map((a) => a.result),
    ...families.flatMap((f) => f.variants.map((v) => v.result)),
  ];
  const asked = new Map<string, number>();
  for (const result of all) for (const c of result.missing) asked.set(c, (asked.get(c) ?? 0) + 1);
  const questions = [...asked.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <div className="results">
      {questions.length > 0 && (
        <section className="panel open-questions" aria-labelledby="questions-title">
          <h3 id="questions-title">Open questions</h3>
          <p className="muted">Answering these settles the most checks.</p>
          <div className="chips">
            {questions.map(([c, n]) => (
              <button key={c} type="button" className="chip" onClick={() => focusField(c)}>
                {conditionLabel(c)} <span className="count">{n}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="assemblies-title">
        <h3 id="assemblies-title">Construction systems</h3>
        {assemblies.map(({ assembly, result }) => (
          <article key={assembly.slug} className="card" aria-label={assembly.name}>
            <header className="card-head">
              <div>
                <h4>{assembly.name}</h4>
                <p className="muted">{assembly.manufacturer.name}</p>
              </div>
              <VerdictBadge verdict={result.verdict} testId="verdict" />
            </header>
            <p>{assembly.description}</p>
            <Questions missing={result.missing} />
            <details>
              <summary>Why ({result.findings.length} checks)</summary>
              <Findings assessment={result} specs={assembly.rules} />
            </details>
          </article>
        ))}
      </section>

      <section aria-labelledby="products-title">
        <h3 id="products-title">Products</h3>
        {families.map(({ family, variants, best }) => {
          const fitting = variants.filter((v) => v.result.verdict === "compatible").length;
          const rules = KNOWLEDGE.categories[family.category]?.rules ?? [];
          const first = variants[0];
          return (
            <article key={family.name} className="card" aria-label={family.name}>
              <header className="card-head">
                <div>
                  <h4>{family.name}</h4>
                  <p className="muted">
                    {KNOWLEDGE.categories[family.category]?.name} · {fitting} of {variants.length}{" "}
                    fit
                  </p>
                </div>
                <VerdictBadge verdict={best} testId="verdict" />
              </header>
              {first && <Questions missing={first.result.missing} />}
              <details>
                <summary>Sizes and stores ({variants.length})</summary>
                <table className="variants">
                  <thead>
                    <tr>
                      <th scope="col">Item</th>
                      <th scope="col">Size</th>
                      <th scope="col">Verdict</th>
                      <th scope="col">Find in stores</th>
                    </tr>
                  </thead>
                  <tbody>
                    {variants.map(({ variant, result }) => (
                      <tr key={variant.sku}>
                        <td>{variant.sku}</td>
                        <td>{sizeOf(variant.dimensions)}</td>
                        <td>
                          <VerdictBadge verdict={result.verdict} />
                        </td>
                        <td>
                          <StoreLinks
                            product={{ manufacturer: family.manufacturer.brand, name: variant.sku }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {first && <Findings assessment={first.result} specs={rules} />}
              </details>
            </article>
          );
        })}
      </section>
    </div>
  );
}
