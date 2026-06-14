import { usePropertyHighlightStore } from "../PropertyHighlightStore";

describe("PropertyHighlightStore", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    usePropertyHighlightStore.getState().clear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("starts with null nodeId and propertyName", () => {
    const state = usePropertyHighlightStore.getState();
    expect(state.nodeId).toBeNull();
    expect(state.propertyName).toBeNull();
  });

  it("highlight sets nodeId and propertyName", () => {
    usePropertyHighlightStore.getState().highlight("node-1", "model");
    const state = usePropertyHighlightStore.getState();
    expect(state.nodeId).toBe("node-1");
    expect(state.propertyName).toBe("model");
  });

  it("highlight increments token on each call", () => {
    const before = usePropertyHighlightStore.getState().token;
    usePropertyHighlightStore.getState().highlight("n1", "p1");
    const after1 = usePropertyHighlightStore.getState().token;
    usePropertyHighlightStore.getState().highlight("n2", "p2");
    const after2 = usePropertyHighlightStore.getState().token;
    expect(after1).toBe(before + 1);
    expect(after2).toBe(before + 2);
  });

  it("auto-clears after the highlight duration", () => {
    usePropertyHighlightStore.getState().highlight("node-1", "model");
    expect(usePropertyHighlightStore.getState().nodeId).toBe("node-1");

    jest.advanceTimersByTime(2500);

    expect(usePropertyHighlightStore.getState().nodeId).toBeNull();
    expect(usePropertyHighlightStore.getState().propertyName).toBeNull();
  });

  it("re-highlighting restarts the timer", () => {
    usePropertyHighlightStore.getState().highlight("node-1", "model");
    jest.advanceTimersByTime(2000);

    usePropertyHighlightStore.getState().highlight("node-2", "prompt");
    jest.advanceTimersByTime(2000);
    expect(usePropertyHighlightStore.getState().nodeId).toBe("node-2");

    jest.advanceTimersByTime(600);
    expect(usePropertyHighlightStore.getState().nodeId).toBeNull();
  });

  it("clear immediately resets state", () => {
    usePropertyHighlightStore.getState().highlight("node-1", "model");
    usePropertyHighlightStore.getState().clear();

    expect(usePropertyHighlightStore.getState().nodeId).toBeNull();
    expect(usePropertyHighlightStore.getState().propertyName).toBeNull();
  });

  it("clear cancels pending auto-clear timer", () => {
    usePropertyHighlightStore.getState().highlight("node-1", "model");
    usePropertyHighlightStore.getState().clear();

    usePropertyHighlightStore.getState().highlight("node-2", "prompt");
    jest.advanceTimersByTime(2500);

    expect(usePropertyHighlightStore.getState().nodeId).toBeNull();
  });
});
