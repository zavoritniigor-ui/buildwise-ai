import type { Verdict } from "../engine";
import { VERDICT_LABEL } from "./labels";

export function VerdictBadge({ verdict, testId }: { verdict: Verdict; testId?: string }) {
  return (
    <span className={`badge badge-${verdict}`} data-testid={testId}>
      {VERDICT_LABEL[verdict]}
    </span>
  );
}
