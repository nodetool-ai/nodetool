/**
 * IO- and CPU-bound task spans, read back from the JSONL sink of a real
 * OTel SDK: outbound fetch, workspace IO, a subprocess and a PNG encode.
 */

import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";
import { initTelemetry, _resetTelemetryForTest } from "../src/telemetry.js";
import { withSpan, withTaskSpan } from "../src/tracing-helpers.js";
import { runHostBinary } from "../src/host-binaries.js";
import { StorageWorkspace } from "../src/storage-workspace.js";
import { encodeRawRgbaToPng } from "../src/image-codec.js";
import type { TraceRecord } from "../src/trace-exporters.js";

const HOOK_TIMEOUT_MS = 30000;
const TRACE_WRITE_TIMEOUT_MS = 3000;

let traceDir: string;
let traceFile: string;
let server: Server;
let serverUrl: string;

async function readRecords(
  ready: (records: TraceRecord[]) => boolean
): Promise<TraceRecord[]> {
  const deadline = Date.now() + TRACE_WRITE_TIMEOUT_MS;
  let records: TraceRecord[] = [];
  while (Date.now() < deadline) {
    const text = await readFile(traceFile, "utf8").catch(() => "");
    records = text
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as TraceRecord);
    if (ready(records)) return records;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return records;
}

function childrenOf(
  records: TraceRecord[],
  parentName: string
): TraceRecord[] {
  const parent = records.find((r) => r.name === parentName);
  expect(parent).toBeDefined();
  return records.filter((r) => r.parent_span_id === parent?.span_id);
}

beforeAll(async () => {
  traceDir = await mkdtemp(join(tmpdir(), "nodetool-task-spans-"));
  traceFile = join(traceDir, "trace.jsonl");
  _resetTelemetryForTest();
  await initTelemetry({ traceFile, silent: true });
  server = createServer((_req, res) => res.end("ok"));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  serverUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
}, HOOK_TIMEOUT_MS);

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(traceDir, { recursive: true, force: true });
  _resetTelemetryForTest();
}, HOOK_TIMEOUT_MS);

describe("task spans", () => {
  it("tags a task span with its kind under the active parent", async () => {
    await withSpan("parent.task", {}, () =>
      withTaskSpan("cpu", "test.cpu", { "nodetool.test": 1 }, async () => 1)
    );
    const records = await readRecords((r) =>
      r.some((x) => x.name === "parent.task")
    );
    const [child] = childrenOf(records, "parent.task");
    expect(child?.name).toBe("test.cpu");
    expect(child?.attributes["nodetool.task.kind"]).toBe("cpu");
    expect(child?.attributes["nodetool.test"]).toBe(1);
  });

  it("records outbound fetch as an HTTP client span", async () => {
    await withSpan("parent.fetch", {}, async () => {
      const response = await fetch(serverUrl);
      await response.text();
    });
    const records = await readRecords((r) =>
      r.some((x) => x.name === "parent.fetch")
    );
    const [http] = childrenOf(records, "parent.fetch");
    expect(http?.kind).toBe("CLIENT");
    expect(http?.attributes["http.request.method"]).toBe("GET");
    expect(http?.attributes["http.response.status_code"]).toBe(200);
  });

  it("records a host binary run with its exit code", async () => {
    await withSpan("parent.subprocess", {}, () =>
      runHostBinary(process.execPath, ["-e", "process.exit(3)"], {
        cwd: traceDir,
        timeoutMs: 10000
      })
    );
    const records = await readRecords((r) =>
      r.some((x) => x.name === "parent.subprocess")
    );
    const [run] = childrenOf(records, "parent.subprocess");
    expect(run?.name).toBe("subprocess.run");
    expect(run?.attributes["nodetool.task.kind"]).toBe("cpu");
    expect(run?.attributes["process.exit_code"]).toBe(3);
    expect(run?.attributes["nodetool.subprocess.queued_ms"]).toBeTypeOf(
      "number"
    );
  });

  it("records workspace reads and writes with their byte counts", async () => {
    const workspace = new StorageWorkspace(new InMemoryStorageAdapter());
    await withSpan("parent.workspace", {}, async () => {
      await workspace.write("notes.txt", "hello");
      await workspace.read("notes.txt");
    });
    const records = await readRecords((r) =>
      r.some((x) => x.name === "parent.workspace")
    );
    const children = childrenOf(records, "parent.workspace");
    const write = children.find((r) => r.name === "workspace.write");
    const read = children.find((r) => r.name === "workspace.read");
    expect(write?.attributes["nodetool.task.kind"]).toBe("io");
    expect(write?.attributes["nodetool.workspace.bytes"]).toBe(5);
    expect(read?.attributes["nodetool.workspace.bytes"]).toBe(5);
  });

  it("records a PNG encode as CPU work", async () => {
    await withSpan("parent.image", {}, () =>
      encodeRawRgbaToPng(new Uint8Array([255, 0, 0, 255]), 1, 1)
    );
    const records = await readRecords((r) =>
      r.some((x) => x.name === "parent.image")
    );
    const [encode] = childrenOf(records, "parent.image");
    expect(encode?.name).toBe("image.encode_png");
    expect(encode?.attributes["nodetool.task.kind"]).toBe("cpu");
  });
});
