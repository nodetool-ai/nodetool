import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";

it("answers an MCP initialize request over stdio", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nodetool-mcp-stdio-"));
  const entry = resolve("src/nodetool.ts");
  try {
    const response = await new Promise<Record<string, unknown>>((resolvePromise, rejectPromise) => {
      const child = spawn(
        process.execPath,
        ["--import", import.meta.resolve("tsx"), entry, "serve"],
        {
          cwd: directory,
          stdio: ["pipe", "pipe", "pipe"],
          env: {
            PATH: process.env["PATH"] ?? "",
            ...(process.env["SystemRoot"] ? { SystemRoot: process.env["SystemRoot"] } : {}),
            ...(process.env["WINDIR"] ? { WINDIR: process.env["WINDIR"] } : {}),
            HOME: directory,
            USERPROFILE: directory,
            APPDATA: join(directory, "appdata"),
            LOCALAPPDATA: join(directory, "localappdata"),
            XDG_CONFIG_HOME: join(directory, "config"),
            XDG_CACHE_HOME: join(directory, "cache"),
            XDG_DATA_HOME: directory,
            ASSET_FOLDER: join(directory, "assets"),
            NODETOOL_WORKSPACES_DIR: join(directory, "workspaces"),
            DB_PATH: join(directory, "test.sqlite3"),
            DATABASE_URL: "",
            SECRETS_MASTER_KEY: "0".repeat(64),
            NODETOOL_LOG_LEVEL: "error",
            NODETOOL_API_URL: "http://127.0.0.1:1"
          }
        }
      );
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        rejectPromise(new Error(`MCP stdio initialize timed out.\nstderr: ${stderr}\nstdout: ${stdout}`));
      }, 60_000);
      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
        const newline = stdout.indexOf("\n");
        if (newline === -1) { return; }
        const line = stdout.slice(0, newline).trim();
        if (!line) { return; }
        clearTimeout(timer);
        child.kill("SIGTERM");
        try {
          resolvePromise(JSON.parse(line) as Record<string, unknown>);
        } catch (error) {
          rejectPromise(error);
        }
      });
      child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
      child.on("error", (error) => { clearTimeout(timer); rejectPromise(error); });
      child.on("exit", (code) => {
        clearTimeout(timer);
        if (!stdout.includes("\n")) {
          rejectPromise(new Error(`MCP server exited (${String(code)}) before answering initialize.\nstderr: ${stderr}`));
        }
      });
      child.stdin.write(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "smoke-test", version: "1.0.0" }
          }
        }) + "\n"
      );
    });
    expect(response["jsonrpc"]).toBe("2.0");
    expect(response["id"]).toBe(1);
    expect(response["result"]).toEqual(
      expect.objectContaining({
        serverInfo: expect.objectContaining({ name: expect.any(String) })
      })
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 90_000);
