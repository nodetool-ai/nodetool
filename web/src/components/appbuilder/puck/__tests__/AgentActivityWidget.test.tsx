import React from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import type { GetRunLogsResult, ListRunsResult, RunLog } from "@nodetool-ai/protocol";
import mockTheme from "../../../../__mocks__/themeMock";
import { stub } from "../../../../test-utils/doubles";
import { makeTestRuntime } from "../../__tests__/testRuntime";
import { AgentActivityWidget } from "../AgentActivityWidget";
import { useRuns, useRunLogs, useRunLiveUpdates } from "../../../../serverState/useRuns";
import { useRunInspection } from "../../../../hooks/useRunInspection";
import { setAppSessionToken } from "../../../../lib/appSession";

jest.mock("../../../../serverState/useRuns", () => ({ useRuns: jest.fn(), useRunLogs: jest.fn(), useRunLiveUpdates: jest.fn() }));
jest.mock("../../../../hooks/useRunInspection", () => ({ useRunInspection: jest.fn() }));
jest.mock("../../../runs/AskRunAgentButton", () => ({ AskRunAgentButton: ({ runId, spanId }: { runId: string; spanId?: string }) => <button data-run={runId} data-span={spanId}>Ask the agent</button> }));
jest.mock("../widgets", () => ({ MarkdownBlock: ({ text }: { text: string }) => <span>{text}</span> }));

const RUN = "a".repeat(32);
const SPAN = "b".repeat(16);
const inspect = jest.fn();
const log = (id: string, name: string, attrs: Record<string, unknown>, span = SPAN): RunLog => ({
  id, name, attributes: { "node.id": "loop-a", ...attrs }, span_id: span, span_name: "agent.loop", time_ms: 1, level: "info", source: "agent"
});
let history: ListRunsResult;
let page: GetRunLogsResult;
const fetchNextPage = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  setAppSessionToken(null);
  history = stub<ListRunsResult>({ runs: [{ id: RUN, app: { instance_id: "instance-a", operation_id: "main" } }], next_cursor: null });
  page = stub<GetRunLogsResult>({ logs: [log("text", "agent.activity", { "log.message": "Stored work" })],
    content_state: "available", content_expired: false, next_cursor: null, truncated: false, limited: false });
  jest.mocked(useRuns).mockImplementation(() => stub<ReturnType<typeof useRuns>>({ data: { pages: [history] }, error: null, isLoading: false, hasNextPage: false, isFetchingNextPage: false, fetchNextPage }));
  jest.mocked(useRunLogs).mockImplementation(() => stub<ReturnType<typeof useRunLogs>>({ data: { pages: [page] }, error: null, isLoading: false, hasNextPage: false, isFetchingNextPage: false, fetchNextPage }));
  jest.mocked(useRunInspection).mockReturnValue({ openRunInspection: inspect, selectedRunId: null, focusedSpanId: null, view: "trace" });
});

function renderWidget(runtime = makeTestRuntime({}, { instanceId: "instance-a" })) {
  return render(<ThemeProvider theme={mockTheme}><runtime.wrapper><AgentActivityWidget id="activity" binding="op:main/exec#transcript" /></runtime.wrapper></ThemeProvider>);
}

it("restores completed activity by instance and operation after reload and links the stored tool span", async () => {
  page.logs.push(log("call", "agent.activity", { "tool.call_id": "call-a", "tool.name": "edit_timeline" }));
  page.logs.push(log("result", "tool.result", { "tool.call_id": "call-a", "tool.name": "edit_timeline", "tool.result": "Applied stored edits" }));
  renderWidget();
  expect(useRuns).toHaveBeenCalledWith({ kind: "app", instance_id: "instance-a", limit: 100 }, true);
  expect(useRunLogs).toHaveBeenCalledWith(RUN, { source: "agent", include_content: true, limit: 500 });
  expect(screen.getByText("Stored work")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "edit_timeline" }));
  expect(screen.getByText("Applied stored edits")).toBeInTheDocument();
  await userEvent.click(screen.getAllByRole("button", { name: "View trace" })[1]!);
  expect(inspect).toHaveBeenCalledWith({ runId: RUN, spanId: SPAN });
  const ask = screen.getAllByRole("button", { name: "Ask the agent" });
  expect(ask[0]).toHaveAttribute("data-run", RUN);
  expect(ask[1]).toHaveAttribute("data-run", RUN);
  expect(ask[1]).toHaveAttribute("data-span", SPAN);
});

it("replaces live activity with persisted events once without duplication", () => {
  const runtime = makeTestRuntime({ invocations: { live: { id: "live", operationId: "main", status: "running", startedAt: 1 } },
    activeInvocation: { main: "live" }, transcripts: { live: [{ kind: "text", text: "Live work" }] } }, { instanceId: "instance-a" });
  runtime.store.getState().setRunReference("main", { runId: RUN, traceId: "c".repeat(32), invocationId: "live" });
  renderWidget(runtime);
  expect(screen.getByText("Live work")).toBeInTheDocument();
  expect(screen.queryByText("Stored work")).not.toBeInTheDocument();
  act(() => runtime.store.getState().dispatchEvent({ type: "invocationStatus", invocationId: "live", status: "completed" }));
  expect(screen.getAllByText("Stored work")).toHaveLength(1);
  expect(screen.queryByText("Live work")).not.toBeInTheDocument();
});

it("subscribes to the canonical trace directory for a live source app run", () => {
  const sourceRunId = "e".repeat(32);
  const runtime = makeTestRuntime({ activeInvocation: { main: "live" } }, { instanceId: "instance-a" });
  runtime.store.getState().setRunReference("main", { runId: sourceRunId, traceId: "f".repeat(32), invocationId: "live" });
  page.run = stub<GetRunLogsResult["run"]>({ id: RUN });
  renderWidget(runtime);
  expect(useRunLogs).toHaveBeenCalledWith(sourceRunId, expect.anything());
  expect(useRunLiveUpdates).toHaveBeenCalledWith(RUN);
});

it("drops cached stored and live text when content expires", () => {
  const runtime = makeTestRuntime({ invocations: { live: { id: "live", operationId: "main", status: "running", startedAt: 1 } },
    activeInvocation: { main: "live" }, transcripts: { live: [{ kind: "text", text: "Private live work" }] } }, { instanceId: "instance-a" });
  runtime.store.getState().setRunReference("main", { runId: RUN, traceId: "c".repeat(32), invocationId: "live" });
  page.content_expired = true;
  page.content_state = "expired";
  renderWidget(runtime);
  expect(screen.getByText("Activity content expired.")).toBeInTheDocument();
  expect(screen.queryByText("Private live work")).not.toBeInTheDocument();
  expect(screen.queryByText("Stored work")).not.toBeInTheDocument();
});

it("hides cached history when the owned reader stops authorizing the run", () => {
  jest.mocked(useRunLogs).mockReturnValue(stub<ReturnType<typeof useRunLogs>>({ data: { pages: [page] }, error: new Error("Run not found") }));
  renderWidget();
  expect(screen.getByText("Run not found")).toBeInTheDocument();
  expect(screen.queryByText("Stored work")).not.toBeInTheDocument();
});

it("keeps simultaneous instance histories and tool calls isolated", () => {
  const other = "d".repeat(32);
  jest.mocked(useRuns).mockImplementation((options) => stub<ReturnType<typeof useRuns>>({ data: { pages: [stub<ListRunsResult>({ runs: [{ id: options?.instance_id === "instance-a" ? RUN : other, app: { operation_id: "main" } }] })] }, error: null }));
  jest.mocked(useRunLogs).mockImplementation((runId) => stub<ReturnType<typeof useRunLogs>>({ data: { pages: [{ ...page, logs: [log("text", "agent.activity", { "log.message": runId === RUN ? "Instance A" : "Instance B" })] }] }, error: null }));
  renderWidget(makeTestRuntime({}, { instanceId: "instance-a" }));
  renderWidget(makeTestRuntime({}, { instanceId: "instance-b" }));
  expect(screen.getByText("Instance A")).toBeInTheDocument();
  expect(screen.getByText("Instance B")).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: "Ask the agent" }).map((button) => button.getAttribute("data-run"))).toEqual([RUN, other]);
});

it("does not read account history for visitors or a new invocation without a run reference", () => {
  setAppSessionToken("visitor");
  const view = renderWidget();
  expect(useRuns).toHaveBeenLastCalledWith(expect.anything(), false);
  expect(useRunLogs).toHaveBeenLastCalledWith(null, expect.anything());
  view.unmount();
  setAppSessionToken(null);
  renderWidget(makeTestRuntime({ activeInvocation: { main: "starting" } }, { instanceId: "instance-a" }));
  expect(useRuns).toHaveBeenLastCalledWith(expect.anything(), false);
  expect(useRunLogs).toHaveBeenLastCalledWith(null, expect.anything());
});
