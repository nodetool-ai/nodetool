import type { Game } from "@nodetool-ai/models";

export const MAX_GAME_DRAFT_OPS = 1024;
export const MAX_GAME_DRAFT_HISTORY_BYTES = 1024 * 1024;

type DraftChange = Omit<Awaited<ReturnType<typeof Game.listDraftChanges>>[number], "gameId">;

/** Keep a newest-first prefix without splitting an agent group at the byte limit. */
export function boundedGameDraftHistory(changes: DraftChange[]): DraftChange[] {
  let bytes = 2;
  let count = 0;
  for (const change of changes) {
    const entryBytes = Buffer.byteLength(JSON.stringify(change)) + (count === 0 ? 0 : 1);
    if (bytes + entryBytes > MAX_GAME_DRAFT_HISTORY_BYTES) { break; }
    bytes += entryBytes;
    count += 1;
  }
  if (count === changes.length) { return changes; }

  // The changes panel groups consecutive agent records, ignoring user records.
  let oldestAgentIndex = count - 1;
  while (oldestAgentIndex >= 0 && changes[oldestAgentIndex].actor !== "agent") {
    oldestAgentIndex -= 1;
  }
  const nextAgent = changes.slice(count).find((change) => change.actor === "agent");
  const messageId = changes[oldestAgentIndex]?.messageId;
  if (messageId && nextAgent?.messageId === messageId) {
    let groupStart = oldestAgentIndex;
    for (let index = oldestAgentIndex - 1; index >= 0; index -= 1) {
      if (changes[index].actor !== "agent") { continue; }
      if (changes[index].messageId !== messageId) { break; }
      groupStart = index;
    }
    count = groupStart;
  }
  return changes.slice(0, count);
}
