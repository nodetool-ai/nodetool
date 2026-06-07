/**
 * Per-user deployment settings: quotas only.
 *
 * Stores one row per user in `nodetool_deployment_settings`. Provider
 * credentials are NO LONGER stored here — they are ordinary per-user secrets
 * (the `Secret` model), keyed by env name. This store is quota-only.
 */

import { DeploymentSettings } from "@nodetool-ai/models";
import {
  DeploymentQuotaSchema,
  type DeploymentQuota
} from "./deployment-quota.js";

export class DbDeploymentSettingsStore {
  // -------------------------------------------------------------------------
  // Quota
  // -------------------------------------------------------------------------

  async getQuota(userId: string): Promise<DeploymentQuota> {
    const row = await DeploymentSettings.findByUserId(userId);
    return DeploymentQuotaSchema.parse(
      row ? JSON.parse(row.quota_json || "{}") : {}
    );
  }

  async setQuota(
    userId: string,
    quota: Partial<DeploymentQuota>
  ): Promise<DeploymentQuota> {
    const existing = await this.getQuota(userId);
    const merged = DeploymentQuotaSchema.parse({ ...existing, ...quota });
    await DeploymentSettings.upsert({
      user_id: userId,
      quota_json: JSON.stringify(merged)
    });
    return merged;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  async remove(userId: string): Promise<boolean> {
    return DeploymentSettings.remove(userId);
  }
}
