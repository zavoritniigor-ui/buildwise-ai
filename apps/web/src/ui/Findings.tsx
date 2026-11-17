import type { Assessment } from "../engine";
import type { RuleSpec, SourceRef } from "../knowledge";
import { Citation } from "./Citation";
import { VERDICT_LABEL } from "./labels";

interface RuleInfo {
  description: string;
  sources: SourceRef[];
}

/** Describe engine rule ids, including alternative groups, from their specs. */
export function ruleInfo(specs: readonly RuleSpec[]): Map<string, RuleInfo> {
  const info = new Map<string, RuleInfo>();
  for (const spec of specs) {
    const id = spec.alternative?.group ?? spec.id;
    const current = info.get(id);
    const description = spec.alternative
      ? `Option ${spec.alternative.number}: ${spec.description}`
      : spec.description;
    info.set(id, {
      description: current ? `${current.description} ${description}` : description,
      sources: current?.sources.some(
        (s) => s.page === spec.source.page && s.document === spec.source.document,
      )
        ? current.sources
        : [...(current?.sources ?? []), spec.source],
    });
  }
  return info;
}

export function Findings({
  assessment,
  specs,
}: {
  assessment: Assessment;
  specs: readonly RuleSpec[];
}) {
  const info = ruleInfo(specs);
  return (
    <ul className="findings">
      {assessment.findings.map((finding) => {
        const rule = info.get(finding.ruleId);
        return (
          <li key={finding.ruleId} className={`finding finding-${finding.verdict}`}>
            <span className="finding-verdict">{VERDICT_LABEL[finding.verdict]}</span>
            <span className="finding-text">
              {rule?.description ?? finding.ruleId}
              <span className="finding-reason">{finding.reason}</span>
              {rule?.sources.map((s) => (
                <Citation key={`${s.document}-${s.page}`} source={s} />
              ))}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
