import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import * as crypto from "crypto";
import * as yaml from "js-yaml";

import {
  TenantStore,
  TenantNotFoundError,
  TenantAlreadyExistsError
} from "../src/tenant-store.js";
import { generateMasterKey, decrypt } from "@nodetool-ai/security";

function makeTmpDir(): string {
  return path.join(os.tmpdir(), `nodetool-tenant-store-${crypto.randomUUID()}`);
}

describe("TenantStore", () => {
  let tmpDir: string;
  let masterKey: string;
  let store: TenantStore;

  beforeEach(async () => {
    tmpDir = makeTmpDir();
    masterKey = generateMasterKey();
    store = new TenantStore({
      baseDir: tmpDir,
      getMasterKey: () => masterKey
    });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("starts empty", async () => {
    const tenants = await store.listTenants();
    expect(tenants).toEqual([]);
  });

  it("creates and retrieves a tenant", async () => {
    const t = await store.createTenant({ id: "acme", display_name: "Acme" });
    expect(t.id).toBe("acme");
    expect(t.display_name).toBe("Acme");
    expect(t.quota.max_deployments).toBe(5);
    expect(t.status).toBe("active");

    const fetched = await store.getTenant("acme");
    expect(fetched.id).toBe("acme");
  });

  it("creates per-tenant directory eagerly", async () => {
    await store.createTenant({ id: "acme", display_name: "Acme" });
    const stat = await fs.stat(path.join(tmpDir, "acme"));
    expect(stat.isDirectory()).toBe(true);
  });

  it("rejects duplicates", async () => {
    await store.createTenant({ id: "acme", display_name: "Acme" });
    await expect(
      store.createTenant({ id: "acme", display_name: "Acme 2" })
    ).rejects.toBeInstanceOf(TenantAlreadyExistsError);
  });

  it("throws for missing tenants", async () => {
    await expect(store.getTenant("ghost")).rejects.toBeInstanceOf(
      TenantNotFoundError
    );
  });

  it("encrypts credentials at rest", async () => {
    await store.createTenant({ id: "acme", display_name: "Acme" });
    await store.setCredential("acme", "RUNPOD_API_KEY", "secret-runpod-token");

    const raw = await fs.readFile(path.join(tmpDir, "index.yaml"), "utf-8");
    expect(raw).not.toContain("secret-runpod-token");

    const parsed = yaml.load(raw) as {
      tenants: Record<string, { credentials: Record<string, { ciphertext: string }> }>;
    };
    const ct = parsed.tenants.acme.credentials.RUNPOD_API_KEY.ciphertext;
    expect(ct).toBeTruthy();

    // The store should be able to round-trip the value back.
    const loaded = await store.loadCredentials("acme");
    expect(loaded.RUNPOD_API_KEY).toBe("secret-runpod-token");

    // And direct decryption with the master key + tenant id should match.
    expect(decrypt(masterKey, "acme", ct)).toBe("secret-runpod-token");
  });

  it("derives different ciphertexts per tenant for the same plaintext", async () => {
    await store.createTenant({ id: "acme", display_name: "Acme" });
    await store.createTenant({ id: "globex", display_name: "Globex" });
    await store.setCredential("acme", "RUNPOD_API_KEY", "shared-secret");
    await store.setCredential("globex", "RUNPOD_API_KEY", "shared-secret");

    const acme = await store.getTenant("acme");
    const globex = await store.getTenant("globex");
    expect(acme.credentials.RUNPOD_API_KEY?.ciphertext).not.toBe(
      globex.credentials.RUNPOD_API_KEY?.ciphertext
    );

    // Cross-tenant decryption should fail (wrong derived key).
    expect(() =>
      decrypt(masterKey, "globex", acme.credentials.RUNPOD_API_KEY!.ciphertext)
    ).toThrow();
  });

  it("validates credential names as SCREAMING_SNAKE_CASE", async () => {
    await store.createTenant({ id: "acme", display_name: "Acme" });
    await expect(
      store.setCredential("acme", "lowercase", "x")
    ).rejects.toThrow(/SCREAMING_SNAKE_CASE/);
    await expect(
      store.setCredential("acme", "Has-Hyphen", "x")
    ).rejects.toThrow();
  });

  it("deletes credentials without disturbing others", async () => {
    await store.createTenant({ id: "acme", display_name: "Acme" });
    await store.setCredential("acme", "RUNPOD_API_KEY", "rp");
    await store.setCredential("acme", "DOCKER_PASSWORD", "dp");
    await store.deleteCredential("acme", "RUNPOD_API_KEY");

    const t = await store.getTenant("acme");
    expect(t.credentials.RUNPOD_API_KEY).toBeUndefined();
    expect(t.credentials.DOCKER_PASSWORD).toBeDefined();
  });

  it("deletes tenants and optionally wipes data", async () => {
    await store.createTenant({ id: "acme", display_name: "Acme" });
    const dir = path.join(tmpDir, "acme");
    // Write a marker so we can verify the wipe happened.
    await fs.writeFile(path.join(dir, "marker.txt"), "x");

    await store.deleteTenant("acme");
    await expect(store.getTenant("acme")).rejects.toBeInstanceOf(
      TenantNotFoundError
    );
    // Without wipeData, the directory survives (caller may want to inspect it).
    await fs.access(path.join(dir, "marker.txt"));

    // With wipeData, everything is removed.
    await store.createTenant({ id: "acme", display_name: "Acme" });
    await fs.writeFile(path.join(tmpDir, "acme", "marker.txt"), "x");
    await store.deleteTenant("acme", { wipeData: true });
    await expect(fs.access(path.join(tmpDir, "acme"))).rejects.toThrow();
  });

  it("updates quota and status without losing credentials", async () => {
    await store.createTenant({ id: "acme", display_name: "Acme" });
    await store.setCredential("acme", "RUNPOD_API_KEY", "rp");
    await store.setQuota("acme", { max_deployments: 1 });
    await store.setStatus("acme", "suspended");

    const t = await store.getTenant("acme");
    expect(t.quota.max_deployments).toBe(1);
    expect(t.status).toBe("suspended");
    expect(t.credentials.RUNPOD_API_KEY).toBeDefined();
  });

  it("writes index file mode 0600", async () => {
    await store.createTenant({ id: "acme", display_name: "Acme" });
    const stat = await fs.stat(path.join(tmpDir, "index.yaml"));
    // On macOS/Linux, file mode mask is the lower 9 bits.
    if (process.platform !== "win32") {
      expect(stat.mode & 0o777).toBe(0o600);
    }
  });

  it("rejects malicious tenant ids in all entry points", async () => {
    await expect(
      store.createTenant({ id: "../escape", display_name: "x" })
    ).rejects.toThrow();
    await expect(store.getTenant("../escape")).rejects.toThrow();
    expect(await store.tenantExists("../escape")).toBe(false);
  });
});
