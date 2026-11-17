/**
 * The compatibility engine, ported from
 * apps/api/src/buildwise_api/compatibility/engine.py so the web app can run
 * without a server. The two must agree: engine.test.ts replays the scenario
 * cases whose verdicts the Python engine computed at export time.
 */
import type { Attribute, AttributeValue, Job, RuleSpec, Status } from "./knowledge";

export type Verdict = "compatible" | "incompatible" | "unknown";

/**
 * verified: only facts a person approved count, as in the API.
 * preview: every fact that is not rejected counts, to show what the verdict
 * will be once the facts are reviewed.
 */
export type Trust = "verified" | "preview";

export type Material = Readonly<Record<string, AttributeValue>>;

export interface Finding {
  ruleId: string;
  verdict: Verdict;
  reason: string;
  missing: readonly string[];
}

export interface Assessment {
  verdict: Verdict;
  findings: readonly Finding[];
  /** Job conditions to ask about; only unknown findings contribute. */
  missing: readonly string[];
}

export type Rule =
  | { kind: "membership"; id: string; materialAttribute: string; condition: string }
  | { kind: "range"; id: string; condition: string; min?: string; max?: string }
  | { kind: "any_of"; id: string; alternatives: readonly (readonly Rule[])[] }
  | { kind: "pending"; id: string };

function text(job: Job, key: string): string | undefined {
  const value = job[key];
  if (value === undefined || typeof value === "string") return value;
  throw new TypeError(`${key} must be text`);
}

function number(values: Readonly<Record<string, AttributeValue>>, key: string): number | undefined {
  const value = values[key];
  if (value === undefined || typeof value === "number") return value;
  throw new TypeError(`${key} must be a number`);
}

function options(material: Material, key: string): readonly string[] | undefined {
  const value = material[key];
  if (value === undefined || Array.isArray(value)) return value as readonly string[] | undefined;
  throw new TypeError(`${key} must be a list of options`);
}

const finding = (ruleId: string, verdict: Verdict, reason: string, missing: string[] = []) => ({
  ruleId,
  verdict,
  reason,
  missing,
});

const missingCondition = (ruleId: string, condition: string) =>
  finding(ruleId, "unknown", `job condition '${condition}' is not known`, [condition]);

function evaluate(rule: Rule, material: Material, job: Job): Finding {
  switch (rule.kind) {
    case "membership": {
      const allowed = options(material, rule.materialAttribute);
      const actual = text(job, rule.condition);
      if (allowed === undefined) {
        return finding(rule.id, "unknown", `material has no data for '${rule.materialAttribute}'`);
      }
      if (actual === undefined) return missingCondition(rule.id, rule.condition);
      if (allowed.includes(actual)) {
        return finding(rule.id, "compatible", `${rule.condition} '${actual}' is allowed`);
      }
      return finding(
        rule.id,
        "incompatible",
        `${rule.condition} '${actual}' is not among the allowed: ${[...allowed].sort().join(", ")}`,
      );
    }
    case "range": {
      const actual = number(job, rule.condition);
      if (actual === undefined) return missingCondition(rule.id, rule.condition);
      const missing: string[] = [];
      for (const [attribute, isMinimum] of [
        [rule.min, true],
        [rule.max, false],
      ] as const) {
        if (attribute === undefined) continue;
        const limit = number(material, attribute);
        if (limit === undefined) missing.push(attribute);
        else if (isMinimum ? actual < limit : actual > limit) {
          const side = isMinimum ? "below the minimum" : "above the maximum";
          return finding(
            rule.id,
            "incompatible",
            `${rule.condition} ${actual} is ${side} ${limit}`,
          );
        }
      }
      if (missing.length > 0) {
        return finding(rule.id, "unknown", `material has no data for ${missing.join(", ")}`);
      }
      return finding(rule.id, "compatible", `${rule.condition} ${actual} is within limits`);
    }
    case "any_of": {
      const outcomes = rule.alternatives.map((rules) => assess(material, job, rules));
      const met = outcomes.findIndex((o) => o.verdict === "compatible");
      if (met >= 0) return finding(rule.id, "compatible", `alternative ${met + 1} is met`);
      if (outcomes.every((o) => o.verdict === "incompatible")) {
        const reasons = outcomes
          .map((o, i) => `alternative ${i + 1}: ${firstMismatch(o)}`)
          .join("; ");
        return finding(rule.id, "incompatible", `no alternative is met (${reasons})`);
      }
      const open = outcomes.filter((o) => o.verdict === "unknown");
      const missing = [...new Set(open.flatMap((o) => o.missing))].sort();
      return finding(
        rule.id,
        "unknown",
        `${open.length} alternative(s) cannot be decided yet`,
        missing,
      );
    }
    case "pending":
      return finding(rule.id, "unknown", "requirement not yet verified by a person");
  }
}

function firstMismatch(outcome: Assessment): string {
  return outcome.findings.find((f) => f.verdict === "incompatible")?.reason ?? "";
}

/**
 * A confirmed mismatch wins over missing data, and missing data wins over
 * confirmations. With no rules there is no evidence, so the verdict is unknown.
 */
export function assess(material: Material, job: Job, rules: readonly Rule[]): Assessment {
  const findings = rules.map((rule) => evaluate(rule, material, job));
  const verdicts = new Set(findings.map((f) => f.verdict));
  const verdict: Verdict = verdicts.has("incompatible")
    ? "incompatible"
    : verdicts.has("unknown") || findings.length === 0
      ? "unknown"
      : "compatible";
  const missing = [
    ...new Set(findings.filter((f) => f.verdict === "unknown").flatMap((f) => f.missing)),
  ].sort();
  return { verdict, findings, missing };
}

/** Code-point order, the same as Python's sorted(). */
const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

function counts(status: Status, trust: Trust): boolean {
  if (status === "rejected") return false;
  return trust === "preview" || status === "human_verified";
}

function toRule(spec: RuleSpec): Rule {
  if (spec.kind === "membership") {
    if (!spec.material_attribute) throw new Error(`Rule ${spec.id} has no material attribute`);
    return {
      kind: "membership",
      id: spec.id,
      materialAttribute: spec.material_attribute,
      condition: spec.condition,
    };
  }
  return {
    kind: "range",
    id: spec.id,
    condition: spec.condition,
    min: spec.min_attribute,
    max: spec.max_attribute,
  };
}

/** The same grouping as the API: alternatives become one rule, unreviewed ones pending. */
export function buildRules(specs: readonly RuleSpec[], trust: Trust): Rule[] {
  const rules: Rule[] = [];
  const groups = new Map<string, RuleSpec[]>();
  for (const spec of [...specs].sort(byId)) {
    if (spec.status === "rejected") continue;
    if (spec.alternative) {
      groups.set(spec.alternative.group, [...(groups.get(spec.alternative.group) ?? []), spec]);
    } else {
      rules.push(counts(spec.status, trust) ? toRule(spec) : { kind: "pending", id: spec.id });
    }
  }
  for (const [group, members] of groups) {
    if (!members.every((m) => counts(m.status, trust))) {
      rules.push({ kind: "pending", id: group });
      continue;
    }
    const numbers = [...new Set(members.map((m) => m.alternative?.number ?? 0))].sort(
      (a, b) => a - b,
    );
    rules.push({
      kind: "any_of",
      id: group,
      alternatives: numbers.map((n) =>
        members.filter((m) => m.alternative?.number === n).map(toRule),
      ),
    });
  }
  return rules.sort(byId);
}

export function materialFrom(attributes: readonly Attribute[], trust: Trust): Material {
  return Object.fromEntries(
    attributes.filter((a) => counts(a.status, trust)).map((a) => [a.key, a.value]),
  );
}
