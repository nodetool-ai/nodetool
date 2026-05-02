/**
 * Per-user deployment quota and encrypted credential schema.
 *
 * Mirrors the column shape of `nodetool_deployment_settings` (one row per
 * user). Quotas cap a single user's blast radius — they cannot create more
 * deployments than `max_deployments`, run wider RunPod endpoints than
 * `max_workers_per_endpoint`, or use disallowed providers/GPU types.
 *
 * Provider credentials are stored encrypted at rest with
 * `encrypt(masterKey, user_id, plaintext)` so each user has their own
 * derived key — leaking one user's row plus the master key cannot decrypt
 * another user's credentials.
 */

import { z } from "zod";

/**
 * Per-user deployment quota.
 */
export const DeploymentQuotaSchema = z.object({
  /** Maximum number of concurrent deployments a user may register. */
  max_deployments: z.number().int().nonnegative().default(5),
  /** Cap on RunPod `workers_max` (and similar autoscaling caps). */
  max_workers_per_endpoint: z.number().int().nonnegative().default(3),
  /** Cap on RunPod `gpu_count` per endpoint. 0 means CPU-only. */
  max_gpu_count_per_endpoint: z.number().int().nonnegative().default(1),
  /**
   * Allowed deployment backends. Empty array means "all providers
   * enabled at the server level". Use this to restrict a user to e.g.
   * just `runpod`.
   */
  allowed_providers: z
    .array(
      z.enum(["docker", "runpod", "gcp", "fly", "railway", "huggingface"])
    )
    .default([]),
  /**
   * Allowed GPU types for RunPod (e.g. `ADA_24`). Empty means no
   * restriction. Use this to keep users off premium GPUs.
   */
  allowed_gpu_types: z.array(z.string()).default([])
});
export type DeploymentQuota = z.infer<typeof DeploymentQuotaSchema>;

/**
 * Ciphertext is the base64 output of `encrypt(masterKey, user_id, plaintext)`
 * from `@nodetool-ai/security`.
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
export const UserCredentialsSchema = z
  .record(z.string(), EncryptedCredentialSchema)
  .default({});
export type UserCredentials = z.infer<typeof UserCredentialsSchema>;
