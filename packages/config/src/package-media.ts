/**
 * Package media: large `package://` files that live on media storage instead
 * of in the package.
 *
 * A package can move binary example media (game sprites, timeline footage,
 * storyboard stills) out of `nodetool/assets/<package>/` and list it in a
 * manifest next to that folder, `nodetool/assets/<package>.media.json`.
 * `scripts/package-media.mjs push` uploads the files and writes the manifest.
 * `pull` puts them back into the folder of a checkout.
 *
 * An install without the files resolves a manifest entry here: it downloads
 * the object once into the cache folder, checks its SHA-256 and size, and
 * returns the cached path. Objects are stored by content hash, so a cached
 * file never goes stale and an old install keeps working after a change.
 *
 * Its file functions need Node. The module itself loads in a browser bundle.
 */

import { getNodetoolCacheDir } from "./paths.js";
import { createLogger } from "./logging.js";
import { z } from "zod";
import { getNodeBuiltinSync, safeProcessEnv } from "./node-import.js";

// Lazy built-ins keep this module loadable in a browser bundle; only the
// functions that touch files need Node.
const cryptoLib = getNodeBuiltinSync<typeof import("node:crypto")>("node:crypto");
const fsLib = getNodeBuiltinSync<typeof import("node:fs")>("node:fs");
const fsp = getNodeBuiltinSync<typeof import("node:fs/promises")>("node:fs/promises");
const pathLib = getNodeBuiltinSync<typeof import("node:path")>("node:path");

/** The Node built-ins the file functions use. */
interface NodeLibraries {
  crypto: typeof import("node:crypto");
  fs: typeof import("node:fs");
  fsp: typeof import("node:fs/promises");
  path: typeof import("node:path");
}

function node(): NodeLibraries {
  if (!cryptoLib || !fsLib || !fsp || !pathLib) {
    throw new Error("Package media needs a Node runtime.");
  }
  return { crypto: cryptoLib, fs: fsLib, fsp, path: pathLib };
}

function extname(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot > path.lastIndexOf("/") ? path.slice(dot) : "";
}

const log = createLogger("nodetool.config.package-media");

/** The one host package media downloads from. */
export const PACKAGE_MEDIA_ORIGIN = "https://media.nodetool.ai";

const PackageMediaEntrySchema = z.object({
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  size: z.number().int().nonnegative()
});

const PackageMediaManifestSchema = z.object({
  version: z.literal(1),
  /** Object URL prefix. An object's key is `<sha256><extension>`. */
  base: z
    .string()
    .refine((base) => URL.canParse(base) && new URL(base).origin === PACKAGE_MEDIA_ORIGIN, {
      message: `base must be on ${PACKAGE_MEDIA_ORIGIN}`
    })
    .transform((base) => (base.endsWith("/") ? base : `${base}/`)),
  files: z.record(z.string(), PackageMediaEntrySchema)
});

/** One file of a package media manifest. */
export type PackageMediaEntry = z.infer<typeof PackageMediaEntrySchema>;

/** `<package>.media.json`: package-relative path to stored object. */
export type PackageMediaManifest = z.infer<typeof PackageMediaManifestSchema>;

const EXTENSION = /^\.[0-9a-z]{1,8}$/;
const manifests = new Map<string, PackageMediaManifest | null>();

function parseManifest(text: string, file: string): PackageMediaManifest | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    log.warn("invalid package media manifest", { file, error: String(error) });
    return null;
  }
  const parsed = PackageMediaManifestSchema.safeParse(raw);
  if (!parsed.success) {
    log.warn("unsupported package media manifest", { file, error: parsed.error.message });
    return null;
  }
  return parsed.data;
}

/**
 * The manifest for `packageName` in an assets root (a folder that holds
 * `<package>/` asset folders), or null when it has none. Cached per file.
 */
export function readPackageMediaManifest(
  assetsRoot: string,
  packageName: string
): PackageMediaManifest | null {
  const { fs, path } = node();
  const file = path.join(assetsRoot, `${packageName}.media.json`);
  if (manifests.has(file)) return manifests.get(file) ?? null;
  const manifest = fs.existsSync(file) ? parseManifest(fs.readFileSync(file, "utf8"), file) : null;
  manifests.set(file, manifest);
  return manifest;
}

/** The manifest entry for a package path in the first root that lists it. */
export function findPackageMedia(
  assetsRoots: readonly string[],
  packageName: string,
  path: string
): { manifest: PackageMediaManifest; entry: PackageMediaEntry } | null {
  for (const root of assetsRoots) {
    const manifest = readPackageMediaManifest(root, packageName);
    const entry = manifest?.files[path];
    if (manifest && entry) return { manifest, entry };
  }
  return null;
}

/** The object key of an entry: its hash plus the path's extension. */
export function packageMediaKey(path: string, entry: PackageMediaEntry): string {
  const extension = extname(path).toLowerCase();
  return `${entry.sha256}${EXTENSION.test(extension) ? extension : ""}`;
}

/** Where downloaded objects are kept. NODETOOL_PACKAGE_MEDIA_CACHE overrides. */
export function packageMediaCacheDir(): string {
  return (
    safeProcessEnv()["NODETOOL_PACKAGE_MEDIA_CACHE"]?.trim() ||
    node().path.join(getNodetoolCacheDir(), "package-media")
  );
}

const inflight = new Map<string, Promise<string>>();

async function cachedObject(cacheDir: string, key: string, entry: PackageMediaEntry): Promise<string | null> {
  const file = node().path.join(cacheDir, key);
  try {
    const info = await node().fsp.stat(file);
    if (info.isFile() && info.size === entry.size) return file;
  } catch {
    // Not cached yet.
  }
  return null;
}

async function download(url: string, file: string, entry: PackageMediaEntry): Promise<string> {
  const response = await fetch(url, { redirect: "error" });
  if (!response.ok) throw new Error(`package media ${url} answered ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const { crypto, fsp } = node();
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  if (bytes.byteLength !== entry.size || sha256 !== entry.sha256) {
    throw new Error(`package media ${url} does not match its manifest entry`);
  }
  const partial = `${file}.${crypto.randomUUID()}.partial`;
  try {
    await fsp.writeFile(partial, bytes);
    await fsp.rename(partial, file);
  } finally {
    await fsp.rm(partial, { force: true });
  }
  return file;
}

/**
 * The local path of a package media file: the cached object, downloaded on
 * first use. Returns null when no root's manifest lists the path. Throws when
 * the download fails or the bytes do not match the manifest.
 */
export async function fetchPackageMedia(
  assetsRoots: readonly string[],
  packageName: string,
  path: string,
  cacheDir = packageMediaCacheDir()
): Promise<string | null> {
  const found = findPackageMedia(assetsRoots, packageName, path);
  if (!found) return null;
  const key = packageMediaKey(path, found.entry);
  const cached = await cachedObject(cacheDir, key, found.entry);
  if (cached) return cached;
  let pending = inflight.get(key);
  if (!pending) {
    pending = (async () => {
      await node().fsp.mkdir(cacheDir, { recursive: true });
      return download(`${found.manifest.base}${key}`, node().path.join(cacheDir, key), found.entry);
    })().finally(() => inflight.delete(key));
    inflight.set(key, pending);
  }
  return pending;
}

/** {@link fetchPackageMedia}, returning the file's bytes. */
export async function readPackageMedia(
  assetsRoots: readonly string[],
  packageName: string,
  path: string
): Promise<Uint8Array | null> {
  const file = await fetchPackageMedia(assetsRoots, packageName, path);
  return file ? new Uint8Array(await node().fsp.readFile(file)) : null;
}

/** Forget cached manifests. Tests only. */
export function resetPackageMediaManifests(): void {
  manifests.clear();
}

/**
 * Bytes of each `package://<package>/<path>` URI that a manifest lists,
 * skipping the URIs in `have`. Callers read local files first and pass what
 * they found, so a checkout with pulled media never downloads.
 */
export async function readMissingPackageMedia(
  uris: readonly string[],
  have: ReadonlySet<string>,
  assetsRoots: readonly string[]
): Promise<Array<{ uri: string; bytes: Uint8Array }>> {
  const found: Array<{ uri: string; bytes: Uint8Array }> = [];
  for (const uri of uris) {
    if (have.has(uri) || !uri.startsWith("package://")) continue;
    const rest = uri.slice("package://".length);
    const slash = rest.indexOf("/");
    if (slash <= 0) continue;
    const bytes = await readPackageMedia(assetsRoots, rest.slice(0, slash), rest.slice(slash + 1));
    if (bytes) found.push({ uri, bytes });
  }
  return found;
}
