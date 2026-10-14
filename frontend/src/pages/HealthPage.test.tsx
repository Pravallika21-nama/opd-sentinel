import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HealthPage } from "./HealthPage";

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <HealthPage />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HealthPage", () => {
  it("shows the API health payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "ok",
          service: "OPD Sentinel",
          version: "0.1.0",
        }),
      }),
    );

    renderPage();

    expect(await screen.findByText("ok")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "OPD Sentinel" })).toBeInTheDocument();
    expect(screen.getByText("0.1.0")).toBeInTheDocument();
    expect(screen.getByText(/reads reports\/results.json/)).toBeInTheDocument();
  });

  it("shows unreachable when the API does not respond", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));

    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("unreachable");
  });
});
