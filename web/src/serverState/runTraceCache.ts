import type { GetRunTraceResult, StoredRunTraceUpdate, TraceRecord } from "@nodetool-ai/protocol";

export const RUN_TRACE_CACHE_LIMIT = 500;
export interface RunLiveCursor { cursor: number; needsSnapshot: boolean }

/** Live delivery coalesces snapshots. A skipped cursor requires a stored read. */
export function advanceRunCursor(previous: RunLiveCursor | undefined, cursor: number, resnapshot = false): RunLiveCursor {
  if (previous && cursor <= previous.cursor) { return previous; }
  return { cursor, needsSnapshot: resnapshot || !previous || cursor > previous.cursor + 1 };
}

export function projectTraceRecords(records: readonly TraceRecord[]): GetRunTraceResult["nodes"] {
  const byId = new Map(records.map((record) => [record.span_id, record]));
  const children = new Map<string, TraceRecord[]>();
  const roots: TraceRecord[] = [];
  for (const record of records) {
    if (!record.parent_span_id || !byId.has(record.parent_span_id)) { roots.push(record); }
    else {
      const siblings = children.get(record.parent_span_id) ?? [];
      siblings.push(record);
      children.set(record.parent_span_id, siblings);
    }
  }
  const compare = (a: TraceRecord, b: TraceRecord) => a.start_time_ms - b.start_time_ms || a.span_id.localeCompare(b.span_id);
  roots.sort(compare);
  for (const siblings of children.values()) { siblings.sort(compare); }
  const result: GetRunTraceResult["nodes"] = [];
  const seen = new Set<string>();
  const walk = (root: TraceRecord) => {
    const stack = [{ record: root, depth: 0 }];
    while (stack.length > 0) {
      const item = stack.pop();
      if (!item || seen.has(item.record.span_id)) { continue; }
      seen.add(item.record.span_id);
      result.push(item);
      const descendants = children.get(item.record.span_id) ?? [];
      for (let index = descendants.length - 1; index >= 0; index--) {
        stack.push({ record: descendants[index], depth: Math.min(64, item.depth + 1) });
      }
    }
  };
  for (const root of roots) { walk(root); }
  // Corrupt ancestry cannot hang the panel or hide the remaining records.
  for (const record of records) { if (!seen.has(record.span_id)) { walk(record); } }
  return result;
}

/** Merge only the selected run. Snapshot identities replace earlier versions. */
export function mergeRunTrace(snapshot: GetRunTraceResult, update: StoredRunTraceUpdate): GetRunTraceResult {
  if (snapshot.run.id !== update.run_id || snapshot.run.trace_id !== update.record.trace_id) { return snapshot; }
  const records = new Map(snapshot.nodes.map(({ record }) => [record.span_id, record]));
  const existing = records.get(update.record.span_id);
  const capped = !existing && records.size >= RUN_TRACE_CACHE_LIMIT;
  if (!capped) { records.set(update.record.span_id, update.record); }
  return {
    ...snapshot,
    nodes: projectTraceRecords([...records.values()]),
    content_expired: update.content_expired,
    content_state: update.content_expired ? "expired" : snapshot.content_state,
    truncated: snapshot.truncated || update.truncated,
    incomplete: snapshot.incomplete || update.incomplete,
    limited: snapshot.limited || capped
  };
}
