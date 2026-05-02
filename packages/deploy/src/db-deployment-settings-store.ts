/**
 * DB-backed replacement for the YAML-based TenantStore.
 *
 * Stores per-user deployment quotas and encrypted provider credentials in
 * the `nodetool_deployment_settings` table (one row per user_id). The "tenant"
 * terminology used by the file-based code maps 1:1 to "user" — every user
 * is their own deployment tenant.
 *
 * Credential ciphertexts are bound to the user via PBKDF2 salt
 * (`encrypt(masterKey, userId, plaintext)`), so leaking one user's row plus
 * the master key does not compromise any other user's credentials.
 */

import { DeploymentSettings } from "@nodetool-ai/models";
import { encrypt, decrypt } from "@nodetool-ai/security";
import {
  TenantQuotaSchema,
  type TenantQuota,
  type EncryptedCredential,
  type TenantCredentials
} from "./tenant-config.js";

export class DeploymentSettingsNotFoundError extends Error {
  constructor(userId: string) {
    super(`Deployment settings for user ${JSON.stringify(userId)} not found`);
    this.name = "DeploymentSettingsNotFoundError";
  }
}

const ENV_NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/;

/**
 * Per-user deployment settings stored in the database. Uses the same
 * encryption primitives as the file-based `TenantStore` so existing data
 * can be migrated by a one-shot copy (see `migrate-yaml-to-db.ts`).
 */
export class DbDeploymentSettingsStore {
  private getMasterKey: () => Promise<string> | string;

  constructor(opts: { getMasterKey: () => Promise<string> | string }) {
    this.getMasterKey = opts.getMasterKey;
  }

  // -------------------------------------------------------------------------
  // Quota
  // -------------------------------------------------------------------------

  async getQuota(userId: string): Promise<TenantQuota> {
    const row = await DeploymentSettings.findByUserId(userId);
    return TenantQuotaSchema.parse(
      row ? JSON.parse(row.quota_json || "{}") : {}
    );
  }

  async setQuota(userId: string, quota: Partial<TenantQuota>): Promise<TenantQuota> {
    const existing = await this.getQuota(userId);
    const merged = TenantQuotaSchema.parse({ ...existing, ...quota });
    await DeploymentSettings.upsert({
      user_id: userId,
      quota_json: JSON.stringify(merged)
    });
    return merged;
  }

  // -------------------------------------------------------------------------
  // Credentials
  // -------------------------------------------------------------------------

  private async readCredentials(userId: string): Promise<TenantCredentials> {
    const row = await DeploymentSettings.findByUserId(userId);
    if (!row) return {};
    const raw = JSON.parse(row.credentials_json || "{}") as TenantCredentials;
    return raw;
  }

  private async writeCredentials(
    userId: string,
    creds: TenantCredentials
  ): Promise<void> {
    await DeploymentSettings.upsert({
      user_id: userId,
      credentials_json: JSON.stringify(creds)
    });
  }

  async setCredential(
    userId: string,
    envName: string,
    plaintext: string
  ): Promise<void> {
    if (!ENV_NAME_PATTERN.test(envName)) {
      throw new Error(
        `Invalid credential name ${JSON.stringify(envName)}: must be SCREAMING_SNAKE_CASE`
      );
    }
    const masterKey = await this.getMasterKey();
    const creds = await this.readCredentials(userId);
    creds[envName] = {
      ciphertext: encrypt(masterKey, userId, plaintext),
      updated_at: new Date().toISOString()
    } satisfies EncryptedCredential;
    await this.writeCredentials(userId, creds);
  }

  async deleteCredential(userId: string, envName: string): Promise<void> {
    const creds = await this.readCredentials(userId);
    delete creds[envName];
    await this.writeCredentials(userId, creds);
  }

  /**
   * Decrypt and return all credentials for a user. Treat the returned object
   * as transient — never log or persist it.
   */
  async loadCredentials(userId: string): Promise<Record<string, string>> {
    const masterKey = await this.getMasterKey();
    const creds = await this.readCredentials(userId);
    const result: Record<string, string> = {};
    for (const [envName, blob] of Object.entries(creds)) {
      result[envName] = decrypt(masterKey, userId, blob.ciphertext);
    }
    return result;
  }

  /** Names of credentials stored for a user (no plaintext exposed). */
  async listCredentialNames(userId: string): Promise<string[]> {
    const creds = await this.readCredentials(userId);
    return Object.keys(creds).sort();
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  async remove(userId: string): Promise<boolean> {
    return DeploymentSettings.remove(userId);
  }
}
