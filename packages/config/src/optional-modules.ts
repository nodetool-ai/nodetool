/**
 * Import an optional dependency from the normal module graph, or — on Node —
 * from a user-managed `node_modules` directory pointed to by
 * NODETOOL_OPTIONAL_NODE_MODULES. The fallback path is Node-only; on
 * browsers / Edge we just re-throw the original import failure.
 */

import { z } from "zod";

import { IS_NODE, importNodeBuiltin, importHidden } from "./node-import.js";

export async function importOptionalModule<T>(
  packageName: string,
  options: { commonJs?: boolean } = {}
): Promise<T> {
  try {
    // Some native wrappers ship TypeScript that ESM development loaders select
    // instead of their published CommonJS entry point.
    if (options.commonJs && IS_NODE) {
      const module =
        await importNodeBuiltin<typeof import("node:module")>("node:module");
      if (!module) {
        throw new Error("Node module loader is unavailable");
      }
      // SAFETY: T describes the caller's trusted package API, as with importHidden<T>.
      return module.createRequire(import.meta.url)(packageName) as T;
    }
    const mod = await importHidden<T>(packageName);
    if (mod === null) {
      throw new Error(
        `importOptionalModule: ${packageName} unavailable on non-Node`
      );
    }
    return mod;
  } catch (error) {
    if (!IS_NODE) {
      throw error;
    }
    const optionalNodeModules = process.env["NODETOOL_OPTIONAL_NODE_MODULES"];
    if (!optionalNodeModules) {
      throw error;
    }
    try {
      const modMod =
        await importNodeBuiltin<typeof import("node:module")>("node:module");
      const pathMod =
        await importNodeBuiltin<typeof import("node:path")>("node:path");
      const urlMod =
        await importNodeBuiltin<typeof import("node:url")>("node:url");
      if (!modMod || !pathMod || !urlMod) {
        throw error;
      }
      const requireFromOptional = modMod.createRequire(
        pathMod.join(optionalNodeModules, "..", "package.json")
      );
      if (options.commonJs) {
        // SAFETY: The caller supplies the API type for this trusted runtime package.
        return requireFromOptional(packageName) as T;
      }
      let resolved: string;
      try {
        resolved = requireFromOptional.resolve(packageName);
      } catch (resolveError) {
        // `require.resolve` sees only the `require` export condition, so an
        // ESM-only package (`"exports": { "import": … }`) is invisible to it.
        const esmEntry = await resolveEsmEntry(
          optionalNodeModules,
          packageName,
          pathMod
        );
        if (esmEntry === null) {
          throw resolveError;
        }
        resolved = esmEntry;
      }
      const fileMod = await importHidden<T>(
        urlMod.pathToFileURL(resolved).href
      );
      if (fileMod === null) {
        throw error;
      }
      return fileMod;
    } catch {
      throw error;
    }
  }
}

/** The export conditions a Node ESM `import` matches. */
const ESM_CONDITIONS = new Set(["node", "import", "default"]);

/** One value of a package's `exports` field, parsed. */
type ExportNode =
  | { kind: "path"; path: string }
  | { kind: "blocked" }
  | { kind: "list"; entries: ExportNode[] }
  | { kind: "map"; entries: [string, ExportNode][] };

const exportNodeSchema: z.ZodType<ExportNode> = z.lazy(() =>
  z.union([
    z.string().transform((path): ExportNode => ({ kind: "path", path })),
    z.null().transform((): ExportNode => ({ kind: "blocked" })),
    z
      .array(exportNodeSchema)
      .transform((entries): ExportNode => ({ kind: "list", entries })),
    z
      .record(z.string(), exportNodeSchema)
      .transform(
        (record): ExportNode => ({ kind: "map", entries: Object.entries(record) })
      )
  ])
);

/** The part of a `package.json` that decides what an import loads. */
export const packageManifestSchema = z.object({
  exports: exportNodeSchema.optional(),
  main: z.string().optional()
});
export type PackageManifest = z.infer<typeof packageManifestSchema>;

/** The first path an export maps to under {@link ESM_CONDITIONS}. */
function exportTarget(node: ExportNode): string | null {
  switch (node.kind) {
    case "path":
      return node.path;
    case "blocked":
      return null;
    case "list":
      for (const entry of node.entries) {
        const resolved = exportTarget(entry);
        if (resolved !== null) {
          return resolved;
        }
      }
      return null;
    case "map":
      // Node walks conditions in the object's key order.
      for (const [condition, value] of node.entries) {
        if (ESM_CONDITIONS.has(condition)) {
          const resolved = exportTarget(value);
          if (resolved !== null) {
            return resolved;
          }
        }
      }
      return null;
  }
}

/**
 * The file an ESM import of `subpath` (`"."` or `"./name"`) loads from a
 * package with this manifest, or null when the package does not export it.
 */
export function esmExportPath(
  manifest: PackageManifest,
  subpath: string
): string | null {
  const { exports } = manifest;
  if (exports === undefined) {
    if (subpath !== ".") {
      return subpath;
    }
    return manifest.main ?? "./index.js";
  }
  const subpaths =
    exports.kind === "map" &&
    exports.entries.some(([key]) => key.startsWith("."))
      ? exports.entries
      : null;
  if (subpaths === null) {
    return subpath === "." ? exportTarget(exports) : null;
  }
  const exact = subpaths.find(([key]) => key === subpath);
  if (exact !== undefined) {
    return exportTarget(exact[1]);
  }
  for (const [pattern, value] of subpaths) {
    const star = pattern.indexOf("*");
    if (star === -1) {
      continue;
    }
    const prefix = pattern.slice(0, star);
    const suffix = pattern.slice(star + 1);
    if (
      subpath.length >= prefix.length + suffix.length &&
      subpath.startsWith(prefix) &&
      subpath.endsWith(suffix)
    ) {
      const target = exportTarget(value);
      const match = subpath.slice(prefix.length, subpath.length - suffix.length);
      return target === null ? null : target.replaceAll("*", match);
    }
  }
  return null;
}

/** Resolve an ESM-only package inside the optional `node_modules`. */
async function resolveEsmEntry(
  optionalNodeModules: string,
  specifier: string,
  pathMod: typeof import("node:path")
): Promise<string | null> {
  const fsMod =
    await importNodeBuiltin<typeof import("node:fs/promises")>(
      "node:fs/promises"
    );
  if (!fsMod) {
    return null;
  }
  const parts = specifier.split("/");
  const nameLength = specifier.startsWith("@") ? 2 : 1;
  const packageDir = pathMod.join(
    optionalNodeModules,
    ...parts.slice(0, nameLength)
  );
  const rest = parts.slice(nameLength);
  const subpath = rest.length === 0 ? "." : `./${rest.join("/")}`;
  let raw: string;
  try {
    raw = await fsMod.readFile(pathMod.join(packageDir, "package.json"), "utf8");
  } catch {
    return null;
  }
  let parsed: ReturnType<typeof packageManifestSchema.safeParse>;
  try {
    parsed = packageManifestSchema.safeParse(JSON.parse(raw));
  } catch {
    return null;
  }
  if (!parsed.success) {
    return null;
  }
  const target = esmExportPath(parsed.data, subpath);
  return target === null ? null : pathMod.join(packageDir, target);
}
