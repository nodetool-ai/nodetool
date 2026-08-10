/**
 * The dedicated npm-module compiler for the sandbox package system.
 *
 * A pack can declare `{"name": ".", "kind": "js", "npm": "js-yaml"}` instead of
 * authoring guest code, and this package produces the module: esbuild bundles
 * the dependency with pinned resolver conditions, a scope-aware scan rejects
 * free references to globals the guest lacks, and a capability-free QuickJS
 * probe imports the result to prove it initializes. Everything is cached by
 * content digest, never by version.
 *
 * It lives outside node-sdk on purpose. node-sdk's discovery is synchronous and
 * must not depend on esbuild or a JavaScript engine, so hosts compile here and
 * inject the artifacts into discovery.
 */

export {
  NPM_BUNDLE_CONDITIONS,
  NPM_BUNDLE_MAIN_FIELDS,
  NPM_BUNDLE_MAX_BYTES,
  NPM_BUNDLE_TARGET,
  NPM_PROBE_TIMEOUT_MS,
  SANDBOX_COMPILER_VERSION,
  normalizedCompileOptions,
  type NormalizedCompileOptions
} from "./options.js";

export {
  ABSENT,
  bundleNpmModule,
  optionsDigest,
  type BundleFailure,
  type BundleOutcome,
  type BundleResult,
  type InputDigest,
  type ResolutionDigest
} from "./bundle.js";

export {
  FORBIDDEN_GLOBALS,
  scanBundle,
  type ScanFinding,
  type ScanReport
} from "./scan.js";

export { probeBundle, type ProbeVerdict } from "./probe.js";

export {
  CompiledModuleCache,
  computeCacheKey,
  defaultCacheRoot,
  type CachedCompilation,
  type CacheKeyInput
} from "./cache.js";

export {
  compileNpmModule,
  type CompileNpmModuleRequest,
  type CompileNpmModuleResult
} from "./compile.js";

export {
  compileDiscoveries,
  compileSandboxCatalog,
  createCompiledNpmLookup,
  type CompileCatalogOptions,
  type CompiledCatalogHost,
  type CompiledModuleReport
} from "./catalog.js";
