import { describe, it, expect, vi, beforeEach } from "vitest";
import * as yaml from "js-yaml";
import { createHash } from "node:crypto";

import {
  RemoteUserManager,
  SimpleSSHConnection,
  type SSHConnectionHandle,
  type UserInfo
} from "../src/remote-users.js";

// Helper: create a mock SSH connection
function createMockSSH(): SSHConnectionHandle & {
  execute: ReturnType<typeof vi.fn>;
} {
  return {
    execute: vi.fn()
  };
}

// Helper: build a YAML users file content
function usersYaml(users: Record<string, UserInfo>): string {
  return yaml.dump({ users, version: "1.0" });
}

function sha256(s: string): string {
  return createHash("sha256").update(s, "utf-8").digest("hex");
}

const USERS_FILE = "/data/users.yaml";

const fakeDeployment = {
  type: "docker" as const,
  host: "example.com",
  enabled: true,
  image: { name: "img", tag: "latest", registry: "docker.io" },
  container: { name: "c", port: 8000 },
  paths: { workspace: "/w", hf_cache: "/h" },
  state: {
    last_deployed: null,
    status: "unknown" as const,
    container_id: null,
    container_name: null,
    url: null,
    container_hash: null
  }
};

describe("RemoteUserManager", () => {
  let ssh: ReturnType<typeof createMockSSH>;
  let mgr: RemoteUserManager;

  beforeEach(() => {
    ssh = createMockSSH();
    mgr = new RemoteUserManager(fakeDeployment, USERS_FILE, ssh);
  });

  // =========================================================================
  // listUsers
  // =========================================================================

  describe("listUsers", () => {
    it("should return empty object when remote file is empty", async () => {
      ssh.execute.mockResolvedValue([0, "{}", ""]);
      const users = await mgr.listUsers();
      expect(users).toEqual({});
    });

    it("should return parsed users from remote YAML", async () => {
      const existing: Record<string, UserInfo> = {
        alice: {
          user_id: "user_alice_abc",
          username: "alice",
          role: "admin",
          token_hash: "hash1",
          created_at: "2024-01-01T00:00:00Z"
        }
      };
      ssh.execute.mockResolvedValue([0, usersYaml(existing), ""]);
      const users = await mgr.listUsers();
      expect(users).toHaveProperty("alice");
      expect(users["alice"]!.role).toBe("admin");
    });

    it("should return empty object on non-zero exit code", async () => {
      ssh.execute.mockResolvedValue([1, "", "error"]);
      const users = await mgr.listUsers();
      expect(users).toEqual({});
    });

    it("should return empty object when SSH throws", async () => {
      ssh.execute.mockRejectedValue(new Error("connection lost"));
      const users = await mgr.listUsers();
      expect(users).toEqual({});
    });

    it("should execute cat command on the users file", async () => {
      ssh.execute.mockResolvedValue([0, "{}", ""]);
      await mgr.listUsers();
      expect(ssh.execute).toHaveBeenCalledWith(
        expect.stringContaining(USERS_FILE),
        { check: false }
      );
    });
  });

  // =========================================================================
  // addUser
  // =========================================================================

  describe("addUser", () => {
    it("should add a new user and save remotely", async () => {
      ssh.execute.mockResolvedValue([0, "{}", ""]);
      await mgr.addUser("bob", "user", "my-secret-token");
      // Should have called mkdir, write, and chmod
      expect(ssh.execute).toHaveBeenCalledTimes(4); // cat, mkdir, write, chmod
    });

    it("should throw when user already exists", async () => {
      const existing: Record<string, UserInfo> = {
        bob: {
          user_id: "user_bob_123",
          username: "bob",
          role: "user",
          token_hash: "h",
          created_at: "2024-01-01T00:00:00Z"
        }
      };
      ssh.execute.mockResolvedValue([0, usersYaml(existing), ""]);
      await expect(mgr.addUser("bob", "user", "tok")).rejects.toThrow(
        "already exists"
      );
    });

    it("should hash the token before saving", async () => {
      ssh.execute.mockResolvedValue([0, "{}", ""]);
      await mgr.addUser("carol", "admin", "plaintext-tok");

      // The write command (3rd call) should contain base64-encoded YAML
      const writeCall = ssh.execute.mock.calls[2]![0] as string;
      // Decode base64 content
      const b64 = writeCall.split("echo ")[1]!.split(" |")[0]!;
      const yamlContent = Buffer.from(b64, "base64").toString("utf-8");
      const data = yaml.load(yamlContent) as {
        users: Record<string, UserInfo>;
      };
      expect(data.users["carol"]!.token_hash).toBe(sha256("plaintext-tok"));
    });

    it("should generate a user_id with username prefix", async () => {
      ssh.execute.mockResolvedValue([0, "{}", ""]);
      await mgr.addUser("dave", "user", "tok");

      const writeCall = ssh.execute.mock.calls[2]![0] as string;
      const b64 = writeCall.split("echo ")[1]!.split(" |")[0]!;
      const yamlContent = Buffer.from(b64, "base64").toString("utf-8");
      const data = yaml.load(yamlContent) as {
        users: Record<string, UserInfo>;
      };
      expect(data.users["dave"]!.user_id).toMatch(/^user_dave_/);
    });

    it("should set the correct role", async () => {
      ssh.execute.mockResolvedValue([0, "{}", ""]);
      await mgr.addUser("eve", "admin", "tok");

      const writeCall = ssh.execute.mock.calls[2]![0] as string;
      const b64 = writeCall.split("echo ")[1]!.split(" |")[0]!;
      const yamlContent = Buffer.from(b64, "base64").toString("utf-8");
      const data = yaml.load(yamlContent) as {
        users: Record<string, UserInfo>;
      };
      expect(data.users["eve"]!.role).toBe("admin");
    });

    it("should set created_at as ISO string", async () => {
      ssh.execute.mockResolvedValue([0, "{}", ""]);
      await mgr.addUser("frank", "user", "tok");

      const writeCall = ssh.execute.mock.calls[2]![0] as string;
      const b64 = writeCall.split("echo ")[1]!.split(" |")[0]!;
      const yamlContent = Buffer.from(b64, "base64").toString("utf-8");
      const data = yaml.load(yamlContent) as {
        users: Record<string, UserInfo>;
      };
      // Should be a valid ISO date
      expect(() => new Date(data.users["frank"]!.created_at)).not.toThrow();
    });

    it("should set chmod 0600 on users file", async () => {
      ssh.execute.mockResolvedValue([0, "{}", ""]);
      await mgr.addUser("gina", "user", "tok");

      const chmodCall = ssh.execute.mock.calls[3]![0] as string;
      expect(chmodCall).toContain("chmod");
      expect(chmodCall).toContain("0600");
    });
  });

  // =========================================================================
  // removeUser
  // =========================================================================

  describe("removeUser", () => {
    it("should remove an existing user", async () => {
      const existing: Record<string, UserInfo> = {
        alice: {
          user_id: "user_alice_abc",
          username: "alice",
          role: "admin",
          token_hash: "h",
          created_at: "2024-01-01T00:00:00Z"
        },
        bob: {
          user_id: "user_bob_def",
          username: "bob",
          role: "user",
          token_hash: "h2",
          created_at: "2024-01-01T00:00:00Z"
        }
      };
      ssh.execute.mockResolvedValue([0, usersYaml(existing), ""]);
      await mgr.removeUser("alice");

      // Verify alice is removed from saved data
      const writeCall = ssh.execute.mock.calls[2]![0] as string;
      const b64 = writeCall.split("echo ")[1]!.split(" |")[0]!;
      const yamlContent = Buffer.from(b64, "base64").toString("utf-8");
      const data = yaml.load(yamlContent) as {
        users: Record<string, UserInfo>;
      };
      expect(data.users).not.toHaveProperty("alice");
      expect(data.users).toHaveProperty("bob");
    });

    it("should throw when user does not exist", async () => {
      ssh.execute.mockResolvedValue([0, "{}", ""]);
      await expect(mgr.removeUser("nonexistent")).rejects.toThrow("not found");
    });

    it("should save after removing", async () => {
      const existing: Record<string, UserInfo> = {
        alice: {
          user_id: "user_alice_abc",
          username: "alice",
          role: "admin",
          token_hash: "h",
          created_at: "2024-01-01T00:00:00Z"
        }
      };
      ssh.execute.mockResolvedValue([0, usersYaml(existing), ""]);
      await mgr.removeUser("alice");
      // 4 calls: cat, mkdir, write, chmod
      expect(ssh.execute).toHaveBeenCalledTimes(4);
    });
  });

  // =========================================================================
  // resetToken
  // =========================================================================

  describe("resetToken", () => {
    it("should update token hash for existing user", async () => {
      const existing: Record<string, UserInfo> = {
        alice: {
          user_id: "user_alice_abc",
          username: "alice",
          role: "admin",
          token_hash: sha256("old-token"),
          created_at: "2024-01-01T00:00:00Z"
        }
      };
      ssh.execute.mockResolvedValue([0, usersYaml(existing), ""]);
      await mgr.resetToken("alice", "new-token");

      const writeCall = ssh.execute.mock.calls[2]![0] as string;
      const b64 = writeCall.split("echo ")[1]!.split(" |")[0]!;
      const yamlContent = Buffer.from(b64, "base64").toString("utf-8");
      const data = yaml.load(yamlContent) as {
        users: Record<string, UserInfo>;
      };
      expect(data.users["alice"]!.token_hash).toBe(sha256("new-token"));
    });

    it("should preserve user_id and role", async () => {
      const existing: Record<string, UserInfo> = {
        alice: {
          user_id: "user_alice_abc",
          username: "alice",
          role: "admin",
          token_hash: sha256("old"),
          created_at: "2024-01-01T00:00:00Z"
        }
      };
      ssh.execute.mockResolvedValue([0, usersYaml(existing), ""]);
      await mgr.resetToken("alice", "new-tok");

      const writeCall = ssh.execute.mock.calls[2]![0] as string;
      const b64 = writeCall.split("echo ")[1]!.split(" |")[0]!;
      const yamlContent = Buffer.from(b64, "base64").toString("utf-8");
      const data = yaml.load(yamlContent) as {
        users: Record<string, UserInfo>;
      };
      expect(data.users["alice"]!.user_id).toBe("user_alice_abc");
      expect(data.users["alice"]!.role).toBe("admin");
    });

    it("should throw when user does not exist", async () => {
      ssh.execute.mockResolvedValue([0, "{}", ""]);
      await expect(mgr.resetToken("ghost", "tok")).rejects.toThrow("not found");
    });

    it("should update created_at timestamp", async () => {
      const oldDate = "2020-01-01T00:00:00Z";
      const existing: Record<string, UserInfo> = {
        alice: {
          user_id: "user_alice_abc",
          username: "alice",
          role: "user",
          token_hash: sha256("old"),
          created_at: oldDate
        }
      };
      ssh.execute.mockResolvedValue([0, usersYaml(existing), ""]);
      await mgr.resetToken("alice", "new");

      const writeCall = ssh.execute.mock.calls[2]![0] as string;
      const b64 = writeCall.split("echo ")[1]!.split(" |")[0]!;
      const yamlContent = Buffer.from(b64, "base64").toString("utf-8");
      const data = yaml.load(yamlContent) as {
        users: Record<string, UserInfo>;
      };
      expect(data.users["alice"]!.created_at).not.toBe(oldDate);
    });
  });

  // =========================================================================
  // SimpleSSHConnection
  // =========================================================================

  describe("SimpleSSHConnection", () => {
    it("should resolve with exit code, stdout, stderr on success", async () => {
      const mockClient = {
        exec: vi.fn(
          (_cmd: string, cb: (err: Error | undefined, stream: any) => void) => {
            const stream = {
              on: vi.fn((event: string, handler: Function) => {
                if (event === "data") handler(Buffer.from("out"));
                if (event === "close") handler(0);
              }),
              stderr: {
                on: vi.fn((event: string, handler: Function) => {
                  if (event === "data") handler(Buffer.from("err"));
                })
              }
            };
            cb(undefined, stream);
          }
        )
      };

      const conn = new SimpleSSHConnection(mockClient);
      const [code, stdout, stderr] = await conn.execute("ls");
      expect(code).toBe(0);
      expect(stdout).toBe("out");
      expect(stderr).toBe("err");
    });

    it("should reject when client.exec returns error", async () => {
      const mockClient = {
        exec: vi.fn(
          (_cmd: string, cb: (err: Error | undefined, stream: any) => void) => {
            cb(new Error("conn error"), null as any);
          }
        )
      };

      const conn = new SimpleSSHConnection(mockClient);
      await expect(conn.execute("ls")).rejects.toThrow("conn error");
    });

    it("should reject on non-zero exit when check is true (default)", async () => {
      const mockClient = {
        exec: vi.fn(
          (_cmd: string, cb: (err: Error | undefined, stream: any) => void) => {
            const stream = {
              on: vi.fn((event: string, handler: Function) => {
                if (event === "close") handler(1);
              }),
              stderr: {
                on: vi.fn()
              }
            };
            cb(undefined, stream);
          }
        )
      };

      const conn = new SimpleSSHConnection(mockClient);
      await expect(conn.execute("fail-cmd")).rejects.toThrow("Command failed");
    });

    it("should resolve on non-zero exit when check is false", async () => {
      const mockClient = {
        exec: vi.fn(
          (_cmd: string, cb: (err: Error | undefined, stream: any) => void) => {
            const stream = {
              on: vi.fn((event: string, handler: Function) => {
                if (event === "close") handler(1);
              }),
              stderr: {
                on: vi.fn()
              }
            };
            cb(undefined, stream);
          }
        )
      };

      const conn = new SimpleSSHConnection(mockClient);
      const [code] = await conn.execute("fail-cmd", { check: false });
      expect(code).toBe(1);
    });
  });
});
