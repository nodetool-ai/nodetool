import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { makeRegistry, makeRunner, nd, de, inp } from "./helpers.js";

let tmpDir: string;
let registry: ReturnType<typeof makeRegistry>;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "nodetool-ws-e2e-"));
  registry = makeRegistry();
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("workspace e2e", () => {
  it("WriteTextFile then ReadTextFile round-trip", async () => {
    // Write
    const r1 = makeRunner(registry);
    const writeResult = await r1.run(
      { job_id: "write-1", params: { ws: tmpDir } },
      {
        nodes: [
          inp("ws", "ws"),
          nd("write", "nodetool.workspace.WriteTextFile", {
            name: "out",
            properties: { path: "hello.txt", content: "Hello E2E!" }
          })
        ],
        edges: [de("ws", "output", "write", "workspace_dir")]
      }
    );
    expect(writeResult.status).toBe("completed");
    expect(writeResult.outputs.out).toContain("hello.txt");

    // Read
    const r2 = makeRunner(registry);
    const readResult = await r2.run(
      { job_id: "read-1", params: { ws: tmpDir } },
      {
        nodes: [
          inp("ws", "ws"),
          nd("read", "nodetool.workspace.ReadTextFile", {
            name: "out",
            properties: { path: "hello.txt" }
          })
        ],
        edges: [de("ws", "output", "read", "workspace_dir")]
      }
    );
    expect(readResult.status).toBe("completed");
    expect(readResult.outputs.out).toContain("Hello E2E!");
  });

  it("WorkspaceFileExists returns true after write, false for missing", async () => {
    // Write a file first
    const r1 = makeRunner(registry);
    await r1.run(
      { job_id: "write-2", params: { ws: tmpDir } },
      {
        nodes: [
          inp("ws", "ws"),
          nd("write", "nodetool.workspace.WriteTextFile", {
            properties: { path: "exists.txt", content: "data" }
          })
        ],
        edges: [de("ws", "output", "write", "workspace_dir")]
      }
    );

    // Check existing file
    const r2 = makeRunner(registry);
    const existsResult = await r2.run(
      { job_id: "exists-1", params: { ws: tmpDir } },
      {
        nodes: [
          inp("ws", "ws"),
          nd("check", "nodetool.workspace.WorkspaceFileExists", {
            name: "out",
            properties: { path: "exists.txt" }
          })
        ],
        edges: [de("ws", "output", "check", "workspace_dir")]
      }
    );
    expect(existsResult.status).toBe("completed");
    expect(existsResult.outputs.out).toContain(true);

    // Check non-existent file
    const r3 = makeRunner(registry);
    const missingResult = await r3.run(
      { job_id: "exists-2", params: { ws: tmpDir } },
      {
        nodes: [
          inp("ws", "ws"),
          nd("check", "nodetool.workspace.WorkspaceFileExists", {
            name: "out",
            properties: { path: "nope.txt" }
          })
        ],
        edges: [de("ws", "output", "check", "workspace_dir")]
      }
    );
    expect(missingResult.status).toBe("completed");
    expect(missingResult.outputs.out).toContain(false);
  });

  it("DeleteWorkspaceFile removes a file", async () => {
    // Write
    const r1 = makeRunner(registry);
    await r1.run(
      { job_id: "write-3", params: { ws: tmpDir } },
      {
        nodes: [
          inp("ws", "ws"),
          nd("write", "nodetool.workspace.WriteTextFile", {
            properties: { path: "doomed.txt", content: "bye" }
          })
        ],
        edges: [de("ws", "output", "write", "workspace_dir")]
      }
    );

    // Delete
    const r2 = makeRunner(registry);
    const delResult = await r2.run(
      { job_id: "del-1", params: { ws: tmpDir } },
      {
        nodes: [
          inp("ws", "ws"),
          nd("del", "nodetool.workspace.DeleteWorkspaceFile", {
            name: "out",
            properties: { path: "doomed.txt" }
          })
        ],
        edges: [de("ws", "output", "del", "workspace_dir")]
      }
    );
    expect(delResult.status).toBe("completed");

    // Verify gone - read should fail
    const r3 = makeRunner(registry);
    const readResult = await r3.run(
      { job_id: "read-3", params: { ws: tmpDir } },
      {
        nodes: [
          inp("ws", "ws"),
          nd("read", "nodetool.workspace.ReadTextFile", {
            name: "out",
            properties: { path: "doomed.txt" }
          })
        ],
        edges: [de("ws", "output", "read", "workspace_dir")]
      }
    );
    // Node errors are caught by the actor; overall run still "completes"
    expect(readResult.status).toBe("completed");
    expect(readResult.outputs.out).toEqual([]);
  });

  it("CreateWorkspaceDirectory creates a directory", async () => {
    const r1 = makeRunner(registry);
    const mkdirResult = await r1.run(
      { job_id: "mkdir-1", params: { ws: tmpDir } },
      {
        nodes: [
          inp("ws", "ws"),
          nd("mkdir", "nodetool.workspace.CreateWorkspaceDirectory", {
            name: "out",
            properties: { path: "subdir" }
          })
        ],
        edges: [de("ws", "output", "mkdir", "workspace_dir")]
      }
    );
    expect(mkdirResult.status).toBe("completed");
    expect(mkdirResult.outputs.out).toContain("subdir");

    // Verify exists
    const r2 = makeRunner(registry);
    const existsResult = await r2.run(
      { job_id: "exists-3", params: { ws: tmpDir } },
      {
        nodes: [
          inp("ws", "ws"),
          nd("check", "nodetool.workspace.WorkspaceFileExists", {
            name: "out",
            properties: { path: "subdir" }
          })
        ],
        edges: [de("ws", "output", "check", "workspace_dir")]
      }
    );
    expect(existsResult.status).toBe("completed");
    expect(existsResult.outputs.out).toContain(true);
  });

  it("GetWorkspaceFileInfo returns file metadata", async () => {
    // Write a file
    const r1 = makeRunner(registry);
    await r1.run(
      { job_id: "write-4", params: { ws: tmpDir } },
      {
        nodes: [
          inp("ws", "ws"),
          nd("write", "nodetool.workspace.WriteTextFile", {
            properties: { path: "info.txt", content: "some content here" }
          })
        ],
        edges: [de("ws", "output", "write", "workspace_dir")]
      }
    );

    // Get file info
    const r2 = makeRunner(registry);
    const infoResult = await r2.run(
      { job_id: "info-1", params: { ws: tmpDir } },
      {
        nodes: [
          inp("ws", "ws"),
          nd("info", "nodetool.workspace.GetWorkspaceFileInfo", {
            name: "out",
            properties: { path: "info.txt" }
          })
        ],
        edges: [de("ws", "output", "info", "workspace_dir")]
      }
    );
    expect(infoResult.status).toBe("completed");
    const meta = infoResult.outputs.out[0] as Record<string, unknown>;
    expect(meta.name).toBe("info.txt");
    expect(meta.is_file).toBe(true);
    expect(meta.is_directory).toBe(false);
    expect(meta.size).toBeGreaterThan(0);
  });

  it("GetWorkspaceDir returns the workspace directory", async () => {
    const r = makeRunner(registry);
    const result = await r.run(
      { job_id: "getdir-1", params: { ws: tmpDir } },
      {
        nodes: [
          inp("ws", "ws"),
          nd("dir", "nodetool.workspace.GetWorkspaceDir", { name: "out" })
        ],
        edges: [de("ws", "output", "dir", "workspace_dir")]
      }
    );
    expect(result.status).toBe("completed");
    expect(result.outputs.out).toContain(tmpDir);
  });

  it("WriteTextFile with append mode", async () => {
    const r1 = makeRunner(registry);
    await r1.run(
      { job_id: "write-5a", params: { ws: tmpDir } },
      {
        nodes: [
          inp("ws", "ws"),
          nd("write", "nodetool.workspace.WriteTextFile", {
            properties: { path: "append.txt", content: "first" }
          })
        ],
        edges: [de("ws", "output", "write", "workspace_dir")]
      }
    );

    // Append
    const r2 = makeRunner(registry);
    await r2.run(
      { job_id: "write-5b", params: { ws: tmpDir } },
      {
        nodes: [
          inp("ws", "ws"),
          nd("write", "nodetool.workspace.WriteTextFile", {
            properties: { path: "append.txt", content: " second", append: true }
          })
        ],
        edges: [de("ws", "output", "write", "workspace_dir")]
      }
    );

    // Read
    const r3 = makeRunner(registry);
    const readResult = await r3.run(
      { job_id: "read-5", params: { ws: tmpDir } },
      {
        nodes: [
          inp("ws", "ws"),
          nd("read", "nodetool.workspace.ReadTextFile", {
            name: "out",
            properties: { path: "append.txt" }
          })
        ],
        edges: [de("ws", "output", "read", "workspace_dir")]
      }
    );
    expect(readResult.status).toBe("completed");
    expect(readResult.outputs.out).toContain("first second");
  });
});
