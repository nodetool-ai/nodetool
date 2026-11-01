import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

vi.mock("@nodetool-ai/models", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/models")>();
  return {
    ...actual,
    Setting: {
      find: vi.fn(),
      upsert: vi.fn(),
      listForUser: vi.fn(),
      deleteSetting: vi.fn()
    },
    clearAllSecretCache: vi.fn(),
    userReferencesAllowed: vi.fn(() => true),
    onePasswordAccount: vi.fn(async () => ""),
    onePasswordBrowser: vi.fn()
  };
});

import {
  Setting,
  onePasswordAccount,
  onePasswordBrowser,
  userReferencesAllowed
} from "@nodetool-ai/models";

const createCaller = createCallerFactory(appRouter);

function makeCtx(): Context {
  return {
    userId: "user-1",
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false
  };
}

function browserStub(overrides: Record<string, unknown> = {}) {
  return {
    backend: "sdk-desktop",
    account: "my.1password.com",
    listVaults: vi.fn(async () => [{ id: "v1", title: "Private" }]),
    listItems: vi.fn(async () => [{ id: "i1", title: "OpenAI" }]),
    listFields: vi.fn(async () => [
      {
        id: "credential",
        title: "credential",
        section: "",
        fieldType: "Concealed",
        reference: "op://Private/i1/credential"
      }
    ]),
    ...overrides
  };
}

const ENV_KEYS = [
  "NODETOOL_1PASSWORD_ACCOUNT",
  "OP_CONNECT_HOST",
  "OP_CONNECT_TOKEN",
  "OP_SERVICE_ACCOUNT_TOKEN"
];
let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(userReferencesAllowed).mockReturnValue(true);
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

describe("settings.onepassword", () => {
  it("reports a connected desktop account", async () => {
    vi.mocked(onePasswordAccount).mockResolvedValue("my.1password.com");
    const status = await createCaller(makeCtx()).settings.onepassword.status();
    expect(status).toEqual({
      available: true,
      backend: "sdk-desktop",
      account: "my.1password.com",
      accountFromEnv: false,
      canBrowse: true
    });
    expect(onePasswordAccount).toHaveBeenCalledWith("user-1");
  });

  it("reports unavailable and refuses every route on a shared server", async () => {
    vi.mocked(userReferencesAllowed).mockReturnValue(false);
    const caller = createCaller(makeCtx());
    const status = await caller.settings.onepassword.status();
    expect(status.available).toBe(false);
    expect(status.canBrowse).toBe(false);
    expect(onePasswordAccount).not.toHaveBeenCalled();

    await expect(
      caller.settings.onepassword.connect({ account: "my.1password.com" })
    ).rejects.toThrow(/turned off/);
    await expect(caller.settings.onepassword.vaults()).rejects.toThrow(
      /turned off/
    );
    expect(Setting.upsert).not.toHaveBeenCalled();
    expect(onePasswordBrowser).not.toHaveBeenCalled();
  });

  it("connect saves the account when 1Password lists vaults", async () => {
    vi.mocked(Setting.find).mockResolvedValue(null as never);
    vi.mocked(onePasswordBrowser).mockResolvedValue(browserStub() as never);
    const result = await createCaller(
      makeCtx()
    ).settings.onepassword.connect({ account: "my.1password.com" });
    expect(result).toEqual({ ok: true, message: "", vaultCount: 1 });
    expect(Setting.upsert).toHaveBeenCalledTimes(1);
    expect(Setting.upsert).toHaveBeenCalledWith({
      userId: "user-1",
      key: "NODETOOL_1PASSWORD_ACCOUNT",
      value: "my.1password.com"
    });
    expect(Setting.deleteSetting).not.toHaveBeenCalled();
  });

  it("connect restores the previous account when sign-in fails", async () => {
    vi.mocked(Setting.find).mockResolvedValue({
      value: "old.1password.com"
    } as never);
    vi.mocked(onePasswordBrowser).mockResolvedValue(
      browserStub({
        listVaults: vi.fn(async () => {
          throw new Error("authorization was denied");
        })
      }) as never
    );
    const result = await createCaller(
      makeCtx()
    ).settings.onepassword.connect({ account: "new.1password.com" });
    expect(result).toEqual({
      ok: false,
      message: "authorization was denied",
      vaultCount: 0
    });
    expect(vi.mocked(Setting.upsert).mock.calls.at(-1)?.[0]).toEqual({
      userId: "user-1",
      key: "NODETOOL_1PASSWORD_ACCOUNT",
      value: "old.1password.com"
    });
  });

  it("connect removes the account when there was none before", async () => {
    vi.mocked(Setting.find).mockResolvedValue(null as never);
    vi.mocked(onePasswordBrowser).mockRejectedValue(new Error("no app"));
    const result = await createCaller(
      makeCtx()
    ).settings.onepassword.connect({ account: "my.1password.com" });
    expect(result.ok).toBe(false);
    expect(Setting.deleteSetting).toHaveBeenCalledWith(
      "user-1",
      "NODETOOL_1PASSWORD_ACCOUNT"
    );
  });

  it("lists fields as references without values", async () => {
    vi.mocked(onePasswordBrowser).mockResolvedValue(browserStub() as never);
    const fields = await createCaller(makeCtx()).settings.onepassword.fields({
      vaultId: "v1",
      itemId: "i1"
    });
    expect(fields).toEqual([
      {
        id: "credential",
        title: "credential",
        section: "",
        fieldType: "Concealed",
        reference: "op://Private/i1/credential"
      }
    ]);
    expect(JSON.stringify(fields)).not.toMatch(/"value"/);
  });

  it("turns a browse failure into a service error", async () => {
    vi.mocked(onePasswordBrowser).mockResolvedValue(
      browserStub({
        listItems: vi.fn(async () => {
          throw new Error("vault not found");
        })
      }) as never
    );
    await expect(
      createCaller(makeCtx()).settings.onepassword.items({ vaultId: "v9" })
    ).rejects.toThrow(/vault not found/);
  });
});
