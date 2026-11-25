/**
 * The access a workflow run gets to its owner's external MCP servers: a real
 * stdio server, the real settings store and secrets, and the deployment
 * policy that keeps stdio off a cloud host.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { initTestDb } from "@nodetool-ai/models";
import { setMasterKey } from "@nodetool-ai/security";
import type { McpServerConfig } from "@nodetool-ai/protocol";
import { externalMcpAccessFor, setExternalMcpResolver } from "@nodetool-ai/runtime";
import {
  closeExternalMcpPools,
  externalMcpAccessForUser,
  installExternalMcpResolver,
  saveExternalMcpServer
} from "../src/external-mcp.js";

const FIXTURE = fileURLToPath(new URL("./fixtures/fake-mcp-server.mjs", import.meta.url));
const SECRET = "sk-live-4f9a1c7e22";

const KEYS = ["NODETOOL_NODE_PROFILE", "NODETOOL_ENV", "SUPABASE_URL", "SUPABASE_KEY", "NODETOOL_ALLOW_STDIO_MCP", "ADMIN_USER_IDS", "USERS_FILE"] as const;
const saved: Record<string, string | undefined> = {};

const stdio = (id: string, command = process.execPath): McpServerConfig => ({
  id,
  name: id,
  enabled: true,
  transport: { type: "stdio", command, args: command === process.execPath ? [FIXTURE] : [], env: { FAKE_TOKEN: SECRET } }
});

beforeEach(() => {
  initTestDb();
  setMasterKey("dGVzdC1tYXN0ZXIta2V5LWZvci11bml0LXRlc3Rz");
  for (const key of KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(async () => {
  setExternalMcpResolver(null);
  await closeExternalMcpPools();
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("externalMcpAccessForUser", () => {
  it("lists the owner's servers, their tools and the read-only hint, and calls them", async () => {
    await saveExternalMcpServer("1", stdio("fake"));
    const access = externalMcpAccessForUser("1");
    expect(await access.servers()).toEqual([{ id: "fake", name: "fake" }]);
    const tools = await access.tools("fake");
    expect(tools.map((t) => [t.name, t.readOnly]).sort()).toEqual([
      ["echo_env", true],
      ["set_light", false]
    ]);
    expect((await access.call("fake", "set_light", {})).text).toBe("switched");
  }, 30_000);

  it("blanks the credential the server was started with out of its answer", async () => {
    await saveExternalMcpServer("1", stdio("fake"));
    const answer = await externalMcpAccessForUser("1").call("fake", "echo_env", {});
    expect(answer.text).toBe("token=[redacted]");
    expect(JSON.stringify(answer)).not.toContain(SECRET);
  }, 30_000);

  it("shows a user none of another user's servers", async () => {
    await saveExternalMcpServer("1", stdio("fake"));
    const other = externalMcpAccessForUser("2");
    expect(await other.servers()).toEqual([]);
    await expect(other.tools("fake")).rejects.toThrow("is not configured");
    await expect(other.call("fake", "set_light", {})).rejects.toThrow("not configured");
  }, 30_000);

  it("offers no stdio server once the deployment is a cloud profile", async () => {
    await saveExternalMcpServer("1", stdio("fake"));
    process.env.NODETOOL_NODE_PROFILE = "cloud";
    const access = externalMcpAccessForUser("1");
    expect(await access.servers()).toEqual([]);
    await expect(access.tools("fake")).rejects.toThrow(/not configured|not available/);
  }, 30_000);

  it("offers no stdio server to a non-admin on a Supabase deployment without the opt-in", async () => {
    await saveExternalMcpServer("1", stdio("fake"));
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_KEY = "k";
    expect(await externalMcpAccessForUser("1").servers()).toEqual([]);
    process.env.NODETOOL_ALLOW_STDIO_MCP = "1";
    expect((await externalMcpAccessForUser("1").servers()).map((s) => s.id)).toEqual(["fake"]);
  }, 30_000);

  it("reports a server whose command does not start as not answering", async () => {
    await saveExternalMcpServer("1", stdio("broken", "/nonexistent/mcp-server"));
    await expect(externalMcpAccessForUser("1").tools("broken")).rejects.toThrow(/not answering/);
  }, 30_000);

  it("installs itself as the process resolver, keyed by the run's user", () => {
    installExternalMcpResolver();
    expect(externalMcpAccessFor({ userId: "1" })).not.toBeNull();
    expect(externalMcpAccessFor({})).toBeNull();
  });
});
