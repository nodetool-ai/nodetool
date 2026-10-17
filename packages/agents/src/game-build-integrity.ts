import { createHash } from "node:crypto";
import { z } from "zod";
import type { Workspace } from "@nodetool-ai/runtime";

export const GAME_BUILD_INTEGRITY_FILE = "build-integrity.json";
const MAX_MANIFEST_BYTES = 128 * 1024;
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const relativePath = z.string().min(1).max(512).refine(path =>
  !path.includes("\\") && !path.includes("\0") && path.split("/").every(part => part !== "" && part !== "." && part !== ".."));
const manifestSchema = z.object({
  schemaVersion: z.literal(1),
  buildPath: relativePath,
  fingerprint: digest,
  entry: relativePath,
  files: z.array(z.object({ path: relativePath, byteLength: z.number().int().nonnegative(), digest })).min(1)
});

export function gameBuildIntegrityManifest(buildPath: string, fingerprint: string, entry: string, files: readonly { path: string; bytes: Uint8Array }[]): string {
  const manifest = JSON.stringify({ schemaVersion: 1, buildPath, fingerprint, entry,
    files: files.map(file => ({ path: file.path, byteLength: file.bytes.byteLength,
      digest: createHash("sha256").update(file.bytes).digest("hex") })).sort((a, b) => a.path.localeCompare(b.path)) });
  if (Buffer.byteLength(manifest) > MAX_MANIFEST_BYTES) { throw new Error("Standalone build integrity manifest exceeds byte limit"); }
  return manifest;
}

/** A cache hit requires every published file, within the same file and byte budgets as a fresh export. */
export async function verifiedGameBuildCache(workspace: Workspace, buildPath: string, fingerprint: string, entry: string,
  limits: { files: number; bytes: number }, signal?: AbortSignal): Promise<boolean> {
  signal?.throwIfAborted();
  const path = `${buildPath}/${GAME_BUILD_INTEGRITY_FILE}`;
  const stat = await workspace.stat(path);
  signal?.throwIfAborted();
  if (!stat || stat.isDirectory || stat.size > MAX_MANIFEST_BYTES) { return false; }
  const content = await workspace.read(path);
  signal?.throwIfAborted();
  if (!content || content.byteLength > MAX_MANIFEST_BYTES) { return false; }
  let value: unknown;
  try { value = JSON.parse(Buffer.from(content).toString("utf8")); } catch { return false; }
  const parsed = manifestSchema.safeParse(value);
  if (!parsed.success) { return false; }
  const manifest = parsed.data;
  if (manifest.buildPath !== buildPath || manifest.fingerprint !== fingerprint || manifest.entry !== entry || manifest.files.length + 1 > limits.files) { return false; }
  const paths = new Set(manifest.files.map(file => file.path));
  const game = entry === "index.html" ? "game.json" : "dist/game.json";
  if (paths.size !== manifest.files.length || paths.has(GAME_BUILD_INTEGRITY_FILE) || !paths.has(entry) || !paths.has(game)) { return false; }
  let bytes = content.byteLength;
  for (const file of manifest.files) {
    signal?.throwIfAborted();
    bytes += file.byteLength;
    if (bytes > limits.bytes) { return false; }
    const filePath = `${buildPath}/${file.path}`;
    const info = await workspace.stat(filePath);
    signal?.throwIfAborted();
    if (!info || info.isDirectory || info.size !== file.byteLength) { return false; }
    const actual = await workspace.read(filePath);
    signal?.throwIfAborted();
    if (!actual || actual.byteLength !== file.byteLength || createHash("sha256").update(actual).digest("hex") !== file.digest) { return false; }
  }
  return true;
}
