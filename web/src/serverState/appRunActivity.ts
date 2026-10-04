import type { ActivityEntry } from "@nodetool-ai/app-runtime";
import type { RunLog } from "@nodetool-ai/protocol";

export interface StoredActivity {
  key: string;
  spanId: string;
  entry: ActivityEntry;
}

/** Replay reporter events once, preserving each agent's text and tool identity. */
export function replayAppRunActivity(logs: readonly RunLog[]): StoredActivity[] {
  const entries: StoredActivity[] = [];
  const seen = new Set<string>();
  const tools = new Map<string, number>();
  for (const log of logs) {
    if (seen.has(log.id) || log.source !== "agent") { continue; }
    seen.add(log.id);
    const source = typeof log.attributes["agent.activity_id"] === "string" ? log.attributes["agent.activity_id"]
      : typeof log.attributes["node.id"] === "string" ? log.attributes["node.id"] : log.span_id;
    const callId = log.attributes["tool.call_id"];
    const name = log.attributes["tool.name"];
    if ((log.name === "agent.activity" || log.name === "tool.result") && typeof callId === "string" && typeof name === "string") {
      const key = `${source}:${callId}`;
      const result = log.attributes["tool.result"];
      const previous = tools.get(key);
      const entry: ActivityEntry = { kind: "tool", id: key, name, label: name, source,
        status: log.name === "tool.result" ? log.level === "error" ? "error" : "done" : "running" };
      if (typeof result === "string") { entry.result = result; }
      if (previous === undefined) {
        tools.set(key, entries.length);
        entries.push({ key, spanId: log.span_id, entry });
      } else {
        const item = entries[previous]!;
        if (item.entry.kind === "tool" && item.entry.status !== "running" && log.name === "agent.activity") { continue; }
        item.entry = { ...item.entry, ...entry };
        if (log.name === "tool.result" && log.level === "error") { item.spanId = log.span_id; }
      }
      continue;
    }
    const text = log.attributes["log.message"];
    if (log.name !== "agent.activity" || typeof text !== "string" || !text) { continue; }
    const last = entries[entries.length - 1];
    if (last?.entry.kind === "text" && last.entry.source === source && last.spanId === log.span_id) {
      last.entry = { ...last.entry, text: last.entry.text + text };
    } else {
      entries.push({ key: log.id, spanId: log.span_id, entry: { kind: "text", text, source } });
    }
  }
  return entries;
}
