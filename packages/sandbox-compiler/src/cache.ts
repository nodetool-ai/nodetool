/**
 * Content-addressed cache for compiled npm modules.
 *
 * The key is never `pack/name@version`. A linked pack, a transitive update, a
 * re-install, and an esbuild upgrade all change the bundle while the version
 * stays exactly where it was, so the key is a digest over what actually
 * determines the output: every input file's content hash from esbuild's
 * metafile, the resolution inputs that decided which files those were, the
 * esbuild version, this compiler's contract version, and the normalized build
 * options.
 *
 * The value carries the scan report and the probe verdict alongside the source,
 * so a warm cache skips the probe too — the expensive half of admission.
 */

import { createHash, randomBytes } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { join, resolve } from "node:path";

import { getNodetoolCacheDir } from "@nodetool-ai/config";
import type { SandboxNpmCompileOutcome } from "@nodetool-ai/node-sdk/sandbox-pack-discovery";

import { ABSENT, type InputDigest, type ResolutionDigest } from "./bundle.js";
import {
  normalizedCompileOptions,
  SANDBOX_COMPILER_VERSION
} from "./options.js";

/** The same shape with its `readonly` modifiers dropped, for step-by-step construction. */
type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/** One free reference the scan flagged. Mirrored here so the cache stays engine-free. */
export interface CachedScanFinding {
  readonly name: string;
  readonly line: number;
  readonly column: number;
  readonly kind: "hard" | "feature-detected";
}

const KEY_PATTERN = /^[a-f0-9]{64}$/;

/** What one cache entry stores. */
export interface CachedCompilation {
  readonly key: string;
  readonly npmName: string;
  readonly compilerVersion: string;
  readonly esbuildVersion: string;
  readonly optionsDigest: string;
  readonly inputsDigest: string;
  readonly source: string;
  readonly bytes: number;
  /** Every input's content hash, kept so a synchronous reader can re-verify. */
  readonly inputDigests: readonly InputDigest[];
  /** Every resolution input's hash, re-verified alongside the inputs. */
  readonly resolutionDigests: readonly ResolutionDigest[];
  readonly scanWarnings: readonly CachedScanFinding[];
  readonly probeOk: boolean;
  readonly probeExports: readonly string[];
}

/** The parts of a compile that determine its identity. */
export interface CacheKeyInput {
  readonly npmName: string;
  readonly esbuildVersion: string;
  /** Every input's content hash, from esbuild's metafile. */
  readonly inputDigests: readonly InputDigest[];
  /** Every file that decided which inputs those were. */
  readonly resolutionDigests: readonly ResolutionDigest[];
}

/** Compute the digest a compilation is stored under. */
export function computeCacheKey(input: CacheKeyInput): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        compilerVersion: SANDBOX_COMPILER_VERSION,
        esbuildVersion: input.esbuildVersion,
        options: normalizedCompileOptions(),
        npmName: input.npmName,
        inputs: [...input.inputDigests].sort(byPath),
        resolution: [...input.resolutionDigests].sort(byPath)
      })
    )
    .digest("hex");
}

function byPath(left: { path: string }, right: { path: string }): number {
  return left.path < right.path ? -1 : left.path > right.path ? 1 : 0;
}

/** Default cache root: `<user cache>/sandbox-modules`. */
export function defaultCacheRoot(): string {
  return join(getNodetoolCacheDir(), "sandbox-modules");
}

/** A cache over one directory. Every failure degrades to a miss, never a throw. */
export class CompiledModuleCache {
  constructor(private readonly root: string = defaultCacheRoot()) {}

  /** Read an entry, or `undefined` on a miss, a bad key, or corrupt content. */
  read(key: string): CachedCompilation | undefined {
    const path = this.pathFor(key);
    if (path === undefined) return undefined;
    let raw: string;
    try {
      raw = readFileSync(path, "utf8");
    } catch {
      // A miss and an unreadable entry are the same answer: compile again.
      return undefined;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // A truncated or hand-edited entry is discarded rather than trusted.
      this.evict(key);
      return undefined;
    }
    const entry = parsed as Partial<CachedCompilation>;
    if (
      entry.key !== key ||
      entry.compilerVersion !== SANDBOX_COMPILER_VERSION ||
      typeof entry.source !== "string" ||
      typeof entry.npmName !== "string" ||
      typeof entry.probeOk !== "boolean"
    ) {
      this.evict(key);
      return undefined;
    }
    return {
      key,
      npmName: entry.npmName,
      compilerVersion: SANDBOX_COMPILER_VERSION,
      esbuildVersion: entry.esbuildVersion ?? "",
      optionsDigest: entry.optionsDigest ?? "",
      inputsDigest: entry.inputsDigest ?? "",
      source: entry.source,
      bytes: entry.bytes ?? Buffer.byteLength(entry.source, "utf8"),
      inputDigests: entry.inputDigests ?? [],
      resolutionDigests: entry.resolutionDigests ?? [],
      scanWarnings: entry.scanWarnings ?? [],
      probeOk: entry.probeOk,
      probeExports: entry.probeExports ?? []
    };
  }

  /**
   * Read a compiled module without running esbuild.
   *
   * The key is a digest over esbuild's input list, which only a bundle run
   * produces — so a synchronous host cannot compute it. A pointer written
   * alongside each entry maps `(pack directory, dependency)` to that key, and
   * this reader then re-hashes every input the entry recorded before trusting
   * it. Content still decides: an entry whose inputs moved is a miss, and a
   * miss is `pending-compile`, never a stale hit.
   *
   * The inputs alone are not enough to decide that. Resolution metadata never
   * appears among them, so a `package.json` that starts pointing `exports` at
   * a different file, or a nearer copy of the dependency that shadows the one
   * that won, leaves every input untouched while making the bundle wrong.
   * Those files are re-hashed here too — an absent one that has appeared
   * counts as changed.
   */
  readForPack(packDir: string, npmName: string): CachedCompilation | undefined {
    const pointerPath = this.pointerPathFor(packDir, npmName);
    if (pointerPath === undefined) return undefined;
    let key: unknown;
    try {
      key = (JSON.parse(readFileSync(pointerPath, "utf8")) as { key?: unknown })
        .key;
    } catch {
      // No pointer, or an unreadable one: compile again.
      return undefined;
    }
    if (typeof key !== "string") return undefined;
    const entry = this.read(key);
    if (entry === undefined) return undefined;
    if (!inputsUnchanged(packDir, entry.inputDigests)) return undefined;
    return resolutionUnchanged(packDir, entry.resolutionDigests)
      ? entry
      : undefined;
  }

  /** Record where a pack's dependency compiled to, for {@link readForPack}. */
  writePointer(packDir: string, npmName: string, key: string): void {
    const pointerPath = this.pointerPathFor(packDir, npmName);
    if (pointerPath === undefined || !KEY_PATTERN.test(key)) return;
    const temporary = `${pointerPath}.${randomBytes(8).toString("hex")}.tmp`;
    try {
      mkdirSync(join(this.root, "index"), { recursive: true });
      writeFileSync(temporary, JSON.stringify({ key }), "utf8");
      renameSync(temporary, pointerPath);
    } catch {
      try {
        rmSync(temporary, { force: true });
      } catch {
        // Nothing further to do about an undeletable temp file.
      }
    }
  }

  private pointerPathFor(packDir: string, npmName: string): string | undefined {
    let realDir: string;
    try {
      realDir = realpathSync(packDir);
    } catch {
      // A pack directory that no longer exists has nothing to point at.
      return undefined;
    }
    const digest = createHash("sha256")
      .update(
        JSON.stringify({
          compilerVersion: SANDBOX_COMPILER_VERSION,
          realDir,
          npmName
        })
      )
      .digest("hex");
    return join(this.root, "index", `${digest}.json`);
  }

  /**
   * Write an entry atomically.
   *
   * A temp file in the same directory plus a rename, so a reader never observes
   * half an entry and two compilers racing on one key both leave a whole one.
   */
  write(entry: CachedCompilation): void {
    const path = this.pathFor(entry.key);
    if (path === undefined) return;
    const temporary = `${path}.${randomBytes(8).toString("hex")}.tmp`;
    try {
      mkdirSync(this.root, { recursive: true });
      writeFileSync(temporary, JSON.stringify(entry), "utf8");
      renameSync(temporary, path);
    } catch {
      // A cache that cannot be written still compiles; drop the temp file.
      try {
        rmSync(temporary, { force: true });
      } catch {
        // Nothing further to do about an undeletable temp file.
      }
    }
  }

  /** Remove an entry. Used when one fails to parse. */
  evict(key: string): void {
    const path = this.pathFor(key);
    if (path === undefined) return;
    try {
      rmSync(path, { force: true });
    } catch {
      // An entry that cannot be removed is simply re-read and re-rejected.
    }
  }

  /** Reject anything that is not a bare digest before it reaches the path. */
  private pathFor(key: string): string | undefined {
    if (!KEY_PATTERN.test(key)) return undefined;
    return join(this.root, `${key}.json`);
  }
}

/** Re-hash every recorded input and report whether all of them still match. */
function inputsUnchanged(
  packDir: string,
  inputDigests: readonly InputDigest[]
): boolean {
  if (inputDigests.length === 0) return false;
  for (const record of inputDigests) {
    let bytes: Buffer;
    try {
      bytes = readFileSync(resolve(packDir, record.path));
    } catch {
      // An input that disappeared changes the bundle; treat it as a miss.
      return false;
    }
    if (createHash("sha256").update(bytes).digest("hex") !== record.sha256)
      return false;
  }
  return true;
}

/**
 * Re-hash every recorded resolution input and report whether all still match.
 *
 * A record whose file is gone must hash to {@link ABSENT}, and one recorded as
 * absent must still be absent — an appearing `package.json` is a dependency
 * that now resolves somewhere else.
 */
function resolutionUnchanged(
  packDir: string,
  resolutionDigests: readonly ResolutionDigest[]
): boolean {
  if (resolutionDigests.length === 0) return false;
  for (const record of resolutionDigests) {
    let current: string;
    try {
      current = createHash("sha256")
        .update(readFileSync(resolve(packDir, record.path)))
        .digest("hex");
    } catch {
      current = ABSENT;
    }
    if (current !== record.sha256) return false;
  }
  return true;
}

/**
 * A {@link SandboxCompiledNpmLookup} that only reads the cache.
 *
 * This is the synchronous host's path: the CLI's `buildFullRegistry` never
 * compiles, so a module it has no cached artifact for surfaces as
 * `pending-compile` naming `nodetool packs compile`.
 */
export function createCachedNpmLookup(
  cache: CompiledModuleCache = new CompiledModuleCache()
): (request: {
  readonly packName: string;
  readonly packDir: string;
  readonly specifier: string;
  readonly npmName: string;
}) =>
  | {
      readonly status: "compiled";
      readonly artifact: {
        readonly source: string;
        readonly compilerVersion: string;
        readonly optionsDigest: string;
        readonly inputsDigest: string;
      };
      readonly warnings?: readonly string[];
    }
  | undefined {
  return (request) => {
    const entry = cache.readForPack(request.packDir, request.npmName);
    if (entry === undefined || !entry.probeOk) return undefined;
    const warnings = entry.scanWarnings.map(
      (finding) =>
        `${request.npmName} feature-detects ${finding.name} at ${finding.line}:${finding.column}; the guest has no such global, so that branch never runs`
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
  };
}
