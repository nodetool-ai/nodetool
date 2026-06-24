/**
 * Locate (and zip) the built Chrome extension so the UI can help users install
 * it into their own Chrome.
 *
 * Resolution order:
 *   1. `NODETOOL_EXTENSION_DIST` — set by the Electron main process to the
 *      bundled resource path in packaged builds.
 *   2. Walk up from this module and from cwd looking for
 *      `chrome-extension/dist/manifest.json` (the dev/monorepo layout).
 */

import { existsSync, readdirSync, statSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";

export interface ExtensionDistInfo {
  /** Absolute path to the extension `dist` dir (may not exist). */
  path: string;
  /** Whether a valid build (with manifest.json) was found there. */
  exists: boolean;
}

function isBuild(dir: string): boolean {
  return existsSync(path.join(dir, "manifest.json"));
}

function findUp(start: string): string | null {
  let dir = start;
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(dir, "chrome-extension", "dist");
    if (isBuild(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function resolveExtensionDist(): ExtensionDistInfo {
  const env = process.env.NODETOOL_EXTENSION_DIST;
  if (env && isBuild(env)) return { path: env, exists: true };

  const here = path.dirname(fileURLToPath(import.meta.url));
  const found = findUp(here) ?? findUp(process.cwd());
  if (found) return { path: found, exists: true };

  return { path: env ?? "", exists: false };
}

/** Recursively collect a directory's files into a flat path → bytes map. */
function addDir(files: Record<string, Uint8Array>, dir: string, rel: string): void {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const relPath = rel ? `${rel}/${entry}` : entry;
    if (statSync(full).isDirectory()) {
      addDir(files, full, relPath);
    } else {
      files[relPath] = new Uint8Array(readFileSync(full));
    }
  }
}

/**
 * Zip the extension build into an in-memory buffer (the build is tiny — a few
 * small JS/HTML/PNG files). Throws if no build is found.
 */
export async function zipExtensionDist(): Promise<Buffer> {
  const dist = resolveExtensionDist();
  if (!dist.exists) {
    throw new Error("Extension build not found");
  }
  const files: Record<string, Uint8Array> = {};
  addDir(files, dist.path, "");
  return Buffer.from(zipSync(files, { level: 6 }));
}
