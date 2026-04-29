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
  GoogleSearchTool,
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

const BUILTIN_AGENT_TOOL_CLASSES: ToolCtor[] = [
  GoogleSearchTool,
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

let builtinAgentTools: Map<string, Tool> | null = null;

export function resolveBuiltinAgentTool(name: string): Tool | null {
  if (!builtinAgentTools) {
    builtinAgentTools = new Map<string, Tool>();
    for (const ToolClass of BUILTIN_AGENT_TOOL_CLASSES) {
      const tool = new ToolClass();
      builtinAgentTools.set(tool.name, tool);
    }
  }
  return builtinAgentTools.get(name) ?? null;
}

export function hydrateBuiltinAgentTool<T extends MaybeTool>(tool: T): T | Tool {
  if (typeof tool.process === "function") return tool;
  return resolveBuiltinAgentTool(tool.name) ?? tool;
}

export function hydrateBuiltinAgentTools<T extends MaybeTool>(tools: T[]): Array<T | Tool> {
  return tools.map(hydrateBuiltinAgentTool);
}
