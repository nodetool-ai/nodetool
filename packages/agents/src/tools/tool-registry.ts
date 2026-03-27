/**
 * Map-based tool registry for resolving tools by name.
 */

import type { Tool } from "./base-tool.js";

const registry = new Map<string, Tool>();

export function registerTool(tool: Tool): void {
  registry.set(tool.name, tool);
}

export function resolveTool(name: string): Tool | null {
  return registry.get(name) ?? null;
}

export function listTools(): string[] {
  return Array.from(registry.keys());
}

export function getAllTools(): Tool[] {
  return Array.from(registry.values());
}
