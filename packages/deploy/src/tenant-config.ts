/**
 * Multi-tenant deployment data model.
 *
 * Defines the on-disk schema for tenants that share a single Docker host but
 * deploy in isolation to backends like RunPod. A tenant carries:
 *  - an immutable id (used as the PBKDF2 salt for credential encryption)
 *  - a display name and creation timestamp
 *  - encrypted provider credentials (e.g. RUNPOD_API_KEY) — never stored in plaintext
 *  - quotas that cap the blast radius of a single tenant
 *  - a status flag so a compromised or over-quota tenant can be frozen
 *
 * The runtime tenant config (the per-tenant `deployment.yaml`) reuses the
 * existing `DeploymentConfig` schema unchanged.
 */

import { z } from "zod";
import * as path from "path";
import * as os from "os";

// ============================================================================
// Tenant id validation
// ============================================================================

/**
 * Tenant ids are used as filesystem path components, audit-log keys, and the
 * PBKDF2 salt for credential encryption. The pattern excludes path separators,
 * leading/trailing dashes, and uppercase characters so ids are stable across
 * case-insensitive filesystems.
 */
export const TENANT_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

export class InvalidTenantIdError extends Error {
  constructor(id: string) {
    super(
      `Invalid tenant id ${JSON.stringify(id)}: must match ${TENANT_ID_PATTERN.source}`
    );
    this.name = "InvalidTenantIdError";
  }
}

export function assertValidTenantId(id: string): void {
  if (!TENANT_ID_PATTERN.test(id)) {
    throw new InvalidTenantIdError(id);
  }
}

// ============================================================================
// Quota schema
// ============================================================================

/**
 * Per-tenant quotas. These are enforced before delegating to the underlying
 * deployer, so a misconfigured tenant cannot exceed them even if their
 * `deployment.yaml` requests more.
 */
export const TenantQuotaSchema = z.object({
  /** Maximum number of concurrent deployments a tenant may register. */
  max_deployments: z.number().int().nonnegative().default(5),
  /** Cap on RunPod `workers_max` (and similar autoscaling caps). */
  max_workers_per_endpoint: z.number().int().nonnegative().default(3),
  /** Cap on RunPod `gpu_count` per endpoint. 0 means CPU-only. */
  max_gpu_count_per_endpoint: z.number().int().nonnegative().default(1),
  /**
   * Allowed deployment backends. Empty array means "all enabled at the
   * server level". Use this to restrict tenants to e.g. just `runpod`.
   */
  allowed_providers: z
    .array(
      z.enum(["docker", "runpod", "gcp", "fly", "railway", "huggingface"])
    )
    .default([]),
  /**
   * Allowed GPU types for RunPod (e.g. `ADA_24`). Empty means "no
   * restriction". Use this to keep tenants off premium GPUs.
   */
  allowed_gpu_types: z.array(z.string()).default([])
});
export type TenantQuota = z.infer<typeof TenantQuotaSchema>;

// ============================================================================
// Encrypted credential schema
// ============================================================================

/**
 * Ciphertext is the base64 output of `encrypt(masterKey, tenant.id, plaintext)`
 * from `@nodetool-ai/security`. The key is derived per-tenant, so leaking one
 * tenant's encrypted blob does not compromise another tenant's credentials.
 */
export const EncryptedCredentialSchema = z.object({
  ciphertext: z.string().min(1),
  /** Last-rotation timestamp, ISO 8601. */
  updated_at: z.string()
});
export type EncryptedCredential = z.infer<typeof EncryptedCredentialSchema>;

/**
 * Provider credentials, keyed by the env-var name the deployer expects
 * (e.g. `RUNPOD_API_KEY`, `DOCKER_PASSWORD`).
 */
export const TenantCredentialsSchema = z
  .record(z.string(), EncryptedCredentialSchema)
  .default({});
export type TenantCredentials = z.infer<typeof TenantCredentialsSchema>;

// ============================================================================
// Tenant record schema
// ============================================================================

export const TenantStatus = {
  ACTIVE: "active",
  SUSPENDED: "suspended"
} as const;
export type TenantStatus = (typeof TenantStatus)[keyof typeof TenantStatus];

export const TenantRecordSchema = z.object({
  id: z.string().regex(TENANT_ID_PATTERN),
  display_name: z.string().min(1),
  created_at: z.string(),
  updated_at: z.string(),
  status: z.enum(["active", "suspended"]).default("active"),
  quota: TenantQuotaSchema.default(() => TenantQuotaSchema.parse({})),
  credentials: TenantCredentialsSchema
});
export type TenantRecord = z.infer<typeof TenantRecordSchema>;

export const TenantIndexSchema = z.object({
  version: z.string().default("1.0"),
  tenants: z.record(z.string(), TenantRecordSchema).default({})
});
export type TenantIndex = z.infer<typeof TenantIndexSchema>;

export function parseTenantIndex(data: unknown): TenantIndex {
  return TenantIndexSchema.parse(data);
}

// ============================================================================
// Path helpers
// ============================================================================

/** Default base directory for tenant data, mirroring `getDeploymentConfigPath`. */
export function getDefaultTenantBaseDir(configDir?: string): string {
  if (configDir) return path.join(configDir, "tenants");
  const plat = process.platform;
  if (plat === "darwin") {
    return path.join(
      os.homedir(),
      "Library",
      "Application Support",
      "nodetool",
      "tenants"
    );
  }
  if (plat === "win32") {
    const appData = process.env.APPDATA;
    return appData
      ? path.join(appData, "nodetool", "tenants")
      : path.join(os.homedir(), ".config", "nodetool", "tenants");
  }
  return process.env.XDG_CONFIG_HOME
    ? path.join(process.env.XDG_CONFIG_HOME, "nodetool", "tenants")
    : path.join(os.homedir(), ".config", "nodetool", "tenants");
}

/** Resolved paths for one tenant's on-disk artifacts. */
export interface TenantPaths {
  /** Base directory containing all tenants. */
  base: string;
  /** Tenant index file (the registry). */
  index: string;
  /** This tenant's directory. */
  dir: string;
  /** Per-tenant deployment.yaml. */
  deployment: string;
  /** Append-only JSONL audit log. */
  audit: string;
}

export function resolveTenantPaths(baseDir: string, id: string): TenantPaths {
  assertValidTenantId(id);
  const dir = path.join(baseDir, id);
  return {
    base: baseDir,
    index: path.join(baseDir, "index.yaml"),
    dir,
    deployment: path.join(dir, "deployment.yaml"),
    audit: path.join(dir, "audit.jsonl")
  };
}
