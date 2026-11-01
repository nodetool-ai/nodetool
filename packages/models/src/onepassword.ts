/**
 * 1Password secret references for getSecret().
 *
 * A secret value may be a 1Password secret reference instead of the secret
 * itself: `op://<vault>/<item>/[<section>/]<field>`. getSecret() resolves the
 * reference at read time, so the key never sits in nodetool's database or in
 * the process environment.
 *
 * The backend is chosen from the environment, first match wins:
 *
 * - Connect server, when `OP_CONNECT_HOST` and `OP_CONNECT_TOKEN` are set.
 *   Read over the Connect REST API.
 * - 1Password SDK (`@1password/sdk`, a regular dependency) with a service
 *   account, when `OP_SERVICE_ACCOUNT_TOKEN` is set.
 * - 1Password SDK through the desktop app, when an account is named (as shown
 *   in the app's sidebar, or its UUID): `NODETOOL_1PASSWORD_ACCOUNT`, or the
 *   account the user connected in Settings, stored as the Setting of the same
 *   name. The app asks the user to approve NodeTool once per session.
 * - 1Password CLI otherwise, for installs that already use `op`. Runs
 *   `op read`. `NODETOOL_1PASSWORD_CLI` overrides the `op` binary path.
 *
 * Resolved values are cached in memory for `NODETOOL_1PASSWORD_CACHE_TTL_SECONDS`
 * (default 300) so a rotated item is picked up without a restart.
 */

import { execFile } from "node:child_process";
import type { Client as SdkClient } from "@1password/sdk";
import { createLogger, isAuthEnforced } from "@nodetool-ai/config";
import { Setting } from "./setting.js";

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
  value: string,
  userId?: string
): Promise<string | null> {
  if (!isOnePasswordReference(value)) {
    return value;
  }
  if (isRefusedUserReference(key, value)) {
    return null;
  }
  return resolveOnePasswordReference(value, userId);
}

/** Setting (and env var) naming the account the desktop app signs in to. */
export const ONEPASSWORD_ACCOUNT_KEY = "NODETOOL_1PASSWORD_ACCOUNT";

/**
 * The 1Password account for desktop app sign-in: the env var, else the
 * account `userId` connected in Settings. A stored account is honoured only
 * where user references are, so a shared server never signs in to the
 * desktop app on a user's say-so.
 */
export async function onePasswordAccount(userId?: string): Promise<string> {
  const fromEnv = process.env[ONEPASSWORD_ACCOUNT_KEY]?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  if (!userId || !userReferencesAllowed()) {
    return "";
  }
  try {
    const setting = await Setting.find(userId, ONEPASSWORD_ACCOUNT_KEY);
    return setting?.value.trim() ?? "";
  } catch {
    // No database (env-only CLI runs): there is no stored account.
    return "";
  }
}

/** Clear resolved 1Password values. */
export function clearOnePasswordCache(): void {
  cache.clear();
  inflight.clear();
  sdkClient = null;
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
  reference: string,
  userId?: string
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

  const promise = readReference(reference, userId).finally(() => {
    inflight.delete(reference);
  });
  inflight.set(reference, promise);
  return promise;
}

async function readReference(
  reference: string,
  userId: string | undefined
): Promise<string | null> {
  const parsed = parseOnePasswordReference(reference);
  if (!parsed) {
    log.error("Malformed 1Password secret reference", { reference });
    remember(reference, null, FAILURE_TTL_MS);
    return null;
  }

  const backend = selectBackend(await onePasswordAccount(userId));
  try {
    const value = await backend.read(reference, parsed);
    remember(reference, value, cacheTtlMs());
    return value;
  } catch (err) {
    log.error("1Password secret reference could not be read", {
      reference,
      backend: backend.name,
      error: err instanceof Error ? err.message : String(err)
    });
    remember(reference, null, FAILURE_TTL_MS);
    return null;
  }
}

/** Which 1Password backend handles reads, chosen from the environment. */
export type OnePasswordBackendName =
  | "connect"
  | "sdk-service-account"
  | "sdk-desktop"
  | "cli";

interface Backend {
  name: OnePasswordBackendName;
  read(reference: string, parsed: OnePasswordReference): Promise<string>;
}

/**
 * The backend reads go to, given the environment and the desktop account
 * (see onePasswordAccount()).
 */
export function onePasswordBackend(
  env: Record<string, string | undefined> = process.env,
  account: string = env[ONEPASSWORD_ACCOUNT_KEY]?.trim() ?? ""
): OnePasswordBackendName {
  if (env["OP_CONNECT_HOST"]?.trim() && env["OP_CONNECT_TOKEN"]?.trim()) {
    return "connect";
  }
  if (env["OP_SERVICE_ACCOUNT_TOKEN"]?.trim()) {
    return "sdk-service-account";
  }
  if (account) {
    return "sdk-desktop";
  }
  return "cli";
}

function selectBackend(account: string): Backend {
  const name = onePasswordBackend(process.env, account);
  switch (name) {
    case "connect": {
      const host = (process.env["OP_CONNECT_HOST"] ?? "").trim();
      const token = (process.env["OP_CONNECT_TOKEN"] ?? "").trim();
      return {
        name,
        read: (_reference, parsed) => readViaConnect(parsed, host, token)
      };
    }
    case "sdk-service-account":
    case "sdk-desktop":
      return {
        name,
        read: (reference) => readViaSdk(reference, name, account)
      };
    case "cli":
      return { name, read: (reference) => readViaCli(reference) };
  }
}

/** One SDK client per auth configuration, reused across reads. */
let sdkClient: { key: string; client: Promise<SdkClient> } | null = null;

const SDK_INTEGRATION_NAME = "NodeTool";
const SDK_INTEGRATION_VERSION = "v1.0.0";

function sdkClientFor(
  backend: "sdk-service-account" | "sdk-desktop",
  account: string
): Promise<SdkClient> {
  const token = (process.env["OP_SERVICE_ACCOUNT_TOKEN"] ?? "").trim();
  const key =
    backend === "sdk-service-account" ? `token:${token}` : `desktop:${account}`;
  if (sdkClient && sdkClient.key === key) {
    return sdkClient.client;
  }
  const client = (async () => {
    // Loaded on first use: the SDK carries a WebAssembly core that nobody
    // without a 1Password reference should pay for at startup.
    const sdk = await import("@1password/sdk");
    return sdk.createClient({
      auth:
        backend === "sdk-service-account"
          ? token
          : new sdk.DesktopAuth(account),
      integrationName: SDK_INTEGRATION_NAME,
      integrationVersion: SDK_INTEGRATION_VERSION
    });
  })();
  sdkClient = { key, client };
  return client;
}

async function readViaSdk(
  reference: string,
  backend: "sdk-service-account" | "sdk-desktop",
  account: string
): Promise<string> {
  return withSdkClient(backend, account, (client) =>
    client.secrets.resolve(reference)
  );
}

async function withSdkClient<T>(
  backend: "sdk-service-account" | "sdk-desktop",
  account: string,
  run: (client: SdkClient) => Promise<T>
): Promise<T> {
  try {
    return await run(await sdkClientFor(backend, account));
  } catch (err) {
    // A desktop session expires after inactivity and a token can be revoked.
    // Drop the client so the next call authenticates again.
    sdkClient = null;
    throw err;
  }
}

// ── Browsing, for the Settings picker ──────────────────────────────

/** A field the picker offers. Never carries the field's value. */
export interface OnePasswordFieldOption {
  id: string;
  title: string;
  section: string | null;
  fieldType: string;
  /** The reference that resolves to this field. */
  reference: string;
}

/**
 * Browse the vaults behind the user's 1Password connection without reading
 * any secret value. Available only for the SDK backends: Connect and the CLI
 * are operator setups with their own tooling. Throws when browsing is not
 * possible here, so callers can say why.
 */
export async function onePasswordBrowser(userId: string) {
  if (!userReferencesAllowed()) {
    throw new Error("1Password references are turned off on this server.");
  }
  const account = await onePasswordAccount(userId);
  const backend = onePasswordBackend(process.env, account);
  if (backend !== "sdk-service-account" && backend !== "sdk-desktop") {
    throw new Error(
      backend === "connect"
        ? "Browsing a Connect server is not supported. Type the reference instead."
        : "Connect a 1Password account first."
    );
  }
  const call = <T>(run: (client: SdkClient) => Promise<T>) =>
    withSdkClient(backend, account, run);
  return {
    backend,
    account,
    async listVaults(): Promise<{ id: string; title: string }[]> {
      const vaults = await call((c) => c.vaults.list());
      return vaults.map((v) => ({ id: v.id, title: v.title }));
    },
    async listItems(vaultId: string): Promise<{ id: string; title: string }[]> {
      const items = await call((c) => c.items.list(vaultId));
      return items
        .map((i) => ({ id: i.id, title: i.title }))
        .sort((a, b) => a.title.localeCompare(b.title));
    },
    async listFields(
      vaultId: string,
      itemId: string
    ): Promise<OnePasswordFieldOption[]> {
      const [vaults, item] = await Promise.all([
        call((c) => c.vaults.list()),
        call((c) => c.items.get(vaultId, itemId))
      ]);
      const vault = vaults.find((v) => v.id === vaultId);
      const sections = new Map(item.sections.map((s) => [s.id, s.title]));
      return item.fields.map((field) => {
        const section = field.sectionId
          ? (sections.get(field.sectionId) ?? null)
          : null;
        return {
          id: field.id,
          title: field.title,
          section: section || null,
          fieldType: field.fieldType,
          reference: buildOnePasswordReference({
            vault: { id: vaultId, title: vault?.title ?? "" },
            vaultTitles: vaults.map((v) => v.title),
            item: { id: item.id, title: item.title },
            field,
            fields: item.fields,
            sectionTitle: section
          })
        };
      });
    }
  };
}

const NAME_SAFE_RE = new RegExp(`^${SEGMENT}$`);

function nameSafe(name: string): boolean {
  return name.trim() === name && name !== "" && NAME_SAFE_RE.test(name);
}

/**
 * Build the reference for a field: names where they are unambiguous and fit
 * the reference syntax, so the reference stays readable, otherwise ids.
 */
export function buildOnePasswordReference(opts: {
  vault: { id: string; title: string };
  vaultTitles: string[];
  item: { id: string; title: string };
  field: { id: string; title: string; sectionId?: string };
  fields: { id: string; title: string; sectionId?: string }[];
  sectionTitle: string | null;
}): string {
  const lower = (s: string) => s.toLowerCase();
  const vault =
    nameSafe(opts.vault.title) &&
    opts.vaultTitles.filter((t) => lower(t) === lower(opts.vault.title))
      .length === 1
      ? opts.vault.title
      : opts.vault.id;
  // Item titles are not unique within a vault, and listing them all to check
  // costs a round trip per pick, so items are referenced by id.
  const item = opts.item.id;
  const sameTitle = opts.fields.filter(
    (f) => lower(f.title) === lower(opts.field.title)
  );
  if (nameSafe(opts.field.title) && sameTitle.length === 1) {
    return `op://${vault}/${item}/${opts.field.title}`;
  }
  const sameInSection = sameTitle.filter(
    (f) => f.sectionId === opts.field.sectionId
  );
  if (
    opts.sectionTitle &&
    nameSafe(opts.sectionTitle) &&
    nameSafe(opts.field.title) &&
    sameInSection.length === 1
  ) {
    return `op://${vault}/${item}/${opts.sectionTitle}/${opts.field.title}`;
  }
  return `op://${vault}/${item}/${opts.field.id}`;
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
