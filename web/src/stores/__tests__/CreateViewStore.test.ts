import { clampCreateBatch, useCreateViewStore } from "../CreateViewStore";

describe("CreateViewStore", () => {
  beforeEach(() => {
    useCreateViewStore.setState({ mode: "image", prompt: "", batch: 1 });
  });

  it("keeps the number of takes between 1 and 4", () => {
    const { setBatch } = useCreateViewStore.getState();
    setBatch(9);
    expect(useCreateViewStore.getState().batch).toBe(4);
    setBatch(0);
    expect(useCreateViewStore.getState().batch).toBe(1);
    expect(clampCreateBatch(Number.NaN)).toBe(1);
  });

  it("holds the draft across a remount", () => {
    useCreateViewStore.getState().setPrompt("a lighthouse");
    useCreateViewStore.getState().setMode("video");
    expect(useCreateViewStore.getState()).toMatchObject({
      prompt: "a lighthouse",
      mode: "video"
    });
  });
});
