import { describe, expect, test } from "vitest";
import { checkAssembly, checkVariant, findAssembly, findVariant } from "./check";
import { type Rule, type Trust, assess } from "./engine";
import { KNOWLEDGE } from "./knowledge";

const cases = KNOWLEDGE.scenarios.flatMap((s) => s.cases.map((c) => ({ ...c, scenario: s.id })));
const trusts: Trust[] = ["verified", "preview"];

describe("agrees with the Python engine on every scenario case", () => {
  test.each(cases.flatMap((c) => trusts.map((trust) => ({ ...c, trust }))))(
    "$scenario $id ($trust)",
    ({ assembly, sku, job, expected, trust }) => {
      const result = assembly
        ? checkAssembly(findAssembly(assembly), job, trust)
        : (() => {
            const { family, variant } = findVariant(sku ?? "");
            return checkVariant(family, variant, job, trust);
          })();
      expect({ verdict: result.verdict, missing: result.missing }).toEqual(expected[trust]);
    },
  );
});

test("there are scenario cases to replay", () => {
  expect(cases.length).toBeGreaterThan(5);
});

describe("engine", () => {
  const subfloor: Rule = {
    kind: "membership",
    id: "s",
    materialAttribute: "allowed",
    condition: "subfloor",
  };
  const spacing: Rule = { kind: "range", id: "j", condition: "joists", max: "max_joists" };
  const material = { allowed: ["plywood", "osb"], max_joists: 406 };

  test("all rules met is compatible", () => {
    expect(assess(material, { subfloor: "osb", joists: 406 }, [subfloor, spacing]).verdict).toBe(
      "compatible",
    );
  });

  test("a mismatch wins over missing data", () => {
    const result = assess(material, { subfloor: "concrete" }, [subfloor, spacing]);
    expect(result.verdict).toBe("incompatible");
    expect(result.missing).toEqual(["joists"]);
  });

  test("no rules means no evidence", () => {
    expect(assess(material, {}, []).verdict).toBe("unknown");
  });

  test("a pending rule never lets a verdict become compatible", () => {
    const result = assess(material, { subfloor: "osb", joists: 300 }, [
      subfloor,
      { kind: "pending", id: "p" },
    ]);
    expect(result.verdict).toBe("unknown");
    expect(result.missing).toEqual([]);
  });

  test("any_of is met by one full alternative", () => {
    const rule: Rule = { kind: "any_of", id: "g", alternatives: [[spacing], [subfloor]] };
    expect(assess(material, { subfloor: "osb", joists: 600 }, [rule]).verdict).toBe("compatible");
    expect(assess(material, { subfloor: "concrete", joists: 600 }, [rule]).verdict).toBe(
      "incompatible",
    );
    expect(assess(material, { joists: 600 }, [rule]).missing).toEqual(["subfloor"]);
  });
});
