/**
 * Tests for WebSocket Phase 2 endpoints: T-WS-8, T-WS-9, T-WS-11, T-WS-18.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  MemoryAdapterFactory,
  setGlobalAdapterResolver,
  Job,
} from "@nodetool/models";
import { handleApiRequest } from "../src/http-api.js";
import { handleFileRequest, type FileApiOptions } from "../src/file-api.js";
import { handleStorageRequest, createStorageHandler } from "../src/storage-api.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

async function jsonBody(response: Response): Promise<unknown> {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

// ── T-WS-8 — Username validation ────────────────────────────────────

describe("T-WS-8: Username validation", () => {
  it("GET /api/users/validate_username?username=foo returns valid+available", async () => {
    const res = await handleApiRequest(
      new Request("http://localhost/api/users/validate_username?username=gooduser123")
    );
    expect(res.status).toBe(200);
    const body = (await jsonBody(res)) as { valid: boolean; available: boolean };
    expect(typeof body.valid).toBe("boolean");
    expect(typeof body.available).toBe("boolean");
    expect(body.valid).toBe(true);
    expect(body.available).toBe(true);
  });

  it("GET /api/users/validate_username without username returns 400", async () => {
    const res = await handleApiRequest(
      new Request("http://localhost/api/users/validate_username")
    );
    expect(res.status).toBe(400);
  });

  it("GET /api/users/validate_username with empty username returns invalid", async () => {
    const res = await handleApiRequest(
      new Request("http://localhost/api/users/validate_username?username=")
    );
    expect(res.status).toBe(400);
  });

  it("GET /api/users/validate_username with short username returns invalid", async () => {
    const res = await handleApiRequest(
      new Request("http://localhost/api/users/validate_username?username=ab")
    );
    expect(res.status).toBe(200);
    const body = (await jsonBody(res)) as { valid: boolean; available: boolean };
    expect(body.valid).toBe(false);
  });

  it("GET /api/users/validate_username with special chars returns invalid", async () => {
    const res = await handleApiRequest(
      new Request("http://localhost/api/users/validate_username?username=bad%20user!")
    );
    expect(res.status).toBe(200);
    const body = (await jsonBody(res)) as { valid: boolean; available: boolean };
    expect(body.valid).toBe(false);
  });
});

// ── T-WS-9 — File browser API ───────────────────────────────────────

describe("T-WS-9: File browser API", () => {
  let tmpDir: string;
  let fileOpts: FileApiOptions;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ws-file-test-"));
    fileOpts = { rootDir: tmpDir };
    // Create test structure
    await fs.mkdir(path.join(tmpDir, "subdir"));
    await fs.writeFile(path.join(tmpDir, "hello.txt"), "hello world");
    await fs.writeFile(path.join(tmpDir, "subdir", "nested.txt"), "nested content");
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("GET /api/files/list?path=/ lists root directory", async () => {
    const res = await handleFileRequest(
      new Request("http://localhost/api/files/list?path=/"),
      fileOpts
    );
    expect(res.status).toBe(200);
    const body = (await jsonBody(res)) as Array<{ name: string; is_dir: boolean }>;
    const names = body.map((f) => f.name);
    expect(names).toContain("hello.txt");
    expect(names).toContain("subdir");
    const subdir = body.find((f) => f.name === "subdir");
    expect(subdir?.is_dir).toBe(true);
    const file = body.find((f) => f.name === "hello.txt");
    expect(file?.is_dir).toBe(false);
  });

  it("GET /api/files/list?path=/subdir lists subdirectory", async () => {
    const res = await handleFileRequest(
      new Request("http://localhost/api/files/list?path=/subdir"),
      fileOpts
    );
    expect(res.status).toBe(200);
    const body = (await jsonBody(res)) as Array<{ name: string }>;
    expect(body.length).toBe(1);
    expect(body[0].name).toBe("nested.txt");
  });

  it("GET /api/files/info?path=/hello.txt returns file metadata", async () => {
    const res = await handleFileRequest(
      new Request("http://localhost/api/files/info?path=/hello.txt"),
      fileOpts
    );
    expect(res.status).toBe(200);
    const body = (await jsonBody(res)) as {
      name: string;
      size: number;
      is_dir: boolean;
      modified_at: string;
    };
    expect(body.name).toBe("hello.txt");
    expect(body.size).toBe(11); // "hello world"
    expect(body.is_dir).toBe(false);
    expect(typeof body.modified_at).toBe("string");
  });

  it("GET /api/files/info?path=/subdir returns directory metadata", async () => {
    const res = await handleFileRequest(
      new Request("http://localhost/api/files/info?path=/subdir"),
      fileOpts
    );
    expect(res.status).toBe(200);
    const body = (await jsonBody(res)) as { name: string; is_dir: boolean };
    expect(body.name).toBe("subdir");
    expect(body.is_dir).toBe(true);
  });

  it("GET /api/files/download?path=/hello.txt returns file content", async () => {
    const res = await handleFileRequest(
      new Request("http://localhost/api/files/download?path=/hello.txt"),
      fileOpts
    );
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe("hello world");
  });

  it("GET /api/files/list with path traversal returns 403", async () => {
    const res = await handleFileRequest(
      new Request("http://localhost/api/files/list?path=/../../../etc"),
      fileOpts
    );
    expect(res.status).toBe(403);
  });

  it("GET /api/files/info with path traversal returns 403", async () => {
    const res = await handleFileRequest(
      new Request("http://localhost/api/files/info?path=/../../etc/passwd"),
      fileOpts
    );
    expect(res.status).toBe(403);
  });

  it("GET /api/files/download with path traversal returns 403", async () => {
    const res = await handleFileRequest(
      new Request("http://localhost/api/files/download?path=/../../../etc/passwd"),
      fileOpts
    );
    expect(res.status).toBe(403);
  });

  it("GET /api/files/info for nonexistent file returns 404", async () => {
    const res = await handleFileRequest(
      new Request("http://localhost/api/files/info?path=/nope.txt"),
      fileOpts
    );
    expect(res.status).toBe(404);
  });

  it("GET /api/files/list without path param returns 400", async () => {
    const res = await handleFileRequest(
      new Request("http://localhost/api/files/list"),
      fileOpts
    );
    expect(res.status).toBe(400);
  });
});

// ── T-WS-11 — Storage file API ──────────────────────────────────────

describe("T-WS-11: Storage KV API", () => {
  let handler: (request: Request) => Promise<Response>;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ws-storage-test-"));
    handler = createStorageHandler({ storagePath: tmpDir, tempStoragePath: path.join(tmpDir, "temp") });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("PUT /api/storage/{key} stores a value", async () => {
    const res = await handler(
      new Request("http://localhost/api/storage/mykey.txt", {
        method: "PUT",
        body: "hello world",
      })
    );
    expect(res.status).toBe(200);
  });

  it("GET /api/storage/{key} retrieves a stored value", async () => {
    // Store first
    await handler(
      new Request("http://localhost/api/storage/mykey.txt", {
        method: "PUT",
        body: "hello world",
      })
    );

    const res = await handler(
      new Request("http://localhost/api/storage/mykey.txt")
    );
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe("hello world");
  });

  it("GET /api/storage/{key} returns 404 for missing key", async () => {
    const res = await handler(
      new Request("http://localhost/api/storage/nope.txt")
    );
    expect(res.status).toBe(404);
  });

  it("DELETE /api/storage/{key} removes a key", async () => {
    // Store first
    await handler(
      new Request("http://localhost/api/storage/mykey.txt", {
        method: "PUT",
        body: "hello",
      })
    );

    const delRes = await handler(
      new Request("http://localhost/api/storage/mykey.txt", { method: "DELETE" })
    );
    expect(delRes.status).toBe(200);

    // Verify gone
    const getRes = await handler(
      new Request("http://localhost/api/storage/mykey.txt")
    );
    expect(getRes.status).toBe(404);
  });

  it("DELETE /api/storage/{key} returns 404 for missing key", async () => {
    const res = await handler(
      new Request("http://localhost/api/storage/nope.txt", { method: "DELETE" })
    );
    expect(res.status).toBe(404);
  });

  it("PUT /api/storage with empty key returns 400", async () => {
    const res = await handler(
      new Request("http://localhost/api/storage/", {
        method: "PUT",
        body: "data",
      })
    );
    expect(res.status).toBe(400);
  });
});

// ── T-WS-18 — Job persistence in WebSocket runner ───────────────────

describe("T-WS-18: Job persistence in unified-websocket-runner", () => {
  beforeEach(async () => {
    const factory = new MemoryAdapterFactory();
    setGlobalAdapterResolver((schema) => factory.getAdapter(schema));
    await Job.createTable();
  });

  it("Job record exists with status completed after successful run_job", async () => {
    const { UnifiedWebSocketRunner } = await import("../src/unified-websocket-runner.js");

    const runner = new UnifiedWebSocketRunner({
      resolveExecutor: () => ({
        process: async () => ({ output: "done" }),
      }),
    });

    const messages: Record<string, unknown>[] = [];
    runner.sendMessage = async (msg: Record<string, unknown>) => {
      messages.push(msg);
    };
    runner.userId = "u1";

    const jobId = "test-job-success";
    await runner.runJob({
      job_id: jobId,
      graph: {
        nodes: [{ id: "n1", type: "test.Node" }],
        edges: [],
      },
    });

    // Wait for the stream task to finish
    const active = (runner as unknown as { activeJobs: Map<string, { streamTask?: Promise<void> }> }).activeJobs;
    // The job may already be removed from activeJobs if streamTask completed synchronously,
    // so we wait a bit for the async streaming to finish
    await new Promise((resolve) => setTimeout(resolve, 200));

    const job = (await Job.get(jobId)) as Job | null;
    expect(job).not.toBeNull();
    expect(job!.status).toBe("completed");
    expect(job!.finished_at).not.toBeNull();
  });

  it("Job record exists with status failed after failed run_job", async () => {
    const { UnifiedWebSocketRunner } = await import("../src/unified-websocket-runner.js");

    const runner = new UnifiedWebSocketRunner({
      resolveExecutor: () => ({
        process: async () => ({ output: "ok" }),
        initialize: async () => {
          throw new Error("init boom");
        },
      }),
    });

    const messages: Record<string, unknown>[] = [];
    runner.sendMessage = async (msg: Record<string, unknown>) => {
      messages.push(msg);
    };
    runner.userId = "u1";

    const jobId = "test-job-failure";
    await runner.runJob({
      job_id: jobId,
      graph: {
        nodes: [{ id: "n1", type: "test.Node" }],
        edges: [],
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 200));

    const job = (await Job.get(jobId)) as Job | null;
    expect(job).not.toBeNull();
    expect(job!.status).toBe("failed");
    expect(job!.error).toBeTruthy();
    expect(job!.finished_at).not.toBeNull();
  });
});
