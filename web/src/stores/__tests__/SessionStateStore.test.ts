import useSessionStateStore from "../SessionStateStore";

describe("SessionStateStore", () => {
  beforeEach(() => {
    useSessionStateStore.setState(useSessionStateStore.getInitialState());
  });

  afterEach(() => {
    useSessionStateStore.setState(useSessionStateStore.getInitialState());
  });

  describe("initial state", () => {
    it("has null clipboard data initially", () => {
      expect(useSessionStateStore.getState().clipboardData).toBeNull();
    });

    it("has isClipboardValid set to false initially", () => {
      expect(useSessionStateStore.getState().isClipboardValid).toBe(false);
    });
  });

  describe("setClipboardData", () => {
    it("sets clipboard data to a string value", () => {
      const testData = '{"nodes": [], "edges": []}';
      useSessionStateStore.getState().setClipboardData(testData);
      expect(useSessionStateStore.getState().clipboardData).toBe(testData);
    });

    it("sets clipboard data to null", () => {
      useSessionStateStore.getState().setClipboardData("some data");
      useSessionStateStore.getState().setClipboardData(null);
      expect(useSessionStateStore.getState().clipboardData).toBeNull();
    });

    it("overwrites existing clipboard data", () => {
      useSessionStateStore.getState().setClipboardData("first data");
      useSessionStateStore.getState().setClipboardData("second data");
      expect(useSessionStateStore.getState().clipboardData).toBe("second data");
    });

    it("handles empty string", () => {
      useSessionStateStore.getState().setClipboardData("");
      expect(useSessionStateStore.getState().clipboardData).toBe("");
    });

    it("handles complex JSON data", () => {
      const complexData = JSON.stringify({
        nodes: [{ id: "1", type: "test" }],
        edges: [{ id: "e1", source: "1", target: "2" }]
      });
      useSessionStateStore.getState().setClipboardData(complexData);
      expect(useSessionStateStore.getState().clipboardData).toBe(complexData);
    });
  });

  describe("setIsClipboardValid", () => {
    it("sets clipboard valid to true", () => {
      useSessionStateStore.getState().setIsClipboardValid(true);
      expect(useSessionStateStore.getState().isClipboardValid).toBe(true);
    });

    it("sets clipboard valid to false", () => {
      useSessionStateStore.getState().setIsClipboardValid(true);
      useSessionStateStore.getState().setIsClipboardValid(false);
      expect(useSessionStateStore.getState().isClipboardValid).toBe(false);
    });

    it("toggles between true and false", () => {
      expect(useSessionStateStore.getState().isClipboardValid).toBe(false);
      useSessionStateStore.getState().setIsClipboardValid(true);
      expect(useSessionStateStore.getState().isClipboardValid).toBe(true);
      useSessionStateStore.getState().setIsClipboardValid(false);
      expect(useSessionStateStore.getState().isClipboardValid).toBe(false);
    });
  });

  describe("clipboard workflow", () => {
    it("manages complete clipboard workflow", () => {
      const workflowData = '{"type": "workflow", "data": "test"}';
      
      expect(useSessionStateStore.getState().clipboardData).toBeNull();
      expect(useSessionStateStore.getState().isClipboardValid).toBe(false);
      
      useSessionStateStore.getState().setClipboardData(workflowData);
      expect(useSessionStateStore.getState().clipboardData).toBe(workflowData);
      
      useSessionStateStore.getState().setIsClipboardValid(true);
      expect(useSessionStateStore.getState().isClipboardValid).toBe(true);
      
      const storedData = useSessionStateStore.getState().clipboardData;
      expect(storedData).toBe(workflowData);
      expect(JSON.parse(storedData!)).toEqual({ type: "workflow", data: "test" });
      
      useSessionStateStore.getState().setClipboardData(null);
      useSessionStateStore.getState().setIsClipboardValid(false);
      
      expect(useSessionStateStore.getState().clipboardData).toBeNull();
      expect(useSessionStateStore.getState().isClipboardValid).toBe(false);
    });
  });
});
