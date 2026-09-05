/**
 * The `packs` capability module — what this session may import, and what each
 * importable module documents and exports.
 *
 * The namespace matches the object model's own (`nodetool.packs.*`, which wraps
 * these two wire names). Both capabilities run in-session: they need no
 * permission gate and no client round trip, only the session's package
 * allowlist and the module catalog that session resolves its imports through.
 *
 * That session state is the reason these are built by a factory rather than
 * served from the registry alone. It is neither a run field nor a call
 * argument: the allowlist is computed where the session is (the CodeAct
 * executor and the chat session both add the DSL pack to it), so it rides in
 * the *implementation's* closure and reaches a belt through
 * `toolFromCapability`. Putting three fields on `CapabilityRun` for two
 * capabilities would push per-session state into a type every host builds.
 *
 * The registry therefore serves the specs — the wire names, the schemas, the
 * `read` classification, the drift walk — and an implementation that fails
 * closed naming the mount. That is the documented shape for a capability whose
 * dependency a run cannot carry: a module is mounted by the host, and
 * availability of one capability inside it is the implementation's answer
 * (`capabilities/dispatcher.ts`).
 */

import {
  SANDBOX_CAPABILITY_PACK,
  SANDBOX_HOST_MODULES,
  sandboxCapabilitySpecifier
} from "@nodetool-ai/protocol";
import type { SandboxPackSkillDisclosure } from "@nodetool-ai/protocol";
import type { SandboxModuleCatalog } from "@nodetool-ai/runtime";

import type { Tool } from "../tools/base-tool.js";
import {
  packNameForSpecifier,
  wrapUntrustedPackageDocs
} from "../codeact/sandbox-package-docs.js";
import {
  allowlistCovers,
  scanModuleExports
} from "../codeact/sandbox-package-listing.js";
import type {
  SandboxModuleExports,
  SandboxPackageEntry,
  SandboxPackageListing,
  SandboxPackageListingResult
} from "../codeact/sandbox-package-listing.js";
import { toolFromCapability } from "./adapters.js";
import { capabilityModuleSpecs } from "./dispatcher.js";
import { ungatedCapabilityRun } from "./invoke.js";
import { listCapabilityModules } from "./registry.js";
import type {
  CapabilityExport,
  CapabilityImpl,
  CapabilityModule
} from "./types.js";
import {
  sandboxPackageDocsSpec,
  sandboxPackageListSpec,
  SANDBOX_PACKAGE_DOCS_TOOL_NAME,
  SANDBOX_PACKAGE_LIST_TOOL_NAME
} from "./packs.specs.js";
import { isNonEmptyString } from "../utils/type-guards.js";

export {
  SANDBOX_PACKAGE_DOCS_TOOL_NAME,
  SANDBOX_PACKAGE_LIST_TOOL_NAME
} from "./packs.specs.js";

/** What `get_sandbox_package_docs` answers with once a specifier clears the allowlist. */
export interface SandboxPackageDocs {
  specifier: string;
  packName: string;
  packVersion?: string;
  trusted: boolean;
  description: string;
  documentation: string;
}

/**
 * `get_sandbox_package_docs` over one session's allowlist and catalog — the one
 * path from a pack's SKILL.md to the model.
 */
export function sandboxPackageDocsImpl(
  allowed: readonly string[],
  catalog: SandboxModuleCatalog | null | undefined
): CapabilityImpl {
  return async (_run, params) => {
    const specifier = String(params["specifier"] ?? "");
    if (!allowed.includes(specifier)) {
      return {
        error: "package_not_allowed",
        message:
          allowed.length > 0
            ? `"${specifier}" is not on this session's package allowlist. Documentation is available for ${allowed
                .map((entry) => `"${entry}"`)
                .join(", ")}.`
            : `"${specifier}" is not on this session's package allowlist, which is empty. No package documentation is available here.`
      };
    }
    const packName = packNameForSpecifier(specifier);
    const skill: SandboxPackSkillDisclosure | undefined =
      catalog?.packSkill?.(packName);
    if (skill === undefined) {
      return {
        error: "package_docs_unavailable",
        message: `The package "${packName}" publishes no readable SKILL.md, so ${specifier} has no documentation here.`
      };
    }
    // A pack documents its modules in `##` sections; serve the one that names
    // this specifier when it exists, and the whole body otherwise.
    const section =
      skill.sections[specifier.toLowerCase()] ??
      skill.sections[moduleName(specifier).toLowerCase()];
    const body = section ?? skill.body;
    const docs: SandboxPackageDocs = {
      specifier,
      packName,
      trusted: skill.trusted,
      description: skill.description,
      documentation: skill.trusted
        ? body
        : wrapUntrustedPackageDocs(specifier, body)
    };
    if (skill.packVersion !== undefined) docs.packVersion = skill.packVersion;
    return docs;
  };
}

/**
 * `list_sandbox_packages` over one session's allowlist and catalog.
 *
 * A pack the session does not allow is still listed, marked `allowed: false`.
 * Hiding it would teach the model that an installed pack does not exist;
 * listing it silently would teach it to write an import that gets refused.
 */
export function sandboxPackageListImpl(
  allowed: readonly string[],
  catalog: SandboxModuleCatalog | null | undefined,
  /** True when the host mounts NodeTool's own capability modules. */
  withPlatformModules: boolean
): CapabilityImpl {
  return async (_run, params) => {
    const specifier = params["specifier"];
    if (isNonEmptyString(specifier)) {
      return exportsFor(specifier, allowed, catalog, withPlatformModules);
    }
    return listing(allowed, catalog, withPlatformModules);
  };
}

function listing(
  allowed: readonly string[],
  catalog: SandboxModuleCatalog | null | undefined,
  withPlatformModules: boolean
): SandboxPackageListing {
  const summaries = catalog?.summaries() ?? [];
  return {
    packages: summaries.map((summary) => {
      const entry: SandboxPackageEntry = {
        specifier: summary.specifier,
        packName: summary.packName,
        kind: summary.kind,
        allowed: allowlistCovers(allowed, summary.specifier)
      };
      if (summary.packVersion !== undefined) {
        entry.packVersion = summary.packVersion;
      }
      if (summary.description !== undefined) {
        entry.description = summary.description;
      }
      return entry;
    }),
    // Names only: loading a capability module pulls its whole dependency cone,
    // which is what the registry's lazy table exists to avoid. The exports of
    // one module are one `specifier` call away.
    platform: withPlatformModules
      ? listCapabilityModules().map((module) => ({
          specifier: sandboxCapabilitySpecifier(module),
          module
        }))
      : [],
    allowedSpecifiers: [...allowed]
  };
}

async function exportsFor(
  specifier: string,
  allowed: readonly string[],
  catalog: SandboxModuleCatalog | null | undefined,
  withPlatformModules: boolean
): Promise<SandboxModuleExports | { error: string; message: string }> {
  if (withPlatformModules && specifier.startsWith(SANDBOX_CAPABILITY_PACK)) {
    return platformExports(specifier);
  }
  if (!allowlistCovers(allowed, specifier)) {
    return {
      error: "package_not_allowed",
      message:
        allowed.length > 0
          ? `"${specifier}" is not on this session's package allowlist. This session can import ${allowed
              .map((entry) => `"${entry}"`)
              .join(", ")}.`
          : `"${specifier}" is not on this session's package allowlist, which is empty. No sandbox package can be imported here.`
    };
  }
  if (!catalog) {
    return {
      error: "catalog_unavailable",
      message:
        "Sandbox packages cannot be resolved in this process, so no module's exports can be read."
    };
  }
  const resolution = catalog.resolveForExecution([{ specifier }]);
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

async function platformExports(
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

function moduleName(specifier: string): string {
  const packName = packNameForSpecifier(specifier);
  return specifier === packName ? "." : specifier.slice(packName.length + 1);
}

/** `get_sandbox_package_docs` as a belt tool over one session's state. */
export function sandboxPackageDocsTool(
  allowed: readonly string[],
  catalog: SandboxModuleCatalog | null | undefined
): Tool {
  return toolFromCapability(
    sandboxPackageDocsSpec,
    sandboxPackageDocsImpl(allowed, catalog),
    ungatedCapabilityRun
  );
}

/** `list_sandbox_packages` as a belt tool over one session's state. */
export function sandboxPackageListTool(
  allowed: readonly string[],
  catalog: SandboxModuleCatalog | null | undefined,
  withPlatformModules: boolean
): Tool {
  return toolFromCapability(
    sandboxPackageListSpec,
    sandboxPackageListImpl(allowed, catalog, withPlatformModules),
    ungatedCapabilityRun
  );
}

/**
 * The implementation the registry serves: a refusal naming the mount.
 *
 * A `CapabilityRun` carries no package allowlist, so nothing built from the
 * registry alone can answer either of these for a session. Failing closed by
 * name is what the dispatcher's contract asks of a capability whose dependency
 * the run does not carry — the same shape `run_subtask` uses for a missing
 * `subAgent` — and the message names the surface that does answer, so a model
 * that reached this by import has somewhere to go.
 */
function sessionBound(name: string, alternative: string): CapabilityImpl {
  return async () => {
    throw new Error(
      `\`${name}\` answers from one session's package allowlist and module ` +
        "catalog, which no CapabilityRun carries — the session mounts it " +
        `itself. Call \`${alternative}\` instead.`
    );
  };
}

const sandboxPackageDocs: CapabilityExport = {
  spec: sandboxPackageDocsSpec,
  impl: sessionBound(
    SANDBOX_PACKAGE_DOCS_TOOL_NAME,
    "nodetool.packs.docs(specifier)"
  )
};

const sandboxPackageList: CapabilityExport = {
  spec: sandboxPackageListSpec,
  impl: sessionBound(SANDBOX_PACKAGE_LIST_TOOL_NAME, "nodetool.packs.list()")
};

/** Both pack-discovery capabilities. */
export const PACK_CAPABILITIES: readonly CapabilityExport[] = [
  sandboxPackageDocs,
  sandboxPackageList
];

export const module: CapabilityModule = {
  module: "packs",
  exports: PACK_CAPABILITIES
};

export { sandboxPackageDocs, sandboxPackageList };

export type SandboxPackageDocsResult =
  | SandboxPackageDocs
  | { error: string; message: string };

export type { SandboxPackageListingResult };
