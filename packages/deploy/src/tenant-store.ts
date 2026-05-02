/**
 * Persistence layer for the multi-tenant registry.
 *
 * The registry lives at `<baseDir>/index.yaml` and is the source of truth for
 * which tenants exist, their quotas, and their (encrypted) provider
 * credentials. Per-tenant deployment configs live alongside in
 * `<baseDir>/<tenant-id>/deployment.yaml` and are managed by the existing
 * `StateManager` — this module never touches them directly.
 *
 * All writes are atomic (temp file + rename) and use mode 0600 / 0700 so the
 * tenant registry is never world-readable.
 */

import * as fs from "fs/promises";
import * as path from "path";
import * as yaml from "js-yaml";
import { encrypt, decrypt } from "@nodetool-ai/security";
import { createLogger } from "@nodetool-ai/config";

import {
  type TenantIndex,
  type TenantRecord,
  type TenantQuota,
  TenantQuotaSchema,
  parseTenantIndex,
  resolveTenantPaths,
  assertValidTenantId,
  getDefaultTenantBaseDir
} from "./tenant-config.js";

const log = createLogger("nodetool.deploy.tenant-store");

// ============================================================================
// In-process mutex shared across all stores against the same base dir
// ============================================================================

class AsyncMutex {
  private locked = false;
  private waiters: Array<() => void> = [];

  async acquire(): Promise<() => void> {
    if (!this.locked) {
      this.locked = true;
      return () => this.release();
    }
    return new Promise<() => void>((resolve) => {
      this.waiters.push(() => {
        this.locked = true;
        resolve(() => this.release());
      });
    });
  }

  private release(): void {
    const next = this.waiters.shift();
    if (next) {
      this.locked = true;
      next();
    } else {
      this.locked = false;
    }
  }
}

const indexMutexes = new Map<string, AsyncMutex>();

function getIndexMutex(indexPath: string): AsyncMutex {
  let mutex = indexMutexes.get(indexPath);
  if (!mutex) {
    mutex = new AsyncMutex();
    indexMutexes.set(indexPath, mutex);
  }
  return mutex;
}

// ============================================================================
// TenantStore
// ============================================================================

export class TenantNotFoundError extends Error {
  constructor(id: string) {
    super(`Tenant ${JSON.stringify(id)} not found`);
    this.name = "TenantNotFoundError";
  }
}

export class TenantAlreadyExistsError extends Error {
  constructor(id: string) {
    super(`Tenant ${JSON.stringify(id)} already exists`);
    this.name = "TenantAlreadyExistsError";
  }
}

export class TenantSuspendedError extends Error {
  constructor(id: string) {
    super(`Tenant ${JSON.stringify(id)} is suspended`);
    this.name = "TenantSuspendedError";
  }
}

export interface CreateTenantInput {
  id: string;
  display_name: string;
  quota?: Partial<TenantQuota>;
}

/**
 * Persists the tenant registry. Constructed with a `getMasterKey` callback so
 * the store stays decoupled from the security package's keychain side effects
 * — tests can inject a fixed key without touching the system keychain.
 */
export class TenantStore {
  readonly baseDir: string;
  readonly indexPath: string;
  private getMasterKey: () => Promise<string> | string;

  constructor(opts: {
    baseDir?: string;
    configDir?: string;
    getMasterKey: () => Promise<string> | string;
  }) {
    this.baseDir = opts.baseDir ?? getDefaultTenantBaseDir(opts.configDir);
    this.indexPath = path.join(this.baseDir, "index.yaml");
    this.getMasterKey = opts.getMasterKey;
  }

  // -------------------------------------------------------------------------
  // Index I/O
  // -------------------------------------------------------------------------

  private async ensureBaseDir(): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true, mode: 0o700 });
  }

  private async loadIndex(): Promise<TenantIndex> {
    try {
      const raw = await fs.readFile(this.indexPath, "utf-8");
      const data = yaml.load(raw, { schema: yaml.JSON_SCHEMA });
      return parseTenantIndex(data ?? {});
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return parseTenantIndex({});
      }
      throw err;
    }
  }

  private async saveIndex(index: TenantIndex): Promise<void> {
    await this.ensureBaseDir();
    const data = JSON.parse(
      JSON.stringify(index, (_k, v) => (v === null ? undefined : v))
    );
    const yamlStr = yaml.dump(data, {
      flowLevel: -1,
      sortKeys: false,
      noCompatMode: true
    });
    const tempPath = this.indexPath + ".tmp";
    await fs.writeFile(tempPath, yamlStr, { encoding: "utf-8", mode: 0o600 });
    await fs.rename(tempPath, this.indexPath);
  }

  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    const mutex = getIndexMutex(this.indexPath);
    const release = await mutex.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }

  // -------------------------------------------------------------------------
  // Read API
  // -------------------------------------------------------------------------

  async listTenants(): Promise<TenantRecord[]> {
    const index = await this.loadIndex();
    return Object.values(index.tenants);
  }

  async getTenant(id: string): Promise<TenantRecord> {
    assertValidTenantId(id);
    const index = await this.loadIndex();
    const tenant = index.tenants[id];
    if (!tenant) {
      throw new TenantNotFoundError(id);
    }
    return tenant;
  }

  async tenantExists(id: string): Promise<boolean> {
    if (!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(id)) return false;
    const index = await this.loadIndex();
    return Boolean(index.tenants[id]);
  }

  // -------------------------------------------------------------------------
  // Mutation API
  // -------------------------------------------------------------------------

  async createTenant(input: CreateTenantInput): Promise<TenantRecord> {
    assertValidTenantId(input.id);
    return this.withLock(async () => {
      const index = await this.loadIndex();
      if (index.tenants[input.id]) {
        throw new TenantAlreadyExistsError(input.id);
      }
      const now = new Date().toISOString();
      const record: TenantRecord = {
        id: input.id,
        display_name: input.display_name,
        created_at: now,
        updated_at: now,
        status: "active",
        quota: TenantQuotaSchema.parse(input.quota ?? {}),
        credentials: {}
      };
      index.tenants[input.id] = record;
      await this.saveIndex(index);

      // Create the per-tenant directory eagerly so deployers can drop their
      // own deployment.yaml without racing on mkdir.
      const paths = resolveTenantPaths(this.baseDir, input.id);
      await fs.mkdir(paths.dir, { recursive: true, mode: 0o700 });
      log.info(`Created tenant ${input.id}`);
      return record;
    });
  }

  async deleteTenant(id: string, opts: { wipeData?: boolean } = {}): Promise<void> {
    assertValidTenantId(id);
    await this.withLock(async () => {
      const index = await this.loadIndex();
      if (!index.tenants[id]) {
        throw new TenantNotFoundError(id);
      }
      delete index.tenants[id];
      await this.saveIndex(index);

      if (opts.wipeData) {
        const paths = resolveTenantPaths(this.baseDir, id);
        await fs.rm(paths.dir, { recursive: true, force: true });
      }
      log.info(`Deleted tenant ${id} (wipeData=${opts.wipeData ?? false})`);
    });
  }

  async setStatus(id: string, status: "active" | "suspended"): Promise<TenantRecord> {
    assertValidTenantId(id);
    return this.withLock(async () => {
      const index = await this.loadIndex();
      const tenant = index.tenants[id];
      if (!tenant) throw new TenantNotFoundError(id);
      tenant.status = status;
      tenant.updated_at = new Date().toISOString();
      await this.saveIndex(index);
      return tenant;
    });
  }

  async setQuota(id: string, quota: Partial<TenantQuota>): Promise<TenantRecord> {
    assertValidTenantId(id);
    return this.withLock(async () => {
      const index = await this.loadIndex();
      const tenant = index.tenants[id];
      if (!tenant) throw new TenantNotFoundError(id);
      tenant.quota = TenantQuotaSchema.parse({ ...tenant.quota, ...quota });
      tenant.updated_at = new Date().toISOString();
      await this.saveIndex(index);
      return tenant;
    });
  }

  // -------------------------------------------------------------------------
  // Credential API
  // -------------------------------------------------------------------------

  /**
   * Encrypt and store a provider credential for a tenant. The plaintext is
   * never written to disk; the ciphertext is bound to the tenant id via
   * PBKDF2 salt, so even a leaked master key + leaked tenant index for tenant
   * A cannot decrypt tenant B's credentials without also leaking B's id.
   */
  async setCredential(
    id: string,
    envName: string,
    plaintext: string
  ): Promise<void> {
    assertValidTenantId(id);
    if (!envName || !/^[A-Z][A-Z0-9_]*$/.test(envName)) {
      throw new Error(
        `Invalid credential name ${JSON.stringify(envName)}: must be SCREAMING_SNAKE_CASE`
      );
    }
    const masterKey = await this.getMasterKey();
    await this.withLock(async () => {
      const index = await this.loadIndex();
      const tenant = index.tenants[id];
      if (!tenant) throw new TenantNotFoundError(id);
      tenant.credentials[envName] = {
        ciphertext: encrypt(masterKey, id, plaintext),
        updated_at: new Date().toISOString()
      };
      tenant.updated_at = new Date().toISOString();
      await this.saveIndex(index);
    });
  }

  async deleteCredential(id: string, envName: string): Promise<void> {
    assertValidTenantId(id);
    await this.withLock(async () => {
      const index = await this.loadIndex();
      const tenant = index.tenants[id];
      if (!tenant) throw new TenantNotFoundError(id);
      delete tenant.credentials[envName];
      tenant.updated_at = new Date().toISOString();
      await this.saveIndex(index);
    });
  }

  /**
   * Decrypt and return all credentials for a tenant. Callers should treat the
   * returned object as transient — never log it, never persist it, and don't
   * leave it around in the parent process env after the deploy call returns.
   */
  async loadCredentials(id: string): Promise<Record<string, string>> {
    assertValidTenantId(id);
    const masterKey = await this.getMasterKey();
    const tenant = await this.getTenant(id);
    const result: Record<string, string> = {};
    for (const [envName, blob] of Object.entries(tenant.credentials)) {
      result[envName] = decrypt(masterKey, id, blob.ciphertext);
    }
    return result;
  }

  /**
   * Resolved on-disk paths for a tenant. The tenant must exist.
   */
  async resolvePaths(id: string) {
    await this.getTenant(id);
    return resolveTenantPaths(this.baseDir, id);
  }
}
