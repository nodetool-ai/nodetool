import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import { TRPCClientError } from "@trpc/client";
import type { RunUpdatesResult } from "@nodetool-ai/protocol";
import { registerRunsCommands } from "../src/commands/runs.js";

const readers = vi.hoisted(() => ({ list: vi.fn(), get: vi.fn(), trace: vi.fn(), logs: vi.fn(), updates: vi.fn(), remoteGet: vi.fn(), remoteUpdates: vi.fn(), ensureDb: vi.fn() }));
vi.mock("@nodetool-ai/execution", () => ({ listRuns: readers.list, getRun: readers.get, getRunTrace: readers.trace, getRunLogs: readers.logs, readRunUpdates: readers.updates }));
vi.mock("@nodetool-ai/protocol", async () => ({ ...await import("../../protocol/src/run-readers.js"), ...await import("../../protocol/src/run-trace.js") }));
vi.mock("../src/api-client.js", () => ({ createApiClient: () => ({ runs: { get: { query: readers.remoteGet }, updates: { query: readers.remoteUpdates } } }) }));

const run = { id: "a".repeat(32), user_id: "1", kind: "workflow" as const, source_id: "job", parent_run_id: null,
  trace_id: "b".repeat(32), root_span_id: "c".repeat(16), origin: "cli" as const, status: "running" as const,
  started_at: "2026-01-01T00:00:00.000Z", ended_at: null, cost_usd: null, error: null,
  content_expired: 0, truncated: 0, incomplete: 0, parents: [], parents_limited: false };
function page(cursor: number, status: "running" | "completed", events = ["e1"], hasMore = false): RunUpdatesResult {
  return { run: { ...run, status }, cursor, has_more: hasMore, resnapshot_required: true, limited: hasMore, trace_settled: true,
    content_state: "available", content_expired: false, truncated: false, incomplete: false,
    records: cursor ? [{ kind: "span_ended", run_id: run.id, cursor, content_expired: false, truncated: false, incomplete: false,
      record: { trace_id: run.trace_id, span_id: "c".repeat(16), parent_span_id: null, name: "workflow.run", kind: "INTERNAL",
        start_time_ms: 1, end_time_ms: 5, duration_ms: 4, status: { code: "OK" }, attributes: {}, resource: {},
        events: events.map((id, index) => ({ id, name: "log", time_ms: index, attributes: { level: "info" } })) } }] : [] };
}
let output: string[]; let errors: string[];
let savedExitCode: typeof process.exitCode;
let savedApiUrl: string | undefined;
beforeEach(() => {
  vi.resetAllMocks(); output = []; errors = []; savedExitCode = process.exitCode; process.exitCode = undefined;
  savedApiUrl = process.env["NODETOOL_API_URL"]; delete process.env["NODETOOL_API_URL"];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => { output.push(args.map(String).join(" ")); });
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => { errors.push(args.map(String).join(" ")); });
});
afterEach(() => { vi.restoreAllMocks(); process.exitCode = savedExitCode; if (savedApiUrl === undefined) { delete process.env["NODETOOL_API_URL"]; } else { process.env["NODETOOL_API_URL"] = savedApiUrl; } });
async function invoke(args: string[]): Promise<void> {
  const program = new Command(); program.exitOverride();
  registerRunsCommands(program, { ensureDb: readers.ensureDb, localUserId: "1" });
  await program.parseAsync(["node", "nodetool", "runs", ...args]);
}

describe("runs CLI options and output", () => {
  it("waits for asynchronous local database setup before reading", async () => {
    let finishSetup: () => void = () => { throw new Error("Setup has not started"); };
    readers.ensureDb.mockImplementation(() => new Promise<void>((resolve) => { finishSetup = resolve; }));
    readers.list.mockResolvedValue({ runs: [], next_cursor: null });
    const pending = invoke(["list", "--json"]);
    await vi.waitFor(() => { expect(readers.ensureDb).toHaveBeenCalled(); });
    expect(readers.list).not.toHaveBeenCalled();
    finishSetup(); await pending;
    expect(readers.list).toHaveBeenCalledWith("1", { limit: 20 });
  });
  it("forwards documented list filters and owner to the shared reader", async () => {
    readers.list.mockResolvedValue({ runs: [run], next_cursor: "next" });
    await invoke(["list", "--kind", "workflow", "--app-id", "app", "--instance-id", "instance", "--workflow-id", "wf",
      "--thread-id", "thread", "--status", "failed", "--origin", "debug", "--since", run.started_at, "--until", "2027-01-01T00:00:00Z", "--limit", "7", "--cursor", "before", "--json"]);
    expect(readers.list).toHaveBeenCalledWith("1", { kind: "workflow", app_id: "app", instance_id: "instance", workflow_id: "wf",
      thread_id: "thread", status: "failed", origin: "debug", since: run.started_at, until: "2027-01-01T00:00:00Z", limit: 7, cursor: "before" });
    expect(JSON.parse(output.join("\n"))).toEqual({ runs: [run], next_cursor: "next" });
  });
  it("passes exact resource prefixes and full focus span IDs without shortening them", async () => {
    readers.get.mockResolvedValue({ run, summary: { first_failed_span_id: "d".repeat(16) } });
    await invoke(["show", run.id.slice(0, 12), "--json"]);
    expect(readers.get).toHaveBeenCalledWith("1", run.id.slice(0, 12), { include_content: false });
    expect(JSON.parse(output[0]!).summary.first_failed_span_id).toBe("d".repeat(16));
    readers.trace.mockResolvedValue({ nodes: [] });
    await invoke(["trace", run.id, "--focus", "d".repeat(16), "--depth", "0", "--errors-only", "--name", "tool.call", "--limit", "9", "--include-content", "--json"]);
    expect(readers.trace).toHaveBeenCalledWith("1", run.id, { focus_span_id: "d".repeat(16), depth: 0, errors_only: true, name: "tool.call", limit: 9, include_content: true });
  });
  it("requires an explicit content opt-in for local and remote show reads", async () => {
    const result = { run: { ...run, app: { instance_id: "instance", operation_id: "operation", app_version: 1, application_id: null,
      inputs: { prompt: "fixture" }, outputs: {}, content_limited: false } }, summary: { first_failed_span_id: null } };
    readers.get.mockResolvedValue(result); readers.remoteGet.mockResolvedValue(result);
    await invoke(["show", run.id, "--include-content", "--json"]);
    expect(readers.get).toHaveBeenCalledWith("1", run.id, { include_content: true });
    expect(JSON.parse(output[0]!)).toEqual(result);
    await invoke(["show", run.id, "--api-url", "http://localhost:7777", "--include-content", "--json"]);
    expect(readers.remoteGet).toHaveBeenCalledWith({ id: run.id, include_content: true });
    expect(JSON.parse(output[1]!)).toEqual(result);
  });
  it("forwards bounded log filters and returns one JSON document", async () => {
    readers.logs.mockResolvedValue({ logs: [], next_cursor: "next" });
    await invoke(["logs", run.id, "--level", "warn", "--source", "script", "--span", "d".repeat(16), "--since-ms", "2", "--until-ms", "5", "--cursor", "old", "--limit", "8", "--include-content", "--json"]);
    expect(readers.logs).toHaveBeenCalledWith("1", run.id, { level: "warn", source: "script", span_id: "d".repeat(16), since_ms: 2, until_ms: 5, cursor: "old", limit: 8, include_content: true, newest: false });
    expect(output).toHaveLength(1); expect(JSON.parse(output[0]!)).toEqual({ logs: [], next_cursor: "next" });
  });
  it.each(["3junk", "0", "101", "-2"])("refuses an invalid list limit %s before querying or opening the database", async (limit) => {
    await invoke(["list", "--limit", limit, "--json"]);
    expect(process.exitCode).toBe(1); expect(readers.list).not.toHaveBeenCalled(); expect(readers.ensureDb).not.toHaveBeenCalled();
    expect(JSON.parse(output[0]!)).toHaveProperty("error"); expect(errors.length).toBe(1);
  });
});

describe("runs tail NDJSON", () => {
  it("waits for the root end snapshot after terminal directory settlement", async () => {
    const starting = page(1, "completed", []); starting.records[0]!.kind = "span_started";
    readers.updates.mockResolvedValueOnce({ ...starting, trace_settled: false })
      .mockResolvedValueOnce({ ...page(2, "completed", ["last-event"]), trace_settled: true });
    await invoke(["tail", run.id, "--json", "--poll-interval", "10"]);
    const frames = output.map((line) => JSON.parse(line));
    expect(readers.updates).toHaveBeenCalledTimes(2);
    expect(frames.filter((frame) => frame.type === "event").map((frame) => frame.event.id)).toEqual(["last-event"]);
    expect(frames.at(-1)).toMatchObject({ type: "terminal", cursor: 2 });
  });
  it("reports an unfinished terminal trace after a bounded drain", async () => {
    readers.updates.mockResolvedValue({ ...page(0, "completed", []), trace_settled: false });
    await invoke(["tail", run.id, "--json", "--poll-interval", "10"]);
    const frames = output.map((line) => JSON.parse(line));
    expect(frames.at(-2)).toMatchObject({ type: "gap", cursor: 0, reason: "terminal_trace_incomplete" });
    expect(frames.at(-1)).toMatchObject({ type: "terminal", trace_settled: false });
    expect(readers.updates.mock.calls.length).toBeGreaterThan(1);
  });
  it("drains terminal stored pages immediately and deduplicates replayed events", async () => {
    readers.updates.mockResolvedValueOnce(page(1, "completed", ["e1"], true)).mockResolvedValueOnce(page(2, "completed", ["e1", "e2"]));
    const listeners = process.listenerCount("SIGINT");
    await invoke(["tail", run.id.slice(0, 12), "--json", "--cursor", "0"]);
    const frames = output.map((line) => JSON.parse(line));
    expect(frames.filter((frame) => frame.type === "event").map((frame) => frame.event.id)).toEqual(["e1", "e2"]);
    expect(frames.filter((frame) => frame.type === "span")).toHaveLength(2);
    expect(frames[0]).toMatchObject({ type: "resnapshot", resnapshot_required: true });
    expect(frames.at(-1)).toMatchObject({ type: "terminal", cursor: 2, run: { status: "completed" } });
    expect(readers.updates.mock.calls.map((call) => call[2].cursor)).toEqual([0, 1]);
    expect(process.listenerCount("SIGINT")).toBe(listeners);
  });
  it("reconnects remote reads from the last durable cursor without replaying old events", async () => {
    readers.remoteUpdates.mockResolvedValueOnce(page(1, "running"))
      .mockRejectedValueOnce(new TRPCClientError("connection lost"))
      .mockResolvedValueOnce(page(2, "completed", ["e1", "e2"]));
    await invoke(["tail", run.id, "--json", "--api-url", "http://localhost:7777", "--poll-interval", "10"]);
    const frames = output.map((line) => JSON.parse(line));
    expect(frames.some((frame) => frame.type === "reconnecting" && frame.cursor === 1)).toBe(true);
    expect(frames.filter((frame) => frame.type === "event").map((frame) => frame.event.id)).toEqual(["e1", "e2"]);
    expect(readers.remoteUpdates.mock.calls.map((call) => call[0].cursor)).toEqual([0, 1, 1]);
    expect(readers.ensureDb).not.toHaveBeenCalled();
  });
  it("aborts polling on Ctrl-C and removes its signal listener", async () => {
    readers.updates.mockResolvedValue(page(0, "running"));
    const listeners = process.listenerCount("SIGINT");
    const pending = invoke(["tail", run.id, "--json"]);
    await vi.waitFor(() => { expect(readers.updates).toHaveBeenCalled(); });
    process.emit("SIGINT"); await pending;
    expect(process.exitCode).toBe(130); expect(process.listenerCount("SIGINT")).toBe(listeners);
    expect(JSON.parse(output.at(-1)!)).toMatchObject({ type: "interrupted", cursor: 0 });
  });
  it("cancels an in-flight remote request on Ctrl-C", async () => {
    readers.remoteUpdates.mockImplementation((_input, options: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => { reject(new TRPCClientError("aborted")); }, { once: true });
    }));
    const listeners = process.listenerCount("SIGINT");
    const pending = invoke(["tail", run.id, "--json", "--api-url", "http://localhost:7777"]);
    await vi.waitFor(() => { expect(readers.remoteUpdates).toHaveBeenCalled(); });
    process.emit("SIGINT"); await pending;
    expect(readers.remoteUpdates.mock.calls[0]?.[1].signal.aborted).toBe(true);
    expect(process.exitCode).toBe(130); expect(process.listenerCount("SIGINT")).toBe(listeners);
    expect(JSON.parse(output.at(-1)!)).toMatchObject({ type: "interrupted", cursor: 0 });
  });
});
