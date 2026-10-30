import { isHostAccessEnabled } from "./host-access-gate.js";
const MAX_RUN_MEDIA_BYTES = 256 * 1024 * 1024;
export const DEFAULT_TIMEOUT_MS = 30_000;
export const MAX_OUTPUT_SIZE = 100_000;
export const MAX_LOOP_ITERATIONS = 10_000;
export const MAX_FETCH_CALLS = 20;
export const MAX_RESPONSE_BODY_SIZE = 1_000_000;
/** Guest heap cap. QuickJS aborts if the guest tries to allocate beyond this. */
export const GUEST_MEMORY_LIMIT = 64 * 1024 * 1024;
/** Guest stack cap — protects against deeply recursive code. */
export const GUEST_STACK_LIMIT = 512 * 1024;
/** Per-request wall-clock cap for the fetch bridge. */
export const FETCH_TIMEOUT_MS = 15_000;
/** Redirect hops the fetch bridge follows before giving up. */
export const MAX_FETCH_REDIRECTS = 5;
/** Locale used by the `format` bridge when the caller names none. */
export const DEFAULT_FORMAT_LOCALE = "en-US";

export interface SandboxLimits {
  maxFetchCalls?: number;
  maxResponseBodyBytes?: number;
  maxOutputSize?: number;
  memoryLimitBytes?: number;
  /**
   * Total bytes of media one run may hold host-side for its handles. The
   * aggregate the per-call image/media ceilings never bounded.
   */
  runMediaBytes?: number;
  stackLimitBytes?: number;
  fetchTimeoutMs?: number;
  /**
   * Permit fetches to loopback, link-local and private address ranges.
   *
   * Off by default: guest code is untrusted, so the SSRF guard is the norm and
   * this is the exception. It exists because the trusted `lib.http` nodes have
   * always been able to reach a local service, and a Code node replacing one
   * must be able to do the same — a workflow pointing at `http://localhost:8000`
   * would otherwise silently stop working.
   *
   * Host-set only: it is read from {@link RunSandboxOptions.limits} and never
   * exposed to the guest, so sandboxed code cannot turn it on for itself.
   */
  allowPrivateNetwork?: boolean;
  /** `User-Agent` for bridge fetches. Guest-set headers still win. */
  userAgent?: string;
  /**
   * `"workspace"` (default) confines every `workspace.*` call to the workspace
   * root, symlinks included. `"host"` lifts that to the whole filesystem the
   * process can reach, with `~` expanded.
   *
   * Off by default for the same reason as {@link allowPrivateNetwork}, and the
   * stakes are higher — host mode can read credential files. It exists because
   * roughly half the `lib.os` nodes already operate on arbitrary host paths
   * (`expandUser` + raw `node:fs`), so a Code node replacing one needs the same
   * reach. Host-set only, and the graph migration sets it only on nodes
   * rewritten from such a node — a hand-written or model-authored Code node
   * stays confined.
   */
  filesystemAccess?: "workspace" | "host";
  /**
   * The secret names this run may read, or `null`/absent for every secret the
   * store holds.
   *
   * A script that talks to an external service needs one credential, and
   * nothing about `getSecret` used to say so: a node written to send a Slack
   * message could read the AWS keys. Declaring the scope makes the credential
   * a node reaches part of the node, visible in the graph and refused at the
   * bridge rather than trusted to the code.
   *
   * Host-set only, like {@link allowPrivateNetwork}. A run reads its own scope
   * through `nodetool.secrets.list()` but cannot widen it, and an empty array
   * means no secret at all — a stricter thing than an absent scope, not a
   * looser one.
   */
  secretScope?: readonly string[] | null;
}

export type ResolvedSandboxLimits = Required<SandboxLimits>;

/**
 * Normalize a declared secret scope: a list of non-empty names, or `null` for
 * an unscoped run. An empty declared list stays empty — it denies everything.
 */
function resolveSecretScope(
  scope: readonly string[] | null | undefined
): readonly string[] | null {
  if (!Array.isArray(scope)) return null;
  return scope
    .filter((name): name is string => typeof name === "string" && name !== "")
    .map((name) => name.trim())
    .filter((name) => name !== "");
}

function clampLimit(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  if (value == null || !Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.floor(value), min), max);
}

/** Apply defaults and ceilings to a caller-supplied {@link SandboxLimits}. */
export function resolveSandboxLimits(
  limits?: SandboxLimits
): ResolvedSandboxLimits {
  return {
    maxFetchCalls: clampLimit(limits?.maxFetchCalls, MAX_FETCH_CALLS, 0, 100),
    maxResponseBodyBytes: clampLimit(
      limits?.maxResponseBodyBytes,
      MAX_RESPONSE_BODY_SIZE,
      1024,
      50 * 1024 * 1024
    ),
    maxOutputSize: clampLimit(
      limits?.maxOutputSize,
      MAX_OUTPUT_SIZE,
      1024,
      10 * 1024 * 1024
    ),
    memoryLimitBytes: clampLimit(
      limits?.memoryLimitBytes,
      GUEST_MEMORY_LIMIT,
      1024 * 1024,
      512 * 1024 * 1024
    ),
    runMediaBytes: clampLimit(
      limits?.runMediaBytes,
      MAX_RUN_MEDIA_BYTES,
      1024 * 1024,
      2 * 1024 * 1024 * 1024
    ),
    stackLimitBytes: clampLimit(
      limits?.stackLimitBytes,
      GUEST_STACK_LIMIT,
      16 * 1024,
      8 * 1024 * 1024
    ),
    fetchTimeoutMs: clampLimit(
      limits?.fetchTimeoutMs,
      FETCH_TIMEOUT_MS,
      100,
      120_000
    ),
    // Not clamped — these are capability switches, not magnitudes. Both
    // resolve to the restrictive value unless the host explicitly opts out,
    // and the cloud profile never lets them out (see isHostAccessEnabled).
    allowPrivateNetwork:
      limits?.allowPrivateNetwork === true && isHostAccessEnabled(),
    userAgent: limits?.userAgent ?? "",
    filesystemAccess:
      limits?.filesystemAccess === "host" && isHostAccessEnabled()
        ? "host"
        : "workspace",
    secretScope: resolveSecretScope(limits?.secretScope)
  };
}
