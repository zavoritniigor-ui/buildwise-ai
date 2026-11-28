import { useI18n } from "../i18n";
import { citationUrl } from "../knowledge";
import type { Breach } from "../ventilation";

/** Whether a system meets the building code, with the pages it was checked against. */
export function CodeStatus({
  breaches,
  document,
  pages,
  ok,
  broken,
}: {
  breaches: readonly Breach[];
  document: string;
  /** the pages of the code the check reads */
  pages: readonly number[];
  ok: string;
  broken: (rules: string) => string;
}) {
  const { t } = useI18n();
  const rules = [...new Set(breaches.map((b) => b.rule))].join(", ");
  return (
    <>
      <p className={breaches.length ? "code-status code-breach" : "code-status code-ok"}>
        {breaches.length ? broken(rules) : ok}
      </p>
      <p className="muted small">
        {t.buildingCodeNote}{" "}
        {pages.map((page, i) => (
          <span key={page}>
            {i > 0 && ", "}
            <a
              className="citation"
              href={citationUrl({ document, page })}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t.page(page)}
            </a>
          </span>
        ))}
        .
      </p>
    </>
  );
}
