/**
 * @jest-environment node
 */
import { sortThreadsByDate } from "../threadUtils";
import type { ThreadInfo } from "../../types/thread.types";

describe("sortThreadsByDate", () => {
  it("sorts threads by updatedAt in descending order (newest first)", () => {
    const threads: Record<string, ThreadInfo> = {
      old: { id: "old", updatedAt: "2024-01-01T00:00:00Z", messages: [] },
      newest: { id: "newest", updatedAt: "2024-03-01T00:00:00Z", messages: [] },
      middle: { id: "middle", updatedAt: "2024-02-01T00:00:00Z", messages: [] }
    };

    const sorted = sortThreadsByDate(threads);

    expect(sorted[0][0]).toBe("newest");
    expect(sorted[1][0]).toBe("middle");
    expect(sorted[2][0]).toBe("old");
  });

  it("returns an empty array for empty input", () => {
    const sorted = sortThreadsByDate({});
    expect(sorted).toEqual([]);
  });

  it("handles threads with undefined updatedAt by sorting them last", () => {
    const threads: Record<string, ThreadInfo> = {
      withDate: { id: "withDate", updatedAt: "2024-01-01T00:00:00Z", messages: [] },
      noDate: { id: "noDate", updatedAt: undefined } as unknown as ThreadInfo
    };

    const sorted = sortThreadsByDate(threads);

    expect(sorted[0][0]).toBe("withDate");
    expect(sorted[1][0]).toBe("noDate");
  });

  it("handles single thread", () => {
    const threads: Record<string, ThreadInfo> = {
      only: { id: "only", updatedAt: "2024-01-01T00:00:00Z", messages: [] }
    };

    const sorted = sortThreadsByDate(threads);

    expect(sorted).toHaveLength(1);
    expect(sorted[0][0]).toBe("only");
  });

  it("returns entries as [key, ThreadInfo] tuples", () => {
    const threadInfo: ThreadInfo = {
      id: "myThread",
      updatedAt: "2024-05-01T12:00:00Z",
      messages: []
    };
    const threads: Record<string, ThreadInfo> = { myThread: threadInfo };

    const sorted = sortThreadsByDate(threads);

    expect(sorted[0]).toEqual(["myThread", threadInfo]);
  });

  it("handles threads with identical dates stably", () => {
    const threads: Record<string, ThreadInfo> = {
      a: { id: "a", updatedAt: "2024-01-01T00:00:00Z", messages: [] },
      b: { id: "b", updatedAt: "2024-01-01T00:00:00Z", messages: [] }
    };

    const sorted = sortThreadsByDate(threads);

    expect(sorted).toHaveLength(2);
  });

  it("handles ISO date strings with different time zones", () => {
    const threads: Record<string, ThreadInfo> = {
      earlier: { id: "earlier", updatedAt: "2024-01-01T23:00:00Z", messages: [] },
      later: { id: "later", updatedAt: "2024-01-02T01:00:00Z", messages: [] }
    };

    const sorted = sortThreadsByDate(threads);

    expect(sorted[0][0]).toBe("later");
    expect(sorted[1][0]).toBe("earlier");
  });
});
