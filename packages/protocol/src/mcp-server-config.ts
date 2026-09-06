/**
 * A user-configured external MCP server — Blender, Hugging Face, a local
 * script — whose tools join the agent's toolbelt.
 *
 * One shape serves every consumer: the settings store persists it, the REST
 * route validates it, the web settings panel edits it, and the agents package
 * connects to it. A server is reached over stdio (a child process this
 * machine spawns) or over HTTP (Streamable HTTP, with SSE as the fallback for
 * older servers).
 *
 * A header or env value is either a literal or carries `${SECRET_NAME}`
 * references. The persistence layer moves every literal that could be a
 * credential into an encrypted secret and stores the reference in its place,
 * so the stored config holds no token.
 */

import { z } from "zod";

/** Lowercase letters, digits and underscores: the id is part of a JS identifier. */
export const MCP_SERVER_ID_PATTERN = /^[a-z0-9][a-z0-9_]{0,31}$/;

export const McpStdioTransportSchema = z.object({
  type: z.literal("stdio"),
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  /** Extra environment for the child. Values may carry `${SECRET_NAME}` references. */
  env: z.record(z.string(), z.string()).default({}),
  cwd: z.string().optional()
});

export const McpHttpTransportSchema = z.object({
  type: z.literal("http"),
  url: z.string().url(),
  /** Extra request headers. Values may carry `${SECRET_NAME}` references. */
  headers: z.record(z.string(), z.string()).default({})
});

export const McpServerTransportSchema = z.discriminatedUnion("type", [
  McpStdioTransportSchema,
  McpHttpTransportSchema
]);

export const McpServerConfigSchema = z.object({
  /** Stable slug; becomes the middle of every tool name (`mcp_<id>_<tool>`). */
  id: z.string().regex(MCP_SERVER_ID_PATTERN),
  /** Display name for the settings UI. */
  name: z.string().min(1).max(120),
  enabled: z.boolean().default(true),
  transport: McpServerTransportSchema
});

export const McpServerConfigListSchema = z.array(McpServerConfigSchema);

export type McpStdioTransport = z.infer<typeof McpStdioTransportSchema>;
export type McpHttpTransport = z.infer<typeof McpHttpTransportSchema>;
export type McpServerTransport = z.infer<typeof McpServerTransportSchema>;
export type McpServerConfig = z.infer<typeof McpServerConfigSchema>;

/** Prefix every external MCP tool name carries, and the guest namespace it imports from. */
export const MCP_TOOL_PREFIX = "mcp_";
export const MCP_CAPABILITY_MODULE = "mcp";

/** Provider tool names are capped here, and so is the guest export. */
const MAX_TOOL_NAME_LENGTH = 64;

/**
 * The tool name the model sees for one remote tool. It is also a guest
 * export, so it must be a JS identifier: `[a-z0-9_]`, starting with a
 * letter. When the whole would exceed the cap, the remote name is shortened
 * and the server id kept, so the name still says which server it belongs to.
 */
export function mcpToolName(serverId: string, remoteName: string): string {
  const prefix = `${MCP_TOOL_PREFIX}${serverId}_`;
  const room = Math.max(1, MAX_TOOL_NAME_LENGTH - prefix.length);
  // One linear pass: a run of non-alphanumerics becomes one `_`, never at the
  // start; a trailing `_` is dropped. The remote name is server input, so no
  // regex with a nested quantifier runs over it.
  let remote = "";
  let pendingUnderscore = false;
  for (const ch of remoteName) {
    if (remote.length >= room) break;
    if (/[a-zA-Z0-9]/.test(ch)) {
      if (pendingUnderscore && remote.length > 0 && remote.length < room - 1) {
        remote += "_";
      }
      pendingUnderscore = false;
      remote += ch;
    } else {
      pendingUnderscore = true;
    }
  }
  return `${prefix}${remote}`;
}

const SECRET_REFERENCE = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

/** The secret names a value refers to. */
export function secretReferencesIn(value: string): string[] {
  return [...value.matchAll(SECRET_REFERENCE)].map((m) => m[1]);
}

/**
 * Substitute every `${SECRET_NAME}` in a string map, inline, so
 * `Bearer ${HF_TOKEN}` works. A reference the resolver cannot answer becomes
 * empty rather than passing through, so a placeholder never reaches a child
 * process or a wire as a literal.
 */
export async function resolveSecretReferences(
  values: Record<string, string>,
  getSecret: (name: string) => Promise<string | null | undefined>
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(values)) {
    out[key] = await resolveOne(raw, getSecret, 0);
  }
  return out;
}

/**
 * A secret's own value may be a template (`Bearer ${HF_TOKEN}`, stored whole
 * by the persistence layer), so a reference resolves through a bounded
 * number of levels. Past the bound, what is left is sent as it stands.
 */
const MAX_REFERENCE_DEPTH = 3;

async function resolveOne(
  raw: string,
  getSecret: (name: string) => Promise<string | null | undefined>,
  depth: number
): Promise<string> {
  const names = secretReferencesIn(raw);
  if (names.length === 0 || depth >= MAX_REFERENCE_DEPTH) return raw;
  const resolved = new Map<string, string>();
  for (const name of new Set(names)) {
    const value = (await getSecret(name)) ?? "";
    resolved.set(name, await resolveOne(value, getSecret, depth + 1));
  }
  return raw.replace(SECRET_REFERENCE, (_m, name: string) =>
    resolved.get(name) ?? ""
  );
}

/**
 * The secret name a literal header or env value is stored under when the
 * persistence layer moves it out of the config: `MCP_<SERVER>_<KEYHEX>`.
 * The key is hex-encoded, so the part after the last underscore is the key
 * and everything between is the server id: no two (server, key) pairs share
 * a name, whatever underscores or casing they carry.
 */
export function mcpCredentialSecretName(serverId: string, key: string): string {
  // UTF-16 code units, four hex digits each: a lone surrogate keeps its own
  // code, where a UTF-8 encoding would fold every one into U+FFFD.
  let hex = "";
  for (let i = 0; i < key.length; i += 1) {
    hex += key.charCodeAt(i).toString(16).toUpperCase().padStart(4, "0");
  }
  return `MCP_${serverId.toUpperCase()}_${hex}`;
}

/** Whether a value is exactly one secret reference and nothing else. */
export function isSecretReference(value: string): boolean {
  return /^\$\{[A-Za-z_][A-Za-z0-9_]*\}$/.test(value);
}

/** Whether a value is made only of references and nothing else (`${A}${B}`). */
export function isPureSecretReferences(value: string): boolean {
  return value !== "" && value.replace(SECRET_REFERENCE, "") === "";
}
