import useSessionStateStore from "../SessionStateStore";

describe("SessionStateStore", () => {
  beforeEach(() => {
    useSessionStateStore.setState(useSessionStateStore.getInitialState());
  });

  it("initializes with null clipboard data", () => {
    expect(useSessionStateStore.getState().clipboardData).toBeNull();
  });

  it("initializes with invalid clipboard", () => {
    expect(useSessionStateStore.getState().isClipboardValid).toBe(false);
  });

  it("sets clipboard data", () => {
    const testData = JSON.stringify({ nodes: [], edges: [] });
    useSessionStateStore.getState().setClipboardData(testData);
    expect(useSessionStateStore.getState().clipboardData).toBe(testData);
  });

  it("clears clipboard data", () => {
    useSessionStateStore.getState().setClipboardData("some data");
    useSessionStateStore.getState().setClipboardData(null);
    expect(useSessionStateStore.getState().clipboardData).toBeNull();
  });

  it("sets clipboard validity", () => {
    useSessionStateStore.getState().setIsClipboardValid(true);
    expect(useSessionStateStore.getState().isClipboardValid).toBe(true);
  });

  it("toggles clipboard validity", () => {
    expect(useSessionStateStore.getState().isClipboardValid).toBe(false);
    useSessionStateStore.getState().setIsClipboardValid(true);
    expect(useSessionStateStore.getState().isClipboardValid).toBe(true);
    useSessionStateStore.getState().setIsClipboardValid(false);
    expect(useSessionStateStore.getState().isClipboardValid).toBe(false);
  });

  it("handles clipboard data updates independently of validity", () => {
    expect(useSessionStateStore.getState().clipboardData).toBeNull();
    expect(useSessionStateStore.getState().isClipboardValid).toBe(false);

    useSessionStateStore.getState().setClipboardData("test data");
    expect(useSessionStateStore.getState().clipboardData).toBe("test data");
    expect(useSessionStateStore.getState().isClipboardValid).toBe(false);

    useSessionStateStore.getState().setIsClipboardValid(true);
    expect(useSessionStateStore.getState().clipboardData).toBe("test data");
    expect(useSessionStateStore.getState().isClipboardValid).toBe(true);
  });
});
