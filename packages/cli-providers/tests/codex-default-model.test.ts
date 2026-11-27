/**
 * The command line's codex provider: credential fallback to the Codex CLI
 * login, and the default model taken from the account's catalog.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  stored: null as string | null,
  cliToken: null as string | null,
  catalog: (async () => [{ id: "gpt-6-astra" }]) as () => Promise<Array<{ id: string }>>,
  seenToken: undefined as string | null | undefined
}));

vi.mock("@nodetool-ai/pack-manager", () => ({ initializeInstalledExecutionHost: vi.fn(async () => {}) }));
vi.mock("@nodetool-ai/node-catalog", () => ({
  importPack: vi.fn(async () => { throw new (class MissingPackError extends Error {})(); }),
  MissingPackError: Error
}));
vi.mock("@nodetool-ai/huggingface", () => ({ readCachedHfModels: vi.fn(async () => []) }));
vi.mock("@nodetool-ai/models", () => ({
  getSecret: vi.fn(async (key: string) => (key === "CODEX_ACCESS_TOKEN" ? state.stored : null)),
  Setting: { find: vi.fn(async () => null) }
}));
vi.mock("../src/codex-cli-login.js", () => ({
  codexCliAuthPath: () => "/fixture/auth.json",
  resolveCodexCliAccessToken: vi.fn(async () => state.cliToken)
}));
vi.mock("@nodetool-ai/runtime", () => ({
  BaseProvider: class {},
  FakeProvider: class {},
  PythonProvider: class {},
  createPythonBridge: vi.fn(),
  registerProvider: vi.fn(),
  syncCustomProviders: vi.fn(),
  RECOMMENDED_MODELS: [],
  listRegisteredProviderIds: vi.fn(() => ["codex", "anthropic"]),
  getProviderSecretKey: vi.fn(() => null),
  isProviderConfigured: vi.fn(async () => true),
  getProvider: vi.fn(async (id: string, getSecret: (key: string) => Promise<string | null>) => {
    if (id !== "codex") { return {}; }
    const token = await getSecret("CODEX_ACCESS_TOKEN");
    state.seenToken = token;
    if (!token) { throw new Error("Codex is not signed in (no CODEX_ACCESS_TOKEN)."); }
    return { listAccountLanguageModels: () => state.catalog() };
  })
}));

const { resolveDefaultModel } = await import("../src/index.js");

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("CODEX_ACCESS_TOKEN", "");
  delete process.env.CODEX_ACCESS_TOKEN;
  state.stored = null;
  state.cliToken = null;
  state.seenToken = undefined;
  state.catalog = async () => [{ id: "gpt-6-astra" }, { id: "gpt-6-luna" }];
});
afterEach(() => vi.unstubAllEnvs());

describe("codex on the command line", () => {
  it("uses the Codex CLI login when NodeTool has no Codex credential", async () => {
    state.cliToken = "cli-token";
    await expect(resolveDefaultModel("codex")).resolves.toBe("gpt-6-astra");
    expect(state.seenToken).toBe("cli-token");
  });

  it("prefers a NodeTool sign-in over the Codex CLI login", async () => {
    state.stored = "stored-token";
    state.cliToken = "cli-token";
    await resolveDefaultModel("codex");
    expect(state.seenToken).toBe("stored-token");
  });

  it("leaves CODEX_ACCESS_TOKEN to the registry's environment fallback", async () => {
    vi.stubEnv("CODEX_ACCESS_TOKEN", "env-token");
    state.cliToken = "cli-token";
    await expect(resolveDefaultModel("codex")).rejects.toThrow();
    expect(state.seenToken).toBeNull();
  });

  it("explains how to sign in when there is no credential", async () => {
    await expect(resolveDefaultModel("codex")).rejects.toThrow("Codex is not signed in");
  });

  it("explains --model when the account catalog cannot be loaded", async () => {
    state.cliToken = "cli-token";
    state.catalog = async () => { throw new Error("Codex model listing failed with HTTP 503"); };
    await expect(resolveDefaultModel("codex")).rejects.toThrow(/HTTP 503.*--model <id>/);
  });

  it("keeps the fixed default for other providers", async () => {
    await expect(resolveDefaultModel("anthropic")).resolves.toBe("claude-sonnet-4-6");
  });
});
