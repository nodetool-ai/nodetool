/**
 * 1Password secret references for getSecret().
 *
 * A secret value may be a 1Password secret reference instead of the secret
 * itself: `op://<vault>/<item>/[<section>/]<field>`. getSecret() resolves the
 * reference at read time, so the key never sits in nodetool's database or in
 * the process environment.
 *
 * Two backends, chosen from the environment:
 *
 * - Connect server, when `OP_CONNECT_HOST` and `OP_CONNECT_TOKEN` are set.
 *   Read over the Connect REST API.
 * - 1Password CLI otherwise. Runs `op read`, which authenticates with
 *   `OP_SERVICE_ACCOUNT_TOKEN` or the desktop app integration.
 *   `NODETOOL_1PASSWORD_CLI` overrides the `op` binary path.
 *
 * Resolved values are cached in memory for `NODETOOL_1PASSWORD_CACHE_TTL_SECONDS`
 * (default 300) so a rotated item is picked up without a restart.
 */

import { execFile } from "node:child_process";
import { createLogger, isAuthEnforced } from "@nodetool-ai/config";

const log = createLogger("nodetool.models.onepassword");

const REFERENCE_PREFIX = "op://";
const SEGMENT = String.raw`[^/?"\x00-\x1f\x7f]+`;
const REFERENCE_RE = new RegExp(
  `^op://(${SEGMENT})/(${SEGMENT})/(?:(${SEGMENT})/)?(${SEGMENT})(?:\\?([A-Za-z0-9=&_-]+))?$`
);
/** 1Password object ids are 26 lowercase alphanumerics. */
const OBJECT_ID_RE = /^[a-z0-9]{26}$/;

const DEFAULT_CACHE_TTL_MS = 300_000;
/** A failed read is remembered briefly so a broken setup does not stall every call. */
const FAILURE_TTL_MS = 30_000;
const CLI_TIMEOUT_MS = 15_000;
const CONNECT_TIMEOUT_MS = 15_000;
const MAX_SECRET_BYTES = 1024 * 1024;

export interface OnePasswordReference {
  vault: string;
  item: string;
  section: string | null;
  field: string;
  query: string | null;
}

interface CacheEntry {
  value: string | null;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<string | null>>();

/** True when the value is a 1Password secret reference (`op://...`). */
export function isOnePasswordReference(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(REFERENCE_PREFIX);
}

/** Parse a secret reference. Returns null when it is malformed. */
export function parseOnePasswordReference(
  value: string
): OnePasswordReference | null {
  const match = REFERENCE_RE.exec(value);
  if (!match) {
    return null;
  }
  const [, vault, item, section, field, query] = match;
  if (
    [vault, item, section, field].some(
      (s) => s !== undefined && s.trim() === ""
    )
  ) {
    return null;
  }
  return {
    vault,
    item,
    section: section ?? null,
    field,
    query: query ?? null
  };
}

/**
 * Whether references stored by users (Secret and Setting rows) are resolved.
 *
 * Every reference is read with the server's own 1Password credentials. On a
 * shared deployment a user who could store `op://...` could read any item the
 * server's service account can see, so stored references are resolved only on
 * a local install unless the operator opts in. References in the process
 * environment are operator-controlled and are always resolved.
 *
 * `NODETOOL_1PASSWORD_USER_REFERENCES` set to `true`/`1` or `false`/`0`
 * overrides the default.
 */
export function userReferencesAllowed(
  env: Record<string, string | undefined> = process.env
): boolean {
  const raw = env["NODETOOL_1PASSWORD_USER_REFERENCES"]?.trim().toLowerCase();
  if (raw === "1" || raw === "true") {
    return true;
  }
  if (raw === "0" || raw === "false") {
    return false;
  }
  return !isAuthEnforced(env);
}

/**
 * True when `value` is a reference stored by a user that must not be resolved
 * on this deployment. Logs the refusal. Callers must not cache such a value.
 */
export function isRefusedUserReference(key: string, value: string): boolean {
  if (!isOnePasswordReference(value) || userReferencesAllowed()) {
    return false;
  }
  log.warn(
    "Ignoring a 1Password reference stored by a user on a shared deployment",
    { key }
  );
  return true;
}

/**
 * Resolve a value a user stored (a Secret or Setting row). Plain values pass
 * through. A reference resolves through 1Password when userReferencesAllowed()
 * permits it, and reads as null otherwise or when the read fails.
 */
export async function resolveUserSecretValue(
  key: string,
  value: string
): Promise<string | null> {
  if (!isOnePasswordReference(value)) {
    return value;
  }
  if (isRefusedUserReference(key, value)) {
    return null;
  }
  return resolveOnePasswordReference(value);
}

/** Clear resolved 1Password values. */
export function clearOnePasswordCache(): void {
  cache.clear();
  inflight.clear();
}

function cacheTtlMs(): number {
  const raw = process.env["NODETOOL_1PASSWORD_CACHE_TTL_SECONDS"];
  if (raw === undefined || raw.trim() === "") {
    return DEFAULT_CACHE_TTL_MS;
  }
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds < 0) {
    return DEFAULT_CACHE_TTL_MS;
  }
  return seconds * 1000;
}

/**
 * Resolve a 1Password secret reference to its value.
 *
 * Returns null and logs the reason when the reference is malformed or the read
 * fails. The reference names a vault and item, not a secret, so it is safe to
 * log. The value never is.
 */
export async function resolveOnePasswordReference(
  reference: string
): Promise<string | null> {
  const now = Date.now();
  const cached = cache.get(reference);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const pending = inflight.get(reference);
  if (pending) {
    return pending;
  }

  const promise = readReference(reference).finally(() => {
    inflight.delete(reference);
  });
  inflight.set(reference, promise);
  return promise;
}

async function readReference(reference: string): Promise<string | null> {
  const parsed = parseOnePasswordReference(reference);
  if (!parsed) {
    log.error("Malformed 1Password secret reference", { reference });
    remember(reference, null, FAILURE_TTL_MS);
    return null;
  }

  const host = process.env["OP_CONNECT_HOST"]?.trim();
  const token = process.env["OP_CONNECT_TOKEN"]?.trim();
  try {
    const value =
      host && token
        ? await readViaConnect(parsed, host, token)
        : await readViaCli(reference);
    remember(reference, value, cacheTtlMs());
    return value;
  } catch (err) {
    log.error("1Password secret reference could not be read", {
      reference,
      backend: host && token ? "connect" : "cli",
      error: err instanceof Error ? err.message : String(err)
    });
    remember(reference, null, FAILURE_TTL_MS);
    return null;
  }
}

function remember(
  reference: string,
  value: string | null,
  ttlMs: number
): void {
  if (ttlMs <= 0) {
    return;
  }
  cache.set(reference, { value, expiresAt: Date.now() + ttlMs });
}

function readViaCli(reference: string): Promise<string> {
  const binary = process.env["NODETOOL_1PASSWORD_CLI"]?.trim() || "op";
  return new Promise((resolve, reject) => {
    execFile(
      binary,
      ["read", "--no-newline", reference],
      {
        timeout: CLI_TIMEOUT_MS,
        maxBuffer: MAX_SECRET_BYTES,
        windowsHide: true,
        encoding: "utf8"
      },
      (error, stdout, stderr) => {
        if (error) {
          const detail = String(stderr ?? "")
            .trim()
            .slice(0, 500);
          reject(new Error(detail || error.message));
          return;
        }
        resolve(String(stdout));
      }
    );
  });
}

interface ConnectNamed {
  id: string;
  name?: string;
  title?: string;
}

interface ConnectField {
  id: string;
  label?: string;
  value?: string;
  section?: { id: string };
}

interface ConnectItem {
  id: string;
  fields?: ConnectField[];
  sections?: { id: string; label?: string }[];
}

async function readViaConnect(
  ref: OnePasswordReference,
  host: string,
  token: string
): Promise<string> {
  if (ref.query) {
    throw new Error(
      `Reference attributes (?${ref.query}) are not supported with a Connect server`
    );
  }
  const base = host.replace(/\/+$/, "");
  const get = async <T>(path: string): Promise<T> => {
    const response = await fetch(`${base}${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(CONNECT_TIMEOUT_MS),
      redirect: "error"
    });
    if (!response.ok) {
      throw new Error(
        `Connect server answered ${response.status} for ${path.split("?")[0]}`
      );
    }
    return (await response.json()) as T;
  };

  const vaultId = await resolveId(ref.vault, "vault", async () =>
    get<ConnectNamed[]>(`/v1/vaults?filter=${filterEq("name", ref.vault)}`)
  );
  const itemId = await resolveId(ref.item, "item", async () =>
    get<ConnectNamed[]>(
      `/v1/vaults/${vaultId}/items?filter=${filterEq("title", ref.item)}`
    )
  );
  const item = await get<ConnectItem>(`/v1/vaults/${vaultId}/items/${itemId}`);
  return pickField(item, ref);
}

function filterEq(attribute: string, value: string): string {
  return encodeURIComponent(`${attribute} eq "${value}"`);
}

async function resolveId(
  segment: string,
  kind: "vault" | "item",
  search: () => Promise<ConnectNamed[]>
): Promise<string> {
  if (OBJECT_ID_RE.test(segment)) {
    return segment;
  }
  const matches = await search();
  if (!Array.isArray(matches) || matches.length === 0) {
    throw new Error(`No ${kind} named "${segment}"`);
  }
  if (matches.length > 1) {
    throw new Error(`More than one ${kind} named "${segment}"; use its id`);
  }
  return matches[0].id;
}

function sameName(a: string | undefined, b: string): boolean {
  return a !== undefined && a.toLowerCase() === b.toLowerCase();
}

function pickField(item: ConnectItem, ref: OnePasswordReference): string {
  let fields = item.fields ?? [];
  if (ref.section !== null) {
    const section = (item.sections ?? []).find(
      (s) => s.id === ref.section || sameName(s.label, ref.section as string)
    );
    if (!section) {
      throw new Error(`No section "${ref.section}" in item`);
    }
    fields = fields.filter((f) => f.section?.id === section.id);
  }
  const byId = fields.filter((f) => f.id === ref.field);
  const candidates =
    byId.length > 0 ? byId : fields.filter((f) => sameName(f.label, ref.field));
  if (candidates.length === 0) {
    throw new Error(`No field "${ref.field}" in item`);
  }
  if (candidates.length > 1) {
    throw new Error(
      `More than one field "${ref.field}" in item; name its section`
    );
  }
  const value = candidates[0].value;
  if (value === undefined) {
    throw new Error(`Field "${ref.field}" has no value`);
  }
  return value;
}
