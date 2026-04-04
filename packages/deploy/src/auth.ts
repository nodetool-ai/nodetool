/**
 * Authentication module for NodeTool server deployments.
 *
 * Provides simple token-based authentication for securing server endpoints
 * when deployed in Docker or other production environments.
 *
 * The token is auto-generated on first run and saved to a deployment config file.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { randomBytes, timingSafeEqual } from "node:crypto";
import * as yaml from "js-yaml";

/** Deployment config file path (used by auth module). */
export const AUTH_DEPLOYMENT_CONFIG_FILE = join(
  homedir(),
  ".config",
  "nodetool",
  "deployment.yaml"
);

/**
 * Generate a cryptographically secure random token.
 *
 * @returns A URL-safe base64-encoded token (32 bytes).
 */
export function generateSecureToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Load deployment configuration from YAML file.
 *
 * @returns Dictionary with deployment config, empty object if file does not exist.
 */
export function loadAuthConfig(): Record<string, unknown> {
  if (!existsSync(AUTH_DEPLOYMENT_CONFIG_FILE)) {
    return {};
  }

  try {
    const content = readFileSync(AUTH_DEPLOYMENT_CONFIG_FILE, "utf-8");
    const config = yaml.load(content, { schema: yaml.JSON_SCHEMA });
    return (config as Record<string, unknown>) ?? {};
  } catch {
    return {};
  }
}

/**
 * Save deployment configuration to YAML file.
 *
 * @param config - Dictionary with deployment configuration.
 */
export function saveAuthConfig(config: Record<string, unknown>): void {
  const dir = dirname(AUTH_DEPLOYMENT_CONFIG_FILE);
  mkdirSync(dir, { recursive: true });

  const content = yaml.dump(config, { flowLevel: -1 });
  writeFileSync(AUTH_DEPLOYMENT_CONFIG_FILE, content, {
    encoding: "utf-8",
    mode: 0o600
  });
}

/**
 * Get the server authentication token.
 *
 * Priority:
 * 1. SERVER_AUTH_TOKEN environment variable
 * 2. Token from deployment config file
 * 3. Auto-generate and save new token
 *
 * @returns The authentication token string.
 */
export function getServerAuthToken(): string {
  // Check environment variable first
  const envToken = process.env["SERVER_AUTH_TOKEN"];
  if (envToken) {
    return envToken;
  }

  // Load from deployment config
  const config = loadAuthConfig();
  if (typeof config["server_auth_token"] === "string") {
    return config["server_auth_token"];
  }

  // Auto-generate new token
  const newToken = generateSecureToken();
  config["server_auth_token"] = newToken;
  saveAuthConfig(config);

  return newToken;
}

/**
 * Check if server authentication is enabled.
 *
 * Authentication is always enabled -- either from environment,
 * config file, or auto-generated.
 */
export function isAuthEnabled(): boolean {
  return true;
}

/**
 * Determine where the token was loaded from.
 *
 * @returns String describing the token source: "environment", "config", or "generated".
 */
export function getTokenSource(): "environment" | "config" | "generated" {
  if (process.env["SERVER_AUTH_TOKEN"]) {
    return "environment";
  }

  const config = loadAuthConfig();
  if (typeof config["server_auth_token"] === "string") {
    return "config";
  }

  return "generated";
}

/** Error thrown when authentication fails. */
export class AuthenticationError extends Error {
  readonly statusCode: number;
  readonly detail: string;

  constructor(statusCode: number, detail: string) {
    super(detail);
    this.name = "AuthenticationError";
    this.statusCode = statusCode;
    this.detail = detail;
  }
}

/**
 * Verify the server authentication token from an Authorization header value.
 *
 * @param authorization - Authorization header value (e.g. "Bearer <token>").
 * @returns "authenticated" if token is valid.
 * @throws {AuthenticationError} If authentication fails.
 */
export async function verifyServerToken(
  authorization: string | undefined | null
): Promise<"authenticated"> {
  const expectedToken = getServerAuthToken();

  if (!authorization) {
    throw new AuthenticationError(
      401,
      "Authorization header required. Use 'Authorization: Bearer YOUR_TOKEN'"
    );
  }

  const parts = authorization.split(" ");
  if (parts.length !== 2 || parts[0]!.toLowerCase() !== "bearer") {
    throw new AuthenticationError(
      401,
      "Invalid authorization header format. Use 'Authorization: Bearer YOUR_TOKEN'"
    );
  }

  const providedToken = parts[1]!;

  const a = Buffer.from(providedToken);
  const b = Buffer.from(expectedToken);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new AuthenticationError(401, "Invalid authentication token");
  }

  return "authenticated";
}
