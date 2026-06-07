/**
 * Per-user deployment quota schema and enforcement.
 *
 * Mirrors the `quota_json` column of `nodetool_deployment_settings` (one row
 * per user). Quotas cap a single user's blast radius — they cannot create more
 * deployments than `max_deployments`, run wider RunPod endpoints than
 * `max_workers_per_endpoint`, or use disallowed providers/GPU types.
 *
 * Provider credentials are NOT stored here anymore: deployment credentials are
 * ordinary per-user secrets (the `Secret` model), keyed by env name. The
 * settings store is quota-only.
 *
 * This module also owns quota enforcement (`findQuotaViolations`,
 * `assertQuotaOk`) and the related errors so the user-deployment-manager stays
 * orchestration-only.
 */

import { z } from "zod";
import type { AnyDeployment, RunPodDeployment } from "./deployment-config.js";

// ============================================================================
// Quota schema
// ============================================================================

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

// ============================================================================
// Errors
// ============================================================================

export class QuotaExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuotaExceededError";
  }
}

export class ProviderNotAllowedError extends Error {
  constructor(provider: string) {
    super(`Provider ${JSON.stringify(provider)} is not allowed for this user`);
    this.name = "ProviderNotAllowedError";
  }
}

// ============================================================================
// Enforcement
// ============================================================================

/**
 * Check a deployment object against a user's quota. Returns a list of
 * violations; an empty list means the deployment is acceptable.
 */
export function findQuotaViolations(
  deployment: AnyDeployment,
  quota: DeploymentQuota
): string[] {
  const violations: string[] = [];

  if (
    quota.allowed_providers.length > 0 &&
    !quota.allowed_providers.includes(deployment.type)
  ) {
    violations.push(
      `provider ${deployment.type} not in allowed list [${quota.allowed_providers.join(", ")}]`
    );
  }

  if (deployment.type === "runpod") {
    const d = deployment as RunPodDeployment;
    if (d.workers_max > quota.max_workers_per_endpoint) {
      violations.push(
        `workers_max (${d.workers_max}) exceeds quota (${quota.max_workers_per_endpoint})`
      );
    }
    const requestedGpu = d.gpu_count ?? 0;
    if (requestedGpu > quota.max_gpu_count_per_endpoint) {
      violations.push(
        `gpu_count (${requestedGpu}) exceeds quota (${quota.max_gpu_count_per_endpoint})`
      );
    }
    if (quota.allowed_gpu_types.length > 0) {
      const disallowed = d.gpu_types.filter(
        (g) => !quota.allowed_gpu_types.includes(g)
      );
      if (disallowed.length > 0) {
        violations.push(
          `gpu_types [${disallowed.join(", ")}] not in allowed list [${quota.allowed_gpu_types.join(", ")}]`
        );
      }
    }
  }

  return violations;
}

/**
 * Throw a {@link QuotaExceededError} if the deployment violates the quota.
 */
export function assertQuotaOk(
  deployment: AnyDeployment,
  quota: DeploymentQuota
): void {
  const violations = findQuotaViolations(deployment, quota);
  if (violations.length > 0) {
    throw new QuotaExceededError(violations.join("; "));
  }
}
