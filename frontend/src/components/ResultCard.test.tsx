import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LocaleProvider } from "../lib/i18n";
import { ResultCard } from "./ResultCard";
import type { TriageResult } from "../api/client";

function renderCard(result: TriageResult) {
  return render(
    <LocaleProvider>
      <ResultCard result={result} />
    </LocaleProvider>,
  );
}

const base: TriageResult = {
  triage_level: 4,
  department: "General Medicine",
  red_flags: [],
  fired_rules: [],
  abstain: false,
  abstain_reasons: [],
  uncertainty: 0.2,
  classical: { level: 4, p_emergency: 0.08, department: "General Medicine" },
  model_status: "ok",
  validation_issues: [],
  explanation: [],
};

describe("ResultCard", () => {
  it("shows a named triage level labelled as a recommendation", () => {
    renderCard(base);
    expect(screen.getByText(/4 Less urgent/)).toBeInTheDocument();
    expect(screen.getByText(/General Medicine/)).toBeInTheDocument();
    expect(screen.getByText(/decision support, not a diagnosis/)).toBeInTheDocument();
  });

  it("shows the abstain banner with its reasons", () => {
    renderCard({ ...base, abstain: true, triage_level: null, abstain_reasons: ["Too many missing vitals"] });
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Cannot assess, send to nurse now");
    expect(alert).toHaveTextContent("Too many missing vitals");
  });

  it("says when the model failed instead of showing a result", () => {
    renderCard({ ...base, classical: null, model_status: "error", abstain: false });
    expect(screen.getByText(/Classical ML model failed/)).toBeInTheDocument();
    expect(screen.queryByText(/Emergency probability/)).not.toBeInTheDocument();
  });

  it("marks a keyword department hint and lists only real vital issues", () => {
    renderCard({
      ...base,
      department_source: "keyword_hint",
      validation_issues: [
        { field: "pulse", status: "ok", raw: 80, detail: "" },
        { field: "spo2", status: "implausible", raw: 140, detail: "Above 100%." },
      ],
    });
    expect(screen.getByText(/keyword hint/)).toBeInTheDocument();
    expect(screen.getByText(/Above 100%/)).toBeInTheDocument();
    expect(screen.queryByText("Pulse")).not.toBeInTheDocument();
  });
});
