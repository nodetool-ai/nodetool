/**
 * Discovery for sandbox packs, their modules, and the functions each exports.
 *
 * A guest can import packs and platform modules, and until now had no way to
 * ask what those are. The data lives host-side in three places — the module
 * catalog, the host-module registry, and the capability registry — none of
 * which the guest can read: the `nodetool` object model is a thin wrapper over
 * belt tools and owns no host bridge. So the answer arrives the way every other
 * `nodetool.*` answer arrives, through a tool. This one runs in-session, like
 * {@link SandboxPackageDocsTool}: it needs no permission gate and no client
 * round trip, only the session allowlist and the catalog the session already
 * resolves its imports through.
 *
 * A pack the session does not allow is still listed, marked `allowed: false`.
 * Hiding it would teach the model that an installed pack does not exist;
 * listing it silently would teach it to write an import that gets refused.
 */
import {
  SANDBOX_CAPABILITY_PACK,
  SANDBOX_HOST_MODULES,
  sandboxCapabilitySpecifier,
  type SandboxModuleSummary
} from "@nodetool-ai/protocol";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { SandboxModuleCatalog } from "@nodetool-ai/runtime";
import * as acorn from "acorn";
import { z } from "zod";

import { capabilityModuleSpecs } from "../capabilities/dispatcher.js";
import { listCapabilityModules } from "../capabilities/registry.js";
import { Tool } from "../tools/base-tool.js";

export const SANDBOX_PACKAGE_LIST_TOOL_NAME = "list_sandbox_packages";

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

const listingSchema = z.object({
  specifier: z
    .string()
    .optional()
    .describe(
      "Omit to list every importable module. Pass one specifier to get that module's exported function names instead."
    )
});

/**
 * `list_sandbox_packages` — what this session may import, and what each module
 * exports.
 */
export class SandboxPackageListTool extends Tool {
  readonly name = SANDBOX_PACKAGE_LIST_TOOL_NAME;
  readonly description =
    "List the sandbox packages and platform modules this session can import, each with its kind and " +
    "whether this session allows it. Pass a specifier to get that module's exported function names " +
    "instead of the listing. Read a package's documentation with get_sandbox_package_docs.";

  constructor(
    private readonly allowed: readonly string[],
    private readonly catalog: SandboxModuleCatalog | null | undefined,
    /** True when the host mounts NodeTool's own capability modules. */
    private readonly withPlatformModules: boolean
  ) {
    super();
  }

  override get schema(): z.ZodType {
    return listingSchema;
  }

  override userMessage(params: Record<string, unknown>): string {
    const specifier = params["specifier"];
    return typeof specifier === "string" && specifier !== ""
      ? `Reading ${specifier} exports`
      : "Listing sandbox packages";
  }

  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<SandboxPackageListingResult> {
    const specifier = params["specifier"];
    if (typeof specifier === "string" && specifier !== "") {
      return this.exportsFor(specifier);
    }
    return this.listing();
  }

  private listing(): SandboxPackageListing {
    const summaries = this.catalog?.summaries() ?? [];
    return {
      packages: summaries.map((summary) => ({
        specifier: summary.specifier,
        packName: summary.packName,
        ...(summary.packVersion === undefined
          ? {}
          : { packVersion: summary.packVersion }),
        kind: summary.kind,
        ...(summary.description === undefined
          ? {}
          : { description: summary.description }),
        allowed: allowlistCovers(this.allowed, summary.specifier)
      })),
      // Names only: loading a capability module pulls its whole dependency
      // cone, which is what the registry's lazy table exists to avoid. The
      // exports of one module are one `specifier` call away.
      platform: this.withPlatformModules
        ? listCapabilityModules().map((module) => ({
            specifier: sandboxCapabilitySpecifier(module),
            module
          }))
        : [],
      allowedSpecifiers: [...this.allowed]
    };
  }

  private async exportsFor(
    specifier: string
  ): Promise<SandboxModuleExports | { error: string; message: string }> {
    if (this.withPlatformModules && specifier.startsWith(SANDBOX_CAPABILITY_PACK)) {
      return this.platformExports(specifier);
    }
    if (!allowlistCovers(this.allowed, specifier)) {
      return {
        error: "package_not_allowed",
        message:
          this.allowed.length > 0
            ? `"${specifier}" is not on this session's package allowlist. This session can import ${this.allowed
                .map((entry) => `"${entry}"`)
                .join(", ")}.`
            : `"${specifier}" is not on this session's package allowlist, which is empty. No sandbox package can be imported here.`
      };
    }
    if (!this.catalog) {
      return {
        error: "catalog_unavailable",
        message:
          "Sandbox packages cannot be resolved in this process, so no module's exports can be read."
      };
    }
    const resolution = this.catalog.resolveForExecution([{ specifier }]);
    const resolved = resolution.modules[0];
    if (resolved === undefined) {
      const status = resolution.statuses[0];
      return {
        error: "module_not_resolved",
        message:
          status?.message ?? `Sandbox module ${specifier} cannot be resolved.`
      };
    }
    if (resolved.kind === "host") {
      const spec = SANDBOX_HOST_MODULES[resolved.hostId];
      return spec === undefined
        ? {
            specifier,
            kind: "host",
            exports: null,
            complete: false,
            note: `No host module is registered for "${resolved.hostId}".`
          }
        : {
            specifier,
            kind: "host",
            exports: [...spec.exports],
            complete: true
          };
    }
    if (resolved.kind === "wasm") {
      return {
        specifier,
        kind: "wasm",
        exports: resolved.wasm.exports.map((entry) => entry.as),
        complete: true
      };
    }
    return { specifier, kind: "js", ...scanModuleExports(resolved.source) };
  }

  private async platformExports(
    specifier: string
  ): Promise<SandboxModuleExports | { error: string; message: string }> {
    const module = listCapabilityModules().find(
      (name) => sandboxCapabilitySpecifier(name) === specifier
    );
    if (module === undefined) {
      return {
        error: "module_not_resolved",
        message: `"${specifier}" is not a NodeTool capability module. Call this tool with no specifier to list the ones this session mounts.`
      };
    }
    const [spec] = await capabilityModuleSpecs([module]);
    return {
      specifier,
      kind: "platform",
      exports: spec === undefined ? null : [...spec.exports],
      complete: spec !== undefined
    };
  }
}

/**
 * Consent is per pack, so a subpath of an allowed specifier is covered — the
 * same rule `mountActionModules` enforces when the import actually runs.
 */
function allowlistCovers(
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
export function scanModuleExports(source: string): {
  exports: string[] | null;
  complete: boolean;
  note?: string;
} {
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
