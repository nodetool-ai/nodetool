import { describe, expect, it } from "vitest";
import { boundedGameDraftHistory, MAX_GAME_DRAFT_HISTORY_BYTES } from "../src/trpc/routers/gameDraftHistory.js";

function change(id: string, summary: string, messageId: string | null = null, actor: "agent" | "user" = "agent") {
  return { id, actor, summary, messageId, threadId: null, beforeUpdatedAt: "before", beforeDigest: "digest",
    createdAt: "now", affectedEntityIds: [], ops: [] };
}

describe("bounded game draft history", () => {
  it("counts UTF-8 bytes and omits an oversized newest entry", () => {
    const records = [change("large", "界".repeat(400_000)), change("old", "old")];
    expect(boundedGameDraftHistory(records)).toEqual([]);
  });

  it("preserves independent complete groups and all operation payloads", () => {
    const records = [change("new", "x".repeat(600_000), "new-message"), change("old", "x".repeat(600_000), "old-message")];
    const result = boundedGameDraftHistory(records);
    expect(result).toEqual([records[0]]);
    expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThanOrEqual(MAX_GAME_DRAFT_HISTORY_BYTES);
  });

  it("does not split an agent message group across intervening user records", () => {
    const records = [change("new", "new", "new-message"), change("last", "x".repeat(600_000), "message"),
      change("user", "user", null, "user"), change("first", "x".repeat(600_000), "message")];
    expect(boundedGameDraftHistory(records)).toEqual([records[0]]);
  });

  it("returns unchanged empty and small histories", () => {
    expect(boundedGameDraftHistory([])).toEqual([]);
    const records = [change("new", "small")];
    expect(boundedGameDraftHistory(records)).toBe(records);
  });
});
