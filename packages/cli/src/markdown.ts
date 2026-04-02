/**
 * Markdown rendering for the terminal.
 * Uses marked + marked-terminal for full markdown support including
 * syntax-highlighted code blocks, tables, bold/italic, links.
 */

import { marked } from "marked";

// Cache so we only set the extension once
let _initialized = false;
export async function renderMarkdown(text: string): Promise<string> {
  if (!_initialized) {
    try {
      // marked-terminal v7 exports markedTerminal() as a MarkedExtension factory
      const mod = await import("marked-terminal");
      const markedTerminal = mod.markedTerminal ?? mod.default;
      marked.use(
        markedTerminal({
          width: process.stdout.columns ?? 80,
          emoji: false,
          tab: 2,
          showSectionPrefix: false,
          reflowText: false
        })
      );
    } catch {
      // marked-terminal unavailable — fall back to plain marked output
    }
    _initialized = true;
  }
  try {
    const result = marked(text);
    if (typeof result === "string") return result;
    return await result;
  } catch {
    return text; // fallback to raw text on render error
  }
}

/** Synchronous fallback — strips markdown syntax for plain display. */
export function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, "[code]")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}
