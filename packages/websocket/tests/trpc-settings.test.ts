import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type {
  SettingWithValue,
  SecretResponse
} from "@nodetool-ai/protocol/api-schemas/settings.js";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

// Mock @nodetool-ai/models for Setting/Secret and cache helpers.
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
    Secret: {
      find: vi.fn(),
      upsert: vi.fn(),
      listForUser: vi.fn(),
      deleteSecret: vi.fn()
    },
    clearSecretCache: vi.fn()
  };
});

// Mock @nodetool-ai/runtime for clearProviderCache.
vi.mock("@nodetool-ai/runtime", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/runtime")>();
  return {
    ...actual,
    clearProviderCache: vi.fn(),
    checkCredential: vi.fn(),
    readCredentialEnv: vi.fn(() => undefined)
  };
});

import { Setting, Secret, clearSecretCache } from "@nodetool-ai/models";
import {
  clearProviderCache,
  checkCredential,
  readCredentialEnv
} from "@nodetool-ai/runtime";

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

/**
 * Build a decrypted-secret stub with enough shape to satisfy `toSecretResponse`
 * (Promise<getDecryptedValue()>, sync toSafeObject()). `isUnreadable` controls
 * whether `getDecryptedValue` throws.
 */
function makeSecretStub(opts: {
  id: string;
  key: string;
  description?: string;
  isUnreadable?: boolean;
  decryptedValue?: string;
}): {
  id: string;
  user_id: string;
  key: string;
  description: string;
  toSafeObject: () => Record<string, unknown>;
  getDecryptedValue: () => Promise<string>;
} {
  // Mirror the real Secret model: `key` lives at the top level AND appears
  // in toSafeObject(). The router's secrets.list Map is keyed by top-level
  // `.key`, while toSecretResponse pulls the body from toSafeObject().
  return {
    id: opts.id,
    user_id: "user-1",
    key: opts.key,
    description: opts.description ?? "",
    toSafeObject: () => ({
      id: opts.id,
      user_id: "user-1",
      key: opts.key,
      description: opts.description ?? "",
      created_at: "2026-04-17T00:00:00Z",
      updated_at: "2026-04-17T00:00:00Z"
    }),
    getDecryptedValue: opts.isUnreadable
      ? vi.fn().mockRejectedValue(new Error("decrypt failed"))
      : vi.fn().mockResolvedValue(opts.decryptedValue ?? "plain-value")
  };
}

describe("settings router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── settings.list ────────────────────────────────────────────────
  describe("list", () => {
    it("returns an array of settings under `settings`", async () => {
      (Setting.listForUser as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (Secret.listForUser as ReturnType<typeof vi.fn>).mockResolvedValue([
        []
      ]);

      const caller = createCaller(makeCtx());
      const result = await caller.settings.list();
      expect(Array.isArray(result.settings)).toBe(true);
      // The registry is populated at module load time — there should be many
      // settings; we don't know the exact count but it must be > 0.
      expect(result.settings.length).toBeGreaterThan(0);
      const settings = result.settings as SettingWithValue[];
      // Each element must satisfy SettingWithValue shape.
      for (const s of settings) {
        expect(typeof s.env_var).toBe("string");
        expect(typeof s.group).toBe("string");
        expect(typeof s.is_secret).toBe("boolean");
      }
    });

    it("rejects unauthenticated callers", async () => {
      const caller = createCaller(makeCtx({ userId: null }));
      await expect(caller.settings.list()).rejects.toMatchObject({
        code: "UNAUTHORIZED"
      });
    });
  });

  // ── settings.update ──────────────────────────────────────────────
  describe("update", () => {
    it("upserts non-secret settings to Setting model", async () => {
      (Setting.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const caller = createCaller(makeCtx());
      await caller.settings.update({
        settings: { VLLM_BASE_URL: "http://localhost:8000", FONT_PATH: "/fonts" }
      });
      expect(Setting.upsert).toHaveBeenCalledTimes(2);
      expect(Setting.upsert).toHaveBeenCalledWith({
        userId: "user-1",
        key: "VLLM_BASE_URL",
        value: "http://localhost:8000"
      });
      expect(Setting.upsert).toHaveBeenCalledWith({
        userId: "user-1",
        key: "FONT_PATH",
        value: "/fonts"
      });
    });

    it("upserts secrets and clears caches when secrets change", async () => {
      (Secret.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const caller = createCaller(makeCtx());
      const res = await caller.settings.update({
        secrets: { OPENAI_API_KEY: "sk-123" }
      });
      expect(Secret.upsert).toHaveBeenCalledWith({
        userId: "user-1",
        key: "OPENAI_API_KEY",
        value: "sk-123",
        description: "Secret for OPENAI_API_KEY"
      });
      expect(clearSecretCache).toHaveBeenCalledWith("user-1", "OPENAI_API_KEY");
      expect(clearProviderCache).toHaveBeenCalledTimes(1);
      expect(res.message).toMatch(/updated/i);
    });

    it("skips '****' placeholder secret values", async () => {
      (Secret.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const caller = createCaller(makeCtx());
      await caller.settings.update({
        secrets: { OPENAI_API_KEY: "****", ANTHROPIC_API_KEY: "real-key" }
      });
      expect(Secret.upsert).toHaveBeenCalledTimes(1);
      expect(Secret.upsert).toHaveBeenCalledWith({
        userId: "user-1",
        key: "ANTHROPIC_API_KEY",
        value: "real-key",
        description: "Secret for ANTHROPIC_API_KEY"
      });
    });

    it("does not call clearProviderCache when only plain settings change", async () => {
      (Setting.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const caller = createCaller(makeCtx());
      await caller.settings.update({
        settings: { VLLM_BASE_URL: "http://localhost:8000" }
      });
      expect(clearProviderCache).not.toHaveBeenCalled();
    });

    it("rejects unauthenticated callers", async () => {
      const caller = createCaller(makeCtx({ userId: null }));
      await expect(
        caller.settings.update({ settings: { FOO: "bar" } })
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });
  });

  // ── settings.secrets.list ────────────────────────────────────────
  describe("secrets.list", () => {
    it("returns registry + configured secrets merged", async () => {
      // One configured secret for a registry key, returned by listForUser.
      const configured = makeSecretStub({
        id: "s1",
        key: "OPENAI_API_KEY",
        description: "OpenAI API key for accessing GPT models, GPT-Image, and other OpenAI services"
      });
      (Secret.listForUser as ReturnType<typeof vi.fn>).mockResolvedValue([
        [configured],
        ""
      ]);

      const caller = createCaller(makeCtx());
      const result = await caller.settings.secrets.list();
      expect(result.secrets.length).toBeGreaterThan(0);
      const secrets = result.secrets as SecretResponse[];

      // OPENAI_API_KEY should be marked configured.
      const openai = secrets.find((s) => s.key === "OPENAI_API_KEY");
      expect(openai).toBeDefined();
      expect(openai?.is_configured).toBe(true);

      // Some other registry secret should be present but unconfigured.
      const unconfigured = secrets.find(
        (s) => s.key === "ANTHROPIC_API_KEY" && s.is_configured === false
      );
      expect(unconfigured).toBeDefined();

      expect(result.next_key).toBeNull();
    });

    it("includes DB-only secrets not in the registry", async () => {
      const customSecret = makeSecretStub({
        id: "s2",
        key: "CUSTOM_NON_REGISTRY_KEY"
      });
      (Secret.listForUser as ReturnType<typeof vi.fn>).mockResolvedValue([
        [customSecret],
        ""
      ]);

      const caller = createCaller(makeCtx());
      const result = await caller.settings.secrets.list();
      const custom = (result.secrets as SecretResponse[]).find(
        (s) => s.key === "CUSTOM_NON_REGISTRY_KEY"
      );
      expect(custom).toBeDefined();
      expect(custom?.is_configured).toBe(true);
    });

    it("rejects unauthenticated callers", async () => {
      const caller = createCaller(makeCtx({ userId: null }));
      await expect(caller.settings.secrets.list()).rejects.toMatchObject({
        code: "UNAUTHORIZED"
      });
    });
  });

  // ── settings.secrets.get ─────────────────────────────────────────
  describe("secrets.get", () => {
    it("returns the safe object without value when decrypt=false", async () => {
      const stub = makeSecretStub({ id: "s1", key: "OPENAI_API_KEY" });
      (Secret.find as ReturnType<typeof vi.fn>).mockResolvedValue(stub);

      const caller = createCaller(makeCtx());
      const result = await caller.settings.secrets.get({
        key: "OPENAI_API_KEY"
      });
      expect(result.key).toBe("OPENAI_API_KEY");
      expect(result.is_configured).toBe(true);
      expect(result.value).toBeUndefined();
      expect(result.is_unreadable).toBe(false);
    });

    it("returns decrypted value when decrypt=true", async () => {
      const stub = makeSecretStub({
        id: "s1",
        key: "OPENAI_API_KEY",
        decryptedValue: "sk-plaintext-12345"
      });
      (Secret.find as ReturnType<typeof vi.fn>).mockResolvedValue(stub);

      const caller = createCaller(makeCtx());
      const result = await caller.settings.secrets.get({
        key: "OPENAI_API_KEY",
        decrypt: true
      });
      expect(result.value).toBe("sk-plaintext-12345");
      expect(result.is_unreadable).toBe(false);
    });

    it("throws NOT_FOUND when secret is missing", async () => {
      (Secret.find as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const caller = createCaller(makeCtx());
      await expect(
        caller.settings.secrets.get({ key: "MISSING_KEY" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("rejects unauthenticated callers", async () => {
      const caller = createCaller(makeCtx({ userId: null }));
      await expect(
        caller.settings.secrets.get({ key: "X" })
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });
  });

  // ── settings.secrets.upsert ──────────────────────────────────────
  describe("secrets.upsert", () => {
    it("upserts a secret and clears caches", async () => {
      const stub = makeSecretStub({
        id: "s1",
        key: "OPENAI_API_KEY",
        description: "my key"
      });
      (Secret.upsert as ReturnType<typeof vi.fn>).mockResolvedValue(stub);

      const caller = createCaller(makeCtx());
      const result = await caller.settings.secrets.upsert({
        key: "OPENAI_API_KEY",
        value: "sk-123",
        description: "my key"
      });
      expect(Secret.upsert).toHaveBeenCalledWith({
        userId: "user-1",
        key: "OPENAI_API_KEY",
        value: "sk-123",
        description: "my key"
      });
      expect(clearSecretCache).toHaveBeenCalledWith("user-1", "OPENAI_API_KEY");
      expect(clearProviderCache).toHaveBeenCalledTimes(1);
      expect(result.key).toBe("OPENAI_API_KEY");
      expect(result.is_configured).toBe(true);
    });

    it("rejects unauthenticated callers", async () => {
      const caller = createCaller(makeCtx({ userId: null }));
      await expect(
        caller.settings.secrets.upsert({ key: "X", value: "y" })
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });
  });

  // ── settings.secrets.delete ──────────────────────────────────────
  describe("secrets.delete", () => {
    it("deletes a secret and clears caches", async () => {
      (Secret.deleteSecret as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      const caller = createCaller(makeCtx());
      const res = await caller.settings.secrets.delete({ key: "OPENAI_API_KEY" });
      expect(Secret.deleteSecret).toHaveBeenCalledWith(
        "user-1",
        "OPENAI_API_KEY"
      );
      expect(clearSecretCache).toHaveBeenCalledWith("user-1", "OPENAI_API_KEY");
      expect(clearProviderCache).toHaveBeenCalledTimes(1);
      expect(res.message).toMatch(/deleted/i);
    });

    it("throws NOT_FOUND when secret did not exist", async () => {
      (Secret.deleteSecret as ReturnType<typeof vi.fn>).mockResolvedValue(
        false
      );

      const caller = createCaller(makeCtx());
      await expect(
        caller.settings.secrets.delete({ key: "MISSING" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("rejects unauthenticated callers", async () => {
      const caller = createCaller(makeCtx({ userId: null }));
      await expect(
        caller.settings.secrets.delete({ key: "X" })
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });
  });

  // ── settings.secrets.validate ────────────────────────────────────
  describe("secrets.validate", () => {
    const mockCheck = () => checkCredential as ReturnType<typeof vi.fn>;

    it("probes the candidate value without reading the stored secret", async () => {
      mockCheck().mockResolvedValue({
        status: "valid",
        message: "OpenAI accepted the key."
      });

      const caller = createCaller(makeCtx());
      const res = await caller.settings.secrets.validate({
        key: "OPENAI_API_KEY",
        value: "  sk-candidate  "
      });

      expect(checkCredential).toHaveBeenCalledWith(
        "OPENAI_API_KEY",
        "sk-candidate"
      );
      expect(Secret.find).not.toHaveBeenCalled();
      expect(res).toEqual({
        status: "valid",
        valid: true,
        message: "OpenAI accepted the key."
      });
    });

    it("falls back to the stored secret when no value is given", async () => {
      (Secret.find as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeSecretStub({
          id: "s1",
          key: "GROQ_API_KEY",
          decryptedValue: "stored-key"
        })
      );
      mockCheck().mockResolvedValue({
        status: "invalid",
        message: "Groq rejected the key (401)."
      });

      const caller = createCaller(makeCtx());
      const res = await caller.settings.secrets.validate({
        key: "GROQ_API_KEY"
      });

      expect(checkCredential).toHaveBeenCalledWith("GROQ_API_KEY", "stored-key");
      expect(res.status).toBe("invalid");
      expect(res.valid).toBe(false);
    });

    it("reports a provider with no probe as unverifiable, not valid", async () => {
      mockCheck().mockResolvedValue({
        status: "unverifiable",
        message: "NodeTool has no quick check for FAL_API_KEY."
      });

      const caller = createCaller(makeCtx());
      const res = await caller.settings.secrets.validate({
        key: "FAL_API_KEY",
        value: "fal-key"
      });

      expect(res.status).toBe("unverifiable");
      expect(res.valid).toBe(false);
    });

    it("reports an undecryptable stored secret as invalid", async () => {
      (Secret.find as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeSecretStub({
          id: "s1",
          key: "OPENAI_API_KEY",
          isUnreadable: true
        })
      );

      const caller = createCaller(makeCtx());
      const res = await caller.settings.secrets.validate({
        key: "OPENAI_API_KEY"
      });

      expect(res.status).toBe("invalid");
      expect(res.message).toMatch(/decrypt/i);
      expect(checkCredential).not.toHaveBeenCalled();
    });

    it("reports a key that is stored nowhere as invalid", async () => {
      (Secret.find as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (readCredentialEnv as ReturnType<typeof vi.fn>).mockReturnValue(
        undefined
      );

      const caller = createCaller(makeCtx());
      const res = await caller.settings.secrets.validate({
        key: "MISTRAL_API_KEY"
      });

      expect(res.status).toBe("invalid");
      expect(res.message).toMatch(/No key is stored/i);
      expect(checkCredential).not.toHaveBeenCalled();
    });

    it("falls back to the process env when nothing is stored", async () => {
      (Secret.find as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (readCredentialEnv as ReturnType<typeof vi.fn>).mockReturnValue(
        "env-key"
      );
      mockCheck().mockResolvedValue({
        status: "valid",
        message: "Mistral accepted the key."
      });

      const caller = createCaller(makeCtx());
      const res = await caller.settings.secrets.validate({
        key: "MISTRAL_API_KEY"
      });

      expect(checkCredential).toHaveBeenCalledWith(
        "MISTRAL_API_KEY",
        "env-key"
      );
      expect(res.valid).toBe(true);
    });

    it("rejects unauthenticated callers", async () => {
      const caller = createCaller(makeCtx({ userId: null }));
      await expect(
        caller.settings.secrets.validate({ key: "OPENAI_API_KEY" })
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });
  });
});
