import useSessionStateStore from "../SessionStateStore";

describe("SessionStateStore", () => {
  beforeEach(() => {
    useSessionStateStore.setState({
      clipboardData: null,
      isClipboardValid: false
    });
  });

  describe("initial state", () => {
    it("has null clipboardData", () => {
      const { clipboardData } = useSessionStateStore.getState();
      expect(clipboardData).toBeNull();
    });

    it("has false isClipboardValid", () => {
      const { isClipboardValid } = useSessionStateStore.getState();
      expect(isClipboardValid).toBe(false);
    });
  });

  describe("setClipboardData", () => {
    it("sets clipboard data to a string value", () => {
      const testData = '{"nodes":[],"edges":[]}';

      useSessionStateStore.getState().setClipboardData(testData);

      expect(useSessionStateStore.getState().clipboardData).toBe(testData);
    });

    it("sets clipboard data to null", () => {
      useSessionStateStore.getState().setClipboardData("some data");
      useSessionStateStore.getState().setClipboardData(null);

      expect(useSessionStateStore.getState().clipboardData).toBeNull();
    });

    it("can update clipboard data multiple times", () => {
      useSessionStateStore.getState().setClipboardData("first");
      expect(useSessionStateStore.getState().clipboardData).toBe("first");

      useSessionStateStore.getState().setClipboardData("second");
      expect(useSessionStateStore.getState().clipboardData).toBe("second");
    });

    it("preserves isClipboardValid when setting data", () => {
      useSessionStateStore.setState({ isClipboardValid: true });
      useSessionStateStore.getState().setClipboardData("test");

      expect(useSessionStateStore.getState().clipboardData).toBe("test");
      expect(useSessionStateStore.getState().isClipboardValid).toBe(true);
    });
  });

  describe("setIsClipboardValid", () => {
    it("sets isClipboardValid to true", () => {
      useSessionStateStore.getState().setIsClipboardValid(true);

      expect(useSessionStateStore.getState().isClipboardValid).toBe(true);
    });

    it("sets isClipboardValid to false", () => {
      useSessionStateStore.setState({ isClipboardValid: true });
      useSessionStateStore.getState().setIsClipboardValid(false);

      expect(useSessionStateStore.getState().isClipboardValid).toBe(false);
    });

    it("preserves clipboardData when setting validity", () => {
      useSessionStateStore.getState().setClipboardData("test data");
      useSessionStateStore.getState().setIsClipboardValid(true);

      expect(useSessionStateStore.getState().clipboardData).toBe("test data");
      expect(useSessionStateStore.getState().isClipboardValid).toBe(true);
    });
  });

  describe("state transitions", () => {
    it("handles full state transition", () => {
      useSessionStateStore.getState().setClipboardData("workflow data");
      useSessionStateStore.getState().setIsClipboardValid(true);

      expect(useSessionStateStore.getState().clipboardData).toBe("workflow data");
      expect(useSessionStateStore.getState().isClipboardValid).toBe(true);

      useSessionStateStore.getState().setIsClipboardValid(false);

      expect(useSessionStateStore.getState().isClipboardValid).toBe(false);
      expect(useSessionStateStore.getState().clipboardData).toBe("workflow data");
    });

    it("handles clearing clipboard", () => {
      useSessionStateStore.getState().setClipboardData("data");
      useSessionStateStore.getState().setIsClipboardValid(true);

      useSessionStateStore.getState().setClipboardData(null);

      expect(useSessionStateStore.getState().clipboardData).toBeNull();
      expect(useSessionStateStore.getState().isClipboardValid).toBe(true);
    });
  });
});
