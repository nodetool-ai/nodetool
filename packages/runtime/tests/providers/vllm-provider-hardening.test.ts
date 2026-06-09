/**
 * Mutation-hardening for VLLMProvider: required base URL (throws when absent or
 * blank), baseURL precedence + trailing-slash strip, the no-key default, the
 * default client baseURL, container-env, model-list filtering, and fetch
 * fallbacks. See MUTATION_TESTING.md.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { VLLMProvider } from "../../src/providers/vllm-provider.js";

const ENV = "VLLM_BASE_URL";
const orig = process.env[ENV];
afterEach(() => {
  if (orig === undefined) delete process.env[ENV];
  else process.env[ENV] = orig;
  vi.restoreAllMocks();
});

type P = {
  getClient: () => { baseURL: string };
  getContainerEnv: () => Record<string, string>;
  getAvailableLanguageModels: () => Promise<Array<{ id: string }>>;
};
const make = (secrets: object = {}, options: object = {}) =>
  new VLLMProvider(secrets as never, options as never) as unknown as P;

describe("VLLMProvider base URL requirement", () => {
  it("throws when no base URL is configured", () => {
    delete process.env[ENV];
    expect(() => make()).toThrow("VLLM_BASE_URL is required");
  });

  it("throws when the base URL is whitespace-only", () => {
    delete process.env[ENV];
    expect(() => make({}, { baseURL: "   " })).toThrow("VLLM_BASE_URL is required");
  });

  it("prefers options.baseURL, then secret, then env", () => {
    process.env[ENV] = "http://env:9";
    expect(
      make({ VLLM_BASE_URL: "http://sec:8" }, { baseURL: "http://opt:7" })
        .getClient().baseURL
    ).toBe("http://opt:7/v1");
    expect(make({ VLLM_BASE_URL: "http://sec:8" }).getClient().baseURL).toBe(
      "http://sec:8/v1"
    );
    expect(make().getClient().baseURL).toBe("http://env:9/v1");
  });

  it("strips ALL trailing slashes", () => {
    expect(make({}, { baseURL: "http://h:1///" }).getClient().baseURL).toBe(
      "http://h:1/v1"
    );
  });
});

describe("VLLMProvider getContainerEnv / key default", () => {
  it("omits the API key when none (uses the no-key default)", () => {
    expect(make({}, { baseURL: "http://h:1" }).getContainerEnv()).toEqual({
      VLLM_BASE_URL: "http://h:1"
    });
  });

  it("omits the API key when it is blank", () => {
    expect(
      make({ VLLM_API_KEY: "   " }, { baseURL: "http://h:1" }).getContainerEnv()
    ).toEqual({ VLLM_BASE_URL: "http://h:1" });
  });

  it("includes a real API key", () => {
    expect(
      make({ VLLM_API_KEY: "tok" }, { baseURL: "http://h:1" }).getContainerEnv()
    ).toEqual({ VLLM_BASE_URL: "http://h:1", VLLM_API_KEY: "tok" });
  });
});

describe("VLLMProvider getAvailableLanguageModels", () => {
  it("filters to non-empty string ids and sends the bearer header", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: "a" }, { id: "" }, { x: 1 }] })
    });
    const p = make(
      { VLLM_API_KEY: "tok" },
      { client: {}, baseURL: "http://h:1", fetchFn }
    );
    expect((await p.getAvailableLanguageModels()).map((m) => m.id)).toEqual(["a"]);
    expect(fetchFn).toHaveBeenCalledWith(
      "http://h:1/v1/models",
      expect.objectContaining({ headers: { Authorization: "Bearer tok" } })
    );
  });

  it("returns [] when the fetch throws or the response is not ok", async () => {
    const thrower = make({}, {
      client: {},
      baseURL: "http://h:1",
      fetchFn: vi.fn().mockRejectedValue(new Error("down"))
    });
    expect(await thrower.getAvailableLanguageModels()).toEqual([]);
    const notOk = make({}, {
      client: {},
      baseURL: "http://h:1",
      // json present so a skipped !ok check would wrongly return models
      fetchFn: vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ data: [{ id: "should-not-appear" }] })
      })
    });
    expect(await notOk.getAvailableLanguageModels()).toEqual([]);
  });
});
