/**
 * Whether native sign-in (the `native` OAuth scope of the desktop apps) is
 * offered by this server, and why not when it is not. The authorize and
 * token endpoints, the auth hook and the Settings list all read this one
 * function, so they cannot disagree.
 *
 * Native sign-in needs a server with real accounts (Supabase or SSO mode)
 * and a public URL the browser and the app both reach. An administrator can
 * turn it off with `NODETOOL_DISABLE_NATIVE_SIGNIN=1` (SR12); existing device
 * sessions then stop authenticating too.
 */

import { isAuthEnforced } from "@nodetool-ai/config";

export const NATIVE_SIGNIN_DISABLE_ENV_VAR = "NODETOOL_DISABLE_NATIVE_SIGNIN";

export type NativeSignInState =
  | { state: "enabled"; publicUrl: string }
  /** The administrator turned it off. The authorize step says so. */
  | { state: "disabled"; publicUrl: string }
  /** Local mode or no usable public URL: the routes do not exist. */
  | { state: "unavailable" };

/** The configured public URL when it is https, or http on loopback. */
export function issuerPublicUrl(
  env: NodeJS.ProcessEnv = process.env
): string | null {
  const raw = env["NODETOOL_PUBLIC_URL"]?.trim();
  if (!raw) return null;
  const base = raw.replace(/\/+$/, "");
  try {
    const url = new URL(base);
    const loopback =
      url.hostname === "127.0.0.1" || url.hostname === "localhost";
    if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
      return null;
    }
  } catch {
    return null;
  }
  return base;
}

export function nativeSignInState(
  env: NodeJS.ProcessEnv = process.env
): NativeSignInState {
  const publicUrl = issuerPublicUrl(env);
  if (!publicUrl || !isAuthEnforced(env)) return { state: "unavailable" };
  if (env[NATIVE_SIGNIN_DISABLE_ENV_VAR] === "1") {
    return { state: "disabled", publicUrl };
  }
  return { state: "enabled", publicUrl };
}

/** The message the app shows when the administrator turned sign-in off. */
export const NATIVE_SIGNIN_DISABLED_MESSAGE =
  "Signing in from the desktop apps is turned off on this server.";
