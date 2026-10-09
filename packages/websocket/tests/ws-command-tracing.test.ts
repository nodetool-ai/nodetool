/**
 * `/ws` command spans: one per command, rooted in its own trace like an HTTP
 * request span, and skipped for streamed-input frames.
 */

import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  initTelemetry,
  shutdownTelemetry,
  withSpan,
  type TraceRecord
} from "@nodetool-ai/runtime";
import { CommandRouter, type CommandRouterDeps } from "../src/session/commands.js";

let traceDir: string;
let traceFile: string;

async function readRecords(ready: (records: TraceRecord[]) => boolean): Promise<TraceRecord[]> {
  const deadline = Date.now() + 3000;
  let records: TraceRecord[] = [];
  while (Date.now() < deadline) {
    const text = await readFile(traceFile, "utf8").catch(() => "");
    records = text
      .split("\n")
      .slice(0, -1)
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as TraceRecord);
    if (ready(records)) return records;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return records;
}

function router(): CommandRouter {
  // SAFETY: the commands driven here read only the session's app scope, the
  // host's `clearModels` and the job region's lookups.
  return new CommandRouter({
    session: { appSession: null },
    host: { clearModels: async () => ({ message: "cleared" }) },
    jobs: { resolveJobControl: () => null, activeJobIds: () => [] }
  } as unknown as CommandRouterDeps);
}

beforeAll(async () => {
  traceDir = await mkdtemp(join(tmpdir(), "nodetool-ws-command-tracing-"));
  traceFile = join(traceDir, "trace.jsonl");
  await initTelemetry({ traceFile, silent: true });
}, 30000);

afterAll(async () => {
  await shutdownTelemetry();
  await rm(traceDir, { recursive: true, force: true });
}, 30000);

describe("ws.command spans", () => {
  it("opens a root span per command named by its method", async () => {
    // An unrelated active span must not adopt the command.
    const reply = await withSpan("tool.call", {}, () => router().handle("clear_models", {}));
    expect(reply).toEqual({ message: "cleared" });

    const records = await readRecords((r) => r.some((x) => x.name === "ws.command"));
    const command = records.find((r) => r.name === "ws.command");
    const outer = records.find((r) => r.name === "tool.call");
    expect(command?.attributes).toMatchObject({ "rpc.system": "websocket", "rpc.method": "clear_models" });
    expect(command?.status.code).toBe("OK");
    expect(command?.parent_span_id).toBeNull();
    expect(command?.trace_id).not.toBe(outer?.trace_id);
  });

  it("skips streamed-input frames and unknown commands", async () => {
    const before = (await readRecords(() => true)).filter((r) => r.name === "ws.command").length;
    await router().handle("stream_input", { job_id: "job-1" });
    await router().handle("no_such_command", {});
    await withSpan("script.run", {}, async () => undefined);
    const records = await readRecords((r) => r.some((x) => x.name === "script.run"));
    expect(records.filter((r) => r.name === "ws.command")).toHaveLength(before);
  });
});
