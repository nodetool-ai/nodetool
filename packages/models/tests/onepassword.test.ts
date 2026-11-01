import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const execFileMock = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({ execFile: execFileMock }));

const sdkMock = vi.hoisted(() => {
  const resolve = vi.fn();
  const vaultsList = vi.fn();
  const itemsList = vi.fn();
  const itemsGet = vi.fn();
  const createClient = vi.fn(async () => ({
    secrets: { resolve },
    vaults: { list: vaultsList },
    items: { list: itemsList, get: itemsGet }
  }));
  class DesktopAuth {
    constructor(public accountName: string) {}
  }
  return { resolve, vaultsList, itemsList, itemsGet, createClient, DesktopAuth };
});
vi.mock("@1password/sdk", () => ({
  createClient: sdkMock.createClient,
  DesktopAuth: sdkMock.DesktopAuth
}));

const settingMock = vi.hoisted(() => ({ find: vi.fn() }));
vi.mock("../src/setting.js", () => ({ Setting: settingMock }));

import {
  buildOnePasswordReference,
  clearOnePasswordCache,
  onePasswordAccount,
  onePasswordBrowser,
  isOnePasswordReference,
  onePasswordBackend,
  parseOnePasswordReference,
  resolveOnePasswordReference,
  resolveUserSecretValue,
  userReferencesAllowed
} from "../src/onepassword.js";

type ExecCallback = (
  error: Error | null,
  stdout: string,
  stderr: string
) => void;

function cliAnswers(stdout: string): void {
  execFileMock.mockImplementation(
    (_bin: string, _args: string[], _opts: unknown, cb: ExecCallback) => {
      cb(null, stdout, "");
    }
  );
}

function cliFails(stderr: string): void {
  execFileMock.mockImplementation(
    (_bin: string, _args: string[], _opts: unknown, cb: ExecCallback) => {
      cb(new Error("exit 1"), "", stderr);
    }
  );
}

const ENV_KEYS = [
  "OP_CONNECT_HOST",
  "OP_CONNECT_TOKEN",
  "OP_SERVICE_ACCOUNT_TOKEN",
  "NODETOOL_1PASSWORD_ACCOUNT",
  "NODETOOL_1PASSWORD_CLI",
  "NODETOOL_1PASSWORD_CACHE_TTL_SECONDS",
  "NODETOOL_1PASSWORD_USER_REFERENCES",
  "SUPABASE_URL",
  "SUPABASE_KEY"
];

describe("onepassword", () => {
  beforeEach(() => {
    clearOnePasswordCache();
    execFileMock.mockReset();
    sdkMock.resolve.mockReset();
    sdkMock.createClient.mockClear();
    sdkMock.vaultsList.mockReset();
    sdkMock.itemsList.mockReset();
    sdkMock.itemsGet.mockReset();
    settingMock.find.mockReset();
    for (const key of ENV_KEYS) delete process.env[key];
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    for (const key of ENV_KEYS) delete process.env[key];
  });

  describe("parseOnePasswordReference", () => {
    it("parses vault/item/field", () => {
      expect(parseOnePasswordReference("op://Dev/OpenAI/credential")).toEqual({
        vault: "Dev",
        item: "OpenAI",
        section: null,
        field: "credential",
        query: null
      });
    });

    it("parses a section, spaces and a query attribute", () => {
      expect(
        parseOnePasswordReference("op://Team Keys/Fal AI/api/key?attribute=otp")
      ).toEqual({
        vault: "Team Keys",
        item: "Fal AI",
        section: "api",
        field: "key",
        query: "attribute=otp"
      });
    });

    it("rejects malformed references", () => {
      for (const bad of [
        "op://Dev/OpenAI",
        "op://Dev//credential",
        "op://Dev/OpenAI/a/b/c",
        'op://Dev/Open"AI/credential',
        "op://Dev/OpenAI/cred\nential",
        "op:// /OpenAI/credential",
        "https://Dev/OpenAI/credential"
      ]) {
        expect(parseOnePasswordReference(bad)).toBeNull();
      }
    });

    it("only treats op:// strings as references", () => {
      expect(isOnePasswordReference("op://Dev/OpenAI/credential")).toBe(true);
      expect(isOnePasswordReference("sk-abc")).toBe(false);
      expect(isOnePasswordReference(undefined)).toBe(false);
    });
  });

  describe("CLI backend", () => {
    it("runs op read without a shell and returns stdout", async () => {
      cliAnswers("sk-secret");
      const value = await resolveOnePasswordReference(
        "op://Dev/OpenAI/credential"
      );
      expect(value).toBe("sk-secret");
      const [bin, args] = execFileMock.mock.calls[0];
      expect(bin).toBe("op");
      expect(args).toEqual([
        "read",
        "--no-newline",
        "op://Dev/OpenAI/credential"
      ]);
    });

    it("honours NODETOOL_1PASSWORD_CLI", async () => {
      process.env.NODETOOL_1PASSWORD_CLI = "/opt/1password/op";
      cliAnswers("v");
      await resolveOnePasswordReference("op://Dev/OpenAI/credential");
      expect(execFileMock.mock.calls[0][0]).toBe("/opt/1password/op");
    });

    it("caches a resolved value and shares one read between callers", async () => {
      cliAnswers("sk-secret");
      const ref = "op://Dev/OpenAI/credential";
      const [a, b] = await Promise.all([
        resolveOnePasswordReference(ref),
        resolveOnePasswordReference(ref)
      ]);
      await resolveOnePasswordReference(ref);
      expect([a, b]).toEqual(["sk-secret", "sk-secret"]);
      expect(execFileMock).toHaveBeenCalledTimes(1);
    });

    it("re-reads after the cache TTL", async () => {
      process.env.NODETOOL_1PASSWORD_CACHE_TTL_SECONDS = "0";
      cliAnswers("first");
      const ref = "op://Dev/OpenAI/credential";
      expect(await resolveOnePasswordReference(ref)).toBe("first");
      cliAnswers("rotated");
      expect(await resolveOnePasswordReference(ref)).toBe("rotated");
    });

    it("returns null when op fails", async () => {
      cliFails("[ERROR] could not find item OpenAI in vault Dev");
      expect(
        await resolveOnePasswordReference("op://Dev/OpenAI/credential")
      ).toBeNull();
    });

    it("never runs op for a malformed reference", async () => {
      expect(await resolveOnePasswordReference("op://Dev/OpenAI")).toBeNull();
      expect(execFileMock).not.toHaveBeenCalled();
    });
  });

  describe("backend selection", () => {
    it("prefers Connect, then a service account, then the desktop app, then op", () => {
      expect(onePasswordBackend({})).toBe("cli");
      expect(onePasswordBackend({ NODETOOL_1PASSWORD_ACCOUNT: "me" })).toBe(
        "sdk-desktop"
      );
      expect(
        onePasswordBackend({
          NODETOOL_1PASSWORD_ACCOUNT: "me",
          OP_SERVICE_ACCOUNT_TOKEN: "ops_x"
        })
      ).toBe("sdk-service-account");
      expect(
        onePasswordBackend({
          OP_SERVICE_ACCOUNT_TOKEN: "ops_x",
          OP_CONNECT_HOST: "http://c",
          OP_CONNECT_TOKEN: "t"
        })
      ).toBe("connect");
    });
  });

  describe("SDK backend", () => {
    it("resolves through a service account without running op", async () => {
      process.env.OP_SERVICE_ACCOUNT_TOKEN = "ops_token";
      sdkMock.resolve.mockResolvedValue("sk-sdk");
      expect(
        await resolveOnePasswordReference("op://Dev/OpenAI/credential")
      ).toBe("sk-sdk");
      expect(sdkMock.createClient).toHaveBeenCalledWith({
        auth: "ops_token",
        integrationName: "NodeTool",
        integrationVersion: "v1.0.0"
      });
      expect(sdkMock.resolve).toHaveBeenCalledWith("op://Dev/OpenAI/credential");
      expect(execFileMock).not.toHaveBeenCalled();
    });

    it("authenticates through the desktop app for a named account", async () => {
      process.env.NODETOOL_1PASSWORD_ACCOUNT = "my.1password.com";
      sdkMock.resolve.mockResolvedValue("sk-desktop");
      expect(
        await resolveOnePasswordReference("op://Dev/OpenAI/credential")
      ).toBe("sk-desktop");
      const [config] = sdkMock.createClient.mock.calls[0] as unknown as [
        { auth: InstanceType<typeof sdkMock.DesktopAuth> }
      ];
      expect(config.auth).toBeInstanceOf(sdkMock.DesktopAuth);
      expect(config.auth.accountName).toBe("my.1password.com");
    });

    it("reuses one client and rebuilds it after a failed read", async () => {
      process.env.NODETOOL_1PASSWORD_CACHE_TTL_SECONDS = "0";
      process.env.OP_SERVICE_ACCOUNT_TOKEN = "ops_token";
      sdkMock.resolve.mockResolvedValue("a");
      await resolveOnePasswordReference("op://Dev/A/credential");
      await resolveOnePasswordReference("op://Dev/B/credential");
      expect(sdkMock.createClient).toHaveBeenCalledTimes(1);

      sdkMock.resolve.mockRejectedValueOnce(new Error("session expired"));
      expect(
        await resolveOnePasswordReference("op://Dev/C/credential")
      ).toBeNull();
      await resolveOnePasswordReference("op://Dev/D/credential");
      expect(sdkMock.createClient).toHaveBeenCalledTimes(2);
    });
  });

  describe("Connect backend", () => {
    const vaultId = "a".repeat(26);
    const itemId = "b".repeat(26);

    function stubConnect(item: unknown): ReturnType<typeof vi.fn> {
      const fetchMock = vi.fn(async (url: string) => {
        const path = new URL(url).pathname;
        let body: unknown;
        if (path === "/v1/vaults") body = [{ id: vaultId, name: "Dev" }];
        else if (path === `/v1/vaults/${vaultId}/items`)
          body = [{ id: itemId, title: "OpenAI" }];
        else if (path === `/v1/vaults/${vaultId}/items/${itemId}`) body = item;
        else return new Response("not found", { status: 404 });
        return new Response(JSON.stringify(body), { status: 200 });
      });
      vi.stubGlobal("fetch", fetchMock);
      return fetchMock;
    }

    beforeEach(() => {
      process.env.OP_CONNECT_HOST = "http://connect.internal:8080/";
      process.env.OP_CONNECT_TOKEN = "connect-token";
    });

    it("looks up vault and item by name and returns the field", async () => {
      const fetchMock = stubConnect({
        id: itemId,
        fields: [
          { id: "username", label: "username", value: "me" },
          { id: "credential", label: "credential", value: "sk-connect" }
        ]
      });
      expect(
        await resolveOnePasswordReference("op://Dev/OpenAI/credential")
      ).toBe("sk-connect");
      expect(execFileMock).not.toHaveBeenCalled();
      const [firstUrl, init] = fetchMock.mock.calls[0];
      expect(firstUrl).toBe(
        `http://connect.internal:8080/v1/vaults?filter=${encodeURIComponent('name eq "Dev"')}`
      );
      expect(init.headers.Authorization).toBe("Bearer connect-token");
    });

    it("selects a field inside a named section", async () => {
      stubConnect({
        id: itemId,
        sections: [
          { id: "s1", label: "prod" },
          { id: "s2", label: "dev" }
        ],
        fields: [
          { id: "f1", label: "key", value: "prod-key", section: { id: "s1" } },
          { id: "f2", label: "key", value: "dev-key", section: { id: "s2" } }
        ]
      });
      expect(await resolveOnePasswordReference("op://Dev/OpenAI/dev/key")).toBe(
        "dev-key"
      );
    });

    it("refuses an ambiguous field", async () => {
      stubConnect({
        id: itemId,
        fields: [
          { id: "f1", label: "key", value: "one" },
          { id: "f2", label: "key", value: "two" }
        ]
      });
      expect(
        await resolveOnePasswordReference("op://Dev/OpenAI/key")
      ).toBeNull();
    });

    it("returns null on a Connect error", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response("unauthorized", { status: 401 }))
      );
      expect(
        await resolveOnePasswordReference("op://Dev/OpenAI/credential")
      ).toBeNull();
    });
  });

  describe("user references", () => {
    it("are allowed on a local install", () => {
      expect(userReferencesAllowed()).toBe(true);
    });

    it("are refused on a shared deployment unless the operator opts in", async () => {
      process.env.SUPABASE_URL = "https://x.supabase.co";
      process.env.SUPABASE_KEY = "anon";
      expect(userReferencesAllowed()).toBe(false);
      cliAnswers("server-secret");
      expect(
        await resolveUserSecretValue(
          "OPENAI_API_KEY",
          "op://Prod/OpenAI/credential"
        )
      ).toBeNull();
      expect(execFileMock).not.toHaveBeenCalled();

      process.env.NODETOOL_1PASSWORD_USER_REFERENCES = "true";
      expect(userReferencesAllowed()).toBe(true);
    });

    it("can be turned off on a local install", () => {
      process.env.NODETOOL_1PASSWORD_USER_REFERENCES = "0";
      expect(userReferencesAllowed()).toBe(false);
    });

    it("pass plain values through untouched", async () => {
      process.env.SUPABASE_URL = "https://x.supabase.co";
      process.env.SUPABASE_KEY = "anon";
      expect(await resolveUserSecretValue("K", "sk-plain")).toBe("sk-plain");
    });
  });
  describe("desktop account", () => {
    it("prefers the env var over the stored setting", async () => {
      process.env.NODETOOL_1PASSWORD_ACCOUNT = " env.1password.com ";
      settingMock.find.mockResolvedValue({ value: "stored.1password.com" });
      expect(await onePasswordAccount("u1")).toBe("env.1password.com");
      expect(settingMock.find).not.toHaveBeenCalled();
    });

    it("reads the account the user connected in Settings", async () => {
      settingMock.find.mockResolvedValue({ value: "stored.1password.com" });
      expect(await onePasswordAccount("u1")).toBe("stored.1password.com");
      expect(settingMock.find).toHaveBeenCalledWith(
        "u1",
        "NODETOOL_1PASSWORD_ACCOUNT"
      );
    });

    it("ignores a stored account on a shared server", async () => {
      process.env.SUPABASE_URL = "https://x.supabase.co";
      process.env.SUPABASE_KEY = "anon";
      settingMock.find.mockResolvedValue({ value: "stored.1password.com" });
      expect(await onePasswordAccount("u1")).toBe("");
      expect(settingMock.find).not.toHaveBeenCalled();
    });

    it("treats a missing database as no account", async () => {
      settingMock.find.mockRejectedValue(new Error("no db"));
      expect(await onePasswordAccount("u1")).toBe("");
    });
  });

  describe("browsing", () => {
    it("needs a connected account", async () => {
      settingMock.find.mockResolvedValue(null);
      await expect(onePasswordBrowser("u1")).rejects.toThrow(
        /Connect a 1Password account first/
      );
    });

    it("refuses a Connect server", async () => {
      process.env.OP_CONNECT_HOST = "http://connect:8080";
      process.env.OP_CONNECT_TOKEN = "tok";
      await expect(onePasswordBrowser("u1")).rejects.toThrow(/Connect server/);
    });

    it("lists sorted items and fields as references without values", async () => {
      settingMock.find.mockResolvedValue({ value: "my.1password.com" });
      sdkMock.vaultsList.mockResolvedValue([{ id: "vlt1", title: "Dev" }]);
      sdkMock.itemsList.mockResolvedValue([
        { id: "itm2", title: "Zeta" },
        { id: "itm1", title: "Alpha" }
      ]);
      sdkMock.itemsGet.mockResolvedValue({
        id: "itm1",
        title: "Alpha",
        sections: [{ id: "s1", title: "API" }],
        fields: [
          {
            id: "credential",
            title: "credential",
            fieldType: "Concealed",
            value: "sk-secret"
          },
          {
            id: "f2",
            title: "key",
            sectionId: "s1",
            fieldType: "Concealed",
            value: "sk-other"
          }
        ]
      });
      const browser = await onePasswordBrowser("u1");
      expect(browser.backend).toBe("sdk-desktop");
      expect((await browser.listItems("vlt1")).map((i) => i.title)).toEqual([
        "Alpha",
        "Zeta"
      ]);
      const fields = await browser.listFields("vlt1", "itm1");
      expect(fields).toEqual([
        {
          id: "credential",
          title: "credential",
          section: null,
          fieldType: "Concealed",
          reference: "op://Dev/itm1/credential"
        },
        {
          id: "f2",
          title: "key",
          section: "API",
          fieldType: "Concealed",
          reference: "op://Dev/itm1/key"
        }
      ]);
      expect(JSON.stringify(fields)).not.toContain("sk-");
    });
  });

  describe("building references", () => {
    const base = {
      vault: { id: "vlt1", title: "Dev" },
      vaultTitles: ["Dev", "Private"],
      item: { id: "itm1", title: "OpenAI" },
      sectionTitle: null
    };

    it("uses names when they are unique and fit the syntax", () => {
      const field = { id: "f1", title: "credential" };
      expect(
        buildOnePasswordReference({ ...base, field, fields: [field] })
      ).toBe("op://Dev/itm1/credential");
    });

    it("falls back to the vault id when vault names clash or do not fit", () => {
      const field = { id: "f1", title: "credential" };
      expect(
        buildOnePasswordReference({
          ...base,
          vaultTitles: ["Dev", "dev"],
          field,
          fields: [field]
        })
      ).toBe("op://vlt1/itm1/credential");
      expect(
        buildOnePasswordReference({
          ...base,
          vault: { id: "vlt1", title: "A/B" },
          vaultTitles: ["A/B"],
          field,
          fields: [field]
        })
      ).toBe("op://vlt1/itm1/credential");
    });

    it("adds the section when a field title repeats across sections", () => {
      const a = { id: "f1", title: "key", sectionId: "s1" };
      const b = { id: "f2", title: "key", sectionId: "s2" };
      expect(
        buildOnePasswordReference({
          ...base,
          field: b,
          fields: [a, b],
          sectionTitle: "Prod"
        })
      ).toBe("op://Dev/itm1/Prod/key");
    });

    it("uses the field id when the title cannot identify it", () => {
      const a = { id: "f1", title: "key" };
      const b = { id: "f2", title: "key" };
      expect(buildOnePasswordReference({ ...base, field: b, fields: [a, b] })).toBe(
        "op://Dev/itm1/f2"
      );
      const slash = { id: "f3", title: "a/b" };
      expect(
        buildOnePasswordReference({ ...base, field: slash, fields: [slash] })
      ).toBe("op://Dev/itm1/f3");
    });
  });
});
