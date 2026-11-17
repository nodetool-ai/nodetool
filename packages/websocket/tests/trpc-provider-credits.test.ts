import { describe, it, expect, beforeEach, vi } from "vitest";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

vi.mock("@nodetool-ai/models", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/models")>();
  return { ...actual, getSecrets: vi.fn() };
});

vi.mock("@nodetool-ai/runtime", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/runtime")>();
  return {
    ...actual,
    readCredentialEnv: vi.fn(() => undefined),
    readProviderCredit: vi.fn()
  };
});

vi.mock("../src/lib/permissions.js", () => ({
  requirePermission: async () => undefined,
  permissionsFor: async () => new Proxy({}, { get: () => true }),
  permissionRefusal: (flag: string) => flag,
  forgetPermissions: () => undefined
}));

import { getSecrets } from "@nodetool-ai/models";
import { creditAccountKey, readProviderCredit } from "@nodetool-ai/runtime";

const createCaller = createCallerFactory(appRouter);

function makeCtx(overrides: Partial<Context> = {}): Context {
  return {
    userId: "user-1",
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false,
    ...overrides
  };
}

const deepseekCredit = {
  state: "available" as const,
  remaining: 12,
  unit: "currency" as const,
  currency: "USD",
  source: "balance_endpoint" as const,
  summary: "DeepSeek has 12.00 USD left.",
  checkedAt: 1
};

describe("settings.providerCredits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getSecrets as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Map([
        ["DEEPSEEK_API_KEY", "sk-deep"],
        ["OPENAI_API_KEY", "sk-open"]
      ])
    );
    (readProviderCredit as ReturnType<typeof vi.fn>).mockImplementation(
      async (account: { providerId: string }) =>
        account.providerId === "deepseek" ? deepseekCredit : null
    );
  });

  it("answers for the providers the user holds a key for", async () => {
    const rows = await createCaller(makeCtx()).settings.providerCredits();
    const byProvider = Object.fromEntries(rows.map((row) => [row.provider, row]));

    expect(byProvider.deepseek).toEqual({
      provider: "deepseek",
      supported: true,
      credit: deepseekCredit
    });
    expect(byProvider.openai).toEqual({ provider: "openai", supported: false, credit: null });
    expect(byProvider.anthropic).toBeUndefined();
  });

  it("keys the read by the user's credential and passes refresh through", async () => {
    await createCaller(makeCtx()).settings.providerCredits({
      provider: "deepseek",
      refresh: true
    });

    expect(readProviderCredit).toHaveBeenCalledTimes(1);
    const [account, options] = (readProviderCredit as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(account.key).toBe(creditAccountKey("deepseek", "sk-deep"));
    expect(options).toEqual({ refresh: true });
  });

  it("rejects unauthenticated callers", async () => {
    await expect(
      createCaller(makeCtx({ userId: null })).settings.providerCredits()
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
