/**
 * Settings API — REST handlers for /api/settings (GET, PUT).
 *
 * Registry + defaults moved to `settings-registry.ts` so both the tRPC router
 * and the remaining REST secrets handlers in `http-api.ts` can consume them.
 * This file will be deleted once all REST callers are migrated.
 */

import { readFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { Secret, Setting, clearSecretCache } from "@nodetool/models";
import { clearProviderCache } from "@nodetool/runtime";
import { createLogger } from "@nodetool/config";

import {
  getRegisteredSettings,
  type SettingWithValue
} from "./settings-registry.js";

// Re-export registry + types so consumers importing from `./settings-api.js`
// continue to resolve during the migration window.
export {
  registerSetting,
  getRegisteredSettings,
  getSetting,
  type SettingDefinition,
  type SettingWithValue
} from "./settings-registry.js";

const log = createLogger("nodetool.settings-api");

interface SettingsHandlerOptions {
  userIdHeader?: string;
}

// ── One-time migration from settings.json ──────────────────────────

let migrationDone = false;

function legacySettingsFilePath(): string {
  const platform = process.platform;
  if (platform === "win32") {
    const appdata =
      process.env.APPDATA ?? join(homedir(), "AppData", "Roaming");
    return join(appdata, "nodetool", "settings.json");
  }
  return join(homedir(), ".config", "nodetool", "settings.json");
}

async function migrateSettingsFromFile(userId: string): Promise<void> {
  if (migrationDone) return;
  migrationDone = true;

  const filePath = legacySettingsFilePath();
  try {
    const data = await readFile(filePath, "utf8");
    const settings = JSON.parse(data) as Record<string, unknown>;
    for (const [key, value] of Object.entries(settings)) {
      if (typeof value === "string" && value.length > 0) {
        await Setting.upsert({ userId, key, value });
      }
    }
    await rename(filePath, filePath + ".migrated");
    log.info("Migrated settings.json to DB", {
      count: Object.keys(settings).length
    });
  } catch {
    // File doesn't exist or is unreadable — nothing to migrate
  }
}

// ── Helpers ────────────────────────────────────────────────────────

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function errorResponse(status: number, detail: string): Response {
  return jsonResponse({ detail }, status);
}

// ── Handlers ───────────────────────────────────────────────────────

async function handleGetSettings(userId: string): Promise<Response> {
  await migrateSettingsFromFile(userId);

  const userSettings = await Setting.listForUser(userId);
  const settingsMap = new Map(userSettings.map((s) => [s.key, s.value]));
  const result: SettingWithValue[] = [];

  // Non-secret settings: read from DB then env
  for (const def of getRegisteredSettings()) {
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

  // Secrets: query DB then env; "****" if configured, null otherwise
  for (const def of getRegisteredSettings()) {
    if (!def.isSecret) continue;
    const secret = await Secret.find(userId, def.envVar);
    const hasEnvVar = Boolean(process.env[def.envVar]);
    result.push({
      package_name: def.packageName,
      env_var: def.envVar,
      group: def.group,
      description: def.description,
      enum: null,
      value: secret || hasEnvVar ? "****" : null,
      is_secret: true
    });
  }

  return jsonResponse({ settings: result });
}

async function handleUpdateSettings(
  request: Request,
  userId: string
): Promise<Response> {
  let body: {
    settings?: Record<string, unknown>;
    secrets?: Record<string, unknown>;
  };
  try {
    body = (await request.json()) as {
      settings?: Record<string, unknown>;
      secrets?: Record<string, unknown>;
    };
  } catch {
    return errorResponse(400, "Invalid JSON body");
  }

  // Save non-secret settings to DB
  if (body.settings) {
    for (const [key, value] of Object.entries(body.settings)) {
      await Setting.upsert({ userId, key, value: String(value ?? "") });
    }
  }

  // Save secrets to DB (skip "****" placeholder values)
  let secretsChanged = false;
  if (body.secrets) {
    for (const [key, value] of Object.entries(body.secrets)) {
      if (typeof value === "string" && value.split("").every((c) => c === "*"))
        continue;
      await Secret.upsert({
        userId,
        key,
        value: String(value ?? ""),
        description: `Secret for ${key}`
      });
      clearSecretCache(userId, key);
      secretsChanged = true;
    }
  }

  if (secretsChanged) {
    clearProviderCache();
  }

  return jsonResponse({ message: "Settings updated successfully" });
}

// ── Main export ────────────────────────────────────────────────────

export async function handleSettingsRequest(
  request: Request,
  pathname: string,
  options: SettingsHandlerOptions
): Promise<Response | null> {
  // Only handle /api/settings (not /api/settings/secrets which is handled by http-api.ts)
  if (pathname !== "/api/settings") return null;

  const userId =
    request.headers.get(options.userIdHeader ?? "x-user-id") ??
    request.headers.get("x-user-id") ??
    "1";

  if (request.method === "GET") {
    return handleGetSettings(userId);
  }
  if (request.method === "PUT") {
    return handleUpdateSettings(request, userId);
  }
  return errorResponse(405, "Method not allowed");
}
