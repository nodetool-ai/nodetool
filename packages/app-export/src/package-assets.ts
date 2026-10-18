/**
 * Sample files a bundle references as `package://<package>/<path>`.
 *
 * Example apps seed inputs with files that ship inside NodeTool's node
 * packages. Those files are not on npm, so the exported project carries a copy
 * under `assets/<package>/<path>` and its server resolves the URIs from there.
 */
import { readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { isString, type ApplicationBundle } from "@nodetool-ai/app-runtime";

import { bundleContent, isContentRecord, type BundleContent } from "./bundle-content.js";

const SCHEME = "package://";

export interface PackageAssetFile {
  uri: string;
  bytes: Uint8Array;
}

/** `<package>/<path>` for a well-formed URI that stays inside its package. */
export function packageAssetPath(uri: string): string | null {
  if (!uri.startsWith(SCHEME)) return null;
  const segments = uri.slice(SCHEME.length).split("/").filter((segment) => segment !== "" && segment !== ".");
  if (segments.length < 2 || segments.some((segment) => segment === ".." || segment.includes("\\"))) {
    return null;
  }
  return segments.join("/");
}

/** Every distinct `package://` URI in the app document and its graphs. */
export function packageAssetUris(bundle: ApplicationBundle): string[] {
  const found = new Set<string>();
  const visit = (value: BundleContent, depth: number): void => {
    if (depth > 64) return;
    if (isString(value)) {
      if (packageAssetPath(value)) found.add(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    if (isContentRecord(value)) {
      for (const entry of Object.values(value)) visit(entry, depth + 1);
    }
  };
  visit(bundleContent(bundle.app), 0);
  for (const workflow of bundle.workflows) visit(bundleContent(workflow.graph), 0);
  return [...found].sort();
}

/**
 * Read each URI from the first root holding `<root>/<package>/<path>`. URIs
 * no root holds are left out; the exporter warns about them.
 */
export function readPackageAssets(uris: ReadonlyArray<string>, roots: ReadonlyArray<string>): PackageAssetFile[] {
  const files: PackageAssetFile[] = [];
  for (const uri of uris) {
    const path = packageAssetPath(uri);
    if (!path) continue;
    for (const root of roots) {
      const base = resolve(root);
      const target = resolve(join(base, ...path.split("/")));
      if (relative(base, target).startsWith("..")) continue;
      try {
        files.push({ uri, bytes: new Uint8Array(readFileSync(target)) });
        break;
      } catch {
        // Not under this root; try the next one.
      }
    }
  }
  return files;
}
