/**
 * The platform's own guest surface: the facade generator that expresses one
 * capability module as importable guest JavaScript.
 *
 * A **capability module** is one namespace of NodeTool's own API — workflows,
 * models, media — reached from the guest as
 * `import { list_workflows } from "@nodetool-ai/sandbox-nodetool/workflows"`.
 * The mechanics mirror `sandbox-host.ts` exactly: a generated ESM facade over a
 * private bridge module, which reads a dispatcher the host parks on a global
 * for the length of the entry module's link. Only the far side differs — a host
 * module lands on a library implementation, a capability lands on
 * `CapabilityRun.invoke`, which is where the permission gate lives.
 *
 * **A pack cannot bring one.** The module list is `@nodetool-ai/agents`'
 * capability registry, first-party only, and the host — not the model's consent
 * allowlist — decides which modules a session mounts. Protocol cannot depend on
 * agents, so what lives here is the contract: the specifier shape, the bridge,
 * and the generator. The list of modules stays in the registry.
 *
 * **Export naming: the wire name, and nothing else.** A facade exports
 * `list_workflows`, not `listWorkflows`. One capability, one name — the same
 * string the prompt documents, the MCP surface registers, and the belt calls —
 * so no reader has to know which spelling a surface prefers. Capability names
 * are already valid JavaScript identifiers; {@link generateSandboxCapabilityFacade}
 * refuses anything that is not.
 *
 * Everything here is pure and browser-safe.
 */

/** The one pack every capability module is a submodule of. */
export const SANDBOX_CAPABILITY_PACK = "@nodetool-ai/sandbox-nodetool";

/** One capability module's guest-visible identity. */
export interface SandboxCapabilityModuleSpec {
  /** Registry key: "workflows". */
  readonly module: string;
  /** Guest specifier: "@nodetool-ai/sandbox-nodetool/workflows". */
  readonly specifier: string;
  /** Capability wire names, in facade order. Nothing else is callable. */
  readonly exports: readonly string[];
}

/** The specifier one registry module is imported under. */
export function sandboxCapabilitySpecifier(module: string): string {
  return `${SANDBOX_CAPABILITY_PACK}/${module}`;
}

/** The registry module a specifier names, or `undefined` for anything else. */
export function sandboxCapabilityModuleName(
  specifier: string
): string | undefined {
  const prefix = `${SANDBOX_CAPABILITY_PACK}/`;
  if (!specifier.startsWith(prefix)) return undefined;
  const module = specifier.slice(prefix.length);
  return module.length > 0 && !module.includes("/") ? module : undefined;
}

/**
 * The facade generator's version. Bump it whenever
 * {@link generateSandboxCapabilityFacade} or
 * {@link SANDBOX_CAPABILITY_BRIDGE_SOURCE} changes what the guest sees.
 */
export const SANDBOX_CAPABILITY_FACADE_VERSION = 2;

/**
 * The guest-visible name the host parks the dispatcher on.
 *
 * It exists only between the init prelude and the entry module's first
 * statement — long enough for the bridge module to capture it while the static
 * graph evaluates, then deleted. The hiding is convenience; the dispatcher's
 * own checks are the boundary.
 */
export const SANDBOX_CAPABILITY_DISPATCH_GLOBAL = "__nodetoolCapabilityDispatch";

/**
 * The private bridge module every capability facade imports.
 *
 * Guest code cannot import it: the loader refuses the specifier from any module
 * that is not a generated facade.
 */
export const SANDBOX_CAPABILITY_BRIDGE_SPECIFIER = "nodetool:capability-bridge";

/**
 * The bridge module's source.
 *
 * It reads the dispatcher once, at module-evaluation time — which happens while
 * the entry module's static graph links, before the entry body deletes the
 * binding.
 */
export const SANDBOX_CAPABILITY_BRIDGE_SOURCE = `const __dispatch = globalThis.${SANDBOX_CAPABILITY_DISPATCH_GLOBAL};
export const __call = (moduleKey, exportName, args) => {
  if (typeof __dispatch !== "function") {
    throw new Error("the sandbox capability bridge is unavailable in this run");
  }
  return __dispatch(moduleKey, exportName, args);
};
`;

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/**
 * Generate the ESM facade for one capability module.
 *
 * One named async export per capability wire name, plus a default namespace
 * object so `import workflows from "@nodetool-ai/sandbox-nodetool/workflows"`
 * reads the way the object model does. Each export takes the arguments
 * record every capability's input schema describes — the same object a direct
 * tool call takes. Extra positional arguments are forwarded, not dropped, so
 * `save_asset("reel.mp4", {source})` reaches the dispatcher instead of
 * arriving as a lone string.
 */
export function generateSandboxCapabilityFacade(
  moduleKey: string,
  exportNames: readonly string[]
): string {
  for (const name of exportNames) {
    if (!IDENTIFIER.test(name)) {
      throw new Error(
        `${moduleKey}: "${name}" is not a valid JavaScript identifier and cannot be exported to the guest`
      );
    }
  }
  const body = exportNames
    .map(
      (exported) =>
        `export async function ${exported}(...args) {\n  return __call(${JSON.stringify(moduleKey)}, ${JSON.stringify(exported)}, args.length === 0 ? [{}] : args);\n}`
    )
    .join("\n");
  return `import { __call } from ${JSON.stringify(SANDBOX_CAPABILITY_BRIDGE_SPECIFIER)};
${body}
export default { ${exportNames.join(", ")} };
`;
}
