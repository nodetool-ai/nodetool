/**
 * Regression cover for the outage of 2026-08-05: a Supabase-mode backend that
 * served `supabaseAnonKey: null` left the client holding the placeholder key,
 * so every login answered 401 while the app looked healthy and logged nothing.
 *
 * `jest.config.ts` maps every extensionless specifier for this module to
 * `__mocks__/supabaseClientMock.ts`, so the tests below import it *with* the
 * `.ts` extension — the one spelling those patterns don't match — to get the
 * real implementation under test.
 */
jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({ auth: {} }))
}));

type SupabaseClientModule = typeof import("../supabaseClient");

const importReal = (): SupabaseClientModule =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("../supabaseClient.ts") as SupabaseClientModule;

import type { RuntimeConfig } from "../runtimeConfig";

const LOCAL_CONFIG: RuntimeConfig = {
  authMode: "local",
  supabaseUrl: null,
  supabaseAnonKey: null,
  authRedirectUrl: null,
  googleWorkspace: false,
  googleScopes: [],
  version: null
};

const SUPABASE_URL = "https://project.supabase.co";

describe("initSupabaseFromConfig", () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.resetModules();
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("reports an error when Supabase mode ships no anon key", async () => {
    const mod = importReal();

    mod.initSupabaseFromConfig({
      ...LOCAL_CONFIG,
      authMode: "supabase",
      supabaseUrl: SUPABASE_URL,
      supabaseAnonKey: null
    });

    expect(mod.getSupabaseConfigError()).toMatch(/SUPABASE_ANON_KEY/);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("stays quiet when Supabase mode supplies an anon key", async () => {
    const mod = importReal();

    mod.initSupabaseFromConfig({
      ...LOCAL_CONFIG,
      authMode: "supabase",
      supabaseUrl: SUPABASE_URL,
      supabaseAnonKey: "a-real-anon-key"
    });

    expect(mod.getSupabaseConfigError()).toBeNull();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("stays quiet in Local mode, where Supabase is never called", async () => {
    const mod = importReal();

    mod.initSupabaseFromConfig(LOCAL_CONFIG);

    expect(mod.getSupabaseConfigError()).toBeNull();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("builds the client with the resolved credentials", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const mod = importReal();

    mod.initSupabaseFromConfig({
      ...LOCAL_CONFIG,
      authMode: "supabase",
      supabaseUrl: SUPABASE_URL,
      supabaseAnonKey: "a-real-anon-key"
    });

    expect(createClient).toHaveBeenLastCalledWith(
      SUPABASE_URL,
      "a-real-anon-key"
    );
  });
});
