import { describe, it, expect } from "vitest";

describe("security index exports", () => {
  it("exports all public API", async () => {
    const mod = await import("../src/index.js");
    expect(mod).toBeDefined();

    // crypto
    expect(mod.generateMasterKey).toBeDefined();
    expect(mod.deriveKey).toBeDefined();
    expect(mod.encrypt).toBeDefined();
    expect(mod.decrypt).toBeDefined();
    expect(mod.encryptFernet).toBeDefined();
    expect(mod.decryptFernet).toBeDefined();
    expect(mod.isValidMasterKey).toBeDefined();

    // master-key
    expect(mod.getMasterKey).toBeDefined();
    expect(mod.initMasterKey).toBeDefined();
    expect(mod.clearMasterKeyCache).toBeDefined();
    expect(mod.setMasterKey).toBeDefined();
    expect(mod.setMasterKeyPersistent).toBeDefined();
    expect(mod.deleteMasterKey).toBeDefined();
    expect(mod.isUsingEnvKey).toBeDefined();
    expect(mod.isUsingAwsKey).toBeDefined();
    expect(mod.setKeytarLoader).toBeDefined();
    expect(mod.resetKeytarLoader).toBeDefined();
  });
});
