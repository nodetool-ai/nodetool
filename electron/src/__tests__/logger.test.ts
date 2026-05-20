jest.unmock("../logger");

jest.mock("electron-log", () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock("../config", () => ({
  getSystemDataPath: jest.fn((name: string) => `/tmp/nodetool-test/${name}`),
}));

jest.mock("fs", () => {
  const actual = jest.requireActual("fs");
  return {
    ...actual,
    existsSync: jest.fn().mockReturnValue(true),
    mkdirSync: jest.fn(),
    createWriteStream: jest.fn().mockReturnValue({
      write: jest.fn(),
      end: jest.fn(),
      destroyed: false,
      on: jest.fn(),
    }),
  };
});

import log from "electron-log";
import { logMessage, closeLogStream, LOG_FILE } from "../logger";

describe("logger", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("LOG_FILE", () => {
    it("ends with nodetool.log", () => {
      expect(LOG_FILE).toMatch(/nodetool\.log$/);
    });
  });

  describe("logMessage", () => {
    it("logs at info level by default", () => {
      logMessage("hello");
      expect(log.info).toHaveBeenCalledWith("hello");
    });

    it("logs at warn level", () => {
      logMessage("warning!", "warn");
      expect(log.warn).toHaveBeenCalledWith("warning!");
    });

    it("logs at error level", () => {
      logMessage("broken", "error");
      expect(log.error).toHaveBeenCalledWith("broken");
    });

    it("trims the message", () => {
      logMessage("  padded  ");
      expect(log.info).toHaveBeenCalledWith("padded");
    });
  });

  describe("closeLogStream", () => {
    it("does not throw when called without prior logging", () => {
      expect(() => closeLogStream()).not.toThrow();
    });
  });
});
