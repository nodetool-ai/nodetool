import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import { getDefaultDbPath } from "@nodetool-ai/config";
import { createSqliteRepository } from "@nodetool-ai/database-sqlite";

type Repository = ReturnType<typeof createSqliteRepository>;

/**
 * The local secret store is the application database that every run reads
 * (`nodetool node run`, `nodetool chat`, the desktop app): DB_PATH, DATABASE_URL,
 * or `nodetool.sqlite3` in the NodeTool data directory.
 */
export function localSecretStorePath(env: NodeJS.ProcessEnv): string {
  return resolve(getDefaultDbPath(env));
}

/**
 * Databases that releases before this store was shared kept local secrets in:
 * `nodetool.db` in NODETOOL_DATA_DIR, which defaulted to `./nodetool-data`
 * relative to the working directory. Without NODETOOL_DATA_DIR the home
 * directory's `nodetool-data` is checked too, because most commands ran there.
 */
export function legacySecretStorePaths(env: NodeJS.ProcessEnv): string[] {
  const directories = [resolve(env.NODETOOL_DATA_DIR ?? "./nodetool-data")];
  if (!env.NODETOOL_DATA_DIR) { directories.push(join(env.HOME || env.USERPROFILE || homedir(), "nodetool-data")); }
  const target = localSecretStorePath(env);
  return [...new Set(directories.map(directory => join(directory, "nodetool.db")))].filter(path => path !== target);
}

const markerSchema = z.object({ migrated_users: z.array(z.string()) });

function markerPath(legacyPath: string): string {
  return `${legacyPath}.secrets-migrated.json`;
}

async function migratedUsers(legacyPath: string): Promise<string[]> {
  try {
    const marker = markerSchema.safeParse(JSON.parse(await readFile(markerPath(legacyPath), "utf8")));
    return marker.success ? marker.data.migrated_users : [];
  } catch {
    // No marker yet: this legacy database has not been migrated.
    return [];
  }
}

export interface SecretMigration {
  readonly from: string;
  readonly copied: readonly string[];
}

/**
 * Copy one user's secrets from a legacy database into the shared store, once.
 * Encrypted values are copied as they are: both stores encrypt with
 * SECRETS_MASTER_KEY and the user id, so no master key is needed here. A key
 * the shared store already holds keeps its current value. A marker next to the
 * legacy database records the user, so a secret deleted later is not copied back.
 * The legacy database is left in place.
 */
export async function migrateLegacySecrets(target: Repository, legacyPath: string, userId: string): Promise<SecretMigration | null> {
  if (!existsSync(legacyPath)) { return null; }
  const done = await migratedUsers(legacyPath);
  if (done.includes(userId)) { return null; }
  const legacy = createSqliteRepository(legacyPath);
  const copied: string[] = [];
  try {
    const present = new Set((await target.list("secrets", userId)).map(row => String(row.key)));
    for (const row of await legacy.list("secrets", userId)) {
      const key = String(row.key);
      if (present.has(key)) { continue; }
      await target.put("secrets", userId, { key, description: row.description ?? "", encrypted_value: row.encrypted_value });
      present.add(key);
      copied.push(key);
    }
  } finally { legacy.close(); }
  try {
    await writeFile(markerPath(legacyPath), `${JSON.stringify({ migrated_users: [...done, userId] }, null, 2)}\n`);
  } catch {
    // A read-only legacy directory: the next run copies nothing new, because
    // every legacy key is now present in the shared store.
  }
  return { from: legacyPath, copied };
}

export interface LocalSecretStoreOptions {
  readonly env: NodeJS.ProcessEnv;
  readonly userId: string;
  /** Called once for each legacy database that contributed secrets. */
  readonly onMigrated?: (migration: SecretMigration, target: string) => void;
}

/**
 * Open the shared store for one operation, after migrating legacy secrets.
 * `create: false` answers null instead of creating a store that holds nothing.
 */
export async function withLocalSecretStore<T>(options: LocalSecretStoreOptions & { create: true }, operate: (repository: Repository) => Promise<T>): Promise<T>;
export async function withLocalSecretStore<T>(options: LocalSecretStoreOptions & { create: false }, operate: (repository: Repository) => Promise<T>): Promise<T | null>;
export async function withLocalSecretStore<T>(options: LocalSecretStoreOptions & { create: boolean }, operate: (repository: Repository) => Promise<T>): Promise<T | null> {
  const target = localSecretStorePath(options.env);
  const legacy = legacySecretStorePaths(options.env).filter(path => existsSync(path));
  if (!options.create && !existsSync(target) && legacy.length === 0) { return null; }
  await mkdir(dirname(target), { recursive: true });
  const repository = createSqliteRepository(target);
  try {
    for (const path of legacy) {
      const migration = await migrateLegacySecrets(repository, path, options.userId);
      if (migration && migration.copied.length > 0) { options.onMigrated?.(migration, target); }
    }
    return await operate(repository);
  } finally { repository.close(); }
}
