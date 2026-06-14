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
          nd("write", "lib.os.WriteTextFile", {
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
          nd("read", "lib.os.ReadTextFile", {
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

  it("WriteTextFile with append mode", async () => {
    const r1 = makeRunner(registry);
    await r1.run(
      { job_id: "write-5a", params: { ws: tmpDir } },
      {
        nodes: [
          inp("ws", "ws"),
          nd("write", "lib.os.WriteTextFile", {
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
          nd("write", "lib.os.WriteTextFile", {
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
          nd("read", "lib.os.ReadTextFile", {
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
