import { useDocumentDraftStore } from "../DocumentDraftStore";

describe("DocumentDraftStore", () => {
  beforeEach(() => {
    useDocumentDraftStore.setState(useDocumentDraftStore.getInitialState());
  });

  it("tracks dirty and saving flags per tab", () => {
    const { setDirty, setSaving } = useDocumentDraftStore.getState();
    setDirty("a", true);
    setSaving("b", true);
    const state = useDocumentDraftStore.getState();
    expect(state.dirtyTabs).toEqual({ a: true });
    expect(state.savingTabs).toEqual({ b: true });
  });

  it("setCodeDraft stores the draft and marks the timeline tab dirty", () => {
    const draft = { code: "x", dirty: true, writtenCode: null };
    useDocumentDraftStore.getState().setCodeDraft("seq1", draft);
    const state = useDocumentDraftStore.getState();
    expect(state.codeDrafts.seq1).toBe(draft);
    expect(state.dirtyTabs["timeline:seq1"]).toBe(true);

    useDocumentDraftStore
      .getState()
      .setCodeDraft("seq1", { code: "x", dirty: false, writtenCode: "x" });
    expect(useDocumentDraftStore.getState().dirtyTabs["timeline:seq1"]).toBe(
      false
    );
  });

  it("discardDraft clears a timeline tab's flags and its code draft", () => {
    const { setCodeDraft, setSaving, setDirty, discardDraft } =
      useDocumentDraftStore.getState();
    setCodeDraft("seq1", { code: "x", dirty: true, writtenCode: null });
    setCodeDraft("seq2", { code: "y", dirty: true, writtenCode: null });
    setSaving("timeline:seq1", true);
    setDirty("other", true);

    discardDraft("timeline:seq1");

    const state = useDocumentDraftStore.getState();
    expect(state.codeDrafts).not.toHaveProperty("seq1");
    expect(state.codeDrafts).toHaveProperty("seq2");
    expect(state.dirtyTabs).not.toHaveProperty("timeline:seq1");
    expect(state.savingTabs).not.toHaveProperty("timeline:seq1");
    expect(state.dirtyTabs.other).toBe(true);
  });

  it("discardDraft on a non-timeline tab leaves code drafts alone", () => {
    const { setCodeDraft, setDirty, discardDraft } =
      useDocumentDraftStore.getState();
    setCodeDraft("seq1", { code: "x", dirty: true, writtenCode: null });
    setDirty("workflow:1", true);

    discardDraft("workflow:1");

    const state = useDocumentDraftStore.getState();
    expect(state.codeDrafts).toHaveProperty("seq1");
    expect(state.dirtyTabs).not.toHaveProperty("workflow:1");
  });
});
