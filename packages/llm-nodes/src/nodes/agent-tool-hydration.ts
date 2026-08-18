/**
 * Builtin agent-tool registry + hydration.
 *
 * Tools can be referenced by name as bare stubs (`{ name }`) and hydrated into
 * real `Tool` instances on demand. The registry is the default agent toolbelt
 * (`getAgentToolbelt()` — no hand-maintained name list) plus anything other
 * modules append via {@link registerBuiltinAgentToolClasses} at load time
 * (e.g. `sandbox.ts` registers the `browser_*` CDP tools).
 *
 * CONTRACT: a name-stub is NOT executable until hydrated. `runAgentLoop` and
 * the AgentNode (`normalizeTools`) both hydrate their `tools` before use, so a
 * stub or a real Tool reaches the loop equivalently. Any other caller that
 * builds tools by name and runs them itself MUST call
 * {@link resolveBuiltinAgentTool} / {@link hydrateBuiltinAgentTool} first — an
 * unhydrated stub has no `process`/`inputSchema` and silently can't be called.
 */

import { getAgentToolbelt, getMediaTools, Tool } from "@nodetool-ai/agents";
import { isCallable } from "./type-predicates.js";

type ToolCtor = new () => Tool;

type MaybeTool = {
  name: string;
  process?: unknown;
};

/**
 * Names a saved workflow may still carry, mapped to what replaced them.
 *
 * The provider-specific search and media tools were retired: one `web_search`
 * chooses a backend host-side and takes a `search_type`, and
 * `generate_image` / `generate_speech` are provider-agnostic. An AgentNode
 * saved before that stores the old name as a bare stub, and a stub that
 * resolves to nothing is silently uncallable — so resolve it to the tool that
 * took over instead.
 */
const RETIRED_TOOL_NAMES: Readonly<Record<string, string>> = {
  openai_web_search: "web_search",
  google_grounded_search: "web_search",
  dataforseo_search: "web_search",
  // The news and image searches folded into `web_search`'s `search_type`.
  // A hydrated stub carries the name only, so it lands on a web search — the
  // tool exists and answers, rather than resolving to nothing and being
  // silently uncallable, which is what this map is for.
  dataforseo_news: "web_search",
  dataforseo_images: "web_search",
  google_news: "web_search",
  google_images: "web_search",
  image_generation: "generate_image",
  openai_image_generation: "generate_image",
  google_image_generation: "generate_image",
  openai_text_to_speech: "generate_speech"
};

const extraToolClasses: ToolCtor[] = [];
const toolFactories: (() => ToolCtor[])[] = [];
let builtinAgentTools: Map<string, Tool> | null = null;

/**
 * Append additional Tool classes to the built-in registry. Called from
 * other modules (e.g. `sandbox.ts`) at module-load time so they don't have
 * to be imported here, which would re-introduce a circular dependency.
 */
export function registerBuiltinAgentToolClasses(classes: ToolCtor[]): void {
  for (const c of classes) extraToolClasses.push(c);
  builtinAgentTools = null;
}

/**
 * Register a factory that produces Tool classes on demand. Unlike
 * `registerBuiltinAgentToolClasses`, the factory is called lazily on the
 * first `resolveBuiltinAgentTool` call, after all modules are initialized.
 * Use this when the tool classes depend on module-level constants that may
 * not be initialized at the time the registering module is evaluated (e.g.
 * `BROWSER_ACTION_SPECS` in esbuild bundles where `__esm` lazy init can
 * cause the constant to be `undefined` at module load time).
 */
export function registerBuiltinAgentToolFactory(factory: () => ToolCtor[]): void {
  toolFactories.push(factory);
  builtinAgentTools = null;
}

/** Resolve a registered builtin tool by name to a runnable `Tool`, or null. */
export function resolveBuiltinAgentTool(name: string): Tool | null {
  if (!builtinAgentTools) {
    builtinAgentTools = new Map<string, Tool>();
    for (const tool of [...getAgentToolbelt(), ...getMediaTools()]) {
      builtinAgentTools.set(tool.name, tool);
    }
    const dynamicClasses = toolFactories.flatMap((f) => f());
    for (const ToolClass of [...extraToolClasses, ...dynamicClasses]) {
      const tool = new ToolClass();
      builtinAgentTools.set(tool.name, tool);
    }
  }
  const direct = builtinAgentTools.get(name);
  if (direct) return direct;
  const replacement = RETIRED_TOOL_NAMES[name];
  return replacement ? (builtinAgentTools.get(replacement) ?? null) : null;
}

/**
 * Hydrate one tool: a real tool (has `process`) passes through unchanged; a
 * bare name-stub is resolved from the registry (or returned as-is if unknown,
 * so the caller can detect the still-unrunnable stub).
 */
export function hydrateBuiltinAgentTool<T extends MaybeTool>(tool: T): T | Tool {
  if (isCallable(tool.process)) return tool;
  return resolveBuiltinAgentTool(tool.name) ?? tool;
}

/** Hydrate a list of tools — see {@link hydrateBuiltinAgentTool}. */
export function hydrateBuiltinAgentTools<T extends MaybeTool>(tools: T[]): Array<T | Tool> {
  return tools.map(hydrateBuiltinAgentTool);
}
