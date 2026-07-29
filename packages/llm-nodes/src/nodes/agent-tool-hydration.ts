/**
 * Builtin agent-tool registry + hydration.
 *
 * Tools can be referenced by name as bare stubs (`{ name }`) and hydrated into
 * real `Tool` instances on demand. The registry holds the always-available
 * STATIC_TOOL_CLASSES plus anything other modules append via
 * {@link registerBuiltinAgentToolClasses} at load time (e.g. `sandbox.ts`
 * registers the `browser_*` CDP tools).
 *
 * CONTRACT: a name-stub is NOT executable until hydrated. `runAgentLoop` and
 * the AgentNode (`normalizeTools`) both hydrate their `tools` before use, so a
 * stub or a real Tool reaches the loop equivalently. Any other caller that
 * builds tools by name and runs them itself MUST call
 * {@link resolveBuiltinAgentTool} / {@link hydrateBuiltinAgentTool} first — an
 * unhydrated stub has no `process`/`inputSchema` and silently can't be called.
 */

import {
  BrowserTool,
  CalculatorTool,
  ConversionTool,
  DataForSEOImagesTool,
  DataForSEONewsTool,
  DataForSEOSearchTool,
  GeometryTool,
  GoogleGroundedSearchTool,
  GoogleImageGenerationTool,
  GoogleImagesTool,
  GoogleNewsTool,
  WebSearchTool,
  HttpRequestTool,
  OpenAIImageGenerationTool,
  OpenAITextToSpeechTool,
  OpenAIWebSearchTool,
  RunCodeTool,
  ScreenshotTool,
  SearchEmailTool,
  StatisticsTool,
  Tool
} from "@nodetool-ai/agents";

type ToolCtor = new () => Tool;

type MaybeTool = {
  name: string;
  process?: unknown;
};

const STATIC_TOOL_CLASSES: ToolCtor[] = [
  WebSearchTool,
  GoogleNewsTool,
  GoogleImagesTool,
  GoogleGroundedSearchTool,
  GoogleImageGenerationTool,
  OpenAIWebSearchTool,
  OpenAIImageGenerationTool,
  OpenAITextToSpeechTool,
  BrowserTool,
  ScreenshotTool,
  HttpRequestTool,
  CalculatorTool,
  RunCodeTool,
  StatisticsTool,
  GeometryTool,
  ConversionTool,
  SearchEmailTool,
  DataForSEOSearchTool,
  DataForSEONewsTool,
  DataForSEOImagesTool
];

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
    const dynamicClasses = toolFactories.flatMap((f) => f());
    for (const ToolClass of [...STATIC_TOOL_CLASSES, ...extraToolClasses, ...dynamicClasses]) {
      const tool = new ToolClass();
      builtinAgentTools.set(tool.name, tool);
    }
  }
  return builtinAgentTools.get(name) ?? null;
}

/**
 * Hydrate one tool: a real tool (has `process`) passes through unchanged; a
 * bare name-stub is resolved from the registry (or returned as-is if unknown,
 * so the caller can detect the still-unrunnable stub).
 */
export function hydrateBuiltinAgentTool<T extends MaybeTool>(tool: T): T | Tool {
  if (typeof tool.process === "function") return tool;
  return resolveBuiltinAgentTool(tool.name) ?? tool;
}

/** Hydrate a list of tools — see {@link hydrateBuiltinAgentTool}. */
export function hydrateBuiltinAgentTools<T extends MaybeTool>(tools: T[]): Array<T | Tool> {
  return tools.map(hydrateBuiltinAgentTool);
}
