/**
 * IO- and CPU-bound task spans, read back from the JSONL sink of a real
 * OTel SDK: outbound fetch, workspace IO, a subprocess and a PNG encode.
 */

import { describe, it, expect, afterAll, beforeAll, beforeEach, vi } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";
import { ProcessingContext } from "../src/context.js";
import { BaseProvider } from "../src/providers/base-provider.js";
import { WebsocketPythonBridge } from "../src/python-websocket-bridge.js";
import { startFakeWorker } from "./python-websocket-bridge.test-helpers.js";
import type { Message, ProviderStreamItem, TextToImageParams } from "../src/providers/types.js";
import { initTelemetry, _resetTelemetryForTest } from "../src/telemetry.js";
import { withSpan, withTaskSpan } from "../src/tracing-helpers.js";
import { runHostBinary } from "../src/host-binaries.js";
import { StorageWorkspace } from "../src/storage-workspace.js";
import { encodeRawRgbaToPng } from "../src/image-codec.js";
import type { TraceRecord } from "../src/trace-exporters.js";

class ImageProvider extends BaseProvider {
  constructor() {
    super("test");
  }
  async generateMessage(): Promise<Message> {
    return { role: "assistant", content: "" };
  }
  async *generateMessages(): AsyncGenerator<ProviderStreamItem> {
    yield* [];
  }
  override async textToImage(_params: TextToImageParams): Promise<Uint8Array> {
    return new Uint8Array([1, 2, 3]);
  }
}

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
    // The sink may be mid-append: parse only the lines its newline has closed.
    records = text
      .slice(0, text.lastIndexOf("\n") + 1)
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

beforeEach(() => {
  // These hierarchy checks inspect custom diagnostic names and attributes.
  vi.stubEnv("NODETOOL_TRACE_INCLUDE_CONTENT", "1");
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(traceDir, { recursive: true, force: true });
  _resetTelemetryForTest();
  vi.unstubAllEnvs();
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

  it("records asset storage IO through the run context", async () => {
    const adapter = new InMemoryStorageAdapter();
    const context = new ProcessingContext({ jobId: "job-storage", storage: adapter });
    expect(context.storage).toBe(adapter);
    await withSpan("parent.storage", {}, async () => {
      const uri = await context.storage!.store("a.bin", new Uint8Array(4));
      await context.storage!.retrieve(uri);
      await context.storage!.list("");
    });
    const records = await readRecords((r) =>
      r.some((x) => x.name === "parent.storage")
    );
    const children = childrenOf(records, "parent.storage");
    const store = children.find((r) => r.name === "storage.store");
    const retrieve = children.find((r) => r.name === "storage.retrieve");
    const list = children.find((r) => r.name === "storage.list");
    expect(store?.attributes["nodetool.task.kind"]).toBe("io");
    expect(store?.attributes["nodetool.storage.backend"]).toBe("InMemoryStorageAdapter");
    expect(store?.attributes["nodetool.storage.bytes"]).toBe(4);
    expect(retrieve?.attributes["nodetool.storage.bytes"]).toBe(4);
    expect(list?.attributes["nodetool.storage.entry_count"]).toBe(1);
    // A child context reuses the adapter without tracing it twice.
    expect(context.copy().storage).toBe(context.storage);
  });

  it("records Python worker node runs as RPC spans", async () => {
    const worker = await startFakeWorker(0, { protocolVersion: 4 });
    const bridge = new WebsocketPythonBridge({ wsUrl: `ws://127.0.0.1:${worker.port}` });
    try {
      await bridge.connect();
      await withSpan("parent.python", {}, async () => {
        await bridge.execute("test.Node", {}, {}, {});
        for await (const _ of bridge.executeStream("test.Node", {}, {}, {})) {
          // Drain the stream so its span ends.
        }
      });
    } finally {
      bridge.close();
      await worker.close();
    }
    const records = await readRecords((r) =>
      r.some((x) => x.name === "parent.python")
    );
    const children = childrenOf(records, "parent.python");
    expect(children.find((r) => r.name === "python.execute")?.attributes).toMatchObject({
      "node.type": "test.Node", "rpc.system": "nodetool-python", "rpc.method": "execute"
    });
    expect(children.find((r) => r.name === "python.execute_stream")?.attributes["rpc.method"]).toBe("execute_stream");
  });

  it("records a media provider call without its prompt, even with content filtered", async () => {
    vi.stubEnv("NODETOOL_TRACE_INCLUDE_CONTENT", "");
    await withSpan("parent.provider", {}, () =>
      new ImageProvider().textToImage({ prompt: "a private prompt", model: { id: "img-1", name: "img-1", provider: "test" } })
    );
    const records = await readRecords((r) =>
      r.some((x) => x.span_id === r.find((y) => y.name === "provider.textToImage")?.parent_span_id)
    );
    const call = records.find((r) => r.name === "provider.textToImage");
    expect(call?.attributes).toMatchObject({
      "gen_ai.system": "test",
      "gen_ai.operation.name": "textToImage",
      "gen_ai.request.model": "img-1"
    });
    expect(JSON.stringify(records)).not.toContain("a private prompt");
  });
});
