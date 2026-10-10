/**
 * @jest-environment jsdom
 *
 * Two editor tabs share one persisted pending list. A write from one tab must
 * keep the requests the other remembered.
 */
import { beforeEach, describe, expect, it } from "@jest/globals";
import { useDirectGenPendingStore } from "../directGenPending";

const STORAGE_KEY = "nodetool-timeline-directgen-pending";

const job = (clipId: string, requestId: string) => ({
  clipId,
  requestId,
  startedAt: Date.now(),
  bucket: "text-to-video:model"
});

/** What another tab's persist middleware wrote: its whole state. */
const writeFromOtherTab = (
  pending: Record<string, ReturnType<typeof job>[]>
): void => {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      state: {
        pending,
        durationSamples: {},
        editSettlements: {},
        productionSettlements: {},
        editFailures: {}
      },
      version: 0
    })
  );
};

const storedPending = (): Record<string, Array<{ requestId: string }>> =>
  JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}").state.pending;

beforeEach(() => {
  localStorage.clear();
  useDirectGenPendingStore.setState({
    pending: {},
    durationSamples: {},
    editSettlements: {},
    productionSettlements: {},
    editFailures: {}
  });
});

describe("directGenPending across tabs", () => {
  it("keeps another tab's request when this tab remembers one", () => {
    writeFromOtherTab({ "seq-other": [job("clip-b", "req-b")] });

    useDirectGenPendingStore
      .getState()
      .remember("seq-1", job("clip-a", "req-a"));

    expect(
      storedPending()["seq-other"].map((entry) => entry.requestId)
    ).toEqual(["req-b"]);
    expect(storedPending()["seq-1"].map((entry) => entry.requestId)).toEqual([
      "req-a"
    ]);
  });

  it("restores a request another tab remembered in the same sequence", () => {
    useDirectGenPendingStore
      .getState()
      .remember("seq-1", job("clip-a", "req-a"));
    writeFromOtherTab({
      "seq-1": [job("clip-a", "req-a"), job("clip-b", "req-b")]
    });

    const restored = useDirectGenPendingStore.getState().restore("seq-1");

    expect(restored.map((entry) => entry.requestId)).toEqual([
      "req-a",
      "req-b"
    ]);
  });

  it("settling one request leaves the other tab's request listed", () => {
    useDirectGenPendingStore
      .getState()
      .remember("seq-1", job("clip-a", "req-a"));
    writeFromOtherTab({
      "seq-1": [job("clip-a", "req-a"), job("clip-b", "req-b")]
    });

    useDirectGenPendingStore
      .getState()
      .settle("seq-1", "clip-a", undefined, "req-a");

    expect(storedPending()["seq-1"].map((entry) => entry.requestId)).toEqual([
      "req-b"
    ]);
  });
});
