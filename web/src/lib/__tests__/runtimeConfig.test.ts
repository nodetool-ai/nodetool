/**
 * @jest-environment node
 */
jest.mock("../../stores/BASE_URL", () => ({
  BASE_URL: "http://api.example.com"
}));

const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

const jsonResponse = (body: unknown, ok = true): Response =>
  ({
    ok,
    status: ok ? 200 : 500,
    json: async () => body
  }) as unknown as Response;

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

    const { loadRuntimeConfig, isAuthRequired } = await import("../runtimeConfig");
    const config = await loadRuntimeConfig();

    expect(config.authMode).toBe("local");
    expect(isAuthRequired()).toBe(false);
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
