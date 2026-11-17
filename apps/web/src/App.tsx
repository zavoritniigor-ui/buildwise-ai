import { useState } from "react";
import type { Trust } from "./engine";
import type { Job } from "./knowledge";
import { KNOWLEDGE } from "./knowledge";
import { Catalogue } from "./ui/Catalogue";
import { JobForm } from "./ui/JobForm";
import { Results } from "./ui/Results";

const BW001 = KNOWLEDGE.scenarios.find((s) => s.id === "bw-001");
const BRIEF: Job = { country: "CA", subfloor: "plywood" };

type Tab = "check" | "catalogue";

export function App() {
  const [tab, setTab] = useState<Tab>("check");
  const [trust, setTrust] = useState<Trust>("preview");
  const [job, setJob] = useState<Job>(BW001?.job ?? BRIEF);

  return (
    <div className="page">
      <header className="site-header">
        <h1>BuildWise AI</h1>
        <p>Renovation planning with verified material compatibility.</p>
      </header>

      <aside className="notice" role="note">
        <strong>Preview data.</strong> Facts were read from manufacturer documents and are waiting
        for a person to check them against the cited pages.{" "}
        {trust === "preview"
          ? "Verdicts show what the rules will say once the facts are confirmed."
          : "Only verified facts count, so most verdicts are “Not enough information” for now."}
        <label className="toggle">
          <input
            type="checkbox"
            checked={trust === "verified"}
            onChange={(e) => setTrust(e.target.checked ? "verified" : "preview")}
          />
          Use only verified facts
        </label>
      </aside>

      <nav className="tabs" aria-label="Sections">
        <button type="button" aria-pressed={tab === "check"} onClick={() => setTab("check")}>
          Bathroom check
        </button>
        <button
          type="button"
          aria-pressed={tab === "catalogue"}
          onClick={() => setTab("catalogue")}
        >
          Catalogue
        </button>
      </nav>

      {tab === "check" ? (
        <main className="check">
          <section className="panel conditions" aria-labelledby="conditions-title">
            <h2 id="conditions-title">Your job</h2>
            <div className="presets">
              {BW001 && (
                <button type="button" onClick={() => setJob(BW001.job)}>
                  Example: {BW001.title}
                </button>
              )}
              <button type="button" onClick={() => setJob(BRIEF)}>
                Only “wood floor in Quebec”
              </button>
              <button type="button" onClick={() => setJob({})}>
                Clear
              </button>
            </div>
            <JobForm job={job} onChange={setJob} />
          </section>
          <section className="verdicts" aria-labelledby="verdicts-title">
            <h2 id="verdicts-title">What fits</h2>
            <Results job={job} trust={trust} />
          </section>
        </main>
      ) : (
        <main>
          <h2>Catalogue</h2>
          <Catalogue />
        </main>
      )}

      <footer className="site-footer">
        Free, non-commercial project. Store buttons open the retailer&apos;s own search; BuildWise
        does not collect prices or stock.
      </footer>
    </div>
  );
}
