import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ModelObserver } from "../src/base-model.js";
import { initTestDb } from "../src/db.js";
import { OAuthCredential } from "../src/oauth-credential.js";
import { encryptFernet, setMasterKey } from "@nodetool-ai/security";

const TEST_MASTER_KEY = "dGVzdC1tYXN0ZXIta2V5LWZvci11bml0LXRlc3Rz"; // base64

function setup() {
  initTestDb();
  setMasterKey(TEST_MASTER_KEY);
}

describe("OAuthCredential model", () => {
  beforeEach(setup);
  afterEach(() => ModelObserver.clear());

  it("creates with defaults", async () => {
    const cred = await OAuthCredential.create<OAuthCredential>({
      user_id: "u1",
      provider: "google",
      account_id: "acc1",
      encrypted_access_token: "tok123",
      token_type: "Bearer",
      received_at: new Date().toISOString()
    });
    expect(cred.id).toBeTruthy();
    expect(cred.user_id).toBe("u1");
    expect(cred.provider).toBe("google");
    expect(cred.account_id).toBe("acc1");
    expect(cred.encrypted_access_token).toBe("tok123");
    expect(cred.token_type).toBe("Bearer");
    expect(cred.encrypted_refresh_token).toBeNull();
    expect(cred.username).toBeNull();
    expect(cred.scope).toBeNull();
    expect(cred.expires_at).toBeNull();
    expect(cred.created_at).toBeTruthy();
    expect(cred.updated_at).toBeTruthy();
  });

  it("constructor applies defaults for optional fields", () => {
    const cred = new OAuthCredential({
      user_id: "u1",
      provider: "github",
      account_id: "acc2",
      encrypted_access_token: "tok456"
    });
    expect(cred.id).toBeTruthy();
    expect(cred.token_type).toBe("Bearer");
    expect(cred.encrypted_refresh_token).toBeNull();
    expect(cred.username).toBeNull();
    expect(cred.scope).toBeNull();
    expect(cred.expires_at).toBeNull();
    expect(cred.received_at).toBeTruthy();
    expect(cred.created_at).toBeTruthy();
    expect(cred.updated_at).toBeTruthy();
  });

  it("beforeSave updates updated_at", async () => {
    const cred = await OAuthCredential.create<OAuthCredential>({
      user_id: "u1",
      provider: "google",
      account_id: "acc1",
      encrypted_access_token: "tok123",
      token_type: "Bearer",
      received_at: new Date().toISOString()
    });
    const originalUpdatedAt = cred.updated_at;
    // Wait a tick so timestamp changes
    await new Promise((r) => setTimeout(r, 5));
    cred.encrypted_access_token = "new-token";
    await cred.save();
    expect(cred.updated_at).not.toBe(originalUpdatedAt);
  });

  it("findByAccount returns matching credential", async () => {
    await OAuthCredential.create<OAuthCredential>({
      user_id: "u1",
      provider: "google",
      account_id: "acc1",
      encrypted_access_token: "tok-a",
      token_type: "Bearer",
      received_at: new Date().toISOString()
    });

    const found = await OAuthCredential.findByAccount("u1", "google", "acc1");
    expect(found).not.toBeNull();
    expect(found!.encrypted_access_token).toBe("tok-a");
  });

  it("findByAccount returns null when not found", async () => {
    const found = await OAuthCredential.findByAccount(
      "u1",
      "google",
      "nonexistent"
    );
    expect(found).toBeNull();
  });

  it("findByAccount scoped to user/provider/account", async () => {
    await OAuthCredential.create<OAuthCredential>({
      user_id: "u1",
      provider: "google",
      account_id: "acc1",
      encrypted_access_token: "tok-u1",
      token_type: "Bearer",
      received_at: new Date().toISOString()
    });

    // Different user
    const r1 = await OAuthCredential.findByAccount("u2", "google", "acc1");
    expect(r1).toBeNull();

    // Different provider
    const r2 = await OAuthCredential.findByAccount("u1", "github", "acc1");
    expect(r2).toBeNull();

    // Different account
    const r3 = await OAuthCredential.findByAccount("u1", "google", "acc2");
    expect(r3).toBeNull();
  });

  it("listForUserAndProvider returns all matching credentials", async () => {
    await OAuthCredential.create<OAuthCredential>({
      user_id: "u1",
      provider: "google",
      account_id: "acc1",
      encrypted_access_token: "tok1",
      token_type: "Bearer",
      received_at: new Date().toISOString()
    });
    await OAuthCredential.create<OAuthCredential>({
      user_id: "u1",
      provider: "google",
      account_id: "acc2",
      encrypted_access_token: "tok2",
      token_type: "Bearer",
      received_at: new Date().toISOString()
    });
    await OAuthCredential.create<OAuthCredential>({
      user_id: "u1",
      provider: "github",
      account_id: "acc3",
      encrypted_access_token: "tok3",
      token_type: "Bearer",
      received_at: new Date().toISOString()
    });
    await OAuthCredential.create<OAuthCredential>({
      user_id: "u2",
      provider: "google",
      account_id: "acc4",
      encrypted_access_token: "tok4",
      token_type: "Bearer",
      received_at: new Date().toISOString()
    });

    const results = await OAuthCredential.listForUserAndProvider(
      "u1",
      "google"
    );
    expect(results).toHaveLength(2);
    const accounts = results.map((r) => r.account_id).sort();
    expect(accounts).toEqual(["acc1", "acc2"]);
  });

  it("listForUserAndProvider returns empty array when no matches", async () => {
    const results = await OAuthCredential.listForUserAndProvider(
      "u1",
      "google"
    );
    expect(results).toEqual([]);
  });

  it("upsert creates a new credential", async () => {
    const cred = await OAuthCredential.upsert({
      user_id: "u1",
      provider: "google",
      account_id: "acc1",
      access_token: "tok-new",
      token_type: "Bearer",
      received_at: new Date().toISOString()
    });

    expect(cred.id).toBeTruthy();
    expect(await cred.getDecryptedAccessToken()).toBe("tok-new");
  });

  it("upsert updates an existing credential", async () => {
    const created = await OAuthCredential.upsert({
      user_id: "u1",
      provider: "google",
      account_id: "acc1",
      access_token: "tok-original",
      token_type: "Bearer",
      received_at: "2024-01-01T00:00:00.000Z"
    });
    const createdId = created.id;

    const updated = await OAuthCredential.upsert({
      user_id: "u1",
      provider: "google",
      account_id: "acc1",
      access_token: "tok-updated",
      token_type: "Bearer",
      received_at: "2024-06-01T00:00:00.000Z",
      refresh_token: "refresh-new",
      username: "user@example.com",
      scope: "read write",
      expires_at: "2025-01-01T00:00:00.000Z"
    });

    expect(updated.id).toBe(createdId);
    expect(await updated.getDecryptedAccessToken()).toBe("tok-updated");
    expect(await updated.getDecryptedRefreshToken()).toBe("refresh-new");
    expect(updated.username).toBe("user@example.com");
    expect(updated.scope).toBe("read write");
    expect(updated.received_at).toBe("2024-06-01T00:00:00.000Z");
    expect(updated.expires_at).toBe("2025-01-01T00:00:00.000Z");
  });

  it("decrypts Fernet-encrypted tokens for backward compatibility", async () => {
    const accessToken = encryptFernet(TEST_MASTER_KEY, "u1", "legacy-access");
    const refreshToken = encryptFernet(TEST_MASTER_KEY, "u1", "legacy-refresh");

    const cred = await OAuthCredential.create<OAuthCredential>({
      user_id: "u1",
      provider: "google",
      account_id: "acc-legacy",
      encrypted_access_token: accessToken,
      encrypted_refresh_token: refreshToken,
      token_type: "Bearer",
      received_at: new Date().toISOString()
    });

    await expect(cred.getDecryptedAccessToken()).resolves.toBe("legacy-access");
    await expect(cred.getDecryptedRefreshToken()).resolves.toBe(
      "legacy-refresh"
    );
  });

  it("upsert preserves existing optional fields if not provided in update", async () => {
    await OAuthCredential.upsert({
      user_id: "u1",
      provider: "google",
      account_id: "acc1",
      access_token: "tok-original",
      token_type: "Bearer",
      received_at: "2024-01-01T00:00:00.000Z",
      refresh_token: "existing-refresh",
      username: "existing-user",
      scope: "existing-scope",
      expires_at: "2025-12-31T00:00:00.000Z"
    });

    const updated = await OAuthCredential.upsert({
      user_id: "u1",
      provider: "google",
      account_id: "acc1",
      access_token: "tok-updated",
      token_type: "Bearer",
      received_at: "2024-06-01T00:00:00.000Z"
      // not providing refresh_token, username, scope, expires_at
    });

    expect(await updated.getDecryptedRefreshToken()).toBe("existing-refresh");
    expect(updated.username).toBe("existing-user");
    expect(updated.scope).toBe("existing-scope");
    expect(updated.expires_at).toBe("2025-12-31T00:00:00.000Z");
  });

  it("delete removes a credential", async () => {
    const cred = await OAuthCredential.create<OAuthCredential>({
      user_id: "u1",
      provider: "google",
      account_id: "acc1",
      encrypted_access_token: "tok1",
      token_type: "Bearer",
      received_at: new Date().toISOString()
    });

    await cred.delete();

    const found = await OAuthCredential.findByAccount("u1", "google", "acc1");
    expect(found).toBeNull();
  });

  it("get retrieves by primary key", async () => {
    const cred = await OAuthCredential.create<OAuthCredential>({
      user_id: "u1",
      provider: "google",
      account_id: "acc1",
      encrypted_access_token: "tok1",
      token_type: "Bearer",
      received_at: new Date().toISOString()
    });

    const found = await OAuthCredential.get<OAuthCredential>(cred.id);
    expect(found).not.toBeNull();
    expect(found!.provider).toBe("google");
  });
});

describe("OAuthCredential encryption", () => {
  beforeEach(setup);
  afterEach(() => ModelObserver.clear());

  it("createEncrypted stores encrypted tokens", async () => {
    const cred = await OAuthCredential.createEncrypted({
      user_id: "u1",
      provider: "google",
      account_id: "acc1",
      access_token: "my-access-token",
      refresh_token: "my-refresh-token"
    });

    expect(cred.id).toBeTruthy();
    expect(cred.encrypted_access_token).not.toBe("my-access-token");
    expect(cred.encrypted_refresh_token).not.toBe("my-refresh-token");
    expect(cred.encrypted_access_token).toBeTruthy();
    expect(cred.encrypted_refresh_token).toBeTruthy();
  });

  it("createEncrypted without refresh_token stores null", async () => {
    const cred = await OAuthCredential.createEncrypted({
      user_id: "u1",
      provider: "google",
      account_id: "acc1",
      access_token: "my-access-token"
    });

    expect(cred.encrypted_refresh_token).toBeNull();
  });

  it("getDecryptedAccessToken decrypts correctly", async () => {
    const cred = await OAuthCredential.createEncrypted({
      user_id: "u1",
      provider: "google",
      account_id: "acc1",
      access_token: "secret-access-token-123"
    });

    const decrypted = await cred.getDecryptedAccessToken();
    expect(decrypted).toBe("secret-access-token-123");
  });

  it("getDecryptedRefreshToken decrypts correctly", async () => {
    const cred = await OAuthCredential.createEncrypted({
      user_id: "u1",
      provider: "google",
      account_id: "acc1",
      access_token: "access-tok",
      refresh_token: "secret-refresh-token-456"
    });

    const decrypted = await cred.getDecryptedRefreshToken();
    expect(decrypted).toBe("secret-refresh-token-456");
  });

  it("getDecryptedRefreshToken returns null when not set", async () => {
    const cred = await OAuthCredential.createEncrypted({
      user_id: "u1",
      provider: "google",
      account_id: "acc1",
      access_token: "access-tok"
    });

    const decrypted = await cred.getDecryptedRefreshToken();
    expect(decrypted).toBeNull();
  });

  it("updateTokens re-encrypts tokens", async () => {
    const cred = await OAuthCredential.createEncrypted({
      user_id: "u1",
      provider: "google",
      account_id: "acc1",
      access_token: "old-access-token",
      refresh_token: "old-refresh-token"
    });

    const oldEncryptedAccess = cred.encrypted_access_token;

    await cred.updateTokens({
      accessToken: "new-access-token",
      refreshToken: "new-refresh-token",
      expiresAt: "2025-12-31T00:00:00.000Z"
    });

    // Encrypted value should have changed
    expect(cred.encrypted_access_token).not.toBe(oldEncryptedAccess);

    // Decrypt to verify
    const decryptedAccess = await cred.getDecryptedAccessToken();
    expect(decryptedAccess).toBe("new-access-token");

    const decryptedRefresh = await cred.getDecryptedRefreshToken();
    expect(decryptedRefresh).toBe("new-refresh-token");

    expect(cred.expires_at).toBe("2025-12-31T00:00:00.000Z");
  });

  it("updateTokens updates optional fields", async () => {
    const cred = await OAuthCredential.createEncrypted({
      user_id: "u1",
      provider: "google",
      account_id: "acc1",
      access_token: "tok",
      token_type: "Bearer",
      scope: "read"
    });

    await cred.updateTokens({
      accessToken: "new-tok",
      tokenType: "MAC",
      scope: "read write"
    });

    expect(cred.token_type).toBe("MAC");
    expect(cred.scope).toBe("read write");
  });

  it("toSafeObject excludes encrypted tokens", async () => {
    const cred = await OAuthCredential.createEncrypted({
      user_id: "u1",
      provider: "google",
      account_id: "acc1",
      access_token: "secret-tok",
      refresh_token: "secret-refresh",
      username: "testuser",
      scope: "openid"
    });

    const safe = cred.toSafeObject();
    expect(safe.provider).toBe("google");
    expect(safe.account_id).toBe("acc1");
    expect(safe.username).toBe("testuser");
    expect(safe.scope).toBe("openid");
    expect(safe).not.toHaveProperty("access_token");
    expect(safe).not.toHaveProperty("refresh_token");
    expect(safe).not.toHaveProperty("encrypted_access_token");
    expect(safe).not.toHaveProperty("encrypted_refresh_token");
  });

  it("isolates encrypted tokens between users", async () => {
    const cred1 = await OAuthCredential.createEncrypted({
      user_id: "u1",
      provider: "google",
      account_id: "acc1",
      access_token: "user1-token"
    });

    const cred2 = await OAuthCredential.createEncrypted({
      user_id: "u2",
      provider: "google",
      account_id: "acc2",
      access_token: "user2-token"
    });

    // Different users should produce different ciphertexts even for same-length tokens
    expect(cred1.encrypted_access_token).not.toBe(cred2.encrypted_access_token);

    const d1 = await cred1.getDecryptedAccessToken();
    const d2 = await cred2.getDecryptedAccessToken();
    expect(d1).toBe("user1-token");
    expect(d2).toBe("user2-token");
  });
});
