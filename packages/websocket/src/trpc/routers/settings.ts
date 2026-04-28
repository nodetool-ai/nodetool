/**
 * Settings router — migrated from REST `/api/settings*`.
 *
 * - `settings.list` / `settings.update` replace GET/PUT /api/settings.
 * - `settings.secrets.list|get|upsert|delete` replace /api/settings/secrets[/:key].
 *
 * Relies on the registry in `../../settings-registry.ts` (side-effect import
 * populates the registry at module load time).
 */

import { Secret, Setting, clearSecretCache } from "@nodetool-ai/models";
import type { Secret as SecretModel } from "@nodetool-ai/models";
import { clearProviderCache } from "@nodetool-ai/runtime";
import { ApiErrorCode } from "../../error-codes.js";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import { throwApiError } from "../error-formatter.js";
import {
  getRegisteredSettings,
  type SettingWithValue
} from "../../settings-registry.js";
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
  type SecretResponse
} from "@nodetool-ai/protocol/api-schemas/settings.js";

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
  return {
    id: safe.id as string | undefined,
    user_id: safe.user_id as string | undefined,
    key: safe.key as string,
    description: safe.description as string | undefined,
    created_at: safe.created_at as string | undefined,
    updated_at: safe.updated_at as string | undefined,
    is_configured: true,
    is_unreadable: isUnreadable,
    ...(value !== undefined ? { value } : {})
  };
}

// ── Secrets sub-router ─────────────────────────────────────────────

const secretsRouter = router({
  list: protectedProcedure.output(secretsListOutput).query(async ({ ctx }) => {
    const [configuredSecrets] = await Secret.listForUser(ctx.userId, 1000);
    const configuredMap = new Map(configuredSecrets.map((s) => [s.key, s]));

    // Registry secrets: mark configured if in map, else unconfigured placeholder.
    const registrySecrets = getRegisteredSettings().filter((d) => d.isSecret);
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
    for (const s of configuredSecrets) {
      if (!registrySecrets.some((d) => d.envVar === s.key)) {
        normalizedResults.push(await toSecretResponse(s));
      }
    }

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
      const secret = await Secret.upsert({
        userId: ctx.userId,
        key: input.key,
        value: input.value,
        ...(input.description !== undefined
          ? { description: input.description }
          : {})
      });
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
    for (const def of getRegisteredSettings()) {
      if (def.isSecret) continue;
      result.push({
        package_name: def.packageName,
        env_var: def.envVar,
        group: def.group,
        description: def.description,
        enum: def.enum ?? null,
        value:
          settingsMap.get(def.envVar) ?? process.env[def.envVar] ?? null,
        is_secret: false
      });
    }

    // Secrets: "****" if configured (DB or env), null otherwise.
    for (const def of getRegisteredSettings()) {
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

      // Secrets: skip "****" placeholders, upsert the rest, invalidate caches.
      let secretsChanged = false;
      if (input.secrets) {
        for (const [key, value] of Object.entries(input.secrets)) {
          if (
            typeof value === "string" &&
            value.length > 0 &&
            value.split("").every((c) => c === "*")
          ) {
            continue;
          }
          await Secret.upsert({
            userId: ctx.userId,
            key,
            value: String(value ?? ""),
            description: `Secret for ${key}`
          });
          clearSecretCache(ctx.userId, key);
          secretsChanged = true;
        }
      }

      if (secretsChanged) {
        clearProviderCache();
      }

      return { message: "Settings updated successfully" };
    }),

  secrets: secretsRouter
});
