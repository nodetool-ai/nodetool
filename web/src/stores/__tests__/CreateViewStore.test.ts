import {
  EMPTY_CREATE_DRAFT,
  GLOBAL_CREATE_SESSION,
  MAX_CREATE_DRAFTS,
  clampCreateBatch,
  createDraftOf,
  useCreateViewStore
} from "../CreateViewStore";

const draft = (sessionId: string) => createDraftOf(useCreateViewStore.getState(), sessionId);

describe("CreateViewStore", () => {
  beforeEach(() => {
    useCreateViewStore.setState({ drafts: {} });
  });

  it("keeps the number of takes between 1 and 4", () => {
    const { setBatch } = useCreateViewStore.getState();
    setBatch("a", 9);
    expect(draft("a").batch).toBe(4);
    setBatch("a", 0);
    expect(draft("a").batch).toBe(1);
    expect(clampCreateBatch(Number.NaN)).toBe(1);
  });

  it("keeps each tab's draft apart", () => {
    const { setPrompt, setMode } = useCreateViewStore.getState();
    setPrompt("a", "a lighthouse");
    setMode("a", "video");
    setPrompt("b", "a harbour");
    expect(draft("a")).toMatchObject({ prompt: "a lighthouse", mode: "video" });
    expect(draft("b")).toMatchObject({ prompt: "a harbour", mode: "image" });
    expect(draft("unknown")).toBe(EMPTY_CREATE_DRAFT);
  });

  it("returns each kind to the mode it was last on", () => {
    const { setMode, setKind } = useCreateViewStore.getState();
    setMode("a", "retake");
    setKind("a", "image");
    expect(draft("a").mode).toBe("image");
    setKind("a", "video");
    expect(draft("a").mode).toBe("retake");
  });

  it("attaches each asset once and removes it by id", () => {
    const picture = { assetId: "a", contentType: "image/png", name: "a" };
    const { addReferences, removeReference } = useCreateViewStore.getState();
    addReferences("s", [picture, picture]);
    addReferences("s", [picture, { assetId: "b", contentType: "video/mp4", name: "b" }]);
    expect(draft("s").references.map((item) => item.assetId)).toEqual(["a", "b"]);
    removeReference("s", "a");
    expect(draft("s").references.map((item) => item.assetId)).toEqual(["b"]);
  });

  it("starts a session in the mode and with the prompt it was opened with", () => {
    const picture = { assetId: "a", contentType: "image/png", name: "a" };
    useCreateViewStore.getState().startSession("s", {
      mode: "image_to_video",
      prompt: "waves",
      references: [picture, picture]
    });
    expect(draft("s")).toMatchObject({
      mode: "image_to_video",
      prompt: "waves",
      scope: "session",
      titled: false
    });
    expect(draft("s").references).toHaveLength(1);
    expect(draft("s").kindModes.video).toBe("image_to_video");
  });

  it("keeps only the newest drafts", () => {
    const { setPrompt } = useCreateViewStore.getState();
    for (let index = 0; index <= MAX_CREATE_DRAFTS; index++) {
      setPrompt(`s${index}`, `${index}`);
    }
    const ids = Object.keys(useCreateViewStore.getState().drafts);
    expect(ids).toHaveLength(MAX_CREATE_DRAFTS);
    expect(ids).not.toContain("s0");
    setPrompt("s1", "touched");
    expect(Object.keys(useCreateViewStore.getState().drafts).at(-1)).toBe("s1");
  });

  it("moves the single draft of the old Create view to its session", async () => {
    const persist = useCreateViewStore.persist;
    const options = persist.getOptions();
    const migrated = await options.migrate?.(
      { mode: "video", prompt: "old", batch: 2, references: [] },
      1
    );
    expect(migrated).toEqual({
      drafts: { [GLOBAL_CREATE_SESSION]: { mode: "video", prompt: "old", batch: 2, references: [] } }
    });
    const merged = options.merge?.(migrated, useCreateViewStore.getState());
    expect(merged?.drafts[GLOBAL_CREATE_SESSION]).toMatchObject({
      mode: "video",
      prompt: "old",
      batch: 2,
      scope: "session"
    });
  });
});
