import fs from "fs";
import path from "path";
import os from "os";
import * as yaml from "js-yaml";

let tempDir: string;
const originalPlatform = process.platform;

function setPlatform(platform: NodeJS.Platform) {
  Object.defineProperty(process, "platform", { value: platform });
}

function readPersistedSettings(): Record<string, unknown> {
  const settingsPath = path.join(tempDir, ".config", "nodetool", "settings.yaml");
  if (!fs.existsSync(settingsPath)) return {};
  return (yaml.load(fs.readFileSync(settingsPath, "utf8")) ?? {}) as Record<string, unknown>;
}

// Data dir on linux is <home>/.local/share/nodetool
function dataDir(): string {
  return path.join(tempDir, ".local", "share", "nodetool");
}

beforeEach(() => {
  jest.resetModules();
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vaults-test-"));
  jest.spyOn(os, "homedir").mockReturnValue(tempDir);
  setPlatform("linux");
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
  (os.homedir as jest.Mock).mockRestore();
  setPlatform(originalPlatform as NodeJS.Platform);
});

describe("vaults module", () => {
  test("listVaults returns a default vault when none configured", async () => {
    const { listVaults, DEFAULT_VAULT_ID } = await import("../vaults");
    const vaults = listVaults();
    expect(vaults).toHaveLength(1);
    expect(vaults[0].id).toBe(DEFAULT_VAULT_ID);
    expect(vaults[0].dbPath).toBeNull();
    expect(vaults[0].assetPath).toBeNull();
  });

  test("getActiveVaultId defaults to the default vault", async () => {
    const { getActiveVaultId, DEFAULT_VAULT_ID } = await import("../vaults");
    expect(getActiveVaultId()).toBe(DEFAULT_VAULT_ID);
  });

  test("getActiveVaultEnv is empty for the default vault", async () => {
    const { getActiveVaultEnv } = await import("../vaults");
    expect(getActiveVaultEnv()).toEqual({});
  });

  test("createVault adds an isolated vault with its own paths and dirs", async () => {
    const { createVault, listVaults } = await import("../vaults");
    const vault = createVault("Work");

    expect(vault.name).toBe("Work");
    expect(vault.id).not.toBe("default");
    expect(vault.dbPath).toBe(
      path.join(dataDir(), "vaults", vault.id, "nodetool.sqlite3"),
    );
    expect(vault.assetPath).toBe(path.join(dataDir(), "vaults", vault.id, "assets"));
    expect(vault.vectorPath).toBe(
      path.join(dataDir(), "vaults", vault.id, "vectorstore.db"),
    );
    // The assets directory is created eagerly.
    expect(fs.existsSync(vault.assetPath as string)).toBe(true);

    const vaults = listVaults();
    expect(vaults.map((v) => v.name)).toEqual(["Default", "Work"]);

    // Persisted to settings.yaml.
    const persisted = readPersistedSettings();
    expect(Array.isArray(persisted.vaults)).toBe(true);
    expect((persisted.vaults as unknown[]).length).toBe(2);
  });

  test("createVault rejects empty names", async () => {
    const { createVault } = await import("../vaults");
    expect(() => createVault("   ")).toThrow(/cannot be empty/);
  });

  test("setActiveVaultId switches active vault and surfaces env overrides", async () => {
    const { createVault, setActiveVaultId, getActiveVaultId, getActiveVaultEnv } =
      await import("../vaults");
    const vault = createVault("Work");

    setActiveVaultId(vault.id);
    expect(getActiveVaultId()).toBe(vault.id);

    expect(getActiveVaultEnv()).toEqual({
      DB_PATH: vault.dbPath,
      ASSET_FOLDER: vault.assetPath,
      VECTORSTORE_DB_PATH: vault.vectorPath,
    });
  });

  test("setActiveVaultId throws for unknown vaults", async () => {
    const { setActiveVaultId } = await import("../vaults");
    expect(() => setActiveVaultId("does-not-exist")).toThrow(/Unknown vault/);
  });

  test("renameVault updates the name", async () => {
    const { createVault, renameVault } = await import("../vaults");
    const vault = createVault("Work");
    const updated = renameVault(vault.id, "Renamed");
    expect(updated.find((v) => v.id === vault.id)?.name).toBe("Renamed");
  });

  test("deleteVault removes a non-active vault but keeps files on disk", async () => {
    const { createVault, deleteVault, listVaults } = await import("../vaults");
    const vault = createVault("Work");
    const assetPath = vault.assetPath as string;

    const remaining = deleteVault(vault.id);
    expect(remaining.some((v) => v.id === vault.id)).toBe(false);
    expect(listVaults().some((v) => v.id === vault.id)).toBe(false);

    // Non-destructive: the files are intentionally left on disk.
    expect(fs.existsSync(assetPath)).toBe(true);
  });

  test("deleteVault refuses to delete the default vault", async () => {
    const { deleteVault, DEFAULT_VAULT_ID } = await import("../vaults");
    expect(() => deleteVault(DEFAULT_VAULT_ID)).toThrow(/default vault/);
  });

  test("deleteVault refuses to delete the active vault", async () => {
    const { createVault, setActiveVaultId, deleteVault } = await import("../vaults");
    const vault = createVault("Work");
    setActiveVaultId(vault.id);
    expect(() => deleteVault(vault.id)).toThrow(/active vault/);
  });

  test("a hand-edited default vault with paths is normalized back to defaults", async () => {
    // Simulate a settings file where someone gave the default vault paths.
    const settingsDir = path.join(tempDir, ".config", "nodetool");
    fs.mkdirSync(settingsDir, { recursive: true });
    fs.writeFileSync(
      path.join(settingsDir, "settings.yaml"),
      yaml.dump({
        vaults: [
          { id: "default", name: "Default", dbPath: "/somewhere/else.sqlite3" },
        ],
      }),
      "utf8",
    );

    const { listVaults } = await import("../vaults");
    const defaultVault = listVaults().find((v) => v.id === "default");
    expect(defaultVault?.dbPath).toBeNull();
  });

  test("the default vault is pinned to the front even when listed later", async () => {
    const settingsDir = path.join(tempDir, ".config", "nodetool");
    fs.mkdirSync(settingsDir, { recursive: true });
    fs.writeFileSync(
      path.join(settingsDir, "settings.yaml"),
      yaml.dump({
        vaults: [
          { id: "work", name: "Work", dbPath: "/x/work.sqlite3" },
          { id: "default", name: "Default" },
        ],
      }),
      "utf8",
    );

    const { listVaults, DEFAULT_VAULT_ID } = await import("../vaults");
    const vaults = listVaults();
    expect(vaults[0].id).toBe(DEFAULT_VAULT_ID);
    expect(vaults.map((v) => v.id)).toEqual(["default", "work"]);
  });

  test("getVaultList returns both the list and the active id", async () => {
    const { createVault, setActiveVaultId, getVaultList } = await import("../vaults");
    const vault = createVault("Work");
    setActiveVaultId(vault.id);
    const result = getVaultList();
    expect(result.activeVaultId).toBe(vault.id);
    expect(result.vaults.map((v) => v.name)).toEqual(["Default", "Work"]);
  });
});
