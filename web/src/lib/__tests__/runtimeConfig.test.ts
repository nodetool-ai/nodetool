import { stub } from "../../test-utils/doubles";
/**
 * @jest-environment node
 */
jest.mock("../../stores/BASE_URL", () => ({
  BASE_URL: "http://api.example.com"
}));

const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

const jsonResponse = (body: unknown, ok = true): Response =>
  stub<Response>({
    ok,
    status: ok ? 200 : 500,
    json: async () => body
  });

describe("runtimeConfig", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("defaults to local auth before load", async () => {
    const { isAuthRequired, getRuntimeConfig } = await import("../runtimeConfig");
    expect(isAuthRequired()).toBe(false);
    expect(getRuntimeConfig().supabaseUrl).toBeNull();
  });

  it("fetches /api/config from BASE_URL and applies supabase mode", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        authMode: "supabase",
        supabaseUrl: "https://x.supabase.co",
        supabaseAnonKey: "anon",
        authRedirectUrl: null,
        version: "1.2.3"
      })
    );

    const { loadRuntimeConfig, isAuthRequired } = await import("../runtimeConfig");
    const config = await loadRuntimeConfig();

    expect(mockFetch).toHaveBeenCalledWith(
      "http://api.example.com/api/config",
      expect.any(Object)
    );
    expect(config.authMode).toBe("supabase");
    expect(isAuthRequired()).toBe(true);
  });

  it("falls back to local defaults when the endpoint is unavailable", async () => {
    mockFetch.mockResolvedValue(jsonResponse(null, false));

    const { loadRuntimeConfig, isAuthRequired, isRuntimeConfigFromBackend } =
      await import("../runtimeConfig");
    const config = await loadRuntimeConfig();

    expect(config.authMode).toBe("local");
    expect(isAuthRequired()).toBe(false);
    expect(isRuntimeConfigFromBackend()).toBe(false);
  });

  it("retries before giving up on the endpoint", async () => {
    mockFetch
      .mockRejectedValueOnce(new Error("503"))
      .mockRejectedValueOnce(new Error("503"))
      .mockResolvedValue(jsonResponse({ authMode: "supabase" }));

    const { loadRuntimeConfig, isAuthRequired, isRuntimeConfigFromBackend } =
      await import("../runtimeConfig");
    await loadRuntimeConfig();

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(isAuthRequired()).toBe(true);
    expect(isRuntimeConfigFromBackend()).toBe(true);
  });

  // A bundle built with Supabase credentials targets a Supabase backend. An
  // unreachable /api/config must not downgrade it to Local mode, which would
  // log the user in as the single local user against a server enforcing auth.
  it("falls back to supabase mode when the build carries Supabase credentials", async () => {
    mockFetch.mockRejectedValue(new Error("backend down"));
    process.env.VITE_SUPABASE_URL = "https://x.supabase.co";
    process.env.VITE_SUPABASE_ANON_KEY = "anon";
    try {
      const { loadRuntimeConfig, isAuthRequired } = await import(
        "../runtimeConfig"
      );
      const config = await loadRuntimeConfig();

      expect(config.authMode).toBe("supabase");
      expect(config.supabaseUrl).toBe("https://x.supabase.co");
      expect(config.supabaseAnonKey).toBe("anon");
      expect(isAuthRequired()).toBe(true);
    } finally {
      delete process.env.VITE_SUPABASE_URL;
      delete process.env.VITE_SUPABASE_ANON_KEY;
    }
  });

  it("caches after the first successful load", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ authMode: "local", supabaseUrl: null })
    );

    const { loadRuntimeConfig } = await import("../runtimeConfig");
    await loadRuntimeConfig();
    await loadRuntimeConfig();

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
