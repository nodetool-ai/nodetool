import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock node:fs before importing auth module
vi.mock("node:fs", () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  existsSync: vi.fn()
}));

vi.mock("node:crypto", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    randomBytes: vi.fn(() => Buffer.from("a".repeat(32)))
  };
});

import {
  generateSecureToken,
  loadAuthConfig,
  saveAuthConfig,
  getServerAuthToken,
  isAuthEnabled,
  getTokenSource,
  verifyServerToken,
  AuthenticationError,
  AUTH_DEPLOYMENT_CONFIG_FILE
} from "../src/auth.js";

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";

const mockedExistsSync = vi.mocked(existsSync);
const mockedReadFileSync = vi.mocked(readFileSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);
const mockedMkdirSync = vi.mocked(mkdirSync);
const mockedRandomBytes = vi.mocked(randomBytes);

describe("auth", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env["SERVER_AUTH_TOKEN"];
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // =========================================================================
  // AUTH_DEPLOYMENT_CONFIG_FILE
  // =========================================================================

  describe("AUTH_DEPLOYMENT_CONFIG_FILE", () => {
    it("should be a string path", () => {
      expect(typeof AUTH_DEPLOYMENT_CONFIG_FILE).toBe("string");
    });

    it("should contain deployment.yaml", () => {
      expect(AUTH_DEPLOYMENT_CONFIG_FILE).toContain("deployment.yaml");
    });

    it("should contain .config/nodetool", () => {
      expect(AUTH_DEPLOYMENT_CONFIG_FILE).toContain(".config");
      expect(AUTH_DEPLOYMENT_CONFIG_FILE).toContain("nodetool");
    });
  });

  // =========================================================================
  // generateSecureToken
  // =========================================================================

  describe("generateSecureToken", () => {
    it("should return a string", () => {
      const token = generateSecureToken();
      expect(typeof token).toBe("string");
    });

    it("should call randomBytes with 32", () => {
      generateSecureToken();
      expect(mockedRandomBytes).toHaveBeenCalledWith(32);
    });

    it("should return base64url encoded value", () => {
      mockedRandomBytes.mockReturnValueOnce(Buffer.from("x".repeat(32)) as any);
      const token = generateSecureToken();
      // base64url should not contain +, /, =
      expect(token).not.toMatch(/[+/=]/);
    });

    it("should produce non-empty token", () => {
      const token = generateSecureToken();
      expect(token.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // loadAuthConfig
  // =========================================================================

  describe("loadAuthConfig", () => {
    it("should return empty object when file does not exist", () => {
      mockedExistsSync.mockReturnValue(false);
      const config = loadAuthConfig();
      expect(config).toEqual({});
    });

    it("should parse YAML content when file exists", () => {
      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue("server_auth_token: abc123\n");
      const config = loadAuthConfig();
      expect(config).toEqual({ server_auth_token: "abc123" });
    });

    it("should return empty object on parse error", () => {
      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockImplementation(() => {
        throw new Error("read error");
      });
      const config = loadAuthConfig();
      expect(config).toEqual({});
    });

    it("should return empty object when YAML content is null", () => {
      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue("");
      const config = loadAuthConfig();
      expect(config).toEqual({});
    });

    it("should read from the correct file path", () => {
      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue("key: val\n");
      loadAuthConfig();
      expect(mockedReadFileSync).toHaveBeenCalledWith(
        AUTH_DEPLOYMENT_CONFIG_FILE,
        "utf-8"
      );
    });

    it("should handle complex YAML structures", () => {
      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue(
        "server_auth_token: tok\nother_key: 42\nnested:\n  a: 1\n"
      );
      const config = loadAuthConfig();
      expect(config).toHaveProperty("server_auth_token", "tok");
      expect(config).toHaveProperty("other_key", 42);
      expect(config).toHaveProperty("nested");
    });
  });

  // =========================================================================
  // saveAuthConfig
  // =========================================================================

  describe("saveAuthConfig", () => {
    it("should create directory recursively", () => {
      saveAuthConfig({ key: "val" });
      expect(mockedMkdirSync).toHaveBeenCalledWith(expect.any(String), {
        recursive: true
      });
    });

    it("should write YAML content to file with restrictive permissions", () => {
      saveAuthConfig({ server_auth_token: "tok123" });
      expect(mockedWriteFileSync).toHaveBeenCalledWith(
        AUTH_DEPLOYMENT_CONFIG_FILE,
        expect.stringContaining("server_auth_token"),
        { encoding: "utf-8", mode: 0o600 }
      );
    });

    it("should handle empty config", () => {
      saveAuthConfig({});
      expect(mockedWriteFileSync).toHaveBeenCalled();
    });

    it("should serialize nested objects", () => {
      saveAuthConfig({ nested: { a: 1, b: "two" } });
      const written = mockedWriteFileSync.mock.calls[0]![1] as string;
      expect(written).toContain("nested");
    });
  });

  // =========================================================================
  // getServerAuthToken
  // =========================================================================

  describe("getServerAuthToken", () => {
    it("should return env var when SERVER_AUTH_TOKEN is set", () => {
      process.env["SERVER_AUTH_TOKEN"] = "env-token";
      expect(getServerAuthToken()).toBe("env-token");
    });

    it("should return token from config file when no env var", () => {
      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue("server_auth_token: file-token\n");
      expect(getServerAuthToken()).toBe("file-token");
    });

    it("should auto-generate and save token when neither env nor config exists", () => {
      mockedExistsSync.mockReturnValue(false);
      const token = getServerAuthToken();
      expect(typeof token).toBe("string");
      expect(token.length).toBeGreaterThan(0);
      // Should have saved the config
      expect(mockedWriteFileSync).toHaveBeenCalled();
    });

    it("should prioritize env var over config file", () => {
      process.env["SERVER_AUTH_TOKEN"] = "env-wins";
      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue("server_auth_token: file-token\n");
      expect(getServerAuthToken()).toBe("env-wins");
    });

    it("should not read file when env var is available", () => {
      process.env["SERVER_AUTH_TOKEN"] = "env-token";
      getServerAuthToken();
      expect(mockedExistsSync).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // isAuthEnabled
  // =========================================================================

  describe("isAuthEnabled", () => {
    it("should always return true", () => {
      expect(isAuthEnabled()).toBe(true);
    });

    it("should return true even with no env var set", () => {
      delete process.env["SERVER_AUTH_TOKEN"];
      expect(isAuthEnabled()).toBe(true);
    });
  });

  // =========================================================================
  // getTokenSource
  // =========================================================================

  describe("getTokenSource", () => {
    it("should return 'environment' when env var is set", () => {
      process.env["SERVER_AUTH_TOKEN"] = "some-token";
      expect(getTokenSource()).toBe("environment");
    });

    it("should return 'config' when token in config file", () => {
      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue("server_auth_token: tok\n");
      expect(getTokenSource()).toBe("config");
    });

    it("should return 'generated' when no env var and no config token", () => {
      mockedExistsSync.mockReturnValue(false);
      expect(getTokenSource()).toBe("generated");
    });
  });

  // =========================================================================
  // AuthenticationError
  // =========================================================================

  describe("AuthenticationError", () => {
    it("should be an instance of Error", () => {
      const err = new AuthenticationError(401, "bad");
      expect(err).toBeInstanceOf(Error);
    });

    it("should set statusCode", () => {
      const err = new AuthenticationError(403, "forbidden");
      expect(err.statusCode).toBe(403);
    });

    it("should set detail", () => {
      const err = new AuthenticationError(401, "invalid token");
      expect(err.detail).toBe("invalid token");
    });

    it("should set name to AuthenticationError", () => {
      const err = new AuthenticationError(401, "test");
      expect(err.name).toBe("AuthenticationError");
    });

    it("should set message to detail", () => {
      const err = new AuthenticationError(401, "msg detail");
      expect(err.message).toBe("msg detail");
    });
  });

  // =========================================================================
  // verifyServerToken
  // =========================================================================

  describe("verifyServerToken", () => {
    beforeEach(() => {
      process.env["SERVER_AUTH_TOKEN"] = "valid-token";
    });

    it("should return 'authenticated' for valid Bearer token", async () => {
      const result = await verifyServerToken("Bearer valid-token");
      expect(result).toBe("authenticated");
    });

    it("should throw when authorization is undefined", async () => {
      await expect(verifyServerToken(undefined)).rejects.toThrow(
        AuthenticationError
      );
    });

    it("should throw when authorization is null", async () => {
      await expect(verifyServerToken(null)).rejects.toThrow(
        AuthenticationError
      );
    });

    it("should throw when authorization is empty string", async () => {
      await expect(verifyServerToken("")).rejects.toThrow(AuthenticationError);
    });

    it("should throw for invalid format (no Bearer prefix)", async () => {
      await expect(verifyServerToken("valid-token")).rejects.toThrow(
        AuthenticationError
      );
    });

    it("should throw for wrong token", async () => {
      await expect(verifyServerToken("Bearer wrong-token")).rejects.toThrow(
        AuthenticationError
      );
    });

    it("should throw with status 401 for missing header", async () => {
      try {
        await verifyServerToken(undefined);
      } catch (e) {
        expect((e as AuthenticationError).statusCode).toBe(401);
      }
    });

    it("should throw with status 401 for invalid format", async () => {
      try {
        await verifyServerToken("Basic abc");
      } catch (e) {
        expect((e as AuthenticationError).statusCode).toBe(401);
      }
    });

    it("should throw with status 401 for wrong token", async () => {
      try {
        await verifyServerToken("Bearer bad");
      } catch (e) {
        expect((e as AuthenticationError).statusCode).toBe(401);
      }
    });

    it("should be case-insensitive for Bearer prefix", async () => {
      // The code does parts[0]!.toLowerCase() === "bearer"
      const result = await verifyServerToken("BEARER valid-token");
      expect(result).toBe("authenticated");
    });

    it("should reject when there are too many parts", async () => {
      await expect(verifyServerToken("Bearer token extra")).rejects.toThrow(
        AuthenticationError
      );
    });
  });
});
