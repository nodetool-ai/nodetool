/**
 * How this server is deployed — one answer, read from the environment.
 *
 * `NODE_ENV` does not answer it: the desktop backend (`electron/src/server.ts`)
 * and the Docker image both set `NODE_ENV=production` while serving one user on
 * their own machine. What separates a shared deployment from a local install is
 * whether a remote identity provider is configured, so that is what this asks.
 */
import { safeProcessEnv } from "./node-import.js";

/**
 * True when the server enforces authentication — a remote identity provider
 * (`SUPABASE_URL` + `SUPABASE_KEY`) is configured, so every request carries a
 * user token and the host is shared. False for a local install, where loopback
 * is trusted and the machine belongs to the person using it.
 */
export function isAuthEnforced(
  env: Record<string, string | undefined> = safeProcessEnv()
): boolean {
  return Boolean(env["SUPABASE_URL"]?.trim() && env["SUPABASE_KEY"]?.trim());
}
