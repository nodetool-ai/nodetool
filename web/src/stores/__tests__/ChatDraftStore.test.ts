import { useChatDraftStore } from "../ChatDraftStore";

const reset = () => useChatDraftStore.setState({ drafts: {} });

describe("ChatDraftStore", () => {
  beforeEach(reset);

  it("parks a seed under its thread", () => {
    useChatDraftStore.getState().setDraft("thread-1", "Draw a cat");
    expect(useChatDraftStore.getState().drafts).toEqual({
      "thread-1": "Draw a cat"
    });
  });

  it("clears the seed once it is taken", () => {
    useChatDraftStore.getState().setDraft("thread-1", "Draw a cat");

    expect(useChatDraftStore.getState().takeDraft("thread-1")).toBe(
      "Draw a cat"
    );
    expect(useChatDraftStore.getState().drafts).toEqual({});
    expect(useChatDraftStore.getState().takeDraft("thread-1")).toBeUndefined();
  });

  it("returns undefined for a thread with no seed", () => {
    expect(useChatDraftStore.getState().takeDraft("nobody")).toBeUndefined();
  });

  it("keeps seeds per thread", () => {
    useChatDraftStore.getState().setDraft("thread-1", "first");
    useChatDraftStore.getState().setDraft("thread-2", "second");

    expect(useChatDraftStore.getState().takeDraft("thread-1")).toBe("first");
    expect(useChatDraftStore.getState().drafts).toEqual({
      "thread-2": "second"
    });
    expect(useChatDraftStore.getState().takeDraft("thread-2")).toBe("second");
  });

  it("replaces a thread's seed rather than appending", () => {
    useChatDraftStore.getState().setDraft("thread-1", "first");
    useChatDraftStore.getState().setDraft("thread-1", "second");

    expect(useChatDraftStore.getState().takeDraft("thread-1")).toBe("second");
  });

  it("keeps an empty seed distinguishable from no seed", () => {
    useChatDraftStore.getState().setDraft("thread-1", "");
    expect(useChatDraftStore.getState().takeDraft("thread-1")).toBe("");
  });
});
