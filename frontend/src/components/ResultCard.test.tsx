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
  quantum: { level: 4, p_emergency: 0.15, department: null },
  quantum_note: null,
  models_disagree: false,
  validation_issues: [],
  explanation: [],
};

describe("ResultCard", () => {
  it("shows a named triage level", () => {
    renderCard(base);
    expect(screen.getByText(/4 Less urgent/)).toBeInTheDocument();
    expect(screen.getByText(/General Medicine/)).toBeInTheDocument();
  });

  it("shows the abstain banner", () => {
    renderCard({ ...base, abstain: true, triage_level: null, abstain_reasons: ["Cannot assess, send to nurse now"] });
    expect(screen.getByRole("alert")).toHaveTextContent("Cannot assess, send to nurse now");
  });

  it("shows model disagreement", () => {
    renderCard({ ...base, models_disagree: true, triage_level: 2 });
    expect(screen.getByText("Models disagree")).toBeInTheDocument();
  });

  it("shows Quantum ML unavailable", () => {
    renderCard({ ...base, quantum: null, quantum_note: "Quantum ML unavailable" });
    expect(screen.getByText("Quantum ML unavailable")).toBeInTheDocument();
  });
});
