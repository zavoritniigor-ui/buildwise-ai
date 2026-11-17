import type { Job } from "../knowledge";
import { KNOWLEDGE } from "../knowledge";
import { CONDITION_GROUPS, conditionLabel } from "./labels";

const grouped = new Set(CONDITION_GROUPS.flatMap((g) => g.conditions));
const groups = [
  ...CONDITION_GROUPS,
  { title: "Other", conditions: Object.keys(KNOWLEDGE.conditions).filter((c) => !grouped.has(c)) },
].filter((g) => g.conditions.some((c) => c in KNOWLEDGE.conditions));

export const fieldId = (condition: string) => `condition-${condition}`;

export function JobForm({ job, onChange }: { job: Job; onChange: (job: Job) => void }) {
  const set = (name: string, value: string | number | undefined) => {
    const rest = Object.fromEntries(Object.entries(job).filter(([key]) => key !== name));
    onChange(value === undefined ? rest : { ...rest, [name]: value });
  };

  return (
    <form className="job-form" onSubmit={(e) => e.preventDefault()} aria-label="Job conditions">
      {groups.map((group) => (
        <fieldset key={group.title}>
          <legend>{group.title}</legend>
          {group.conditions
            .filter((name) => name in KNOWLEDGE.conditions)
            .map((name) => {
              const condition = KNOWLEDGE.conditions[name];
              if (!condition) return null;
              const id = fieldId(name);
              const value = job[name];
              const options = condition.options
                ? KNOWLEDGE.vocabulary[condition.options]
                : undefined;
              return (
                <div className="field" key={name}>
                  <label htmlFor={id}>
                    {conditionLabel(name)}
                    {condition.unit ? ` (${condition.unit === "C" ? "°C" : condition.unit})` : ""}
                  </label>
                  {options ? (
                    <select
                      id={id}
                      value={typeof value === "string" ? value : ""}
                      onChange={(e) => set(name, e.target.value || undefined)}
                    >
                      <option value="">Not known</option>
                      {Object.entries(options).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id={id}
                      type="number"
                      inputMode="decimal"
                      placeholder="Not known"
                      value={typeof value === "number" ? value : ""}
                      onChange={(e) => {
                        const parsed = e.target.valueAsNumber;
                        set(name, Number.isFinite(parsed) ? parsed : undefined);
                      }}
                    />
                  )}
                </div>
              );
            })}
        </fieldset>
      ))}
    </form>
  );
}
