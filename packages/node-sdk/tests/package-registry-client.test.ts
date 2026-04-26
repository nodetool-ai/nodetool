import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAvailablePackages } from "../src/package-registry-client.js";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("fetchAvailablePackages", () => {
  it("returns [] on network failure", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("boom");
    }) as typeof fetch;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await fetchAvailablePackages();
    expect(result).toEqual([]);
    expect(errorSpy).toHaveBeenCalled();
  });

  it("returns [] on non-2xx response", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response("nope", { status: 500, statusText: "Server Error" })
    ) as typeof fetch;
    vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await fetchAvailablePackages();
    expect(result).toEqual([]);
  });

  it("parses a valid JSON array", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify([
            { name: "a", repo_id: "org/a", description: "Package A" },
            { name: "b", repo_id: "org/b" },
            { name: "bad" } // missing repo_id — filtered out
          ]),
          { status: 200 }
        )
    ) as typeof fetch;
    const result = await fetchAvailablePackages();
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      name: "a",
      repo_id: "org/a",
      description: "Package A"
    });
    expect(result[1]).toEqual({ name: "b", repo_id: "org/b" });
  });

  it("supports { packages: [...] } wrapper form", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            packages: [{ name: "a", repo_id: "org/a" }]
          }),
          { status: 200 }
        )
    ) as typeof fetch;
    const result = await fetchAvailablePackages();
    expect(result).toHaveLength(1);
  });
});
