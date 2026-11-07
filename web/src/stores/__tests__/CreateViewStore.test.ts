import { clampCreateBatch, useCreateViewStore } from "../CreateViewStore";

describe("CreateViewStore", () => {
  beforeEach(() => {
    useCreateViewStore.setState({
      mode: "image",
      kindModes: { image: "image", video: "video", audio: "audio" },
      prompt: "",
      batch: 1,
      references: []
    });
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

  it("returns each kind to the mode it was last on", () => {
    const { setMode, setKind } = useCreateViewStore.getState();
    setMode("retake");
    setKind("image");
    expect(useCreateViewStore.getState().mode).toBe("image");
    setKind("video");
    expect(useCreateViewStore.getState().mode).toBe("retake");
  });

  it("attaches each asset once and removes it by id", () => {
    const picture = { assetId: "a", contentType: "image/png", name: "a" };
    const { addReferences, removeReference } = useCreateViewStore.getState();
    addReferences([picture, picture]);
    addReferences([picture, { assetId: "b", contentType: "video/mp4", name: "b" }]);
    expect(useCreateViewStore.getState().references.map((item) => item.assetId)).toEqual(["a", "b"]);
    removeReference("a");
    expect(useCreateViewStore.getState().references.map((item) => item.assetId)).toEqual(["b"]);
  });
});
