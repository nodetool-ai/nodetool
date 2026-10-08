import React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import type { GetRunResult, GetRunTraceResult, RunLog } from "@nodetool-ai/protocol";
import { trpcClient } from "../../../trpc/client";
import useTraceStore from "../../../stores/TraceStore";
import { makeRecord, makeTrace } from "../../../__fixtures__/runTrace";
import TracePanel from "../TracePanel";
import { runKeys } from "../../../serverState/useRuns";

jest.mock("../../../trpc/client", () => ({ trpcClient: { runs: {
  list: { query: jest.fn() }, get: { query: jest.fn() }, trace: { query: jest.fn() }, logs: { query: jest.fn() }
} } }));
jest.mock("../../../lib/websocket/GlobalWebSocketManager", () => ({
  globalWebSocketManager: { subscribeEvent: jest.fn(() => jest.fn()), ensureConnection: jest.fn().mockResolvedValue(undefined) }
}));
jest.mock("../../runs/AskRunAgentButton", () => ({ AskRunAgentButton: ({ runId, spanId }: { runId: string; spanId?: string }) => <button data-run={runId} data-span={spanId}>Ask the agent</button> }));

let client: QueryClient;
let trace: GetRunTraceResult;
const a = "b".repeat(32), b = "c".repeat(32), c = "d".repeat(32);
const log: RunLog = { id: "event-1", span_id: makeRecord(2).span_id, span_name: "script.run", time_ms: 3, name: "console", level: "info", source: "script", attributes: { "console.output": "Readable console fixture" } };
function summary(id: string): GetRunResult {
  return { run: makeTrace(id).run, summary: { content_state: "available", content_expired: false, truncated: false, incomplete: false,
    first_failed_span_id: makeRecord(2).span_id, failure_path: [], cost_by_provider: { fixture: 0.01 },
    slowest_spans: [], counts_by_name: {}, span_count: 3, event_count: 1, generation_ids: [], document_ids: [], documents: [], documents_limited: false, summary_truncated: false } };
}
const renderPanel = (view: "trace" | "logs" = "trace") => render(<QueryClientProvider client={client}><ThemeProvider theme={mockTheme}><TracePanel view={view} /></ThemeProvider></QueryClientProvider>);
const originalWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");
const originalHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
beforeAll(() => Object.defineProperties(HTMLElement.prototype, {
  offsetWidth: { configurable: true, value: 600 }, offsetHeight: { configurable: true, value: 200 }
}));
afterAll(() => {
  if (originalWidth) { Object.defineProperty(HTMLElement.prototype, "offsetWidth", originalWidth); }
  if (originalHeight) { Object.defineProperty(HTMLElement.prototype, "offsetHeight", originalHeight); }
});
beforeEach(() => {
  jest.clearAllMocks();
  useTraceStore.getState().clear();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const root = { ...makeRecord(), parent_span_id: makeRecord(3).span_id };
  trace = { ...makeTrace(), nodes: [
    { record: { ...makeRecord(3), name: "ui.action", start_time_ms: 0, resource: { "nodetool.trace.source": "browser" } }, depth: 0 },
    { record: root, depth: 1 },
    { record: { ...makeRecord(2, root.span_id), status: { code: "ERROR" }, events: [{ id: log.id, name: "console", time_ms: 3, attributes: log.attributes }] }, depth: 2 }
  ] };
  jest.mocked(trpcClient.runs.list.query).mockResolvedValue({ runs: [
    makeTrace(a).run, { ...makeTrace(b).run, kind: "workflow" }, { ...makeTrace(c).run, kind: "chat" }
  ], next_cursor: null });
  jest.mocked(trpcClient.runs.get.query).mockImplementation(async (input) => summary(input.id));
  jest.mocked(trpcClient.runs.trace.query).mockImplementation(async (input) => ({
    ...trace, run: { ...trace.run, id: input.id },
    nodes: input.focus_span_id ? trace.nodes.filter(({ record }) => record.span_id === input.focus_span_id) : trace.nodes
  }));
  jest.mocked(trpcClient.runs.logs.query).mockResolvedValue({ ...makeTrace(), logs: [log], next_cursor: null });
});
afterEach(() => client.clear());

it("uses a durable shared picker for app, workflow and chat runs with keyboard selection", async () => {
  const user = userEvent.setup();
  renderPanel();
  await screen.findByRole("list", { name: "Browser spans" });
  expect(screen.getByRole("list", { name: "Browser spans" }).compareDocumentPosition(screen.getByRole("list", { name: "Server spans" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  const picker = screen.getByRole("combobox", { name: "Run" });
  act(() => picker.focus());
  await user.keyboard("{ArrowDown}");
  expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(expect.arrayContaining([expect.stringContaining("app"), expect.stringContaining("Workflow run"), expect.stringContaining("Chat turn")]));
  await user.keyboard("{ArrowDown}{Enter}");
  await waitFor(() => expect(useTraceStore.getState().selectedRunId).toBe(b));
  await waitFor(() => expect(jest.mocked(trpcClient.runs.get.query).mock.calls.some(([input]) => input.id === b)).toBe(true));
});

it("focuses the failure, drills into the named span, and preserves full IDs", async () => {
  renderPanel();
  await screen.findByRole("button", { name: "Show failing span" });
  fireEvent.click(screen.getByRole("button", { name: "Show failing span" }));
  await screen.findByText(log.span_id);
  expect(jest.mocked(trpcClient.runs.trace.query).mock.calls.some(([input]) => input.focus_span_id === log.span_id && input.include_content)).toBe(true);
  expect(screen.getAllByRole("button", { name: "Ask the agent" }).some((button) => button.dataset.span === log.span_id)).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Clear span focus" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Errors only" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Span name" }), { target: { value: "script" } });
  await waitFor(() => expect(jest.mocked(trpcClient.runs.trace.query).mock.calls.some(([input]) => input.name === "script" && input.errors_only)).toBe(true));
});

it("reads stored Logs events with level, source and span filters and the same event identity", async () => {
  renderPanel("logs");
  await screen.findByRole("button", { name: "Read console event event-1" });
  fireEvent.click(screen.getByRole("button", { name: "Read console event event-1" }));
  expect(screen.getByText("console.output")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Inspect log span " + log.span_id }));
  await waitFor(() => expect(jest.mocked(trpcClient.runs.logs.query).mock.calls.some(([input]) => input.span_id === log.span_id)).toBe(true));
  fireEvent.mouseDown(screen.getByRole("combobox", { name: "Log level" }));
  fireEvent.click(screen.getByRole("option", { name: "Error" }));
  await waitFor(() => expect(jest.mocked(trpcClient.runs.logs.query).mock.calls.some(([input]) => input.level === "error")).toBe(true));
  fireEvent.mouseDown(screen.getByRole("combobox", { name: "Log source" }));
  fireEvent.click(screen.getByRole("option", { name: "script" }));
  await waitFor(() => expect(jest.mocked(trpcClient.runs.logs.query).mock.calls.some(([input]) => input.source === "script")).toBe(true));
});

it("virtualizes a capped large trace and names truncation, expiration, visitor and partial states", async () => {
  trace = { ...makeTrace(), nodes: Array.from({ length: 500 }, (_, index) => ({ record: makeRecord(index + 1), depth: index ? 1 : 0 })),
    limited: true, truncated: true, incomplete: true, content_expired: true, content_state: "public" };
  renderPanel();
  const list = await screen.findByRole("list", { name: "Server spans" });
  expect(within(list).getAllByRole("button").length).toBeLessThan(50);
  expect(screen.getByRole("status")).toHaveTextContent("Run content expired");
  expect(screen.getByRole("status")).toHaveTextContent("Visitor run");
  expect(screen.getByRole("status")).toHaveTextContent("truncated");
  expect(screen.getByRole("status")).toHaveTextContent("incomplete");
  expect(screen.getByRole("status")).toHaveTextContent("bounded portion");
});

it("replaces an opened log detail when retained content expires", async () => {
  renderPanel("logs");
  fireEvent.click(await screen.findByRole("button", { name: "Read console event event-1" }));
  expect(screen.getByText("console.output")).toBeInTheDocument();
  jest.mocked(trpcClient.runs.logs.query).mockResolvedValue({ ...makeTrace(), content_expired: true, content_state: "expired", logs: [{ ...log, attributes: {} }], next_cursor: null });
  await act(async () => { await client.invalidateQueries({ queryKey: runKeys.detail(a) }); });
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Run content expired"));
  expect(screen.queryAllByText(/Readable console fixture/)).toHaveLength(0);
});

it("hides cached log content after the reader revokes access", async () => {
  renderPanel("logs");
  fireEvent.click(await screen.findByRole("button", { name: "Read console event event-1" }));
  jest.mocked(trpcClient.runs.logs.query).mockRejectedValue(new Error("Run access revoked"));
  await act(async () => { await client.invalidateQueries({ queryKey: runKeys.detail(a) }); });
  await screen.findByText("Run access revoked");
  expect(screen.queryAllByText(/Readable console fixture/)).toHaveLength(0);
});

it("hides cached focused span content after access is revoked", async () => {
  renderPanel();
  fireEvent.click(await screen.findByRole("button", { name: "Show failing span" }));
  await screen.findByText("Readable console fixture");
  jest.mocked(trpcClient.runs.trace.query).mockRejectedValue(new Error("Span access revoked"));
  await act(async () => { await client.invalidateQueries({ queryKey: runKeys.detail(a) }); });
  await screen.findAllByText("Span access revoked");
  expect(screen.queryAllByText(/Readable console fixture/)).toHaveLength(0);
});

it("hides focused span content when its refreshed snapshot reports expiration", async () => {
  renderPanel();
  fireEvent.click(await screen.findByRole("button", { name: "Show failing span" }));
  await screen.findByText("Readable console fixture");
  trace = { ...trace, content_expired: true, content_state: "expired" };
  await act(async () => { await client.invalidateQueries({ queryKey: runKeys.detail(a) }); });
  await waitFor(() => expect(screen.getAllByRole("status").every((notice) => notice.textContent?.includes("Run content expired"))).toBe(true));
  expect(screen.queryAllByText(/Readable console fixture/)).toHaveLength(0);
});

it("labels span status and duration in aligned columns, including spans without an explicit status", async () => {
  trace = { ...trace, nodes: [...trace.nodes, { record: { ...makeRecord(4), name: "llm.stream", status: { code: "UNSET" }, duration_ms: 4032 }, depth: 1 }] };
  renderPanel();
  const list = await screen.findByRole("list", { name: "Server spans" });
  expect(within(list).getAllByText("ok").length).toBeGreaterThan(0);
  expect(within(list).getByText("error")).toBeInTheDocument();
  expect(within(list).getByText("unset")).toBeInTheDocument();
  expect(within(list).getByText("4.03 s")).toBeInTheDocument();
  expect(within(list).getAllByText("2 ms").length).toBeGreaterThan(0);
});

it("leads a failed run with its error and opens the failing span in place", async () => {
  const failing = makeRecord(2).span_id;
  jest.mocked(trpcClient.runs.get.query).mockImplementation(async (input) => {
    const result = summary(input.id);
    return { ...result, run: { ...result.run, status: "failed", error: "fetch_url returned 503" },
      summary: { ...result.summary, failure_path: [{ span_id: failing, parent_span_id: null, name: "script.run", status: "ERROR", duration_ms: 2, error: "fetch_url returned 503" }] } };
  });
  trace = { ...trace, nodes: trace.nodes.map((node) => node.record.span_id === failing
    ? { ...node, record: { ...node.record, status: { code: "ERROR", message: "fetch_url returned 503" }, attributes: { "http.status_code": 503 } } } : node) };
  renderPanel();
  expect(await screen.findByText("Run failed in script.run")).toBeInTheDocument();
  expect(screen.getByText("fetch_url returned 503")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Show failing span" }));
  expect(await screen.findByText("http.status_code")).toBeInTheDocument();
  expect(screen.getByText("503")).toBeInTheDocument();
  expect(screen.getAllByText("fetch_url returned 503")).toHaveLength(2);
  const list = screen.getByRole("list", { name: "Server spans" });
  expect(within(list).getByRole("button", { name: `Inspect span app.run ${makeRecord().span_id}` })).toBeInTheDocument();
  expect(within(list).getByRole("button", { name: `Inspect span script.run ${failing}` })).toHaveAttribute("aria-pressed", "true");
});

it("offers to clear filters when no span matches them", async () => {
  renderPanel();
  await screen.findByRole("list", { name: "Server spans" });
  jest.mocked(trpcClient.runs.trace.query).mockImplementation(async (input) => ({ ...trace, run: { ...trace.run, id: input.id }, nodes: input.name ? [] : trace.nodes }));
  fireEvent.change(screen.getByRole("textbox", { name: "Span name" }), { target: { value: "missing" } });
  fireEvent.click(await screen.findByRole("button", { name: "Clear filters" }));
  await screen.findByRole("list", { name: "Server spans" });
  expect(screen.getByRole("textbox", { name: "Span name" })).toHaveValue("");
});

it("finds runs and spans by typing and labels repeated span names by position", async () => {
  const user = userEvent.setup();
  client.setQueryData(["workflow", "w".repeat(32)], { id: "w".repeat(32), name: "Research digest" });
  jest.mocked(trpcClient.runs.list.query).mockResolvedValue({ runs: [
    makeTrace(a).run, { ...makeTrace(b).run, kind: "workflow", parents: [{ kind: "workflow", id: "w".repeat(32) }] }
  ], next_cursor: null });
  renderPanel();
  await screen.findByRole("list", { name: "Server spans" });
  await user.type(screen.getByRole("combobox", { name: "Run" }), "research");
  const runOptions = await screen.findAllByRole("option");
  expect(runOptions).toHaveLength(1);
  expect(runOptions[0]).toHaveTextContent("Research digest");
  await user.click(runOptions[0]);
  await waitFor(() => expect(useTraceStore.getState().selectedRunId).toBe(b));
  await screen.findByRole("list", { name: "Server spans" });
  const spanPicker = screen.getByRole("combobox", { name: "Focus span" });
  await user.type(spanPicker, "script");
  const spanOptions = await screen.findAllByRole("option");
  expect(spanOptions).toHaveLength(1);
  expect(spanOptions[0]).toHaveTextContent("script.run");
  expect(spanOptions[0]).toHaveTextContent("error");
  await user.click(spanOptions[0]);
  expect(useTraceStore.getState().focusedSpanId).toBe(makeRecord(2).span_id);
});
