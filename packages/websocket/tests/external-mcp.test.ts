/**
 * External MCP server persistence: the setting row round-trips, invalid rows
 * are dropped rather than fatal, and the cloud profile refuses stdio servers.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Secret, Setting, initTestDb } from "@nodetool-ai/models";
import { setMasterKey } from "@nodetool-ai/security";
import type { McpServerConfig } from "@nodetool-ai/protocol";
import {
  EXTERNAL_MCP_SETTING_KEY,
  STDIO_MCP_DISABLED_ERROR,
  closeExternalMcpPools,
  deleteExternalMcpServer,
  isLocalMcpProfile,
  loadExternalMcpServers,
  probeExternalMcpServer,
  saveExternalMcpServer
} from "../src/external-mcp.js";

const KEYS = ["NODETOOL_NODE_PROFILE", "NODETOOL_ENV"] as const;
const saved: Record<string, string | undefined> = {};

const stdio: McpServerConfig = {
  id: "blender",
  name: "Blender",
  enabled: true,
  transport: { type: "stdio", command: "blender-mcp", args: [], env: {} }
};

const http: McpServerConfig = {
  id: "hf",
  name: "Hugging Face",
  enabled: true,
  transport: {
    type: "http",
    url: "https://huggingface.co/mcp",
    headers: { Authorization: "${HF_TOKEN}" }
  }
};

const TEST_MASTER_KEY = "dGVzdC1tYXN0ZXIta2V5LWZvci11bml0LXRlc3Rz";

beforeEach(() => {
  initTestDb();
  setMasterKey(TEST_MASTER_KEY);
  for (const key of KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(async () => {
  await closeExternalMcpPools();
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("external MCP persistence", () => {
  it("saves, lists, replaces and deletes servers", async () => {
    expect(await loadExternalMcpServers("1")).toEqual([]);
    await saveExternalMcpServer("1", stdio);
    await saveExternalMcpServer("1", http);
    expect((await loadExternalMcpServers("1")).map((s) => s.id)).toEqual([
      "blender",
      "hf"
    ]);
    await saveExternalMcpServer("1", { ...stdio, name: "Blender 4" });
    const listed = await loadExternalMcpServers("1");
    expect(listed).toHaveLength(2);
    expect(listed.find((s) => s.id === "blender")?.name).toBe("Blender 4");
    // Another user sees nothing.
    expect(await loadExternalMcpServers("2")).toEqual([]);
    expect(await deleteExternalMcpServer("1", "blender")).toBe(true);
    expect(await deleteExternalMcpServer("1", "blender")).toBe(false);
    expect((await loadExternalMcpServers("1")).map((s) => s.id)).toEqual([
      "hf"
    ]);
  });

  it("moves a literal header into an encrypted secret and stores the reference", async () => {
    await saveExternalMcpServer("1", {
      ...http,
      transport: {
        type: "http",
        url: http.transport.type === "http" ? http.transport.url : "",
        headers: { Authorization: "Bearer literal-token", "X-Ref": "${HF_TOKEN}" }
      }
    });
    const [stored] = await loadExternalMcpServers("1");
    expect(stored.transport.type === "http" && stored.transport.headers).toEqual({
      Authorization: "${MCP_HF_0041007500740068006F00720069007A006100740069006F006E}",
      "X-Ref": "${HF_TOKEN}"
    });
    const row = await Secret.find("1", "MCP_HF_0041007500740068006F00720069007A006100740069006F006E");
    expect(await row?.getDecryptedValue()).toBe("Bearer literal-token");
    // The plaintext row never held the token.
    const setting = await Setting.find("1", EXTERNAL_MCP_SETTING_KEY);
    expect(setting?.getValue()).not.toContain("literal-token");
    // Deleting the server removes the secret it owns.
    await deleteExternalMcpServer("1", "hf");
    expect(await Secret.find("1", "MCP_HF_0041007500740068006F00720069007A006100740069006F006E")).toBeNull();
  });

  it("encrypts a value that mixes a literal with a reference, and drops an orphaned secret", async () => {
    const withHeaders = (headers: Record<string, string>): McpServerConfig => ({
      ...http,
      transport: { type: "http", url: "https://huggingface.co/mcp", headers }
    });
    await saveExternalMcpServer("1", withHeaders({ X: "tok-${SUFFIX}" }));
    const [first] = await loadExternalMcpServers("1");
    const name = "MCP_HF_0058";
    expect(first.transport.type === "http" && first.transport.headers.X).toBe(
      `\${${name}}`
    );
    expect(await (await Secret.find("1", name))?.getDecryptedValue()).toBe(
      "tok-${SUFFIX}"
    );
    // A reference kept beside another still owns the secret.
    await saveExternalMcpServer("1", withHeaders({ X: `\${${name}}\${OTHER}` }));
    expect(await Secret.find("1", name)).not.toBeNull();
    // Replacing the owned reference with another reference removes the secret.
    await saveExternalMcpServer("1", withHeaders({ X: "${OTHER}" }));
    expect(await Secret.find("1", name)).toBeNull();
  });

  it("refuses a private URL under the cloud profile", async () => {
    process.env.NODETOOL_NODE_PROFILE = "cloud";
    await expect(
      saveExternalMcpServer("1", {
        ...http,
        transport: { type: "http", url: "http://127.0.0.1:8000/mcp", headers: {} }
      })
    ).rejects.toThrow(/unsafe URL/);
  });

  it("drops a malformed row instead of throwing", async () => {
    await Setting.upsert({
      userId: "1",
      key: EXTERNAL_MCP_SETTING_KEY,
      value: "not json",
      description: ""
    });
    expect(await loadExternalMcpServers("1")).toEqual([]);
    await Setting.upsert({
      userId: "1",
      key: EXTERNAL_MCP_SETTING_KEY,
      value: JSON.stringify([{ id: "BAD ID" }]),
      description: ""
    });
    expect(await loadExternalMcpServers("1")).toEqual([]);
  });

  it("refuses stdio servers under the cloud profile", async () => {
    process.env.NODETOOL_NODE_PROFILE = "cloud";
    expect(isLocalMcpProfile()).toBe(false);
    await expect(saveExternalMcpServer("1", stdio)).rejects.toThrow(
      STDIO_MCP_DISABLED_ERROR
    );
    const probe = await probeExternalMcpServer("1", stdio);
    expect(probe).toEqual({
      id: "blender",
      ok: false,
      tools: [],
      error: STDIO_MCP_DISABLED_ERROR
    });
    // HTTP servers are still saved.
    await saveExternalMcpServer("1", http);
    expect((await loadExternalMcpServers("1")).map((s) => s.id)).toEqual([
      "hf"
    ]);
  });

  it("reports a server that cannot be reached", async () => {
    const probe = await probeExternalMcpServer("1", {
      ...stdio,
      transport: {
        type: "stdio",
        command: process.execPath,
        args: ["-e", "process.exit(3)"],
        env: {}
      }
    });
    expect(probe.ok).toBe(false);
    expect(probe.tools).toEqual([]);
    expect(probe.error).toBeTruthy();
  });
});
