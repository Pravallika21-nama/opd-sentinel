import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiGet, apiPost, fieldErrorFor, setAuthToken, setUnauthorizedHandler } from "./client";
import { pagesFor } from "../components/AppShell";

function failure(promise: Promise<unknown>): Promise<ApiError> {
  return promise.then(
    () => {
      throw new Error("Expected the request to fail");
    },
    (caught: unknown) => caught as ApiError,
  );
}

function respond(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body });
}

afterEach(() => {
  vi.unstubAllGlobals();
  setAuthToken(null);
  setUnauthorizedHandler(null);
});

describe("api client", () => {
  it("sends the bearer token", async () => {
    const fetchMock = respond(200, []);
    vi.stubGlobal("fetch", fetchMock);
    setAuthToken("abc");
    await apiGet("/queue");
    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer abc");
  });

  it("reads FastAPI detail messages and field errors", async () => {
    vi.stubGlobal(
      "fetch",
      respond(422, { message: "Check the highlighted fields.", errors: [{ field: "dose", message: "Dose must be a number." }] }),
    );
    const error = await failure(apiPost("/encounters/x/prescriptions", {}));
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(422);
    expect(error.message).toBe("Check the highlighted fields.");
    expect(fieldErrorFor(error, "dose")).toBe("Dose must be a number.");

    vi.stubGlobal("fetch", respond(409, { detail: { message: "Start the consultation before saving notes." } }));
    const conflict = await failure(apiPost("/encounters/x/consultation", {}));
    expect(conflict.message).toBe("Start the consultation before saving notes.");
  });

  it("signals an expired session on 401", async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    vi.stubGlobal("fetch", respond(401, { detail: { message: "Sign in again." } }));
    await expect(apiGet("/queue")).rejects.toThrow("Sign in again.");
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("reports an unreachable API without a status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const error = await failure(apiGet("/queue"));
    expect(error.status).toBe(0);
  });
});

describe("role navigation", () => {
  it("matches the backend role boundaries", () => {
    expect(pagesFor("nurse")).toContain("live");
    expect(pagesFor("nurse")).not.toContain("operations");
    expect(pagesFor("nurse")).not.toContain("audit");
    expect(pagesFor("doctor")).toContain("doctor");
    expect(pagesFor("doctor")).not.toContain("live");
    expect(pagesFor("admin")).toContain("operations");
    expect(pagesFor("admin")).toContain("audit");
    expect(pagesFor("admin")).not.toContain("doctor");
    expect(pagesFor("nurse")).toContain("checkins");
    expect(pagesFor("doctor")).not.toContain("checkins");
    expect(pagesFor("doctor")).toContain("insights");
  });

  it("gives patients only their own portal", () => {
    expect(pagesFor("patient")).toEqual(["portal"]);
    for (const role of ["nurse", "doctor", "admin"] as const) {
      expect(pagesFor(role)).not.toContain("portal");
    }
  });
});
