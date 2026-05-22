import { getSystemDataPath } from "../systemPaths";
import * as os from "os";
import * as path from "path";

describe("getSystemDataPath", () => {
  const originalPlatform = process.platform;
  const originalEnv = process.env;

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform });
    process.env = originalEnv;
  });

  describe("on macOS/Linux", () => {
    it("returns ~/.local/share/nodetool/<filename> on darwin", () => {
      Object.defineProperty(process, "platform", { value: "darwin" });
      const result = getSystemDataPath("settings.json");
      expect(result).toBe(
        path.join(os.homedir(), ".local", "share", "nodetool", "settings.json")
      );
    });

    it("returns ~/.local/share/nodetool/<filename> on linux", () => {
      Object.defineProperty(process, "platform", { value: "linux" });
      const result = getSystemDataPath("logs.txt");
      expect(result).toBe(
        path.join(os.homedir(), ".local", "share", "nodetool", "logs.txt")
      );
    });
  });

  describe("on Windows", () => {
    it("uses LOCALAPPDATA when available", () => {
      Object.defineProperty(process, "platform", { value: "win32" });
      process.env = { ...originalEnv, LOCALAPPDATA: "C:\\Users\\Test\\AppData\\Local" };
      const result = getSystemDataPath("db.sqlite");
      expect(result).toBe(
        path.join("C:\\Users\\Test\\AppData\\Local", "nodetool", "db.sqlite")
      );
    });

    it("falls back to data/<filename> when LOCALAPPDATA is missing", () => {
      Object.defineProperty(process, "platform", { value: "win32" });
      process.env = { ...originalEnv };
      delete process.env.LOCALAPPDATA;
      const result = getSystemDataPath("db.sqlite");
      expect(result).toBe(path.join("data", "db.sqlite"));
    });
  });

  describe("on unknown platform", () => {
    it("falls back to data/<filename>", () => {
      Object.defineProperty(process, "platform", { value: "freebsd" });
      const result = getSystemDataPath("config.json");
      expect(result).toBe(path.join("data", "config.json"));
    });
  });
});
