/**
 * Mutation-hardening for LMStudioProvider: baseURL precedence
 * (options > secret > env > default), trailing-slash stripping, the default
 * client baseURL, container-env emission, model-list filtering, and the
 * fetch-failure fallback. See MUTATION_TESTING.md.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { LMStudioProvider } from "../../src/providers/lmstudio-provider.js";

const ENV = "LMSTUDIO_API_URL";
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
  new LMStudioProvider(secrets as never, options as never) as unknown as P;

describe("LMStudioProvider baseURL precedence", () => {
  it("defaults to the LM Studio default URL", () => {
    delete process.env[ENV];
    expect(make().getClient().baseURL).toBe("http://127.0.0.1:1234/v1");
  });

  it("prefers options.baseURL over secret and env", () => {
    process.env[ENV] = "http://env:9";
    expect(
      make({ LMSTUDIO_API_URL: "http://secret:8" }, { baseURL: "http://opt:7" })
        .getClient().baseURL
    ).toBe("http://opt:7/v1");
  });

  it("uses the secret URL over env", () => {
    process.env[ENV] = "http://env:9";
    expect(make({ LMSTUDIO_API_URL: "http://secret:8" }).getClient().baseURL).toBe(
      "http://secret:8/v1"
    );
  });

  it("uses the env URL when nothing else is set", () => {
    process.env[ENV] = "http://env:9";
    expect(make().getClient().baseURL).toBe("http://env:9/v1");
  });

  it("strips ALL trailing slashes", () => {
    expect(make({}, { baseURL: "http://h:1///" }).getClient().baseURL).toBe(
      "http://h:1/v1"
    );
  });
});

describe("LMStudioProvider getContainerEnv", () => {
  it("emits only the URL when using the default key", () => {
    expect(make({}, { baseURL: "http://h:1" }).getContainerEnv()).toEqual({
      LMSTUDIO_API_URL: "http://h:1"
    });
  });

  it("includes the API key when a non-default one is set", () => {
    expect(
      make({ LMSTUDIO_API_KEY: "secret" }, { baseURL: "http://h:1" }).getContainerEnv()
    ).toEqual({ LMSTUDIO_API_URL: "http://h:1", LMSTUDIO_API_KEY: "secret" });
  });
});

describe("LMStudioProvider getAvailableLanguageModels", () => {
  it("filters to non-empty string ids and sends the bearer header", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: "a" }, { id: "" }, { x: 1 }] })
    });
    const p = make(
      { LMSTUDIO_API_KEY: "tok" },
      { client: {}, baseURL: "http://h:1", fetchFn }
    );
    expect((await p.getAvailableLanguageModels()).map((m) => m.id)).toEqual(["a"]);
    expect(fetchFn).toHaveBeenCalledWith(
      "http://h:1/v1/models",
      expect.objectContaining({ headers: { Authorization: "Bearer tok" } })
    );
  });

  it("returns [] when the fetch throws", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("down"));
    const p = make({}, { client: {}, baseURL: "http://h:1", fetchFn });
    expect(await p.getAvailableLanguageModels()).toEqual([]);
  });

  it("returns [] for a not-ok response even when it carries a data body", async () => {
    // json provided so a skipped !ok check would wrongly return models.
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ data: [{ id: "should-not-appear" }] })
    });
    const p = make({}, { client: {}, baseURL: "http://h:1", fetchFn });
    expect(await p.getAvailableLanguageModels()).toEqual([]);
  });
});
