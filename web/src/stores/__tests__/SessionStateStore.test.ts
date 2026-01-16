import useSessionStateStore from "../SessionStateStore";

describe("SessionStateStore", () => {
  beforeEach(() => {
    useSessionStateStore.setState({
      clipboardData: null,
      isClipboardValid: false
    });
  });

  describe("clipboardData", () => {
    it("should initialize with null", () => {
      expect(useSessionStateStore.getState().clipboardData).toBeNull();
    });

    it("should set clipboard data", () => {
      const data = '{"type":"nodes","data":[1,2,3]}';
      useSessionStateStore.getState().setClipboardData(data);

      expect(useSessionStateStore.getState().clipboardData).toBe(data);
    });

    it("should clear clipboard data when set to null", () => {
      useSessionStateStore.getState().setClipboardData('{"test":"data"}');
      expect(useSessionStateStore.getState().clipboardData).not.toBeNull();

      useSessionStateStore.getState().setClipboardData(null);
      expect(useSessionStateStore.getState().clipboardData).toBeNull();
    });

    it("should overwrite existing clipboard data", () => {
      useSessionStateStore.getState().setClipboardData('{"first":"data"}');
      useSessionStateStore.getState().setClipboardData('{"second":"data"}');

      expect(useSessionStateStore.getState().clipboardData).toBe('{"second":"data"}');
    });
  });

  describe("isClipboardValid", () => {
    it("should initialize with false", () => {
      expect(useSessionStateStore.getState().isClipboardValid).toBe(false);
    });

    it("should set clipboard valid state to true", () => {
      useSessionStateStore.getState().setIsClipboardValid(true);

      expect(useSessionStateStore.getState().isClipboardValid).toBe(true);
    });

    it("should set clipboard valid state back to false", () => {
      useSessionStateStore.getState().setIsClipboardValid(true);
      useSessionStateStore.getState().setIsClipboardValid(false);

      expect(useSessionStateStore.getState().isClipboardValid).toBe(false);
    });

    it("should track clipboard validity independently from clipboard data", () => {
      expect(useSessionStateStore.getState().isClipboardValid).toBe(false);

      useSessionStateStore.getState().setClipboardData('{"test":"data"}');
      expect(useSessionStateStore.getState().isClipboardValid).toBe(false);

      useSessionStateStore.getState().setIsClipboardValid(true);
      expect(useSessionStateStore.getState().clipboardData).not.toBeNull();
      expect(useSessionStateStore.getState().isClipboardValid).toBe(true);

      useSessionStateStore.getState().setClipboardData(null);
      expect(useSessionStateStore.getState().clipboardData).toBeNull();
      expect(useSessionStateStore.getState().isClipboardValid).toBe(true);
    });
  });
});
