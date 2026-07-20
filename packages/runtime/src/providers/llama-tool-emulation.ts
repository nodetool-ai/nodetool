import type { ProviderTool, ToolCall } from "./types.js";

/**
 * Parse `key=value` keyword arguments out of an emulated tool-call string.
 * Handles quoted strings (with escapes), nested brackets/braces, and JSON
 * values. Shared by the llama.cpp providers, which rely on emulated tool
 * calling rather than native function calling.
 */
export function parseKeywordArgs(raw: string): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  const src = raw.trim();
  if (!src) return args;

  const parts: string[] = [];
  let buf = "";
  let quote: string | null = null;
  let depth = 0;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quote) {
      buf += ch;
      if (ch === "\\") {
        // Consume the escaped character literally so an escaped backslash
        // (e.g. a trailing `\\` in a Windows path) or an escaped quote can't be
        // misread as the closing quote — which swallowed every following arg.
        i += 1;
        if (i < src.length) buf += src[i];
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      buf += ch;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") {
      depth += 1;
      buf += ch;
      continue;
    }
    if (ch === ")" || ch === "]" || ch === "}") {
      depth = Math.max(0, depth - 1);
      buf += ch;
      continue;
    }
    if (ch === "," && depth === 0) {
      if (buf.trim()) parts.push(buf.trim());
      buf = "";
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) parts.push(buf.trim());

  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const key = part.slice(0, eq).trim();
    const valueRaw = part.slice(eq + 1).trim();
    if (!key) continue;

    if (
      (valueRaw.startsWith("{") && valueRaw.endsWith("}")) ||
      (valueRaw.startsWith("[") && valueRaw.endsWith("]"))
    ) {
      try {
        args[key] = JSON.parse(valueRaw);
        continue;
      } catch {
        // fall through
      }
    }

    if (
      (valueRaw.startsWith('"') && valueRaw.endsWith('"')) ||
      (valueRaw.startsWith("'") && valueRaw.endsWith("'"))
    ) {
      args[key] = valueRaw.slice(1, -1);
      continue;
    }

    if (valueRaw === "true" || valueRaw === "false") {
      args[key] = valueRaw === "true";
      continue;
    }

    if (valueRaw === "null") {
      args[key] = null;
      continue;
    }

    const num = Number(valueRaw);
    if (Number.isFinite(num)) {
      args[key] = num;
      continue;
    }

    args[key] = valueRaw;
  }

  return args;
}

/**
 * Extract `function_name(key=value, ...)` calls from model output when the
 * model has no native tool-calling support. Returns the parsed tool calls and
 * the text with those call lines stripped out.
 */
export function parseEmulatedToolCalls(
  content: string,
  tools: ProviderTool[]
): { toolCalls: ToolCall[]; cleanedContent: string } {
  const lines = content.split("\n");
  const cleaned: string[] = [];
  const calls: ToolCall[] = [];

  const allowed = new Set(tools.map((t) => t.name));
  const callPattern = /^\s*([A-Za-z_][A-Za-z0-9_]*)\((.*)\)\s*$/;
  for (const line of lines) {
    const match = line.match(callPattern);
    if (!match) {
      cleaned.push(line);
      continue;
    }
    const name = match[1];
    if (allowed.size > 0 && !allowed.has(name)) {
      cleaned.push(line);
      continue;
    }
    const args = parseKeywordArgs(match[2] ?? "");
    calls.push({
      id: `tool_${calls.length + 1}`,
      name,
      args
    });
  }

  return {
    toolCalls: calls,
    cleanedContent: cleaned.join("\n").trim()
  };
}
