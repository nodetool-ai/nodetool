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
import { basename, dirname, join, relative, resolve } from "node:path";

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

/**
 * One file that decided *which* inputs esbuild read, with its content hash.
 *
 * Input hashes answer "did the files we bundled change". They cannot answer
 * "would we still resolve to those files", because a `package.json` is
 * consulted during resolution and never appears among the inputs: flip
 * `exports` from `v1.js` to `v2.js` and, as long as `v1.js` is still on disk
 * unchanged, every recorded input still matches while the bundle is wrong.
 * These records close that gap — the manifests governing each input, plus the
 * places a closer copy of the dependency could appear and shadow the one that
 * won.
 */
export interface ResolutionDigest {
  /**
   * Pack-relative path. Unlike an input this may reach above the pack, because
   * a hoisted install puts the manifest that resolved it there.
   */
  readonly path: string;
  /** Content hash, or {@link ABSENT} for a file that did not exist. */
  readonly sha256: string;
}

/** Recorded in place of a hash for a file that was not there. */
export const ABSENT = "absent";

/** A successful bundle plus what the cache key is computed from. */
export interface BundleResult {
  readonly source: string;
  readonly bytes: number;
  /** Every input esbuild read, sorted by path. */
  readonly inputDigests: readonly InputDigest[];
  /** Every file that decided which inputs those were, sorted by path. */
  readonly resolutionDigests: readonly ResolutionDigest[];
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
    const resolutionDigests = hashResolution(packDir, npmName, built.metafile);
    return {
      status: "bundled",
      result: {
        source,
        bytes: Buffer.byteLength(source, "utf8"),
        inputDigests,
        resolutionDigests,
        inputsDigest: digestOf(inputDigests, resolutionDigests),
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
    if (isSyntheticEntry(packDir, relativePath)) continue;
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
  return digests.sort(byPath);
}

/**
 * Hash every file that decided which inputs esbuild read.
 *
 * Two sets, both of them `package.json` files. The *governing* manifests are
 * the ones a resolver consults on the way to an input — the package's own
 * manifest, whose `exports`/`main` chose the file, any nested manifest between
 * it and the file, and the pack's own. The *shadow* candidates are the places
 * a nearer copy of the dependency could be installed later; those are usually
 * absent, and an absence that becomes a file is exactly the change that
 * silently re-resolves the import.
 *
 * Lockfiles are deliberately not hashed. A lockfile records what *should* be
 * installed, so hashing one invalidates every pack's cache on any unrelated
 * dependency edit while still saying nothing about the tree on disk. Once the
 * install actually happens it moves either an input or one of these manifests,
 * which is what the digest is watching.
 */
function hashResolution(
  packDir: string,
  npmName: string,
  metafile: Metafile | undefined
): ResolutionDigest[] {
  const paths = new Set<string>(shadowCandidates(packDir, npmName));
  paths.add(join(packDir, "package.json"));
  for (const relativePath of Object.keys(metafile?.inputs ?? {})) {
    if (isSyntheticEntry(packDir, relativePath)) continue;
    for (const manifest of manifestsGoverning(packDir, resolve(packDir, relativePath))) {
      paths.add(manifest);
    }
  }
  const digests: ResolutionDigest[] = [];
  for (const absolute of paths) {
    let bytes: Buffer;
    try {
      bytes = readFileSync(absolute);
    } catch {
      digests.push({ path: relative(packDir, absolute), sha256: ABSENT });
      continue;
    }
    digests.push({
      path: relative(packDir, absolute),
      sha256: createHash("sha256").update(bytes).digest("hex")
    });
  }
  return digests.sort(byPath);
}

function isSyntheticEntry(packDir: string, inputPath: string): boolean {
  return resolve(packDir, inputPath) === join(packDir, `${NAMESPACE}.js`);
}

/**
 * Every `package.json` between `file` and the root of the package holding it.
 *
 * The walk stops at the enclosing `node_modules` — above that directory is a
 * different package, whose manifest had no say in resolving this file — or at
 * the pack itself for a file the pack ships.
 */
function manifestsGoverning(packDir: string, file: string): string[] {
  const manifests: string[] = [];
  let dir = dirname(file);
  while (basename(dir) !== "node_modules") {
    manifests.push(join(dir, "package.json"));
    const parent = dirname(dir);
    if (parent === dir || dir === packDir) break;
    dir = parent;
  }
  return manifests;
}

/**
 * Every `node_modules/<npmName>/package.json` from the pack upward.
 *
 * Node resolution takes the nearest one, so a copy installed closer to the
 * pack than the one that won replaces the dependency without touching a single
 * recorded input.
 */
function shadowCandidates(packDir: string, npmName: string): string[] {
  const segments = npmName.split("/");
  const candidates: string[] = [];
  let dir = packDir;
  for (;;) {
    if (basename(dir) !== "node_modules") {
      candidates.push(join(dir, "node_modules", ...segments, "package.json"));
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return candidates;
}

function byPath(left: { path: string }, right: { path: string }): number {
  return left.path < right.path ? -1 : left.path > right.path ? 1 : 0;
}

function digestOf(
  inputDigests: readonly InputDigest[],
  resolutionDigests: readonly ResolutionDigest[]
): string {
  return createHash("sha256")
    .update(JSON.stringify({ inputs: inputDigests, resolution: resolutionDigests }))
    .digest("hex");
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
