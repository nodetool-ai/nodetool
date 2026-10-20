/**
 * User-configured external MCP servers: persistence and the per-user client
 * pool that serves their tools to a chat turn.
 *
 * The server list is one JSON row in the plaintext `Setting` table, and it
 * holds no credential: on save, every literal header or env value that is
 * not already a `${SECRET_NAME}` reference is moved into an encrypted
 * `Secret` row named `MCP_<SERVER>_<KEY>` and the reference stored in its
 * place. References resolve at connect time from the user's own secrets and
 * nowhere else — never from the process environment, which holds the
 * server's infrastructure keys.
 *
 * Connections are process-global per user: the belt of every turn shares
 * them, `sync` reconciles them after a save, and a server that stops
 * answering is dropped and retried on the next turn.
 */

import { createLogger, isAuthEnforced } from "@nodetool-ai/config";
import { Secret, Setting, clearSecretCache } from "@nodetool-ai/models";
import {
  McpClientPool,
  getExternalMcpTools,
  type McpClientPoolOptions,
  type McpRemoteTool,
  type Tool
} from "@nodetool-ai/agents";
import { assertSafePublicHttpsUrl, safeFetch } from "@nodetool-ai/runtime";
import {
  CLOUD_PROFILE_ENV,
  NODE_ENV_VAR,
  McpServerConfigListSchema,
  isCloudProfileActive,
  isPureSecretReferences,
  mcpCredentialSecretName,
  secretReferencesIn,
  type McpServerConfig
} from "@nodetool-ai/protocol";
import { isAdmin } from "./lib/admin.js";

const log = createLogger("nodetool.websocket.external-mcp");

/** The `Setting` key the server list lives under. */
export const EXTERNAL_MCP_SETTING_KEY = "EXTERNAL_MCP_SERVERS";

/** Each user's pool, and whether it was made without the SSRF guard. */
const pools = new Map<string, { pool: McpClientPool; local: boolean }>();

/** Per-user write serialization: save and delete are read-modify-write. */
const writeQueues = new Map<string, Promise<unknown>>();

function serializedFor<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const prior = writeQueues.get(userId) ?? Promise.resolve();
  const next = prior.then(fn, fn);
  writeQueues.set(
    userId,
    next.catch(() => undefined)
  );
  return next;
}

/**
 * Whether this deployment spawns stdio servers and reaches private hosts. A
 * stdio server is a command run on the machine the server owns, so it is
 * offered only where that machine belongs to its user — the desktop app, a
 * local server, a single-user self-hosted install. The cloud profile and a
 * Supabase-auth deployment keep HTTP servers only, and only public https ones.
 */
export function isLocalMcpProfile(): boolean {
  if (isCloudProfileActive(process.env[CLOUD_PROFILE_ENV], process.env[NODE_ENV_VAR])) {
    return false;
  }
  // With Supabase auth the machine is shared by every account that can sign
  // up, and a stdio server would run a command for any of them. The operator
  // can opt in when every account is trusted with a shell on the host.
  if (isAuthEnforced()) {
    return process.env["NODETOOL_ALLOW_STDIO_MCP"]?.trim() === "1";
  }
  return true;
}

/**
 * Whether this user may spawn stdio servers and reach private hosts.
 *
 * A Local-mode server is single-user only until someone runs
 * `nodetool deploy users-add`: each API user then has their own id and a
 * bearer token, and a `user`-role account must not get a shell on the host.
 * So in Local mode the deployment-level answer above applies to admins only
 * (user "1", `ADMIN_USER_IDS`, or an API user with the admin role). Under
 * Supabase auth the operator's `NODETOOL_ALLOW_STDIO_MCP=1` already says
 * every account is trusted with a shell.
 */
export async function isLocalMcpAllowedFor(userId: string): Promise<boolean> {
  if (!isLocalMcpProfile()) return false;
  if (isAuthEnforced()) return true;
  return isAdmin(userId);
}

export const STDIO_MCP_DISABLED_ERROR =
  "Stdio MCP servers run a command on the server machine, so they are not " +
  "available on this deployment. Use an HTTP server instead.";

/** A resolver over the user's encrypted secrets only. */
function userSecretResolver(userId: string) {
  return async (name: string): Promise<string | null> => {
    const row = await Secret.find(userId, name);
    if (!row) return null;
    try {
      return await row.getDecryptedValue();
    } catch {
      // An undecryptable secret reads as unset; the server sees an empty
      // header, which is what the user has to fix by re-entering it.
      return null;
    }
  };
}

/** `safeFetch` in the shape the MCP transports take. */
const guardedFetch: typeof fetch = (input, init) => {
  const url = input instanceof Request ? input.url : String(input);
  return safeFetch(url, init);
};

/**
 * A probe has someone watching it, so it waits less than a chat turn does for
 * a server that accepts the socket and then says nothing.
 */
const PROBE_CONNECT_TIMEOUT_MS = 15_000;

function newPool(
  userId: string,
  local: boolean,
  extra: McpClientPoolOptions = {}
): McpClientPool {
  const options: McpClientPoolOptions = {
    ...extra,
    getSecret: userSecretResolver(userId)
  };
  // The cloud profile and non-admin users fetch through the SSRF guard, which
  // re-checks every redirect hop. A local admin may reach loopback servers.
  if (!local) options.fetch = guardedFetch;
  return new McpClientPool(options);
}

async function poolFor(userId: string): Promise<McpClientPool> {
  const local = await isLocalMcpAllowedFor(userId);
  const existing = pools.get(userId);
  if (existing !== undefined && existing.local === local) return existing.pool;
  // The user's role changed since the pool was made, and its fetch guard was
  // fixed then. Start over with the guard the role now calls for.
  // No await between the lookup and the set, so two turns never both build one.
  if (existing !== undefined) void existing.pool.close().catch(() => undefined);
  const pool = newPool(userId, local);
  pools.set(userId, { pool, local });
  return pool;
}

/** Refuse what this user cannot connect to on this deployment. */
function assertConnectable(config: McpServerConfig, local: boolean): void {
  if (local) return;
  if (config.transport.type === "stdio") {
    throw new Error(STDIO_MCP_DISABLED_ERROR);
  }
  assertSafePublicHttpsUrl(config.transport.url);
}

/** The servers this user can actually connect to. */
function connectable(
  servers: McpServerConfig[],
  local: boolean
): McpServerConfig[] {
  return servers.filter((s) => {
    try {
      assertConnectable(s, local);
      return true;
    } catch {
      return false;
    }
  });
}

/** The user's configured servers, invalid rows dropped. */
export async function loadExternalMcpServers(
  userId: string
): Promise<McpServerConfig[]> {
  const setting = await Setting.find(userId, EXTERNAL_MCP_SETTING_KEY);
  if (!setting) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(setting.getValue());
  } catch {
    return [];
  }
  const parsed = McpServerConfigListSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  log.warn("Ignoring malformed external MCP server list", {
    userId,
    issues: parsed.error.issues.length
  });
  return [];
}

async function writeServers(
  userId: string,
  servers: McpServerConfig[]
): Promise<void> {
  await Setting.upsert({
    userId,
    key: EXTERNAL_MCP_SETTING_KEY,
    value: JSON.stringify(servers),
    description: "External MCP servers whose tools join the agent toolbelt"
  });
  const local = await isLocalMcpAllowedFor(userId);
  await (await poolFor(userId)).sync(connectable(servers, local));
}

/**
 * Move every literal header/env value into an encrypted secret and store the
 * reference. A value already made of references is kept as written. The
 * secrets for keys the new config no longer carries are removed.
 */
async function externalizeCredentials(
  userId: string,
  config: McpServerConfig,
  previous: McpServerConfig | undefined
): Promise<McpServerConfig> {
  const t = config.transport;
  const values = t.type === "stdio" ? t.env : t.headers;
  const stored: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    // Only a value made purely of references stays as written; anything
    // carrying a literal — even beside a reference — is a credential.
    if (value === "" || isPureSecretReferences(value)) {
      stored[key] = value;
      continue;
    }
    const name = mcpCredentialSecretName(config.id, key);
    await Secret.upsert({
      userId,
      key: name,
      value,
      description: `${key} for the MCP server ${config.name}`
    });
    clearSecretCache(userId, name);
    stored[key] = `\${${name}}`;
  }
  if (previous !== undefined) {
    await removeOwnedSecrets(userId, previous, ownedReferences(config.id, stored));
  }
  return t.type === "stdio"
    ? { ...config, transport: { ...t, env: stored } }
    : { ...config, transport: { ...t, headers: stored } };
}

/** The secret names a config's values own: those it references by its own name. */
function ownedReferences(
  serverId: string,
  values: Record<string, string>
): Set<string> {
  const owned = new Set<string>();
  // A secret is owned by this server when any value references it, not only
  // the value at its own key: `${MCP_HF_58}${OTHER}` still uses it.
  const names = new Set(
    Object.keys(values).map((key) => mcpCredentialSecretName(serverId, key))
  );
  for (const value of Object.values(values)) {
    for (const ref of secretReferencesIn(value)) {
      if (names.has(ref)) owned.add(ref);
    }
  }
  return owned;
}

/** Delete the secrets a config owns, except the names in `keep`. */
async function removeOwnedSecrets(
  userId: string,
  config: McpServerConfig,
  keep: ReadonlySet<string> = new Set()
): Promise<void> {
  const t = config.transport;
  const values = t.type === "stdio" ? t.env : t.headers;
  for (const name of ownedReferences(config.id, values)) {
    if (keep.has(name)) continue;
    await Secret.deleteSecret(userId, name);
    clearSecretCache(userId, name);
  }
}

/** Create or replace one server. */
export async function saveExternalMcpServer(
  userId: string,
  config: McpServerConfig
): Promise<McpServerConfig[]> {
  const local = await isLocalMcpAllowedFor(userId);
  assertConnectable(config, local);
  return serializedFor(userId, async () => {
    const current = await loadExternalMcpServers(userId);
    const previous = current.find((s) => s.id === config.id);
    const stored = await externalizeCredentials(userId, config, previous);
    const next = current.filter((s) => s.id !== config.id);
    next.push(stored);
    // A rotated literal keeps the same reference, so the fingerprint alone
    // would keep the old connection. Drop this server first; the sync
    // below reopens it with the values now stored.
    await (await poolFor(userId)).sync(
      connectable(
        current.filter((s) => s.id !== config.id),
        local
      )
    );
    await writeServers(userId, next);
    return next;
  });
}

/** Remove one server and the secrets it owns. Returns false if absent. */
export function deleteExternalMcpServer(
  userId: string,
  id: string
): Promise<boolean> {
  return serializedFor(userId, async () => {
    const current = await loadExternalMcpServers(userId);
    const target = current.find((s) => s.id === id);
    if (target === undefined) return false;
    await removeOwnedSecrets(userId, target);
    await writeServers(
      userId,
      current.filter((s) => s.id !== id)
    );
    return true;
  });
}

/** What one server answered when asked for its tools. */
export interface ExternalMcpServerProbe {
  id: string;
  ok: boolean;
  tools: McpRemoteTool[];
  error: string | null;
}

/**
 * Connect to one server (fresh, outside the shared pool) and list its tools.
 * The settings UI calls this after a save so the user sees what the server
 * offers, or why it could not be reached. A literal credential in the probe
 * is used for the probe only; nothing is stored.
 */
export async function probeExternalMcpServer(
  userId: string,
  config: McpServerConfig
): Promise<ExternalMcpServerProbe> {
  const local = await isLocalMcpAllowedFor(userId);
  try {
    assertConnectable(config, local);
  } catch (err) {
    return {
      id: config.id,
      ok: false,
      tools: [],
      error: err instanceof Error ? err.message : String(err)
    };
  }
  const pool = newPool(userId, local, {
    connectTimeoutMs: PROBE_CONNECT_TIMEOUT_MS
  });
  try {
    await pool.sync([{ ...config, enabled: true }]);
    let error: string | null = null;
    const discovered = await pool.discover((_id, err) => {
      error = err.message.split("\n")[0].slice(0, 300);
    });
    const tools = discovered.get(config.id) ?? [];
    return { id: config.id, ok: error === null, tools, error };
  } finally {
    await pool.close();
  }
}

/**
 * The belt contribution of the user's enabled servers. Syncs the pool with
 * the stored list first, so a server saved from the settings UI is live on
 * the next turn without a restart.
 */
export async function externalMcpToolsFor(userId: string): Promise<Tool[]> {
  const servers = await loadExternalMcpServers(userId);
  const local = await isLocalMcpAllowedFor(userId);
  const pool = await poolFor(userId);
  await pool.sync(connectable(servers, local));
  if (pool.serverIds().length === 0) return [];
  return getExternalMcpTools(pool, (serverId, error) => {
    log.warn("External MCP server skipped for this turn", {
      userId,
      server: serverId,
      error: error.message.split("\n")[0].slice(0, 300)
    });
  });
}

/** Close every user's connections (server shutdown, tests). */
export async function closeExternalMcpPools(): Promise<void> {
  const all = [...pools.values()];
  pools.clear();
  await Promise.all(all.map((p) => p.pool.close()));
}
