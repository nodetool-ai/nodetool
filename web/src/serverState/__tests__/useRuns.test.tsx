import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { WebSocketMessage } from "../../lib/websocket/GlobalWebSocketManager";
import { globalWebSocketManager } from "../../lib/websocket/GlobalWebSocketManager";
import { trpcClient } from "../../trpc/client";
import { runKeys, useRunLiveUpdates, useRunLogs, useRuns, useRunTrace } from "../useRuns";
import { makeRecord, makeTrace, makeUpdate } from "../../__fixtures__/runTrace";

jest.mock("../../trpc/client", () => ({
  trpcClient: { runs: {
    list: { query: jest.fn() }, get: { query: jest.fn() },
    trace: { query: jest.fn() }, logs: { query: jest.fn() }
  } }
}));
jest.mock("../../lib/websocket/GlobalWebSocketManager", () => ({
  globalWebSocketManager: { subscribeEvent: jest.fn(), ensureConnection: jest.fn().mockResolvedValue(undefined) }
}));

type Listener = (message: WebSocketMessage) => void;
let listeners: Map<string, Set<Listener>>;
let client: QueryClient;

const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
function emit(event: string, message: WebSocketMessage = { type: "open" }) {
  for (const listener of listeners.get(event) ?? []) { listener(message); }
}

beforeEach(() => {
  jest.clearAllMocks();
  listeners = new Map();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  jest.mocked(globalWebSocketManager.subscribeEvent).mockImplementation((event, handler) => {
    // The mocked manager emits messages and parameterless open/close signals
    // through one test seam. Production signatures remain strongly typed.
    const listener = handler as unknown as Listener;
    const set = listeners.get(event) ?? new Set();
    set.add(listener); listeners.set(event, set);
    return () => set.delete(listener);
  });
  jest.mocked(trpcClient.runs.trace.query).mockImplementation(async (input) => ({ ...makeTrace(input.id), run: { ...makeTrace(input.id).run, status: "completed" } }));
  jest.mocked(trpcClient.runs.list.query).mockResolvedValue({ runs: [makeTrace().run], next_cursor: null });
  jest.mocked(trpcClient.runs.logs.query).mockResolvedValue({ ...makeTrace(), logs: [], next_cursor: null });
});

afterEach(() => { client.clear(); });

it("loads durable snapshots after reload and disables visitor/no-run reads", async () => {
  const disabled = renderHook(() => ({ runs: useRuns({ instance_id: "instance" }, false), logs: useRunLogs(null) }), { wrapper });
  expect(trpcClient.runs.list.query).not.toHaveBeenCalled();
  expect(trpcClient.runs.logs.query).not.toHaveBeenCalled();
  disabled.unmount();
  const loaded = renderHook(() => useRunTrace(makeTrace().run.id), { wrapper });
  await waitFor(() => expect(loaded.result.current.data?.nodes[0].record.span_id).toBe(makeRecord().span_id));
  loaded.unmount();
});

it("merges identity snapshots into Query cache and never overwrites a sibling run", async () => {
  const a = makeTrace();
  const b = makeTrace("d".repeat(32));
  client.setQueryData(runKeys.trace(a.run.id, {}), a);
  client.setQueryData(runKeys.trace(b.run.id, {}), b);
  const hook = renderHook(({ id }) => useRunLiveUpdates(id), { wrapper, initialProps: { id: a.run.id } });
  act(() => emit("message", { type: "run_trace", ...makeUpdate() }));
  expect(client.getQueryData(runKeys.trace(a.run.id, {}))).toMatchObject({ nodes: [{}, { depth: 1 }] });
  expect(client.getQueryData(runKeys.trace(b.run.id, {}))).toBe(b);
  hook.rerender({ id: b.run.id });
  act(() => emit("message", { type: "run_trace", ...makeUpdate(2) }));
  expect(client.getQueryData(runKeys.cursor(a.run.id))).toMatchObject({ cursor: 1 });
  act(() => emit("message", { type: "run_trace", ...makeUpdate(1, b.run.id) }));
  expect(client.getQueryData(runKeys.trace(b.run.id, {}))).toMatchObject({ nodes: [{}, { depth: 1 }] });
  hook.unmount();
  expect([...listeners.values()].every((set) => set.size === 0)).toBe(true);
});

it("ignores duplicate cursors and resnapshots gaps/reconnects through the same reader", async () => {
  const id = makeTrace().run.id;
  const hook = renderHook(() => { useRunLiveUpdates(id); return useRunTrace(id); }, { wrapper });
  await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
  const baseline = jest.mocked(trpcClient.runs.trace.query).mock.calls.length;
  act(() => emit("message", { type: "run_trace", ...makeUpdate(1) }));
  act(() => emit("message", { type: "run_trace", ...makeUpdate(1, id, { ...makeRecord(2), name: "duplicate" }) }));
  expect(client.getQueryData(runKeys.trace(id, {}))).toMatchObject({ nodes: [{}, { record: { name: "script.run" } }] });
  act(() => emit("message", { type: "run_trace", ...makeUpdate(4), resnapshot_required: true }));
  expect(client.getQueryData(runKeys.cursor(id))).toMatchObject({ cursor: 4, needsSnapshot: true });
  await waitFor(() => expect(jest.mocked(trpcClient.runs.trace.query).mock.calls.length).toBeGreaterThan(baseline));
  await waitFor(() => expect(hook.result.current.data?.nodes).toHaveLength(1));
  const beforeReconnect = jest.mocked(trpcClient.runs.trace.query).mock.calls.length;
  act(() => emit("open"));
  await waitFor(() => expect(jest.mocked(trpcClient.runs.trace.query).mock.calls.length).toBeGreaterThan(beforeReconnect));
  hook.unmount();
});

it("does not inject whole-run live records into focused content or errors-only queries", () => {
  const id = makeTrace().run.id;
  const options = { focus_span_id: makeRecord().span_id, include_content: true };
  client.setQueryData(runKeys.trace(id, options), makeTrace());
  client.setQueryData(runKeys.trace(id, { errors_only: true }), makeTrace());
  const hook = renderHook(() => useRunLiveUpdates(id), { wrapper });
  act(() => emit("message", { type: "run_trace", ...makeUpdate() }));
  expect(client.getQueryData(runKeys.trace(id, options))).toMatchObject({ nodes: [{}] });
  expect(client.getQueryData(runKeys.trace(id, { errors_only: true }))).toMatchObject({ nodes: [{}] });
  hook.unmount();
});

it("passes pagination, content and abort signals to the common Logs reader", async () => {
  const id = makeTrace().run.id;
  jest.mocked(trpcClient.runs.logs.query).mockResolvedValueOnce({ ...makeTrace(), logs: [], next_cursor: "next" }).mockResolvedValueOnce({ ...makeTrace(), logs: [], next_cursor: null });
  const hook = renderHook(() => useRunLogs(id, { source: "agent", span_id: makeRecord().span_id }), { wrapper });
  await waitFor(() => expect(hook.result.current.hasNextPage).toBe(true));
  await act(async () => { await hook.result.current.fetchNextPage(); });
  expect(jest.mocked(trpcClient.runs.logs.query).mock.calls[1][0]).toMatchObject({ id, source: "agent", span_id: makeRecord().span_id, cursor: "next", include_content: true, limit: 100 });
  expect(jest.mocked(trpcClient.runs.logs.query).mock.calls[1][1]?.signal).toBeInstanceOf(AbortSignal);
  hook.unmount();
});
