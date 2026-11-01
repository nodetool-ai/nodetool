import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const execFileMock = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({ execFile: execFileMock }));

import {
  clearOnePasswordCache,
  isOnePasswordReference,
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
});
