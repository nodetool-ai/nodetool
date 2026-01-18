import { renderHook } from "@testing-library/react";
import { useClipboard } from "../useClipboard";

// Mock dependencies
jest.mock("../../stores/SessionStateStore", () => ({
  __esModule: true,
  default: jest.fn((selector) => {
    const mockState = {
      clipboardData: null,
      setClipboardData: jest.fn(),
      isClipboardValid: false,
      setIsClipboardValid: jest.fn()
    };
    return selector(mockState);
  })
}));

jest.mock("loglevel", () => ({
  info: jest.fn(),
  warn: jest.fn()
}));

// Mock navigator.clipboard
const mockClipboard = {
  readText: jest.fn().mockResolvedValue(""),
  writeText: jest.fn().mockResolvedValue(undefined)
};

describe("useClipboard", () => {
  let result: {
    clipboardData: any;
    readClipboard: jest.Mock;
    writeClipboard: jest.Mock;
    isClipboardValid: boolean;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    Object.defineProperty(navigator, "clipboard", {
      value: mockClipboard,
      writable: true
    });

    result = renderHook(() => useClipboard()).result;
  });

  describe("initial state", () => {
    it("initializes with null clipboard data", () => {
      expect(result.clipboardData).toBeNull();
    });

    it("initializes with isClipboardValid as false", () => {
      expect(result.isClipboardValid).toBe(false);
    });
  });

  describe("readClipboard", () => {
    it("reads clipboard data successfully", async () => {
      const validData = JSON.stringify({
        nodes: [{ id: "node-1" }],
        edges: []
      });
      mockClipboard.readText.mockResolvedValueOnce(validData);

      const { readClipboard } = result;
      const response = await readClipboard();

      expect(mockClipboard.readText).toHaveBeenCalled();
      expect(response.data).not.toBeNull();
      expect(response.isValid).toBe(true);
    });

    it("validates clipboard data correctly", async () => {
      const validData = JSON.stringify({
        nodes: [{ id: "node-1" }],
        edges: []
      });
      mockClipboard.readText.mockResolvedValueOnce(validData);

      const { readClipboard } = result;
      await readClipboard();

      expect(result.isClipboardValid).toBe(true);
    });

    it("rejects invalid clipboard data", async () => {
      mockClipboard.readText.mockResolvedValueOnce("invalid data");

      const { readClipboard } = result;
      await readClipboard();

      expect(result.isClipboardValid).toBe(false);
      expect(result.clipboardData).toBeNull();
    });

    it("rejects data without nodes", async () => {
      const invalidData = JSON.stringify({
        edges: []
      });
      mockClipboard.readText.mockResolvedValueOnce(invalidData);

      const { readClipboard } = result;
      await readClipboard();

      expect(result.isClipboardValid).toBe(false);
    });

    it("rejects data with empty nodes array", async () => {
      const invalidData = JSON.stringify({
        nodes: [],
        edges: []
      });
      mockClipboard.readText.mockResolvedValueOnce(invalidData);

      const { readClipboard } = result;
      await readClipboard();

      expect(result.isClipboardValid).toBe(false);
    });

    it("rejects data without edges property", async () => {
      const invalidData = JSON.stringify({
        nodes: [{ id: "node-1" }]
      });
      mockClipboard.readText.mockResolvedValueOnce(invalidData);

      const { readClipboard } = result;
      await readClipboard();

      expect(result.isClipboardValid).toBe(false);
    });

    it("handles JSON parsing errors", async () => {
      mockClipboard.readText.mockResolvedValueOnce("not valid json{");

      const { readClipboard } = result;
      await readClipboard();

      expect(result.isClipboardValid).toBe(false);
    });
  });

  describe("writeClipboard", () => {
    it("writes valid data to clipboard", async () => {
      const validData = JSON.stringify({
        nodes: [{ id: "node-1" }],
        edges: []
      });

      const { writeClipboard } = result;
      await writeClipboard(validData);

      expect(mockClipboard.writeText).toHaveBeenCalledWith(validData);
    });

    it("sets isClipboardValid to true for valid data", async () => {
      const validData = JSON.stringify({
        nodes: [{ id: "node-1" }],
        edges: []
      });

      const { writeClipboard } = result;
      await writeClipboard(validData);

      expect(result.isClipboardValid).toBe(true);
    });

    it("does not write invalid data to clipboard", async () => {
      const invalidData = "invalid data";

      const { writeClipboard } = result;
      await writeClipboard(invalidData);

      expect(mockClipboard.writeText).not.toHaveBeenCalled();
    });

    it("sets isClipboardValid to false for invalid data", async () => {
      const invalidData = "invalid data";

      const { writeClipboard } = result;
      await writeClipboard(invalidData);

      expect(result.isClipboardValid).toBe(false);
    });

    it("allows arbitrary data when flag is set", async () => {
      const arbitraryData = "any text content";

      const { writeClipboard } = result;
      await writeClipboard(arbitraryData, true);

      expect(mockClipboard.writeText).toHaveBeenCalledWith(arbitraryData);
    });

    it("formats JSON when formatJson flag is set", async () => {
      const data = '{"nodes":[{"id":"node-1"}],"edges":[]}';
      const formattedData = '{\n  "nodes": [\n    {\n      "id": "node-1"\n    }\n  ],\n  "edges": []\n}';

      const { writeClipboard } = result;
      await writeClipboard(data, false, true);

      expect(mockClipboard.writeText).toHaveBeenCalledWith(formattedData);
    });
  });

  describe("Firefox handling", () => {
    it("clears clipboard data on Firefox", () => {
      const { useSessionStateStore } = require("../../stores/SessionStateStore");
      const mockSetClipboardData = jest.fn();
      
      useSessionStateStore.mockImplementation((selector) => {
        const mockState = {
          clipboardData: null,
          setClipboardData: mockSetClipboardData,
          isClipboardValid: false,
          setIsClipboardValid: jest.fn()
        };
        return selector(mockState);
      });

      Object.defineProperty(navigator, "userAgent", {
        value: "Mozilla/5.0 Firefox/100.0",
        writable: true
      });

      renderHook(() => useClipboard());

      expect(mockSetClipboardData).toHaveBeenCalledWith(null);
    });
  });
});
