import type { GenerationBatchItem } from "@nodetool-ai/protocol";
import { useGenerationBatchStore } from "../GenerationBatchStore";

const items = (n: number): GenerationBatchItem[] =>
  Array.from({ length: n }, (_, i) => ({ index: i }) as unknown as GenerationBatchItem);

describe("GenerationBatchStore", () => {
  beforeEach(() => {
    useGenerationBatchStore.setState(useGenerationBatchStore.getInitialState());
  });

  it("stores a batch under its tool call id", () => {
    useGenerationBatchStore
      .getState()
      .applyUpdate({ tool_call_id: "t1", concurrency: 2, items: items(3) });
    const batch = useGenerationBatchStore.getState().batches["t1"];
    expect(batch.concurrency).toBe(2);
    expect(batch.items).toHaveLength(3);
  });

  it("replaces the previous update for the same call and keeps others", () => {
    const { applyUpdate } = useGenerationBatchStore.getState();
    applyUpdate({ tool_call_id: "t1", concurrency: 1, items: items(1) });
    applyUpdate({ tool_call_id: "t2", concurrency: 4, items: items(2) });
    applyUpdate({ tool_call_id: "t1", concurrency: 3, items: items(5) });
    const { batches } = useGenerationBatchStore.getState();
    expect(batches["t1"]).toEqual({ concurrency: 3, items: items(5) });
    expect(batches["t2"].items).toHaveLength(2);
  });
});
