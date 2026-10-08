import type { Message } from "./types.js";
import { messageText } from "./structured-output.js";

/** A value that satisfies `schema`: its enum's first entry, else a placeholder of its type. */
function sampleForSchema(schema: unknown, depth = 0): unknown {
  if (!schema || typeof schema !== "object" || depth > 8) return "fake";
  const s = schema as Record<string, unknown>;
  if ("const" in s) return s["const"];
  if (Array.isArray(s["enum"]) && s["enum"].length > 0) return s["enum"][0];
  for (const key of ["anyOf", "oneOf"]) {
    const options = s[key];
    if (Array.isArray(options) && options.length > 0) {
      const usable =
        options.find((o) => (o as Record<string, unknown>)?.["type"] !== "null") ??
        options[0];
      return sampleForSchema(usable, depth + 1);
    }
  }
  const type = Array.isArray(s["type"])
    ? s["type"].find((t) => t !== "null")
    : s["type"];
  switch (type) {
    case "object": {
      const props = (s["properties"] ?? {}) as Record<string, unknown>;
      return Object.fromEntries(
        Object.entries(props).map(([key, sub]) => [key, sampleForSchema(sub, depth + 1)])
      );
    }
    case "array": {
      const count = Math.max(1, Number(s["minItems"] ?? 1));
      return Array.from({ length: count }, () => sampleForSchema(s["items"], depth + 1));
    }
    case "integer":
    case "number":
      return typeof s["minimum"] === "number" ? s["minimum"] : 1;
    case "boolean":
      return true;
    default:
      return "fake";
  }
}

/**
 * The Structured Output Generator sends its schema in a `<JSON_SCHEMA>` tag
 * and refuses an answer with no JSON object, so the fake and scripted
 * providers answer that prompt with a fenced object the schema accepts.
 */
export function schemaAnswer(messages: Message[]): string | null {
  const open = "<JSON_SCHEMA>";
  for (const message of messages) {
    // Sliced by index, not a regex, so a long prompt cannot backtrack.
    const text = messageText(message.content);
    const start = text.indexOf(open);
    const end = start < 0 ? -1 : text.indexOf("</JSON_SCHEMA>", start);
    if (end < 0) continue;
    try {
      const schema = JSON.parse(text.slice(start + open.length, end));
      return "```json\n" + JSON.stringify(sampleForSchema(schema)) + "\n```";
    } catch {
      return null;
    }
  }
  return null;
}
