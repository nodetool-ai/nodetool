/**
 * Settings router — migrated from REST `/api/settings*`.
 *
 * - `settings.list` / `settings.update` replace GET/PUT /api/settings.
 * - `settings.secrets.list|get|upsert|delete` replace /api/settings/secrets[/:key].
 *
 * The setting definitions come from `settingCatalog()` in `@nodetool-ai/config`,
 * which its own module load populates; values come from the database.
 */

import { z } from "zod";
import {
  Secret,
  Setting,
  cleanupStorage,
  compactStorage,
  getStorageStatus,
  clearSecretCache
} from "@nodetool-ai/models";
import type { Secret as SecretModel } from "@nodetool-ai/models";
import {
  clearProviderCache,
  checkCredential,
  readCredentialEnv
} from "@nodetool-ai/runtime";
import { ApiErrorCode } from "../../error-codes.js";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import { throwApiError } from "../error-formatter.js";
import { settingCatalog } from "@nodetool-ai/config";
import type { SettingWithValue } from "../../settings-registry.js";
import {
  listOutput,
  updateInput,
  updateOutput,
  secretsListOutput,
  secretGetInput,
  secretResponse,
  secretUpsertInput,
  secretDeleteInput,
  secretDeleteOutput,
  secretValidateInput,
  secretValidateOutput,
  storageHistoryOutput,
  updateStorageHistoryInput,
  cleanupStorageHistoryOutput,
  compactStorageHistoryOutput,
  type SecretResponse
} from "@nodetool-ai/protocol/api-schemas/settings.js";
import {
  getStorageRetentionSettings,
  recordStorageCleanup,
  saveStorageRetentionPolicy
} from "../../storage-retention.js";

// ── Secret response helpers ────────────────────────────────────────

/** Build a SecretResponse from a Secret model instance. */
async function toSecretResponse(
  secret: SecretModel,
  options: { includeValue?: boolean } = {}
): Promise<SecretResponse> {
  let isUnreadable = false;
  let value: string | undefined;
  try {
    const plain = await secret.getDecryptedValue();
    if (options.includeValue) {
      value = plain;
    }
  } catch {
    isUnreadable = true;
  }
  const safe = secret.toSafeObject();
  const response: z.infer<typeof secretResponse> = {
    id: safe.id as string | undefined,
    user_id: safe.user_id as string | undefined,
    key: safe.key as string,
    description: safe.description as string | undefined,
    created_at: safe.created_at as string | undefined,
    updated_at: safe.updated_at as string | undefined,
    is_configured: true,
    is_unreadable: isUnreadable
  };
  if (value !== undefined) {
    response.value = value;
  }
  return response;
}

// ── Secrets sub-router ─────────────────────────────────────────────

const secretsRouter = router({
  list: protectedProcedure.output(secretsListOutput).query(async ({ ctx }) => {
    const [configuredSecrets] = await Secret.listForUser(ctx.userId, 1000);
    const configuredMap = new Map(configuredSecrets.map((s) => [s.key, s]));

    // Registry secrets: mark configured if in map, else unconfigured placeholder.
    const registrySecrets = settingCatalog().filter((d) => d.isSecret);
    const normalizedResults: SecretResponse[] = await Promise.all(
      registrySecrets.map(async (def) => {
        const configured = configuredMap.get(def.envVar);
        if (configured) {
          return toSecretResponse(configured);
        }
        return {
          key: def.envVar,
          user_id: ctx.userId,
          description: def.description ?? "",
          is_configured: false,
          is_unreadable: false
        };
      })
    );

    // DB secrets not in the registry.
    const registrySecretKeys = new Set(registrySecrets.map((d) => d.envVar));
    const extraSecrets = configuredSecrets.filter((s) => !registrySecretKeys.has(s.key));
    const extraResponses = await Promise.all(extraSecrets.map((s) => toSecretResponse(s)));
    normalizedResults.push(...extraResponses);

    return { secrets: normalizedResults, next_key: null };
  }),

  get: protectedProcedure
    .input(secretGetInput)
    .output(secretResponse)
    .query(async ({ ctx, input }) => {
      const secret = await Secret.find(ctx.userId, input.key);
      if (!secret) {
        throwApiError(ApiErrorCode.NOT_FOUND, "Secret not found");
      }
      return toSecretResponse(secret, { includeValue: input.decrypt });
    }),

  upsert: protectedProcedure
    .input(secretUpsertInput)
    .output(secretResponse)
    .mutation(async ({ ctx, input }) => {
      const upsertInput: Parameters<typeof Secret.upsert>[0] = {
        userId: ctx.userId,
        key: input.key,
        value: input.value
      };
      if (input.description !== undefined) {
        upsertInput.description = input.description;
      }
      const secret = await Secret.upsert(upsertInput);
      clearSecretCache(ctx.userId, input.key);
      clearProviderCache();
      return toSecretResponse(secret);
    }),

  delete: protectedProcedure
    .input(secretDeleteInput)
    .output(secretDeleteOutput)
    .mutation(async ({ ctx, input }) => {
      const deleted = await Secret.deleteSecret(ctx.userId, input.key);
      if (!deleted) {
        throwApiError(ApiErrorCode.NOT_FOUND, "Secret not found");
      }
      clearSecretCache(ctx.userId, input.key);
      clearProviderCache();
      return { message: "Secret deleted successfully" };
    }),

  /**
   * Spend one small request against the provider to find out whether a
   * credential works. With no `value`, the stored key (or the process env
   * fallback the runtime would use) is checked instead — that's the "Test
   * connection" case. Never throws on a bad key: an unusable credential is a
   * result, not a server error.
   */
  validate: protectedProcedure
    .input(secretValidateInput)
    .output(secretValidateOutput)
    .mutation(async ({ ctx, input }) => {
      let value = input.value?.trim();
      if (!value) {
        const secret = await Secret.find(ctx.userId, input.key);
        if (secret) {
          try {
            value = (await secret.getDecryptedValue()) ?? undefined;
          } catch {
            // An undecryptable secret is unusable, and saying so is more
            // useful than a decryption stack trace.
            return {
              status: "invalid" as const,
              valid: false,
              message:
                "The stored key could not be decrypted. Enter it again to replace it."
            };
          }
        }
        value = value || readCredentialEnv(input.key);
      }
      if (!value) {
        return {
          status: "invalid" as const,
          valid: false,
          message: `No key is stored for ${input.key}.`
        };
      }

      const result = await checkCredential(input.key, value);
      return {
        status: result.status,
        valid: result.status === "valid",
        message: result.message
      };
    })
});

const historyRouter = router({
  get: protectedProcedure
    .output(storageHistoryOutput)
    .query(async ({ ctx }) => {
      const settings = await getStorageRetentionSettings(ctx.userId);
      return {
        policy: settings.policy,
        status: await getStorageStatus(ctx.userId, settings.policy),
        lastCleanupAt: settings.lastCleanupAt
      };
    }),

  update: protectedProcedure
    .input(updateStorageHistoryInput)
    .output(storageHistoryOutput)
    .mutation(async ({ ctx, input }) => {
      await saveStorageRetentionPolicy(ctx.userId, input);
      const settings = await getStorageRetentionSettings(ctx.userId);
      return {
        policy: settings.policy,
        status: await getStorageStatus(ctx.userId, settings.policy),
        lastCleanupAt: settings.lastCleanupAt
      };
    }),

  cleanup: protectedProcedure
    .output(cleanupStorageHistoryOutput)
    .mutation(async ({ ctx }) => {
      const { policy } = await getStorageRetentionSettings(ctx.userId);
      const deleted = await cleanupStorage(ctx.userId, policy);
      await recordStorageCleanup(ctx.userId, deleted.completedAt);
      return {
        deleted,
        status: await getStorageStatus(ctx.userId, policy)
      };
    }),

  compact: protectedProcedure
    .output(compactStorageHistoryOutput)
    .mutation(async ({ ctx }) => {
      const { policy } = await getStorageRetentionSettings(ctx.userId);
      await compactStorage();
      return { status: await getStorageStatus(ctx.userId, policy) };
    })
});

// ── Root settings router ───────────────────────────────────────────

export const settingsRouter = router({
  list: protectedProcedure.output(listOutput).query(async ({ ctx }) => {
    const userSettings = await Setting.listForUser(ctx.userId);
    const settingsMap = new Map(userSettings.map((s) => [s.key, s.value]));

    // Fetch all secrets once and build a lookup map to avoid N+1 queries.
    const [userSecrets] = await Secret.listForUser(ctx.userId, 1000);
    const secretsMap = new Map(userSecrets.map((s) => [s.key, s]));

    const result: SettingWithValue[] = [];

    // Non-secret settings: read from DB then env.
    for (const def of settingCatalog()) {
      if (def.isSecret) continue;
      result.push({
        package_name: def.packageName,
        env_var: def.envVar,
        group: def.group,
        description: def.description,
        enum: def.enum ?? null,
        value: settingsMap.get(def.envVar) ?? process.env[def.envVar] ?? null,
        is_secret: false
      });
    }

    // Secrets: "****" if configured (DB or env), null otherwise.
    for (const def of settingCatalog()) {
      if (!def.isSecret) continue;
      const hasSecret = secretsMap.has(def.envVar);
      const hasEnvVar = Boolean(process.env[def.envVar]);
      result.push({
        package_name: def.packageName,
        env_var: def.envVar,
        group: def.group,
        description: def.description,
        enum: null,
        value: hasSecret || hasEnvVar ? "****" : null,
        is_secret: true
      });
    }

    return { settings: result };
  }),

  update: protectedProcedure
    .input(updateInput)
    .output(updateOutput)
    .mutation(async ({ ctx, input }) => {
      // Non-secret settings → Setting.upsert
      if (input.settings) {
        for (const [key, value] of Object.entries(input.settings)) {
          await Setting.upsert({
            userId: ctx.userId,
            key,
            value: String(value ?? "")
          });
        }
      }

      // Secrets: skip the unchanged-display placeholder, upsert the rest,
      // invalidate caches. settings.list emits the fixed literal "****" for a
      // configured secret, so match that exact string — treating ANY all-
      // asterisk value as the mask silently dropped legitimate secrets that
      // happen to be asterisks (e.g. an 8-char "********").
      const SECRET_MASK = "****";
      if (input.secrets) {
        for (const [key, value] of Object.entries(input.secrets)) {
          if (value === SECRET_MASK) {
            continue;
          }
          await Secret.upsert({
            userId: ctx.userId,
            key,
            value: String(value ?? ""),
            description: `Secret for ${key}`
          });
          clearSecretCache(ctx.userId, key);
          clearProviderCache();
        }
      }

      return { message: "Settings updated successfully" };
    }),

  secrets: secretsRouter,
  history: historyRouter
});
