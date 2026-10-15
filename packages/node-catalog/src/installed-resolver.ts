import { readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { esmExportPath, packageManifestSchema } from "@nodetool-ai/config";
import { createMissingPackError } from "./errors.js";
import type { CatalogPack } from "./types.js";
import type { PackLoaderContext } from "./loader-context.js";

/** Resolve only the package identity and real root admitted by the startup inventory. */
export function resolveInstalledPack(
  pack: CatalogPack,
  target: string,
  context: PackLoaderContext
): string {
  const entry = context.packs.find((candidate) => candidate.id === pack.id);
  const selected = entry?.packages.find((candidate) => target === candidate.npm || target.startsWith(candidate.npm + "/"));
  if (!selected || selected.version !== context.coreVersion) {
    throw createMissingPackError(pack.id);
  }
  const schema = packageManifestSchema.extend({ name: z.literal(selected.npm), version: z.string() });
  const manifest = schema.parse(JSON.parse(readFileSync(join(selected.realPackageRoot, "package.json"), "utf8")));
  if (manifest.version !== context.coreVersion) {
    throw createMissingPackError(pack.id);
  }
  const subpath = target === selected.npm ? "." : `.${target.slice(selected.npm.length)}`;
  const exported = esmExportPath(manifest, subpath);
  if (exported === null) {
    throw new Error(`Package ${selected.npm} does not export ${subpath}`);
  }
  const segments = exported.split(/[\\/]/);
  if (isAbsolute(exported) || (manifest.exports && !exported.startsWith("./")) ||
    segments.includes("..") || segments.includes("node_modules") || exported.includes("?") || exported.includes("#")) {
    throw new Error(`Invalid export target for ${selected.npm}: ${subpath}`);
  }
  const file = realpathSync(join(selected.realPackageRoot, exported));
  const within = relative(selected.realPackageRoot, file);
  if (within === ".." || within.startsWith(".." + sep) || isAbsolute(within)) {
    throw new Error(`Export ${subpath} escapes admitted package ${selected.npm}`);
  }
  return pathToFileURL(file).href;
}
