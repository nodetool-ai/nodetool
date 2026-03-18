import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { setGlobalAdapterResolver, ModelObserver } from "../src/base-model.js";
import { MemoryAdapterFactory } from "../src/memory-adapter.js";
import { Secret } from "../src/secret.js";
import type { ModelClass } from "../src/base-model.js";
import { setMasterKey } from "@nodetool/security";

const factory = new MemoryAdapterFactory();
const TEST_MASTER_KEY = "dGVzdC1tYXN0ZXIta2V5LWZvci11bml0LXRlc3Rz"; // base64

async function setup() {
  factory.clear();
  setGlobalAdapterResolver((schema) => factory.getAdapter(schema));
  setMasterKey(TEST_MASTER_KEY);
  await (Secret as unknown as ModelClass).createTable();
}

describe("Secret model", () => {
  beforeEach(setup);
  afterEach(() => ModelObserver.clear());

  it("creates a secret via upsert", async () => {
    const secret = await Secret.upsert({
      userId: "user-1",
      key: "OPENAI_API_KEY",
      value: "sk-test-123",
      description: "Test key",
    });

    expect(secret.id).toBeTruthy();
    expect(secret.user_id).toBe("user-1");
    expect(secret.key).toBe("OPENAI_API_KEY");
    expect(secret.description).toBe("Test key");
    expect(secret.encrypted_value).toBeTruthy();
    // encrypted_value should not be the plaintext
    expect(secret.encrypted_value).not.toBe("sk-test-123");
    expect(secret.created_at).toBeTruthy();
    expect(secret.updated_at).toBeTruthy();
  });

  it("finds a secret by userId and key", async () => {
    await Secret.upsert({
      userId: "user-1",
      key: "MY_SECRET",
      value: "secret-value",
    });

    const found = await Secret.find("user-1", "MY_SECRET");
    expect(found).not.toBeNull();
    expect(found!.key).toBe("MY_SECRET");
    expect(found!.user_id).toBe("user-1");
  });

  it("returns null when secret not found", async () => {
    const found = await Secret.find("user-1", "NONEXISTENT");
    expect(found).toBeNull();
  });

  it("upsert updates an existing secret", async () => {
    const created = await Secret.upsert({
      userId: "user-1",
      key: "API_KEY",
      value: "original-value",
      description: "Original",
    });
    const createdId = created.id;

    const updated = await Secret.upsert({
      userId: "user-1",
      key: "API_KEY",
      value: "updated-value",
      description: "Updated",
    });

    expect(updated.id).toBe(createdId);
    expect(updated.description).toBe("Updated");

    const decrypted = await updated.getDecryptedValue();
    expect(decrypted).toBe("updated-value");
  });

  it("deletes a secret", async () => {
    await Secret.upsert({
      userId: "user-1",
      key: "TO_DELETE",
      value: "delete-me",
    });

    const deleted = await Secret.deleteSecret("user-1", "TO_DELETE");
    expect(deleted).toBe(true);

    const found = await Secret.find("user-1", "TO_DELETE");
    expect(found).toBeNull();
  });

  it("returns false when deleting non-existent secret", async () => {
    const deleted = await Secret.deleteSecret("user-1", "NONEXISTENT");
    expect(deleted).toBe(false);
  });

  it("decrypts the value correctly", async () => {
    const secret = await Secret.upsert({
      userId: "user-1",
      key: "DECRYPT_TEST",
      value: "my-secret-value-123",
    });

    const decrypted = await secret.getDecryptedValue();
    expect(decrypted).toBe("my-secret-value-123");
  });

  it("lists secrets for a user", async () => {
    await Secret.upsert({ userId: "user-1", key: "KEY_A", value: "a" });
    await Secret.upsert({ userId: "user-1", key: "KEY_B", value: "b" });
    await Secret.upsert({ userId: "user-2", key: "KEY_C", value: "c" });

    const [secrets] = await Secret.listForUser("user-1");
    expect(secrets.length).toBe(2);
    const keys = secrets.map((s) => s.key).sort();
    expect(keys).toEqual(["KEY_A", "KEY_B"]);
  });

  it("isolates secrets between users", async () => {
    await Secret.upsert({ userId: "user-1", key: "SHARED_KEY", value: "user1-value" });
    await Secret.upsert({ userId: "user-2", key: "SHARED_KEY", value: "user2-value" });

    const s1 = await Secret.find("user-1", "SHARED_KEY");
    const s2 = await Secret.find("user-2", "SHARED_KEY");

    expect(s1).not.toBeNull();
    expect(s2).not.toBeNull();

    const v1 = await s1!.getDecryptedValue();
    const v2 = await s2!.getDecryptedValue();

    expect(v1).toBe("user1-value");
    expect(v2).toBe("user2-value");
  });

  it("listAll returns secrets across all users", async () => {
    await Secret.upsert({ userId: "user-1", key: "KEY_A", value: "a" });
    await Secret.upsert({ userId: "user-2", key: "KEY_B", value: "b" });
    await Secret.upsert({ userId: "user-3", key: "KEY_C", value: "c" });

    const all = await Secret.listAll();
    expect(all.length).toBe(3);
    const keys = all.map((s) => s.key).sort();
    expect(keys).toEqual(["KEY_A", "KEY_B", "KEY_C"]);
  });

  it("listAll respects limit", async () => {
    await Secret.upsert({ userId: "user-1", key: "KEY_A", value: "a" });
    await Secret.upsert({ userId: "user-2", key: "KEY_B", value: "b" });
    await Secret.upsert({ userId: "user-3", key: "KEY_C", value: "c" });

    const limited = await Secret.listAll(2);
    expect(limited.length).toBe(2);
  });

  it("toSafeObject excludes encrypted_value", async () => {
    const secret = await Secret.upsert({
      userId: "user-1",
      key: "SAFE_TEST",
      value: "secret",
      description: "safe test",
    });

    const safe = secret.toSafeObject();
    expect(safe.key).toBe("SAFE_TEST");
    expect(safe.description).toBe("safe test");
    expect(safe).not.toHaveProperty("encrypted_value");
    expect(safe).not.toHaveProperty("value");
  });
});
