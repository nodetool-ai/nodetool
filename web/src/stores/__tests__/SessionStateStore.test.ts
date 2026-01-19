import useSessionStateStore from "../SessionStateStore";

describe("SessionStateStore", () => {
  beforeEach(() => {
    useSessionStateStore.setState(useSessionStateStore.getInitialState());
  });

  it("initializes with default values", () => {
    const state = useSessionStateStore.getState();
    expect(state.clipboardData).toBe(null);
    expect(state.isClipboardValid).toBe(false);
  });

  it("sets clipboard data", () => {
    const testData = '{"type":"nodes","data":[{"id":"node-1"}]}';
    useSessionStateStore.getState().setClipboardData(testData);

    const state = useSessionStateStore.getState();
    expect(state.clipboardData).toBe(testData);
  });

  it("clears clipboard data when null is passed", () => {
    useSessionStateStore.getState().setClipboardData("some data");
    useSessionStateStore.getState().setClipboardData(null);

    const state = useSessionStateStore.getState();
    expect(state.clipboardData).toBe(null);
  });

  it("sets clipboard validity", () => {
    useSessionStateStore.getState().setIsClipboardValid(true);

    const state = useSessionStateStore.getState();
    expect(state.isClipboardValid).toBe(true);
  });

  it("sets clipboard validity to false", () => {
    useSessionStateStore.getState().setIsClipboardValid(true);
    useSessionStateStore.getState().setIsClipboardValid(false);

    const state = useSessionStateStore.getState();
    expect(state.isClipboardValid).toBe(false);
  });

  it("can update both clipboard data and validity independently", () => {
    useSessionStateStore.getState().setClipboardData("test data");
    expect(useSessionStateStore.getState().clipboardData).toBe("test data");
    expect(useSessionStateStore.getState().isClipboardValid).toBe(false);

    useSessionStateStore.getState().setIsClipboardValid(true);
    expect(useSessionStateStore.getState().clipboardData).toBe("test data");
    expect(useSessionStateStore.getState().isClipboardValid).toBe(true);

    useSessionStateStore.getState().setClipboardData("new data");
    expect(useSessionStateStore.getState().clipboardData).toBe("new data");
    expect(useSessionStateStore.getState().isClipboardValid).toBe(true);

    useSessionStateStore.getState().setIsClipboardValid(false);
    expect(useSessionStateStore.getState().clipboardData).toBe("new data");
    expect(useSessionStateStore.getState().isClipboardValid).toBe(false);
  });
});
