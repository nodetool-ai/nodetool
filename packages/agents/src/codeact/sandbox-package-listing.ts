/**
 * The shapes pack discovery answers with, and the export scanner behind them.
 *
 * A guest can import packs and platform modules, and until now had no way to
 * ask what those are. The data lives host-side in three places — the module
 * catalog, the host-module registry, and the capability registry — none of
 * which the guest can read: the `nodetool` object model is a thin wrapper over
 * belt tools and owns no host bridge. So the answer arrives the way every other
 * `nodetool.*` answer arrives, through a tool.
 *
 * The capability that serves it is `list_sandbox_packages`
 * (`capabilities/packs.ts`), mounted per session over that session's allowlist
 * and catalog. What stays here is what the capability is built from: the result
 * shapes, the allowlist rule, and the ESM export scan.
 */
import type { SandboxModuleSummary } from "@nodetool-ai/protocol";
import * as acorn from "acorn";

/** One importable module the catalog knows about. */
export interface SandboxPackageEntry {
  specifier: string;
  packName: string;
  packVersion?: string;
  /** `js` and `wasm` run inside the guest; `host` runs where the sandbox runs. */
  kind: SandboxModuleSummary["kind"];
  description?: string;
  /** Whether this session may import it. */
  allowed: boolean;
}

/** One of NodeTool's own capability modules, mounted by the host. */
export interface SandboxPlatformEntry {
  specifier: string;
  /** The namespace, matching `nodetool.<module>`. */
  module: string;
}

export interface SandboxPackageListing {
  packages: SandboxPackageEntry[];
  /** Empty when this session mounts no capability modules. */
  platform: SandboxPlatformEntry[];
  /** The specifiers an import may name, pack subpaths included. */
  allowedSpecifiers: string[];
}

export interface SandboxModuleExports {
  specifier: string;
  kind: SandboxModuleSummary["kind"] | "platform";
  /** Export names, or null when this kind cannot declare them. */
  exports: string[] | null;
  /** False when the module re-exports names this listing cannot resolve. */
  complete: boolean;
  /** Why the answer is null or incomplete. */
  note?: string;
}

export type SandboxPackageListingResult =
  | SandboxPackageListing
  | SandboxModuleExports
  | { error: string; message: string };

/**
 * Consent is per pack, so a subpath of an allowed specifier is covered — the
 * same rule `mountActionModules` enforces when the import actually runs.
 */
export function allowlistCovers(
  allowed: readonly string[],
  specifier: string
): boolean {
  return allowed.some(
    (entry) => specifier === entry || specifier.startsWith(`${entry}/`)
  );
}

/**
 * The names a JavaScript module declares as exports.
 *
 * ESM exports are static syntax, so this reads what the module says rather than
 * guessing: a parse gives the whole list. What it cannot resolve is
 * `export * from "./other"` — the names live in a file this scan does not walk
 * — and that is reported as an incomplete answer instead of a short one.
 */
export function scanModuleExports(source: string) {
  let program: acorn.Program;
  try {
    program = acorn.parse(source, {
      ecmaVersion: "latest",
      sourceType: "module"
    });
  } catch (e) {
    return {
      exports: null,
      complete: false,
      note: `This module could not be parsed, so its exports are unknown: ${
        e instanceof Error ? e.message : String(e)
      }`
    };
  }
  const names = new Set<string>();
  let starReExport = false;
  for (const statement of program.body) {
    if (statement.type === "ExportDefaultDeclaration") {
      names.add("default");
      continue;
    }
    if (statement.type === "ExportAllDeclaration") {
      const exported = exportedName(statement.exported);
      if (exported === undefined) starReExport = true;
      else names.add(exported);
      continue;
    }
    if (statement.type !== "ExportNamedDeclaration") continue;
    for (const specifier of statement.specifiers) {
      const exported = exportedName(specifier.exported);
      if (exported !== undefined) names.add(exported);
    }
    const declaration = statement.declaration;
    if (declaration === null || declaration === undefined) continue;
    if (declaration.type === "VariableDeclaration") {
      for (const declarator of declaration.declarations) {
        for (const name of patternNames(declarator.id)) names.add(name);
      }
      continue;
    }
    if (declaration.id !== null && declaration.id !== undefined) {
      names.add(declaration.id.name);
    }
  }
  const exports = [...names].sort();
  return starReExport
    ? {
        exports,
        complete: false,
        note: "This module re-exports another module with `export *`, so it exports more names than are listed here. Read its documentation for the full surface."
      }
    : { exports, complete: true };
}

function exportedName(
  node: acorn.Identifier | acorn.Literal | null | undefined
): string | undefined {
  if (node === null || node === undefined) return undefined;
  return node.type === "Identifier" ? node.name : String(node.value);
}

/** Every binding a declaration pattern introduces, destructuring included. */
function patternNames(pattern: acorn.Pattern): string[] {
  switch (pattern.type) {
    case "Identifier":
      return [pattern.name];
    case "ObjectPattern":
      return pattern.properties.flatMap((property) =>
        property.type === "RestElement"
          ? patternNames(property.argument)
          : patternNames(property.value)
      );
    case "ArrayPattern":
      return pattern.elements.flatMap((element) =>
        element === null ? [] : patternNames(element)
      );
    case "AssignmentPattern":
      return patternNames(pattern.left);
    case "RestElement":
      return patternNames(pattern.argument);
    default:
      return [];
  }
}
