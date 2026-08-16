/**
 * The compile pipeline, in execution order: bundle, scan, probe — wrapped by
 * the content-addressed cache.
 *
 * Every way this can end short of an admitted module is a *named skip*, not an
 * error. A pack that imports `node:fs`, one that reaches for `process`, one
 * whose bundle is over the cap, and one that throws while initializing are four
 * different problems, and the pack author gets told which.
 */

import { bundleNpmModule } from "./bundle.js";
import {
  CompiledModuleCache,
  computeCacheKey,
  type CachedCompilation
} from "./cache.js";
import { NPM_BUNDLE_MAX_BYTES, SANDBOX_COMPILER_VERSION } from "./options.js";
import { probeBundle } from "./probe.js";
import { scanBundle, type ScanFinding } from "./scan.js";
import type { SandboxNpmCompileOutcome } from "@nodetool-ai/node-sdk/sandbox-pack-discovery";

/** The same shape with its `readonly` modifiers dropped, for step-by-step construction. */
type Mutable<T> = { -readonly [K in keyof T]: T[K] };

export interface CompileNpmModuleRequest {
  readonly packDir: string;
  readonly npmName: string;
  /** Provide a cache to reuse one across a whole discovery pass. */
  readonly cache?: CompiledModuleCache;
  /** Skip the cache entirely. Tests and `--force` use this. */
  readonly noCache?: boolean;
}

/** The compile pipeline's own result, before it becomes a discovery outcome. */
export interface CompileNpmModuleResult {
  readonly outcome: SandboxNpmCompileOutcome;
  /** Whether the answer came from the cache without re-probing. */
  readonly cached: boolean;
  readonly key?: string;
}

/** Bundle, scan, and probe one npm dependency of one pack. */
export async function compileNpmModule(
  request: CompileNpmModuleRequest
): Promise<CompileNpmModuleResult> {
  const { packDir, npmName } = request;
  const bundled = await bundleNpmModule(packDir, npmName);
  if (bundled.status === "failed") {
    return {
      outcome: { status: "skipped", ...bundled.failure },
      cached: false
    };
  }
  const bundle = bundled.result;

  if (bundle.bytes > NPM_BUNDLE_MAX_BYTES) {
    return {
      outcome: {
        status: "skipped",
        code: "npm-module-too-large",
        message: `${npmName} bundles to ${bundle.bytes} bytes, over the ${NPM_BUNDLE_MAX_BYTES} byte sandbox module cap`
      },
      cached: false
    };
  }

  const key = computeCacheKey({
    npmName,
    esbuildVersion: bundle.esbuildVersion,
    inputDigests: bundle.inputDigests,
    resolutionDigests: bundle.resolutionDigests
  });
  const cache =
    request.noCache === true
      ? undefined
      : (request.cache ?? new CompiledModuleCache());
  const hit = cache?.read(key);
  if (hit !== undefined) {
    // Re-point even on a hit: a pack whose dependency was updated back to a
    // previously-compiled state must still resolve synchronously.
    cache?.writePointer(packDir, npmName, key);
    return { outcome: outcomeFor(npmName, hit), cached: true, key };
  }

  const scan = scanBundle(bundle.source);
  if (scan.rejection !== undefined) {
    return {
      outcome: {
        status: "skipped",
        code: "npm-module-scan-rejected",
        message: `${npmName}: ${scan.rejection}`
      },
      cached: false,
      key
    };
  }
  if (scan.errors.length > 0) {
    return {
      outcome: {
        status: "skipped",
        code: "npm-module-forbidden-global",
        message: `${npmName} references ${describeFindings(scan.errors)}, which the guest does not provide`
      },
      cached: false,
      key
    };
  }

  const probe = await probeBundle(bundle.source);
  if (!probe.ok) {
    return {
      outcome: {
        status: "skipped",
        code: "npm-module-probe-failed",
        message: `${npmName} failed the sandbox admission probe: ${probe.error ?? "the module did not initialize"}`
      },
      cached: false,
      key
    };
  }

  const entry: CachedCompilation = {
    key,
    npmName,
    compilerVersion: SANDBOX_COMPILER_VERSION,
    esbuildVersion: bundle.esbuildVersion,
    optionsDigest: bundle.optionsDigest,
    inputsDigest: bundle.inputsDigest,
    source: bundle.source,
    bytes: bundle.bytes,
    inputDigests: bundle.inputDigests,
    resolutionDigests: bundle.resolutionDigests,
    scanWarnings: scan.warnings,
    probeOk: true,
    probeExports: probe.exports
  };
  cache?.write(entry);
  cache?.writePointer(packDir, npmName, key);
  return { outcome: outcomeFor(npmName, entry), cached: false, key };
}

function outcomeFor(
  npmName: string,
  entry: CachedCompilation
): SandboxNpmCompileOutcome {
  const warnings = entry.scanWarnings.map(
    (finding) =>
      `${npmName} feature-detects ${finding.name} at ${finding.line}:${finding.column}; the guest has no such global, so that branch never runs`
  );
  type OutcomeFields = Mutable<SandboxNpmCompileOutcome>;
  const outcome: OutcomeFields = {
    status: "compiled",
    artifact: {
      source: entry.source,
      compilerVersion: entry.compilerVersion,
      optionsDigest: entry.optionsDigest,
      inputsDigest: entry.inputsDigest
    }
  };
  if (warnings.length > 0) {
    outcome.warnings = warnings;
  }
  return outcome;
}

function describeFindings(findings: readonly ScanFinding[]): string {
  const names = [...new Set(findings.map((finding) => finding.name))].sort();
  const first = findings[0];
  const where =
    first === undefined ? "" : ` (first at ${first.line}:${first.column})`;
  return `${names.join(", ")}${where}`;
}
