import { randomUUID } from "node:crypto";
import fs from "fs";
import path from "path";
import { logMessage } from "./logger";
import { readSettings, updateSettings } from "./settings";
import { getSystemDataPath } from "./systemPaths";
import type { Vault, VaultListResult } from "./types.d";

export type { Vault, VaultListResult };

/**
 * Vault management for the desktop app.
 *
 * A "vault" is a self-contained, switchable data store: its own SQLite
 * database plus its own assets and vector-store directories. Switching the
 * active vault points the backend at a different set of databases, so each
 * vault has fully isolated workflows, jobs, assets, secrets, and RAG
 * collections.
 *
 * This is intentionally distinct from the in-database `nodetool_workspaces`
 * concept (a per-user working directory for file tools). Vaults live one level
 * above the database — the Electron app owns the list and decides which
 * database the backend opens at startup.
 *
 * The list of vaults and the active vault id are persisted in the Electron
 * settings file (settings.yaml). The backend is configured purely through the
 * `DB_PATH` / `ASSET_FOLDER` / `VECTORSTORE_DB_PATH` environment variables it
 * already honours (see @nodetool-ai/config paths), so no backend changes are
 * required.
 */

const VAULTS_KEY = "vaults";
const ACTIVE_VAULT_KEY = "activeVaultId";

/** Id of the built-in vault that maps onto the original (pre-vaults) data store. */
export const DEFAULT_VAULT_ID = "default";

/** Display name of the built-in default vault. */
const DEFAULT_VAULT_NAME = "Default";

/** Directory (under the Nodetool data dir) that holds non-default vault data. */
const VAULTS_DIRNAME = "vaults";

const MAX_NAME_LENGTH = 100;

function createDefaultVault(): Vault {
  return {
    id: DEFAULT_VAULT_ID,
    name: DEFAULT_VAULT_NAME,
    dbPath: null,
    assetPath: null,
    vectorPath: null,
  };
}

function coerceVault(raw: unknown): Vault | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const record = raw as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.name !== "string") {
    return null;
  }
  return {
    id: record.id,
    name: record.name,
    dbPath: typeof record.dbPath === "string" ? record.dbPath : null,
    assetPath: typeof record.assetPath === "string" ? record.assetPath : null,
    vectorPath: typeof record.vectorPath === "string" ? record.vectorPath : null,
  };
}

/**
 * Read the persisted vaults, guaranteeing a default vault exists at the front.
 * Malformed entries from a hand-edited settings file are dropped.
 */
function readVaults(): Vault[] {
  const settings = readSettings();
  const raw = settings[VAULTS_KEY];
  const vaults: Vault[] = [];

  if (Array.isArray(raw)) {
    for (const entry of raw) {
      const vault = coerceVault(entry);
      if (vault && !vaults.some((existing) => existing.id === vault.id)) {
        vaults.push(vault);
      }
    }
  }

  const defaultVault = vaults.find((vault) => vault.id === DEFAULT_VAULT_ID);
  if (!defaultVault) {
    vaults.unshift(createDefaultVault());
  } else {
    // The default vault must always map onto the backend defaults; a
    // hand-edited settings file could have set paths on it. Normalize it.
    defaultVault.name = defaultVault.name || DEFAULT_VAULT_NAME;
    defaultVault.dbPath = null;
    defaultVault.assetPath = null;
    defaultVault.vectorPath = null;
  }

  return vaults;
}

function persistVaults(vaults: Vault[]): void {
  updateSettings({ [VAULTS_KEY]: vaults });
}

function sanitizeName(name: string): string {
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (!trimmed) {
    throw new Error("Vault name cannot be empty");
  }
  if (trimmed.length > MAX_NAME_LENGTH) {
    throw new Error(`Vault name cannot exceed ${MAX_NAME_LENGTH} characters`);
  }
  return trimmed;
}

/** All vaults, default first. */
export function listVaults(): Vault[] {
  return readVaults();
}

/** The id of the active vault, falling back to the default vault. */
export function getActiveVaultId(): string {
  const settings = readSettings();
  const id = settings[ACTIVE_VAULT_KEY];
  const vaults = readVaults();
  if (typeof id === "string" && vaults.some((vault) => vault.id === id)) {
    return id;
  }
  return DEFAULT_VAULT_ID;
}

/** The active vault object. */
export function getActiveVault(): Vault {
  const id = getActiveVaultId();
  const vaults = readVaults();
  return vaults.find((vault) => vault.id === id) ?? createDefaultVault();
}

/** The list plus the active id — convenient single read for IPC/UI. */
export function getVaultList(): VaultListResult {
  return { vaults: readVaults(), activeVaultId: getActiveVaultId() };
}

/**
 * Persist a new active vault id. Does NOT restart the backend — the caller is
 * responsible for applying the switch (see vaultSwitch.applyVaultSwitch).
 */
export function setActiveVaultId(id: string): void {
  const vaults = readVaults();
  if (!vaults.some((vault) => vault.id === id)) {
    throw new Error(`Unknown vault: ${id}`);
  }
  updateSettings({ [ACTIVE_VAULT_KEY]: id });
}

/**
 * Create a new vault with its own database/assets/vector-store directory and
 * persist it. Does not switch to it.
 */
export function createVault(name: string): Vault {
  const cleanName = sanitizeName(name);
  const vaults = readVaults();
  const id = randomUUID();
  const baseDir = path.join(getSystemDataPath(VAULTS_DIRNAME), id);
  const assetPath = path.join(baseDir, "assets");

  fs.mkdirSync(assetPath, { recursive: true });

  const vault: Vault = {
    id,
    name: cleanName,
    dbPath: path.join(baseDir, "nodetool.sqlite3"),
    assetPath,
    vectorPath: path.join(baseDir, "vectorstore.db"),
  };

  vaults.push(vault);
  persistVaults(vaults);
  logMessage(`Created vault "${cleanName}" (${id}) at ${baseDir}`);
  return vault;
}

/** Rename an existing vault. Returns the updated list. */
export function renameVault(id: string, name: string): Vault[] {
  const cleanName = sanitizeName(name);
  const vaults = readVaults();
  const vault = vaults.find((entry) => entry.id === id);
  if (!vault) {
    throw new Error(`Unknown vault: ${id}`);
  }
  vault.name = cleanName;
  persistVaults(vaults);
  logMessage(`Renamed vault ${id} to "${cleanName}"`);
  return vaults;
}

/**
 * Remove a vault from the list. The default vault cannot be removed, nor can
 * the active vault (switch away first). This is intentionally non-destructive:
 * the database/assets files are left on disk so data can be recovered. Returns
 * the updated list.
 */
export function deleteVault(id: string): Vault[] {
  if (id === DEFAULT_VAULT_ID) {
    throw new Error("The default vault cannot be deleted");
  }
  if (getActiveVaultId() === id) {
    throw new Error("Cannot delete the active vault. Switch to another vault first.");
  }
  const vaults = readVaults();
  const vault = vaults.find((entry) => entry.id === id);
  if (!vault) {
    return vaults;
  }
  const next = vaults.filter((entry) => entry.id !== id);
  persistVaults(next);
  logMessage(
    `Removed vault "${vault.name}" (${id}) from the list. Files left on disk: ${vault.dbPath ?? "(default)"}`,
  );
  return next;
}

/**
 * Environment-variable overrides for the active vault, to merge into the
 * backend's environment. Empty for the default vault (the backend then uses its
 * own default paths, preserving the original behaviour).
 */
export function getActiveVaultEnv(): Record<string, string> {
  const vault = getActiveVault();
  const env: Record<string, string> = {};
  if (vault.dbPath) {
    env.DB_PATH = vault.dbPath;
  }
  if (vault.assetPath) {
    env.ASSET_FOLDER = vault.assetPath;
  }
  if (vault.vectorPath) {
    env.VECTORSTORE_DB_PATH = vault.vectorPath;
  }
  return env;
}

/** Ensure the active vault's directories exist before the backend opens them. */
export function ensureActiveVaultDirs(): void {
  const vault = getActiveVault();
  if (vault.dbPath) {
    fs.mkdirSync(path.dirname(vault.dbPath), { recursive: true });
  }
  if (vault.assetPath) {
    fs.mkdirSync(vault.assetPath, { recursive: true });
  }
  if (vault.vectorPath) {
    fs.mkdirSync(path.dirname(vault.vectorPath), { recursive: true });
  }
}
