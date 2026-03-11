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

    // secret-helper
    expect(mod.getSecret).toBeDefined();
    expect(mod.getSecretRequired).toBeDefined();
    expect(mod.hasSecret).toBeDefined();
    expect(mod.getSecretSync).toBeDefined();
    expect(mod.clearSecretCache).toBeDefined();
    expect(mod.clearAllSecretCache).toBeDefined();
    expect(mod.resetSecretModelLoader).toBeDefined();
    expect(mod.setSecretModelLoader).toBeDefined();
  });
});
