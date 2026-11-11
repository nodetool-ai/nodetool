import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setMasterKey } from "@nodetool-ai/security";
import { initTestDb, getRawDb } from "../src/db.js";
import { Secret } from "../src/secret.js";
import { Setting } from "../src/setting.js";
import { clearAllSecretCache, getSecret, getSecrets } from "../src/secret-helper.js";
import { resolveCodexAccessToken } from "../src/codex-token.js";
import { GOOGLE_ACCESS_TOKEN_KEY, resolveGoogleAccessToken } from "../src/google-token.js";

vi.mock("../src/codex-token.js", () => ({ resolveCodexAccessToken: vi.fn() }));
vi.mock("../src/google-token.js", () => ({
  GOOGLE_ACCESS_TOKEN_KEY: "GOOGLE_ACCESS_TOKEN",
  resolveGoogleAccessToken: vi.fn()
}));

describe("batched secret resolution", () => {
  beforeEach(() => {
    initTestDb();
    setMasterKey("dGVzdC1tYXN0ZXIta2V5LWZvci11bml0LXRlc3Rz");
    clearAllSecretCache();
    vi.mocked(resolveCodexAccessToken).mockReset();
    vi.mocked(resolveGoogleAccessToken).mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    clearAllSecretCache();
  });

  it("batch-loads once, limits secret keys, and isolates callers", async () => {
    await Secret.upsert({ userId: "alice", key: "BATCH_A", value: "alice-value" });
    await Secret.upsert({ userId: "alice", key: "BATCH_PRIVATE", value: "unrequested" });
    await Secret.upsert({ userId: "bob", key: "BATCH_A", value: "bob-value" });
    await Setting.upsert({ userId: "alice", key: "BATCH_URL", value: "http://alice" });
    const batch = vi.spyOn(Secret, "findByKeys");
    const settings = vi.spyOn(Setting, "listForUser");
    const findSecret = vi.spyOn(Secret, "find");
    const findSetting = vi.spyOn(Setting, "find");
    const values = await getSecrets(["BATCH_A", "BATCH_URL", "BATCH_A"], "alice");
    expect(values).toEqual(new Map([["BATCH_A", "alice-value"], ["BATCH_URL", "http://alice"]]));
    expect(batch).toHaveBeenCalledExactlyOnceWith("alice", ["BATCH_A", "BATCH_URL"]);
    expect(settings).toHaveBeenCalledExactlyOnceWith("alice");
    expect(findSecret).not.toHaveBeenCalled();
    expect(findSetting).not.toHaveBeenCalled();
    expect(await Secret.findByKeys("alice", ["BATCH_A"])).toMatchObject([{ user_id: "alice", key: "BATCH_A" }]);
    clearAllSecretCache();
    const [alice, bob] = await Promise.all([
      getSecrets(["BATCH_A"], "alice"), getSecrets(["BATCH_A"], "bob")
    ]);
    expect(alice).toEqual(new Map([["BATCH_A", "alice-value"]]));
    expect(bob).toEqual(new Map([["BATCH_A", "bob-value"]]));
  });

  it("does not query for an empty key set", async () => {
    const prepare = vi.spyOn(getRawDb(), "prepare");
    expect(await Secret.findByKeys("alice", [])).toEqual([]);
    expect(await getSecrets([], "alice")).toEqual(new Map());
    expect(prepare).not.toHaveBeenCalled();
  });

  it("preserves secret, setting, environment, forced environment and cache precedence", async () => {
    vi.stubEnv("BATCH_VALUE", "env-value");
    vi.stubEnv("SUPABASE_URL", "https://forced-env");
    await Setting.upsert({ userId: "alice", key: "BATCH_VALUE", value: "setting-value" });
    await Secret.upsert({ userId: "alice", key: "BATCH_VALUE", value: "secret-value" });
    await Secret.upsert({ userId: "alice", key: "SUPABASE_URL", value: "https://stored" });
    expect(await getSecrets(["BATCH_VALUE", "SUPABASE_URL"], "alice")).toEqual(new Map([
      ["BATCH_VALUE", "secret-value"], ["SUPABASE_URL", "https://forced-env"]
    ]));
    await Secret.deleteSecret("alice", "BATCH_VALUE");
    expect((await getSecrets(["BATCH_VALUE"], "alice")).get("BATCH_VALUE")).toBe("secret-value");
    clearAllSecretCache();
    expect((await getSecrets(["BATCH_VALUE"], "alice")).get("BATCH_VALUE")).toBe(await getSecret("BATCH_VALUE", "alice"));
    expect(await getSecret("BATCH_VALUE", "alice")).toBe("setting-value");
  });

  it("falls back after decryption failure and preserves an empty decrypted secret", async () => {
    vi.stubEnv("BATCH_BROKEN", "env-fallback");
    vi.stubEnv("BATCH_EMPTY", "env-does-not-replace-empty");
    const broken = await Secret.upsert({ userId: "alice", key: "BATCH_BROKEN", value: "fake" });
    broken.encrypted_value = "invalid-encrypted-fixture";
    await broken.save();
    await Setting.upsert({ userId: "alice", key: "BATCH_BROKEN", value: "setting-fallback" });
    await Secret.upsert({ userId: "alice", key: "BATCH_EMPTY", value: "" });
    expect(await getSecrets(["BATCH_BROKEN", "BATCH_EMPTY"], "alice")).toEqual(new Map([
      ["BATCH_BROKEN", "setting-fallback"], ["BATCH_EMPTY", ""]
    ]));
  });

  it("keeps OAuth resolution caller-scoped, uncached and independent of stored rows", async () => {
    vi.mocked(resolveCodexAccessToken).mockResolvedValue("fake-codex-oauth");
    vi.mocked(resolveGoogleAccessToken).mockResolvedValue("fake-google-oauth");
    await Secret.upsert({ userId: "alice", key: "CODEX_ACCESS_TOKEN", value: "wrong-stored-token" });
    for (let attempt = 0; attempt < 2; ++attempt) {
      expect(await getSecrets(["CODEX_ACCESS_TOKEN", GOOGLE_ACCESS_TOKEN_KEY], "alice")).toEqual(new Map([
        ["CODEX_ACCESS_TOKEN", "fake-codex-oauth"], [GOOGLE_ACCESS_TOKEN_KEY, "fake-google-oauth"]
      ]));
    }
    expect(resolveCodexAccessToken).toHaveBeenCalledTimes(2);
    expect(resolveCodexAccessToken).toHaveBeenCalledWith("alice");
    expect(resolveGoogleAccessToken).toHaveBeenCalledTimes(2);
    expect(resolveGoogleAccessToken).toHaveBeenCalledWith("alice");
    vi.mocked(resolveCodexAccessToken).mockRejectedValue(new Error("fake refresh failure"));
    expect((await getSecrets(["CODEX_ACCESS_TOKEN"], "alice")).get("CODEX_ACCESS_TOKEN")).toBeNull();
  });

  it("keeps setting and environment fallback when the secret batch read fails", async () => {
    vi.stubEnv("BATCH_ENV_ONLY", "env-value");
    await Setting.upsert({ userId: "alice", key: "BATCH_SETTING", value: "setting-value" });
    vi.spyOn(Secret, "findByKeys").mockRejectedValue(new Error("fake database failure"));
    expect(await getSecrets(["BATCH_SETTING", "BATCH_ENV_ONLY"], "alice")).toEqual(new Map([
      ["BATCH_SETTING", "setting-value"], ["BATCH_ENV_ONLY", "env-value"]
    ]));
  });
});
