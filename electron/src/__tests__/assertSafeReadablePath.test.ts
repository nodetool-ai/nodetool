import { assertSafeReadablePath } from "../utils";

jest.mock("../state", () => ({
  serverState: { serverPort: undefined }
}));

describe("assertSafeReadablePath", () => {
  describe("type validation", () => {
    it("throws for non-string input", () => {
      expect(() => assertSafeReadablePath(42)).toThrow("Path must be a string");
      expect(() => assertSafeReadablePath(null)).toThrow(
        "Path must be a string"
      );
      expect(() => assertSafeReadablePath(undefined)).toThrow(
        "Path must be a string"
      );
    });

    it("throws for empty string", () => {
      expect(() => assertSafeReadablePath("")).toThrow(
        "Path must not be empty"
      );
    });

    it("throws for paths containing null bytes", () => {
      expect(() => assertSafeReadablePath("/tmp/file\0.txt")).toThrow(
        "Path contains invalid characters"
      );
    });

    it("throws for paths exceeding maximum length", () => {
      const longPath = "/" + "a".repeat(4097);
      expect(() => assertSafeReadablePath(longPath)).toThrow(
        "Path exceeds maximum length"
      );
    });
  });

  describe("valid paths", () => {
    it("returns the resolved path for valid absolute paths", () => {
      const result = assertSafeReadablePath("/tmp/test-file.txt");
      expect(result).toBe("/tmp/test-file.txt");
    });

    it("returns resolved path for paths in home directory", () => {
      const result = assertSafeReadablePath("/home/user/documents/file.txt");
      expect(typeof result).toBe("string");
      expect(result).toContain("file.txt");
    });
  });

  describe("sensitive home subdirectories", () => {
    const os = require("os");
    const path = require("path");
    const home = os.homedir();

    const sensitiveSubdirs = [
      ".ssh",
      ".aws",
      ".gnupg",
      ".kube",
      ".docker",
      ".config/gcloud",
      ".netrc",
      ".pgpass",
      ".npmrc"
    ];

    it.each(sensitiveSubdirs)("blocks access to ~/%s", (subdir) => {
      const forbidden = path.join(home, subdir, "some-file");
      expect(() => assertSafeReadablePath(forbidden)).toThrow(
        "Access to this path is not permitted"
      );
    });

    it.each(sensitiveSubdirs)(
      "blocks access to ~/%s directory itself",
      (subdir) => {
        const forbidden = path.join(home, subdir);
        expect(() => assertSafeReadablePath(forbidden)).toThrow(
          "Access to this path is not permitted"
        );
      }
    );
  });

  describe("sensitive absolute prefixes", () => {
    const blockedPaths = [
      "/etc/passwd",
      "/proc/self/environ",
      "/sys/class",
      "/dev/null",
      "/boot/vmlinuz",
      "/root/.bashrc",
      "/var/log/syslog"
    ];

    it.each(blockedPaths)("blocks access to %s", (blockedPath) => {
      expect(() => assertSafeReadablePath(blockedPath)).toThrow(
        "Access to this path is not permitted"
      );
    });
  });
});
