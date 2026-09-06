/**
 * Google Workspace agent tools — Drive, Gmail, Docs, Sheets and Calendar.
 *
 * These authenticate with the access token from the user's Google sign-in
 * (resolved through `getSecret("GOOGLE_ACCESS_TOKEN")`), so there is no API key
 * to configure. They are only offered when the server runs in Supabase auth
 * mode — see `isGoogleWorkspaceEnabled()` in `@nodetool-ai/config`.
 *
 * The implementations live in the `google` capability module
 * (`../capabilities/google.ts`) and arrive here through the registry's eager
 * spec table: each name becomes a `Tool` whose spec is read synchronously and
 * whose implementation loads at first call.
 */

import type { Tool } from "./base-tool.js";
import { googleSpecs } from "../capabilities/google.specs.js";
import { toolFromLazyCapability } from "../capabilities/lazy-tool.js";

/**
 * Every Google Workspace tool name. Kept apart from `BUILTIN_TOOL_NAMES`
 * because these are only offered when the deployment can produce a Google
 * login token.
 */
export const GOOGLE_WORKSPACE_TOOL_NAMES: readonly string[] = googleSpecs.map(
  (spec) => spec.name
);

/** One fresh instance per Google Workspace tool. */
export function getGoogleWorkspaceTools(): Tool[] {
  return googleSpecs.map((spec) => toolFromLazyCapability(spec));
}
