import {
  cleanupStorage,
  DEFAULT_STORAGE_RETENTION_POLICY,
  Setting,
  type StorageCleanupResult,
  type StorageRetentionPolicy
} from "@nodetool-ai/models";

const KEYS = {
  maxAutosavesPerWorkflow: "storage.retention.maxAutosavesPerWorkflow",
  autosaveRetentionDays: "storage.retention.autosaveRetentionDays",
  manualVersionRetentionDays: "storage.retention.manualVersionRetentionDays",
  terminalJobRetentionDays: "storage.retention.terminalJobRetentionDays",
  runEventRetentionDays: "storage.retention.runEventRetentionDays",
  predictionRetentionDays: "storage.retention.predictionRetentionDays",
  automaticCleanup: "storage.retention.automaticCleanup",
  lastCleanupAt: "storage.retention.lastCleanupAt"
} as const;

function boundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

export async function getStorageRetentionSettings(userId: string): Promise<{
  policy: StorageRetentionPolicy;
  lastCleanupAt: string | null;
}> {
  const values = new Map(
    (await Setting.listForUser(userId)).map((setting) => [
      setting.key,
      setting.value
    ])
  );
  return {
    policy: {
      maxAutosavesPerWorkflow: boundedInteger(
        values.get(KEYS.maxAutosavesPerWorkflow),
        DEFAULT_STORAGE_RETENTION_POLICY.maxAutosavesPerWorkflow,
        1,
        500
      ),
      autosaveRetentionDays: boundedInteger(
        values.get(KEYS.autosaveRetentionDays),
        DEFAULT_STORAGE_RETENTION_POLICY.autosaveRetentionDays,
        1,
        3650
      ),
      manualVersionRetentionDays: boundedInteger(
        values.get(KEYS.manualVersionRetentionDays),
        DEFAULT_STORAGE_RETENTION_POLICY.manualVersionRetentionDays,
        1,
        3650
      ),
      terminalJobRetentionDays: boundedInteger(
        values.get(KEYS.terminalJobRetentionDays),
        DEFAULT_STORAGE_RETENTION_POLICY.terminalJobRetentionDays,
        1,
        3650
      ),
      runEventRetentionDays: boundedInteger(
        values.get(KEYS.runEventRetentionDays),
        DEFAULT_STORAGE_RETENTION_POLICY.runEventRetentionDays ?? 30,
        1,
        3650
      ),
      predictionRetentionDays: boundedInteger(
        values.get(KEYS.predictionRetentionDays),
        DEFAULT_STORAGE_RETENTION_POLICY.predictionRetentionDays ?? 400,
        1,
        3650
      ),
      automaticCleanup:
        values.get(KEYS.automaticCleanup) === undefined
          ? DEFAULT_STORAGE_RETENTION_POLICY.automaticCleanup
          : values.get(KEYS.automaticCleanup) === "true"
    },
    lastCleanupAt: values.get(KEYS.lastCleanupAt) ?? null
  };
}

export async function saveStorageRetentionPolicy(
  userId: string,
  policy: StorageRetentionPolicy
): Promise<void> {
  await Promise.all(
    (Object.keys(policy) as Array<keyof StorageRetentionPolicy>)
      // The two retention windows are optional on the policy type; a key
      // present with an undefined value would persist the string "undefined".
      .filter((key) => policy[key] !== undefined)
      .map((key) =>
        Setting.upsert({
          userId,
          key: KEYS[key],
          value: String(policy[key]),
          description: "Database history retention policy"
        })
      )
  );
}

export async function recordStorageCleanup(
  userId: string,
  completedAt: string
): Promise<void> {
  await Setting.upsert({
    userId,
    key: KEYS.lastCleanupAt,
    value: completedAt,
    description: "Last database history cleanup"
  });
}

const AUTOMATIC_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

export async function runAutomaticStorageCleanup(
  userId: string,
  now = new Date()
): Promise<StorageCleanupResult | null> {
  const settings = await getStorageRetentionSettings(userId);
  if (!settings.policy.automaticCleanup) return null;
  if (settings.lastCleanupAt) {
    const lastCleanupTime = Date.parse(settings.lastCleanupAt);
    if (
      Number.isFinite(lastCleanupTime) &&
      now.getTime() - lastCleanupTime < AUTOMATIC_CLEANUP_INTERVAL_MS
    ) {
      return null;
    }
  }
  const result = await cleanupStorage(userId, settings.policy, now);
  await recordStorageCleanup(userId, result.completedAt);
  return result;
}
