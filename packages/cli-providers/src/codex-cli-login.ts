/**
 * Reuse the login of the Codex CLI (`codex login`) for the `codex` provider.
 *
 * The Codex CLI keeps its ChatGPT tokens in `$CODEX_HOME/auth.json`
 * (`~/.codex/auth.json` by default). NodeTool's `codex` provider signs in as
 * the same OAuth client, so the command line can use that login when the user
 * has not connected Codex inside NodeTool. Only the command line reads this
 * file: it runs for the person who owns it, while a server serves other users.
 *
 * OpenAI rotates the refresh token on every refresh. A refreshed token pair is
 * therefore written back to the same file, as the Codex CLI does, so the CLI
 * stays signed in.
 */

import { randomBytes } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  CODEX_OAUTH_CLIENT_ID,
  CODEX_OAUTH_TOKEN_URL
} from "@nodetool-ai/protocol";
import { z } from "zod";

/** Treat an access token expiring within this window as already expired. */
const EXPIRY_SKEW_MS = 60_000;

/** The Codex CLI's login file. */
export function codexCliAuthPath(env: NodeJS.ProcessEnv = process.env): string {
  const codexHome = env.CODEX_HOME?.trim();
  if (codexHome) { return join(codexHome, "auth.json"); }
  const home = env.HOME?.trim() || env.USERPROFILE?.trim() || homedir();
  return join(home, ".codex", "auth.json");
}

/**
 * The parts of `auth.json` this module reads. Loose objects keep the fields
 * the Codex CLI owns, so a write-back preserves them.
 */
const codexCliAuthSchema = z.looseObject({
  tokens: z
    .looseObject({
      access_token: z.string().min(1),
      refresh_token: z.string().min(1).optional().catch(undefined)
    })
    .nullish()
    .catch(null)
});
type CodexCliAuth = z.infer<typeof codexCliAuthSchema>;

const jwtClaimsSchema = z.object({ exp: z.number() });

const refreshResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional().catch(undefined),
  id_token: z.string().min(1).optional().catch(undefined)
});

/** The `exp` claim of a JWT in epoch milliseconds, or null when it has none. */
function jwtExpiryMs(token: string): number | null {
  const payload = token.split(".")[1];
  if (!payload) { return null; }
  try {
    const claims = jwtClaimsSchema.safeParse(
      JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
    );
    return claims.success ? claims.data.exp * 1000 : null;
  } catch {
    // Not a JWT: treat it as a token without an expiry.
    return null;
  }
}

/** The parsed login file, or null when there is none or it cannot be read. */
async function readAuthFile(path: string): Promise<CodexCliAuth | null> {
  try {
    const parsed = codexCliAuthSchema.safeParse(JSON.parse(await readFile(path, "utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    // No Codex CLI login, or a file this reader does not understand.
    return null;
  }
}

/** Replace the file in one step, so the Codex CLI never reads a partial write. */
async function writeAuthFile(path: string, auth: CodexCliAuth): Promise<void> {
  const temporary = join(dirname(path), `.auth.json.${randomBytes(6).toString("hex")}.tmp`);
  await writeFile(temporary, `${JSON.stringify(auth, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, path);
}

interface RefreshOptions {
  readonly fetchImpl: typeof fetch;
  readonly now: () => number;
}

/** Refresh the login and write the rotated tokens back. Null when refused. */
async function refreshLogin(
  path: string,
  refreshToken: string,
  options: RefreshOptions
): Promise<string | null> {
  const response = await options.fetchImpl(CODEX_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json"
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: CODEX_OAUTH_CLIENT_ID
    }).toString()
  });
  if (!response.ok) { return null; }
  const refreshed = refreshResponseSchema.safeParse(await response.json());
  if (!refreshed.success) { return null; }
  const { access_token, refresh_token, id_token } = refreshed.data;

  // Read the file again so fields the Codex CLI owns are kept as they are.
  const auth = await readAuthFile(path);
  if (!auth?.tokens) { return access_token; }
  await writeAuthFile(path, {
    ...auth,
    tokens: {
      ...auth.tokens,
      access_token,
      ...(refresh_token && { refresh_token }),
      ...(id_token && { id_token })
    },
    last_refresh: new Date(options.now()).toISOString()
  });
  return access_token;
}

export interface CodexCliLoginOptions {
  readonly path?: string;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => number;
}

/** One refresh per file at a time: a second refresh would reuse a spent token. */
const inFlight = new Map<string, Promise<string | null>>();

/**
 * A valid access token from the Codex CLI login, or null when there is none.
 * A token that has (nearly) expired is refreshed. When the refresh is refused
 * the stored token is returned, so the request fails with the provider's
 * expired sign-in error rather than a missing credential.
 */
export async function resolveCodexCliAccessToken(
  options: CodexCliLoginOptions = {}
): Promise<string | null> {
  const path = options.path ?? codexCliAuthPath();
  const tokens = (await readAuthFile(path))?.tokens;
  if (!tokens) { return null; }
  const accessToken = tokens.access_token;
  const now = options.now ?? Date.now;
  const expiresAt = jwtExpiryMs(accessToken);
  if (expiresAt === null || now() < expiresAt - EXPIRY_SKEW_MS || !tokens.refresh_token) {
    return accessToken;
  }

  const running = inFlight.get(path);
  if (running) { return running; }
  const pending = refreshLogin(path, tokens.refresh_token, {
    fetchImpl: options.fetchImpl ?? fetch,
    now
  })
    .catch(() => null)
    .then((refreshed) => refreshed ?? accessToken)
    .finally(() => inFlight.delete(path));
  inFlight.set(path, pending);
  return pending;
}
