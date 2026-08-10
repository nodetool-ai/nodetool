/**
 * The compiler's pinned build options.
 *
 * Every constant here is part of the cache key and of an npm module's content
 * digest, so changing one invalidates every cached artifact — which is the
 * point: a different resolver condition can select a different file of the same
 * package version, and the old bundle must not survive the change.
 */

/**
 * Export conditions, in priority order.
 *
 * `platform: "neutral"` alone leaves the condition set empty, so a package with
 * `exports` maps resolves through `default` only — or fails. These are pinned
 * instead: the guest is neither Node nor a browser, so `node` and `browser` are
 * deliberately absent and a package's most portable build wins.
 */
export const NPM_BUNDLE_CONDITIONS: readonly string[] = ["import", "module", "default"];

/** `package.json` fields consulted for packages that predate `exports`. */
export const NPM_BUNDLE_MAIN_FIELDS: readonly string[] = ["module", "main"];

/** Syntax level the bundle is lowered to. QuickJS-ng covers ES2022. */
export const NPM_BUNDLE_TARGET = "es2022";

/**
 * Maximum bundled source, in bytes.
 *
 * Measured against the real bridge candidates in
 * `docs/m3-implementation-plan.md`; the number is evidence, not a guess. It
 * matches `SANDBOX_PACKAGE_LIMITS.npmBundledJsBytes` in node-sdk, which
 * re-checks the artifact discovery actually loads.
 */
export const NPM_BUNDLE_MAX_BYTES = 1024 * 1024;

/** Wall clock the admission probe gets to import the bundle. */
export const NPM_PROBE_TIMEOUT_MS = 5_000;

/** Guest heap the admission probe gets. */
export const NPM_PROBE_MEMORY_BYTES = 64 * 1024 * 1024;

/** Guest stack the admission probe gets. */
export const NPM_PROBE_STACK_BYTES = 1024 * 1024;

/** Console lines the probe keeps; a chatty module cannot flood the host. */
export const NPM_PROBE_MAX_LOG_LINES = 20;

/** Characters kept per captured probe log line. */
export const NPM_PROBE_MAX_LOG_CHARS = 500;

/**
 * The compiler's own contract version.
 *
 * Bump it whenever the bundle shim, the scan rules, or the probe change what
 * "admitted" means. It is part of the cache key, so a bump re-compiles and
 * re-probes everything rather than trusting a verdict an older compiler made.
 */
export const SANDBOX_COMPILER_VERSION = "2";

/** The build options exactly as the cache key records them. */
export interface NormalizedCompileOptions {
  readonly conditions: readonly string[];
  readonly mainFields: readonly string[];
  readonly target: string;
  readonly format: "esm";
  readonly platform: "neutral";
  readonly bundle: true;
  readonly minify: false;
  readonly maxBytes: number;
}

/** The one option set the compiler builds with. */
export function normalizedCompileOptions(): NormalizedCompileOptions {
  return {
    conditions: [...NPM_BUNDLE_CONDITIONS],
    mainFields: [...NPM_BUNDLE_MAIN_FIELDS],
    target: NPM_BUNDLE_TARGET,
    format: "esm",
    platform: "neutral",
    bundle: true,
    minify: false,
    maxBytes: NPM_BUNDLE_MAX_BYTES
  };
}
