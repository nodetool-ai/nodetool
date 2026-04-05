/**
 * Debug export API — T-WS-13.
 *
 * POST /api/debug/export — returns system diagnostics, provider info,
 * and environment configuration with secrets redacted.
 */

import { diagnoseEnvironment, type DiagnosticResult } from "@nodetool/config";
import {
  getRegisteredSettings,
  type SettingDefinition
} from "./settings-api.js";

/**
 * Common API key patterns to redact from string values.
 */
const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{10,}/g, // OpenAI
  /hf_[A-Za-z0-9]{10,}/g, // HuggingFace
  /r8_[A-Za-z0-9]{10,}/g, // Replicate
  /fal_[A-Za-z0-9_-]{10,}/g, // FAL
  /key-[A-Za-z0-9_-]{10,}/g, // Generic key- prefix
  /Bearer\s+[A-Za-z0-9._-]{20,}/g, // Bearer tokens
  /ghp_[A-Za-z0-9]{30,}/g, // GitHub personal tokens
  /gho_[A-Za-z0-9]{30,}/g, // GitHub OAuth tokens
  /xox[bpsar]-[A-Za-z0-9-]{10,}/g // Slack tokens
];

/**
 * Recursively scan all string values in an object and redact
 * anything matching common API key patterns.
 */
export function redactSecrets(value: unknown): unknown {
  if (typeof value === "string") {
    let redacted = value;
    for (const pattern of SECRET_PATTERNS) {
      // Reset lastIndex since we're reusing RegExp objects with /g flag
      pattern.lastIndex = 0;
      redacted = redacted.replace(pattern, "***REDACTED***");
    }
    return redacted;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item));
  }

  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      result[key] = redactSecrets(val);
    }
    return result;
  }

  return value;
}

export interface DebugExportResponse {
  diagnostics: DiagnosticResult[];
  system: {
    platform: string;
    arch: string;
    nodeVersion: string;
    uptime: number;
    memoryUsage: NodeJS.MemoryUsage;
  };
  providers: string[];
  timestamp: string;
}

/**
 * Build the debug export payload.
 *
 * @param providerIds Optional list of registered provider IDs.
 *   If not supplied, defaults to the keys from the settings registry
 *   that look like provider entries (group-based heuristic).
 */
export function buildDebugExport(providerIds?: string[]): DebugExportResponse {
  // Convert websocket SettingDefinitions to config SettingStatus format
  const wsSettings = getRegisteredSettings();
  const settingStatuses = wsSettings.map((def: SettingDefinition) => ({
    package: def.packageName,
    envVar: def.envVar,
    group: def.group,
    description: def.description,
    isSecret: def.isSecret ?? false,
    configured: !!process.env[def.envVar]
  }));

  const diagnostics = diagnoseEnvironment(settingStatuses);

  const system = {
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage()
  };

  const providers = providerIds ?? [];

  return {
    diagnostics,
    system,
    providers,
    timestamp: new Date().toISOString()
  };
}

function jsonResponse(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    status: init?.status ?? 200,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {})
    }
  });
}

function errorResponse(status: number, detail: string): Response {
  return jsonResponse({ detail }, { status });
}

/**
 * Handle POST /api/debug/export.
 */
export async function handleDebugExportRequest(
  request: Request,
  providerIds?: string[]
): Promise<Response> {
  // Debug export leaks system info — disabled in production
  if (process.env["NODETOOL_ENV"] === "production") {
    return errorResponse(403, "Debug export is disabled in production");
  }

  if (request.method !== "POST") {
    return errorResponse(405, "Method not allowed");
  }

  const payload = buildDebugExport(providerIds);
  const redacted = redactSecrets(payload);
  return jsonResponse(redacted);
}
