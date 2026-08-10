/**
 * esbuild half of the compile pipeline: resolve an npm dependency from a pack's
 * own directory and produce one ESM bundle with no externals.
 *
 * Two things this deliberately does *not* do. It does not minify — a digest and
 * a human review both beat the bytes saved. And it does not allow a single
 * external: an import that leaves the bundle is an import the guest cannot
 * resolve, so the resolution failure has to happen here, at admission, where it
 * becomes a named skip.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isBuiltin } from "node:module";
import { resolve } from "node:path";

import esbuild, { type BuildFailure, type Metafile, type Plugin } from "esbuild";

import {
  NPM_BUNDLE_CONDITIONS,
  NPM_BUNDLE_MAIN_FIELDS,
  NPM_BUNDLE_TARGET,
  normalizedCompileOptions
} from "./options.js";

/** One input file esbuild read, with its content hash. */
export interface InputDigest {
  /** Pack-relative path, so the record is the same on every machine. */
  readonly path: string;
  readonly sha256: string;
}

/** A successful bundle plus what the cache key is computed from. */
export interface BundleResult {
  readonly source: string;
  readonly bytes: number;
  /** Every input esbuild read, sorted by path. */
  readonly inputDigests: readonly InputDigest[];
  readonly inputsDigest: string;
  readonly optionsDigest: string;
  readonly esbuildVersion: string;
  /** Whether the shim re-exported a default binding. */
  readonly defaultExport: boolean;
}

/** A bundle that cannot be produced, with the reason already named. */
export interface BundleFailure {
  readonly code:
    | "npm-module-builtin-import"
    | "npm-module-unresolved"
    | "npm-module-bundle-failed";
  readonly message: string;
}

export type BundleOutcome =
  | { readonly status: "bundled"; readonly result: BundleResult }
  | { readonly status: "failed"; readonly failure: BundleFailure };

const NAMESPACE = "nodetool-sandbox-entry";

/** Bundle `npmName` as resolved from `packDir`. */
export async function bundleNpmModule(
  packDir: string,
  npmName: string
): Promise<BundleOutcome> {
  const withDefault = await runBuild(packDir, npmName, true);
  if (withDefault.status === "bundled") return withDefault;
  if (withDefault.failure.code !== "npm-module-bundle-failed") return withDefault;
  // A real ESM package without a default export rejects `export { default }`.
  // Re-export only the named bindings rather than call the package unusable.
  const namedOnly = await runBuild(packDir, npmName, false);
  return namedOnly.status === "bundled" ? namedOnly : withDefault;
}

async function runBuild(
  packDir: string,
  npmName: string,
  withDefault: boolean
): Promise<BundleOutcome> {
  const builtins: string[] = [];
  const contents = withDefault
    ? `export * from ${JSON.stringify(npmName)};\nexport { default } from ${JSON.stringify(npmName)};\n`
    : `export * from ${JSON.stringify(npmName)};\n`;

  try {
    const built = await esbuild.build({
      stdin: { contents, resolveDir: packDir, sourcefile: `${NAMESPACE}.js`, loader: "js" },
      // Metafile input paths are relative to the working directory. Pinning it
      // to the pack makes them pack-relative, so the recorded input list is the
      // same on every machine and a synchronous reader can re-hash them.
      absWorkingDir: packDir,
      bundle: true,
      format: "esm",
      platform: "neutral",
      conditions: [...NPM_BUNDLE_CONDITIONS],
      mainFields: [...NPM_BUNDLE_MAIN_FIELDS],
      target: NPM_BUNDLE_TARGET,
      minify: false,
      treeShaking: true,
      sourcemap: false,
      charset: "utf8",
      legalComments: "none",
      write: false,
      metafile: true,
      logLevel: "silent",
      plugins: [rejectBuiltins(builtins)]
    });
    const output = built.outputFiles?.[0];
    if (output === undefined) {
      return failed("npm-module-bundle-failed", `${npmName}: esbuild produced no output`);
    }
    const source = output.text;
    const inputDigests = hashInputs(packDir, built.metafile);
    return {
      status: "bundled",
      result: {
        source,
        bytes: Buffer.byteLength(source, "utf8"),
        inputDigests,
        inputsDigest: digestOf(inputDigests),
        optionsDigest: optionsDigest(esbuild.version),
        esbuildVersion: esbuild.version,
        defaultExport: withDefault
      }
    };
  } catch (error) {
    if (builtins.length > 0) {
      const names = [...new Set(builtins)].sort().join(", ");
      return failed(
        "npm-module-builtin-import",
        `${npmName} imports ${names} — a Node builtin needs the host bridge path, which the guest does not have`
      );
    }
    const text = buildFailureText(error);
    if (/could not resolve/i.test(text)) {
      return failed("npm-module-unresolved", `${npmName}: ${text}`);
    }
    return failed("npm-module-bundle-failed", `${npmName}: ${text}`);
  }
}

function failed(code: BundleFailure["code"], message: string): BundleOutcome {
  return { status: "failed", failure: { code, message } };
}

/**
 * Fail the bundle on any Node builtin, by name.
 *
 * `platform: "neutral"` would already refuse to resolve `node:fs`, but the
 * message it produces reads like a missing package. Naming the builtin is what
 * turns the failure into a skip a pack author can act on.
 */
function rejectBuiltins(collected: string[]): Plugin {
  return {
    name: "nodetool-reject-node-builtins",
    setup(build) {
      build.onResolve({ filter: /.*/ }, (args) => {
        if (args.kind === "entry-point") return null;
        const target = args.path;
        if (!isBuiltin(target)) return null;
        collected.push(target.startsWith("node:") ? target : `node:${target}`);
        return {
          errors: [{ text: `${target} is a Node builtin and is not available in the sandbox` }]
        };
      });
    }
  };
}

function hashInputs(packDir: string, metafile: Metafile | undefined): InputDigest[] {
  if (metafile === undefined) return [];
  const digests: InputDigest[] = [];
  for (const relativePath of Object.keys(metafile.inputs)) {
    if (relativePath.startsWith(`${NAMESPACE}.js`)) continue;
    const absolute = resolve(packDir, relativePath);
    let bytes: Buffer;
    try {
      bytes = readFileSync(absolute);
    } catch {
      // An input esbuild read but we cannot re-read is recorded as missing so
      // the key changes rather than silently matching a stale entry.
      digests.push({ path: relativePath, sha256: "unreadable" });
      continue;
    }
    digests.push({ path: relativePath, sha256: createHash("sha256").update(bytes).digest("hex") });
  }
  return digests.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
}

function digestOf(inputDigests: readonly InputDigest[]): string {
  return createHash("sha256").update(JSON.stringify(inputDigests)).digest("hex");
}

/** Digest of the pinned options plus the esbuild that will apply them. */
export function optionsDigest(esbuildVersion: string): string {
  return createHash("sha256")
    .update(JSON.stringify({ esbuildVersion, options: normalizedCompileOptions() }))
    .digest("hex");
}

function buildFailureText(error: unknown): string {
  const failure = error as Partial<BuildFailure>;
  if (Array.isArray(failure.errors) && failure.errors.length > 0) {
    return failure.errors.map((message) => message.text).join("; ");
  }
  return error instanceof Error ? error.message : String(error);
}
